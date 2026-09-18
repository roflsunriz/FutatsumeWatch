import { textUtil } from '../text/textUtil';
import { netUtil } from '../infra/netUtil';
import { MylistApiLoader } from './MylistApiLoader';
import { RecommendAPILoader } from './RecommendAPILoader';
import { NicoRssLoader } from './NicoRssLoader';
import { NicoSearchApiV2Loader } from './VideoSearch';

export interface VideoItemData {
  watchId: string;
  videoId: string;
  title: string;
  duration: number;
  commentCount: number;
  mylistCount: number;
  viewCount: number;
  thumbnail: string;
  postedAt: string;
  createdAt: string;
  updatedAt: string;
  isChannel?: boolean;
  isMymemory?: boolean | string;
  mylistComment?: string;
  _sortTitle: string;
}

interface FlapiVideoItem {
  id: string;
  is_middle_thumbnail?: boolean;
  thumbnail_url: string;
  title: string;
  length_seconds: number;
  length?: string;
  num_res: number;
  mylist_counter: number;
  view_counter: number;
  first_retrieve: string;
  create_time: number;
  thread_update_time: string;
  mylist_comment?: string;
}

interface DeflistItem {
  item_data: {
    video_id: string;
    watch_id: string;
    title: string;
    length_seconds: number;
    num_res: number;
    mylist_counter: number;
    view_counter: number;
    thumbnail_url: string;
    first_retrieve: number;
    update_time: number;
  };
  create_time: number;
  description?: string;
}

interface NetFetchInit {
  method?: string;
  headers?: Record<string, string | number>;
  credentials?: string;
  body?: string;
  mode?: string;
  timeout?: number;
  signal?: AbortSignal | null;
  [key: string]: unknown;
}

interface NetUtilLike {
  fetch: (url: string | URL, init?: NetFetchInit) => Promise<Response>;
  jsonp: (url: string) => Promise<unknown>;
}

export interface NicoQueryParts {
  type: string;
  id: string;
  params: Record<string, unknown>;
}

export interface NicoSearchParams {
  searchType: string;
  order: string;
  sort: string;
  userId: string | number | null;
  channelId: string | number | null;
  dateFrom: string | null;
  dateTo: string | null;
  commentCount: string | number | null;
  f_range: string | number | null;
  l_range: string | number | null;
  [key: string]: unknown;
}

//===BEGIN===

const ItemDataConverter = {
  makeSortText: (text: string): string => {
    const converted: unknown = textUtil.convertKansuEi(text);
    return (converted as string)
      .replace(/([0-9]{1,9})/g, (m: string) => m.padStart(10, '0'))
      .replace(/([０-９]{1,9})/g, (m: string) => m.padStart(10, '０'));
  },
  fromFlapiMylistItem: (data: FlapiVideoItem): VideoItemData => {
    const isChannel = data.id.startsWith('so');
    const isMymemory = /^[0-9]+$/.test(data.id);
    const thumbnail = data.is_middle_thumbnail ? `${data.thumbnail_url}.M` : data.thumbnail_url;
    return {
      watchId: data.id,
      videoId: data.id,
      title: data.title,
      duration: data.length_seconds * 1,
      commentCount: data.num_res * 1,
      mylistCount: data.mylist_counter * 1,
      viewCount: data.view_counter * 1,
      thumbnail,
      postedAt: new Date(data.first_retrieve.replace(/-/g, '/')).toISOString(),
      createdAt: new Date(data.create_time * 1000).toISOString(),
      updatedAt: new Date(data.thread_update_time.replace(/-/g, '/')).toISOString(),
      isChannel,
      isMymemory,
      mylistComment: data.mylist_comment || '',
      _sortTitle: ItemDataConverter.makeSortText(data.title),
    };
  },
  fromDeflistItem: (item: DeflistItem): VideoItemData => {
    const data = item.item_data;
    const isChannel = data.video_id.startsWith('so');
    const isMymemory = !isChannel && /^[0-9]+$/.test(data.watch_id);
    return {
      watchId: isChannel ? data.video_id : data.watch_id,
      videoId: data.video_id,
      title: data.title,
      duration: data.length_seconds * 1,
      commentCount: data.num_res * 1,
      mylistCount: data.mylist_counter * 1,
      viewCount: data.view_counter * 1,
      thumbnail: data.thumbnail_url,
      postedAt: new Date(data.first_retrieve * 1000).toISOString(),
      createdAt: new Date(item.create_time * 1000).toISOString(),
      updatedAt: new Date(data.update_time * 1000).toISOString(),
      isChannel,
      isMymemory,
      mylistComment: item.description || '',
      _sortTitle: ItemDataConverter.makeSortText(data.title),
    };
  },
  fromUploadedVideo: (data: FlapiVideoItem): VideoItemData => {
    const isChannel = data.id.startsWith('so');
    const isMymemory = /^[0-9]+$/.test(data.id);
    const thumbnail = data.is_middle_thumbnail ? `${data.thumbnail_url}.M` : data.thumbnail_url;
    const [min, sec] = (data.length as string).split(':');
    const postedAt = new Date(data.first_retrieve.replace(/-/g, '/')).toISOString();
    return {
      watchId: data.id,
      videoId: data.id,
      title: data.title,
      duration: Number(min) * 60 + Number(sec) * 1,
      commentCount: data.num_res * 1,
      mylistCount: data.mylist_counter * 1,
      viewCount: data.view_counter * 1,
      thumbnail,
      postedAt,
      createdAt: postedAt,
      updatedAt: postedAt,
      _sortTitle: ItemDataConverter.makeSortText(data.title),
    };
  },
  fromSearchApiV2: (data: FlapiVideoItem): VideoItemData => {
    const isChannel = data.id.startsWith('so');
    const isMymemory = /^[0-9]+$/.test(data.id);
    const thumbnail = data.is_middle_thumbnail ? `${data.thumbnail_url}.M` : data.thumbnail_url;
    const postedAt = new Date(data.first_retrieve.replace(/-/g, '/')).toISOString();
    return {
      watchId: data.id,
      videoId: data.id,
      title: data.title,
      duration: data.length_seconds,
      commentCount: data.num_res * 1,
      mylistCount: data.mylist_counter * 1,
      viewCount: data.view_counter * 1,
      thumbnail,
      postedAt,
      createdAt: postedAt,
      updatedAt: postedAt,
      isChannel,
      isMymemory,
      _sortTitle: ItemDataConverter.makeSortText(data.title),
    };
  },
};

class NicoQuery {
  type: string;
  id: string;
  params: Record<string, unknown>;

  static parse(query: string | NicoQuery): NicoQuery | NicoQueryParts {
    if (query instanceof NicoQuery) {
      return query;
    }
    const [type = '', vars] = query.split('/');
    const [idPart = '', p] = (vars || '').split('?');
    const id = decodeURIComponent(idPart || '');
    const params = textUtil.parseQuery(p || '') as unknown as Record<string, unknown>;
    Object.keys(params).forEach((key: string) => {
      try {
        params[key] = JSON.parse(params[key] as string);
      } catch {
        /* パース失敗時は元の文字列のままにする */
      }
    });
    return {
      type,
      id,
      params,
    };
  }

  static build(type: string, id: string, params: Record<string, unknown>): string {
    const p = Object.keys(params)
      .sort()
      .filter((key) => !!params[key] && key !== 'title')
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(params[key]))}`);
    // .map(key => `${encodeURIComponent(key)}=${
    //   typeof params[key] === 'string' ?
    //     encodeURIComponent(`"${escape(params[key])}"`) :
    //     encodeURIComponent(params[key])
    // }`);
    if (params.title) {
      p.push(`title=${encodeURIComponent(params.title as string)}`);
    }
    return `${type}/${encodeURIComponent(id)}?${p.join('&')}`;
  }

  static async fetch(query: string | NicoQuery): Promise<unknown> {
    if (typeof query === 'string') {
      query = new NicoQuery(query);
    }

    const { type, id, params } = query;
    // self.console.info('NicoQ.query', JSON.stringify(query), query, query.toString());
    const _req: { query: string; type: string; id: string; params: Record<string, unknown>; url?: string } = {
      query: query.toString(),
      type,
      id,
      params,
    };
    switch (type) {
      case 'mylist':
        _req.url = `https://flapi.nicovideo.jp/api/watch/mylistvideo?id=${id}`;
        break;
      case 'user':
        _req.url = `https://flapi.nicovideo.jp/api/watch/uploadedvideo?user_id=${id}`;
        break;
      case 'mymylist':
        _req.url = `https://www.nicovideo.jp/api/mylist/list?group_id=${id}`;
        break;
      case 'deflist':
        _req.url = 'https://www.nicovideo.jp/api/deflist/list';
        break;
      case 'nicorepo':
        _req.url =
          'https://www.nicovideo.jp/api/nicorepo/timeline/my/all?attribute_filter=upload&object_filter=video&client_app=pc_myrepo';
        break;
      case 'mylistlist':
        return Object.assign(await MylistApiLoader.getMylistList(), { _req });
      case 'series':
        return Object.assign(await RecommendAPILoader.loadSeries(id, {}), { _req });
      case 'ranking':
        return Object.assign(await NicoRssLoader.loadRanking({ genre: id || 'all' }), { _req });
      case 'channel':
        _req.url = `https://ch.nicovideo.jp/${id}/video?rss=2.0`;
        return Object.assign(await NicoRssLoader.load(_req.url), { _req });
      case 'tag':
      case 'search':
        return Object.assign(await NicoSearchApiV2Loader.searchMore(id, query.searchParams), { _req });
      default:
        throw new Error(`unknown query: ${query.toString()}`);
    }
    const fetched: unknown = await (netUtil as unknown as NetUtilLike)
      .fetch(_req.url, { credentials: 'include' })
      .then((res: Response) => res.json());
    return Object.assign(fetched as Record<string, unknown>, { _req });
  }

  constructor(arg: string | NicoQuery | NicoQueryParts) {
    if (typeof arg === 'string') {
      arg = NicoQuery.parse(arg);
    }
    const { type, id, params } = arg;
    this.type = type;
    this.id = id || '';
    this.params = Object.assign({}, params || {});
  }

  toString(): string {
    // const {type, id, params} = this;
    return NicoQuery.build(this.type, this.id, this.params);
  }

  get title(): string {
    if (this.params.title) {
      return this.params.title as string;
    }
    const { type, id } = this;
    switch (type) {
      case 'tag':
        return `タグ検索 「${this.searchWord}」`;
      case 'search':
        return `キーワード検索 「${this.searchWord}」`;
      case 'user':
        return `投稿動画一覧 user/${id}`;
      case 'deflist':
        return 'とりあえずマイリスト';
      case 'nicorepo':
        return 'ニコレポ新着動画';
      case 'mylist':
      case 'mymylist':
        return `マイリスト mylist/${id}`;
      case 'series':
        return `シリーズ series/${id}`;
      case 'ranking':
        return `ランキング ranking/${id || 'all'}`;
      case '':
        return `チャンネル動画 channel/${id}`;
      default:
        return '';
    }
  }

  set title(v: string) {
    this.params.title = v;
  }

  get baseString(): string {
    return NicoQuery.build(this.type, this.id, this.baseParams);
  }

  get string(): string {
    return this.toString();
  }

  get baseParams(): Record<string, unknown> {
    const params = Object.assign({}, this.params);
    delete params.title;
    return params;
  }

  get isSearch(): boolean {
    return this.type === 'search' || this.type === 'tag';
  }

  get isSearchReady(): string | boolean {
    return this.isSearch && this.searchWord;
  }

  get searchWord(): string {
    return (this.id || '').trim();
  }

  get isOwnerFilterEnable(): unknown {
    return this.params.ownerFilter || this.params.userId || this.params.chanelId;
  }

  set isOwnerFilterEnable(v: unknown) {
    this.params.userId = this.params.chanelId = null;
    if (v) {
      this.params.ownerFilter = true;
    } else {
      this.params.ownerFilter = false;
    }
  }

  get searchParams(): NicoSearchParams {
    const { type, params } = this;
    const sortText = (params.sort as string) || '';
    return {
      searchType: type,
      order: sortText.charAt(0) === '-' ? 'd' : 'a',
      sort: sortText.substring(1),
      userId: ((this.isOwnerFilterEnable && params.userId) || null) as string | number | null,
      channelId: ((this.isOwnerFilterEnable && params.channelId) || null) as string | number | null,
      dateFrom: (params.start || null) as string | null,
      dateTo: (params.end || null) as string | null,
      commentCount: (params.commentCount || null) as string | number | null,
      f_range: (params.fRange || null) as string | number | null,
      l_range: (params.lRange || null) as string | number | null,
    };
  }

  nearlyEquals(query: string | NicoQuery): boolean {
    if (typeof query === 'string') {
      query = new NicoQuery(query);
    }
    return this.baseString === query.baseString;
  }

  equals(query: string | NicoQuery): boolean {
    if (typeof query === 'string') {
      query = new NicoQuery(query);
    }
    return this.toString() === query.toString();
  }
}

//===END===

export { NicoQuery, ItemDataConverter };
