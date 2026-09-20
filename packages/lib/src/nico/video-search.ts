import { CrossDomainGate } from '../infra/cross-domain-gate';
import { CacheStorage } from '../infra/cache-storage';
import { WindowMessageEmitter } from '../message/message-util';
import { textUtil } from '../text/text-util';
import { sleep } from '../infra/sleep';

export interface SearchQueryParams {
  searchWord?: string;
  searchType?: string;
  order?: string;
  sort?: string;
  page?: string | number;
  _now?: number;
  f_range?: string | number | null;
  l_range?: string | number | null;
  userId?: string | number | null;
  channelId?: string | number | null;
  commentCount?: string | number | null;
  utimeFrom?: string | number | null;
  utimeTo?: string | number | null;
  dateFrom?: string | Date | null;
  dateTo?: string | Date | null;
  start?: string;
  end?: string;
  [key: string]: unknown;
}

export interface SearchFilter {
  type: string;
  field: string;
  value?: string | number;
  from?: string | number;
  to?: string | number;
}

export interface NicoSearchResult {
  status: string;
  count: number;
  list: Array<Record<string, unknown>>;
  word?: unknown;
  params?: unknown;
  [key: string]: unknown;
}

interface SearchApiItem {
  contentId: string;
  title: string;
  description?: string;
  thumbnailUrl: string;
  thumbnail_url?: string;
  is_middle_thumbnail?: boolean;
  lengthSeconds?: number;
  mylistCounter?: number;
  viewCounter?: number;
  commentCounter?: number;
  startTime?: string;
  [key: string]: unknown;
}

interface SearchApiV2Response {
  meta: { status: number; totalCount: number };
  data: Array<SearchApiItem>;
}

interface CacheStorageLike {
  getItem: (key: string) => unknown;
  setItem: (key: string, data: unknown, expireTime?: number) => void;
}
//===BEGIN===

const { NicoSearchApiV2Query, NicoSearchApiV2Loader } = (function () {
  // 参考: http://site.nicovideo.jp/search-api-docs/search.html
  // http://ch.nicovideo.jp/nico-lab/blomaga/ar930955
  // https://site.nicovideo.jp/search-api-docs/snapshot
  const BASE_URL = 'https://api.search.nicovideo.jp/api/v2/snapshot';
  const API_BASE_URL = `${BASE_URL}/video/contents/search`;
  const VERSION_URL = `${BASE_URL}/version`;
  const MESSAGE_ORIGIN = 'https://api.search.nicovideo.jp/';
  const SORT: Record<string, string> = {
    f: 'startTime',
    v: 'viewCounter',
    r: 'commentCounter',
    m: 'mylistCounter',
    l: 'lengthSeconds',
    n: 'lastCommentTime',
    likeCount: 'likeCounter',
  };

  // 公式検索の日時指定パラメータ -1h -24h -1w -1m
  const F_RANGE: Record<string, number> = {
    U_1H: 4,
    U_24H: 1,
    U_1W: 2,
    U_30D: 3,
  };

  // 公式検索の動画長指定パラメータ -5min 20min-
  const L_RANGE: Record<string, number> = {
    U_5MIN: 1,
    O_20MIN: 2,
  };

  let gate: CrossDomainGate | undefined;

  // なぜかv2はCORSがついてないのでCrossDomainGateの力を借りる
  let initializeCrossDomainGate = function (): void {
    initializeCrossDomainGate = function (): void {};
    gate = new CrossDomainGate({
      baseUrl: BASE_URL,
      origin: MESSAGE_ORIGIN,
      type: 'searchApi',
      messager: WindowMessageEmitter,
    } as unknown as { baseUrl: string; origin: string; type: string });
  };

  /**
   * 公式検索ページのqueryパラメータをv2用に変換するやつ＋α
   */
  class NicoSearchApiV2Query {
    static SORT: Record<string, string>;
    static F_RANGE: Record<string, number>;
    static L_RANGE: Record<string, number>;

    _q!: string;
    _targets!: Array<string>;
    _sort!: string;
    _order!: string;
    _limit!: number;
    _offset!: number;
    _fields!: Array<string>;
    _context!: string;
    _filters!: Array<SearchFilter | null | undefined>;
    _hotField!: string;
    _hotFrom!: Date;
    _hotTo!: Date;
    _now?: number;

    constructor(word: string | SearchQueryParams, params: SearchQueryParams = {}) {
      const wordParams = word as unknown as SearchQueryParams;
      if (wordParams.searchWord) {
        this._initialize(wordParams.searchWord, word as unknown as SearchQueryParams);
      } else {
        this._initialize(word as unknown as string, params);
      }
    }

    get q() {
      return this._q;
    }

    get targets() {
      return this._targets;
    }

    get sort() {
      return this._sort;
    }

    get order() {
      return this._order;
    }

    get limit() {
      return this._limit;
    }

    get offset() {
      return this._offset;
    }

    get fields() {
      return this._fields;
    }

    get context() {
      return this._context;
    }

    get hotField() {
      return this._hotField;
    }

    get hotFrom() {
      return this._hotFrom;
    }

    get hotTo() {
      return this._hotTo;
    }

    _initialize(word: string | undefined, params: SearchQueryParams) {
      if (params._now) {
        this.now = params._now;
      }
      const sortTable = SORT;
      this._filters = [];
      this._q = word || params.searchWord || 'FutatsumeWatch';
      this._targets = params.searchType === 'tag' ? ['tagsExact'] : ['tagsExact', 'title', 'description'];
      this._sort =
        (params.order === 'd' ? '-' : '+') +
        (params.sort && sortTable[params.sort] ? (sortTable[params.sort] as string) : 'lastCommentTime');
      this._order = params.order === 'd' ? 'desc' : 'asc';
      this._limit = 100;
      this._offset = Math.min(params.page ? Math.max(parseInt(params.page as string, 10) - 1, 0) * 25 : 0, 1600);
      this._fields = [
        'contentId',
        'title',
        'description',
        'tags',
        'categoryTags',
        'viewCounter',
        'commentCounter',
        'mylistCounter',
        'likeCounter',
        'lengthSeconds',
        'startTime',
        'thumbnailUrl',
      ];
      this._context = 'FutatsumeWatch';

      const n = new Date(),
        now = this.now;
      if (/^._hot/.test(this.sort)) {
        // 人気が高い順ソート
        (() => {
          this._hotField = 'mylistCounter';
          this._hotFrom = new Date(now - 1 * 24 * 60 * 60 * 1000);
          this._hotTo = n;

          this._sort = '-_hotMylistCounter';
        })();
      }

      if (
        params.f_range &&
        [F_RANGE.U_1H, F_RANGE.U_24H, F_RANGE.U_1W, F_RANGE.U_30D].includes(Number(params.f_range))
      ) {
        this._filters.push(this._buildFRangeFilter(Number(params.f_range)));
      }
      if (params.l_range && [L_RANGE.U_5MIN, L_RANGE.O_20MIN].includes(Number(params.l_range))) {
        this._filters.push(this._buildLRangeFilter(Number(params.l_range)));
      }
      if (params.userId && (params.userId + '').match(/^\d+$/)) {
        this._filters.push({ type: 'equal', field: 'userId', value: Number(params.userId) });
      }
      if (params.channelId && (params.channelId + '').match(/^\d+$/)) {
        this._filters.push({ type: 'equal', field: 'channelId', value: Number(params.channelId) });
      }
      if (params.commentCount && (params.commentCount + '').match(/^[0-9]+$/)) {
        this._filters.push({
          type: 'range',
          field: 'commentCounter',
          from: Number(params.commentCount),
        });
      }
      if (params.utimeFrom || params.utimeTo) {
        this._filters.push(
          this._buildStartTimeRangeFilter({
            from: params.utimeFrom ? Number(params.utimeFrom) : 0,
            to: params.utimeTo ? Number(params.utimeTo) : now,
          })
        );
      }
      if (params.dateFrom || params.dateTo) {
        // 文字列・Date のどちらも受け付ける（旧テストが Date を渡すため）。
        const toTime = (v: string | Date): number => new Date(v instanceof Date ? v.getTime() : v).getTime();
        this._filters.push(
          this._buildStartTimeRangeFilter({
            from: params.dateFrom ? toTime(params.dateFrom) : 0,
            to: params.dateTo ? toTime(params.dateTo) : now,
          })
        );
      }
      // 公式検索ページの日付指定
      const dateReg = /^\d{4}-\d{2}-\d{2}$/;
      if (dateReg.test(params.start as string) && dateReg.test(params.end as string)) {
        this._filters.push(
          this._buildStartTimeRangeFilter({
            from: new Date(params.start as string).getTime(),
            to: new Date(params.end as string).getTime(),
          })
        );
      }
    }

    get stringfiedFilters(): string {
      if (this._filters.length < 1) {
        return '';
      }
      const result: Array<string> = [];
      const TIMEFIELDS = ['startTime'];
      this._filters.forEach((filter) => {
        const isTimeField = TIMEFIELDS.includes(filter!.field);
        if (!filter) {
          return;
        }

        if (filter.type === 'equal') {
          result.push(`filters[${filter.field}][0]=${filter.value as string | number}`);
        } else if (filter.type === 'range') {
          if (filter.from) {
            const from = isTimeField ? this._formatDate(filter.from) : filter.from;
            result.push(`filters[${filter.field}][gte]=${from}`);
          }
          if (filter.to) {
            const to = isTimeField ? this._formatDate(filter.to) : filter.to;
            result.push(`filters[${filter.field}][lte]=${to}`);
          }
        }
      });
      return result.join('&');
    }

    get filters(): Array<SearchFilter | null | undefined> {
      return this._filters;
    }

    _formatDate(time: string | number | undefined): string {
      const dt = new Date(time!);
      return dt.toISOString().replace(/\.\d*Z/, '') + '%2b00:00'; // '%2b00:00'
    }

    _buildStartTimeRangeFilter({ from = 0, to }: { from?: number; to?: number }): SearchFilter {
      const range: SearchFilter = { field: 'startTime', type: 'range' };
      if (from !== undefined && to !== undefined) {
        const sorted = [from, to].sort();
        from = sorted[0]!;
        to = sorted[1]!;
      }
      if (from !== undefined) {
        range.from = from;
      }
      if (to !== undefined) {
        range.to = to;
      }
      return range;
    }

    _buildLengthSecondsRangeFilter({ from, to }: { from?: number; to?: number }): SearchFilter {
      const range: SearchFilter = { field: 'lengthSeconds', type: 'range' };
      if (from !== undefined && to !== undefined) {
        const sorted = [from, to].sort();
        from = sorted[0]!;
        to = sorted[1]!;
      }
      if (from !== undefined) {
        range.from = from;
      }
      if (to !== undefined) {
        range.to = to;
      }
      return range;
    }

    _buildFRangeFilter(range: number): SearchFilter | null {
      const now = this.now;
      switch (range * 1) {
        case F_RANGE.U_1H:
          return this._buildStartTimeRangeFilter({
            from: now - 1000 * 60 * 60,
            to: now,
          });
        case F_RANGE.U_24H:
          return this._buildStartTimeRangeFilter({
            from: now - 1000 * 60 * 60 * 24,
            to: now,
          });
        case F_RANGE.U_1W:
          return this._buildStartTimeRangeFilter({
            from: now - 1000 * 60 * 60 * 24 * 7,
            to: now,
          });
        case F_RANGE.U_30D:
          return this._buildStartTimeRangeFilter({
            from: now - 1000 * 60 * 60 * 24 * 30,
            to: now,
          });
        default:
          return null;
      }
    }

    _buildLRangeFilter(range: number): SearchFilter | undefined {
      switch (range) {
        case L_RANGE.U_5MIN:
          return this._buildLengthSecondsRangeFilter({
            from: 0,
            to: 60 * 5,
          });
        case L_RANGE.O_20MIN:
          return this._buildLengthSecondsRangeFilter({
            from: 60 * 20,
          });
      }
    }

    toString(): string {
      const result: Array<string> = [];
      result.push('q=' + encodeURIComponent(this._q));
      result.push('targets=' + this.targets.join(','));
      result.push('fields=' + this.fields.join(','));

      result.push('_sort=' + encodeURIComponent(this.sort));
      result.push('_limit=' + this.limit);
      result.push('_offset=' + this.offset);
      result.push('_context=' + this.context);

      if (this.sort === '-_hot') {
        result.push('hotField=' + this.hotField);
        result.push('hotFrom=' + String(this.hotFrom));
        result.push('hotTo=' + String(this.hotTo));
      }

      const filters = this.stringfiedFilters;
      if (filters) {
        result.push(filters);
      }

      return result.join('&');
    }

    set now(v: number) {
      this._now = v;
    }

    get now(): number {
      return this._now || Date.now();
    }
  }

  NicoSearchApiV2Query.SORT = SORT;
  NicoSearchApiV2Query.F_RANGE = F_RANGE;
  NicoSearchApiV2Query.L_RANGE = L_RANGE;

  class NicoSearchApiV2Version {
    date: Date | number;
    lastUpdate: Date | number;

    constructor() {
      this.date = this.lastUpdate = this._baseDate;
    }

    get isLatest(): boolean {
      return Number(this.date) - this._baseDate > 0;
    }

    async update(): Promise<Date | number> {
      const now = Date.now();
      if (now - Number(this.lastUpdate) <= 1000 * 60 * 5) {
        return this.date;
      }
      initializeCrossDomainGate();
      const fetched: unknown = await gate!.fetch(VERSION_URL);
      const res = fetched as Response;
      const rawBody: unknown = await res.json();
      const body = rawBody as { last_modified?: string };
      this.date = new Date(body.last_modified as string);
      this.lastUpdate = new Date(res.headers.get('Date') ?? now);
      return this.date;
    }

    // スナップショット検索は日本時間5時の時点のデータなので、UTCの20時を取る
    get _baseDate(): number {
      const now = new Date();
      return now.setUTCHours(now.getUTCHours() >= 20 ? 20 : -4, 0, 0);
    }
  }

  class NicoSearchApiV2Loader {
    static version = new NicoSearchApiV2Version();
    static cacheStorage: CacheStorageLike | undefined;
    static CACHE_EXPIRE_TIME = 24 * 60 * 60 * 1000;

    static async search(word: string, params: SearchQueryParams): Promise<NicoSearchResult> {
      initializeCrossDomainGate();
      const query = new NicoSearchApiV2Query(word, params);
      const url = API_BASE_URL + '?' + query.toString();
      const versionDate = this.version.isLatest
        ? this.version.date
        : await this.version.update().then((date: Date | number) => new Date(date).getTime());
      const version = versionDate instanceof Date ? versionDate.getTime() : versionDate;

      if (!this.cacheStorage) {
        this.cacheStorage = new CacheStorage(sessionStorage);
      }
      const cacheStorage = this.cacheStorage;
      const cacheKey = `search: ${[
        `words:${query.q}`,
        `targets:${query.targets.join(',')}`,
        `sort:${query.sort}`,
        `filters:${query.stringfiedFilters}`,
        `offset:${query.offset}`,
      ].join(', ')}`;
      const cacheData: unknown = cacheStorage.getItem(cacheKey);
      if (cacheData) {
        const cached = cacheData as { version?: unknown; data?: NicoSearchResult };
        if (cached.version === version) {
          return cached.data as NicoSearchResult;
        }
      }

      return (gate as unknown as { fetch: (url: string) => Promise<Response> })
        .fetch(url)
        .then((res: Response) => res.text())
        .then((result: string) => {
          const parsed = NicoSearchApiV2Loader.parseResult(result);
          if (typeof parsed !== 'number' && parsed.status === 'ok') {
            const data = Object.assign(parsed, { word, params });
            void cacheStorage.setItem(cacheKey, { data, version }, this.CACHE_EXPIRE_TIME);
            return Promise.resolve(data);
          } else {
            let description: string;
            switch (parsed) {
              default:
                description = 'UNKNOWN ERROR';
                break;
              case 400:
                description = 'INVALID QUERY';
                break;
              case 500:
                description = 'INTERNAL SERVER ERROR';
                break;
              case 503:
                description = 'MAINTENANCE';
                break;
            }
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 旧実装はプレーンオブジェクトでrejectする契約のため維持する
            return Promise.reject({
              status: 'fail',
              description,
            });
          }
        });
    }

    /**
     * 100件以上検索する用
     */
    static async searchMore(word: string, params: SearchQueryParams, maxLimit = 300): Promise<NicoSearchResult> {
      const ONCE_LIMIT = 100; // 一回で取れる件数
      const PER_PAGE = 25; // 検索ページで1ページあたりに表示される件数
      // 25 * 64 = 1600

      const result = await NicoSearchApiV2Loader.search(word, params);

      const currentPage = params.page ? parseInt(params.page as string, 10) : 1;
      const currentOffset = (currentPage - 1) * PER_PAGE;

      if (result.count <= ONCE_LIMIT) {
        return result;
      }

      const searchCount = Math.min(
        Math.ceil((result.count - currentOffset) / PER_PAGE) - 1,
        Math.ceil((maxLimit - ONCE_LIMIT) / ONCE_LIMIT)
      );

      //// TODO: 途中で失敗したらそこまででもいいので返す？
      for (let i = 1; i <= searchCount; i++) {
        await sleep(300 * i);
        const page = currentPage + i * (ONCE_LIMIT / PER_PAGE);
        console.log('searchNext: "%s"', word, page, params);
        const res = await NicoSearchApiV2Loader.search(word, Object.assign(params, { page }));
        if (res && res.list && res.list.length) {
          result.list = result.list.concat(res.list);
        } else {
          break;
        }
      }
      return Object.assign(result, { word, params });
    }

    static _jsonParse(result: string): unknown {
      try {
        const parsed: unknown = JSON.parse(result);
        return parsed;
      } catch (e) {
        window.console.error('JSON parse error', e);
        return null;
      }
    }

    static parseResult(jsonText: string): NicoSearchResult | number {
      const rawData: unknown = NicoSearchApiV2Loader._jsonParse(jsonText);
      if (!rawData) {
        return 0;
      }
      const data = rawData as SearchApiV2Response;
      const status = data.meta.status;
      const result: NicoSearchResult = {
        status: status === 200 ? 'ok' : 'fail',
        count: data.meta.totalCount,
        list: [],
      };
      if (status !== 200) {
        return status;
      }
      const midThumbnailThreshold = 23608629; // .Mのついた最小ID?
      data.data.forEach((item: SearchApiItem) => {
        const description = item.description ? item.description.replace(/<.*?>/g, '') : '';
        if (item.thumbnailUrl.indexOf('.M') >= 0) {
          item.thumbnail_url = (item.thumbnail_url as string).replace(/\.M$/, '');
          item.is_middle_thumbnail = true;
        } else if (item.thumbnailUrl.indexOf('.M') < 0 && item.contentId.indexOf('sm') === 0) {
          const _id = parseInt(item.contentId.substring(2), 10);
          if (_id >= midThumbnailThreshold) {
            item.is_middle_thumbnail = true;
          }
        }
        const dt = textUtil.dateToString(new Date(item.startTime as string));

        result.list.push({
          id: item.contentId,
          type: 0, // 0 = VIDEO,
          length: item.lengthSeconds
            ? Math.floor(item.lengthSeconds / 60) + ':' + ((item.lengthSeconds % 60) + 100).toString().substring(1)
            : '',
          mylist_counter: item.mylistCounter,
          view_counter: item.viewCounter,
          num_res: item.commentCounter,
          first_retrieve: dt,
          create_time: dt,
          thumbnail_url: item.thumbnailUrl,
          title: item.title,
          description_short: description.substring(0, 150),
          description_full: description,
          length_seconds: item.lengthSeconds,
          //last_res_body:     item.lastResBody,
          is_middle_thumbnail: item.is_middle_thumbnail,
        });
      });
      return result;
    }
  }

  return { NicoSearchApiV2Query, NicoSearchApiV2Loader };
})();
//===END===

export { NicoSearchApiV2Query, NicoSearchApiV2Loader };
