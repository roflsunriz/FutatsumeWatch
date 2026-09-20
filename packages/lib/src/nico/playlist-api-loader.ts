import { netUtil } from '../infra/net-util';
import { CacheStorage } from '../infra/cache-storage';

interface PlaylistLoadTarget {
  type: string;
  id?: string;
  options?: Record<string, string>;
}

interface FrontendVersion {
  frontendId?: number;
  frontendVersion?: number;
}

interface PlaylistUrlPair {
  url: string;
  cacheKey: string;
}

interface CacheStorageLike {
  getItem: (key: string) => unknown;
  setItem: (key: string, data: unknown, expireTime?: number) => void;
  removeItem: (key: string) => void;
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

//===BEGIN===
const PlaylistApiLoader = (() => {
  const CACHE_EXPIRE_TIME = 5 * 60 * 1000;
  let cacheStorage: CacheStorageLike = null as unknown as CacheStorageLike;

  class PlaylistApiLoader {
    constructor() {
      if (!cacheStorage) {
        cacheStorage = new CacheStorage(sessionStorage);
      }
    }

    async load(
      { type, id, options }: PlaylistLoadTarget,
      { frontendId = 6, frontendVersion = 0 }: FrontendVersion = {}
    ): Promise<unknown> {
      const { url, cacheKey } = ((targetType: string): PlaylistUrlPair => {
        switch (targetType) {
          case 'series':
            return this._buildSeriesURL(id as string);
          case 'user-uploaded':
            return this._buildUserUploadedURL(id as string, options);
          case 'mylist':
            return this._buildMylistURL(id as string, options);
          case 'watchlater':
            return this._buildWatchlaterURL(options);
          case 'search':
            return this._buildSearchURL(options);
          default:
            return {} as unknown as PlaylistUrlPair;
        }
      })(type);

      if (url === undefined || cacheKey === undefined) {
        throw new Error(`プレイリストの取得失敗(3) ${type}`);
      }

      // 旧版は先頭ページだけを保存していたため、完全取得のキャッシュを区別する。
      const completeKey = `${cacheKey};complete-v1;${url}`;
      const cacheData: unknown = cacheStorage.getItem(completeKey);
      if (Array.isArray(cacheData)) return cacheData;
      const endpoint = new URL(url);
      const size = Number(endpoint.searchParams.get('pageSize') || 100);
      const firstPage = Number(endpoint.searchParams.get('page') || 1);
      if (!Number.isInteger(size) || size < 1 || size > 100 || firstPage !== 1) {
        throw new Error('プレイリストの全件取得には1ページ目と1〜100件のページサイズを指定してください。');
      }
      endpoint.searchParams.set('pageSize', String(size));
      const items: Array<Record<string, unknown>> = [];
      const ids = new Set<string>();
      let total: number | undefined;
      for (let page = 1; ; page++) {
        endpoint.searchParams.set('page', String(page));
        const response = await (netUtil as unknown as NetUtilLike).fetch(endpoint.toString(), {
          headers: { 'X-Frontend-Id': frontendId, 'X-Frontend-Version': frontendVersion },
          credentials: 'include',
        });
        if (!response.ok)
          throw new Error(
            `プレイリストの${page}ページ目を取得できませんでした (HTTP ${response.status})。一覧は変更していません。`
          );
        const raw: unknown = await response.json();
        const record = (value: unknown): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value);
        if (
          !record(raw) ||
          !record(raw.meta) ||
          raw.meta.status !== 200 ||
          !record(raw.data) ||
          !Array.isArray(raw.data.items)
        )
          throw new Error('プレイリストの応答形式が不正です。一覧は変更していません。');
        const count = raw.data.totalCount;
        if (count !== undefined) {
          if (
            typeof count !== 'number' ||
            !Number.isSafeInteger(count) ||
            count < 0 ||
            (total !== undefined && total !== count)
          )
            throw new Error('取得中にプレイリストの件数が変わりました。再取得してください。');
          total = count;
        } else if (type === 'user-uploaded')
          throw new Error('投稿動画の総件数を確認できません。一覧は変更していません。');
        for (const entry of raw.data.items as unknown[]) {
          if (!record(entry)) throw new Error('プレイリストの動画情報が不正です。');
          const id =
            typeof entry.watchId === 'string'
              ? entry.watchId
              : record(entry.content) && typeof entry.content.id === 'string'
                ? entry.content.id
                : null;
          if (!id || ids.has(id))
            throw new Error('プレイリストの動画情報が不正または重複しています。再取得してください。');
          ids.add(id);
          items.push(entry);
        }
        if (total !== undefined && items.length > total)
          throw new Error('プレイリストの総件数と動画数が一致しません。');
        if (total !== undefined ? items.length === total : raw.data.items.length < size) break;
        if (raw.data.items.length === 0 || items.length >= 10000)
          throw new Error('プレイリストを最後まで取得できません。一覧は変更していません。');
      }
      cacheStorage.setItem(completeKey, items, CACHE_EXPIRE_TIME);
      return items;
    }

    // 動画シリーズ
    // https://nvapi.nicovideo.jp/v1/playlist/series/${seriesId}?sortOrder=${sortOrder}&sortKey=${sortKey}
    _buildSeriesURL(seriesId: string): PlaylistUrlPair {
      return {
        url: `https://nvapi.nicovideo.jp/v1/playlist/series/${seriesId}`,
        cacheKey: `playlist; series: ${seriesId}`,
      };
    }

    // ユーザー投稿
    // https://nvapi.nicovideo.jp/v1/playlist/user-uploaded/${userId}?sortOrder=${sortOrder}&sortKey=${sortKey}
    _buildUserUploadedURL(userId: string, options: Record<string, string> | undefined = {}): PlaylistUrlPair {
      const query = new URLSearchParams(Object.assign({ sortOrder: 'desc', sortKey: 'registeredAt' }, options || {}));
      return {
        url: `https://nvapi.nicovideo.jp/v1/playlist/user-uploaded/${userId}?${query.toString()}`,
        cacheKey: `playlist; user-uploaded: ${userId}, orderBy: ${query.get('sortKey')} ${query.get('sortOrder')}`,
      };
    }

    // マイリスト
    // https://nvapi.nicovideo.jp/v1/playlist/mylist/${mylistId}?sortOrder=${sortOrder}&sortKey=${sortKey}
    _buildMylistURL(mylistId: string, options: Record<string, string> | undefined = {}): PlaylistUrlPair {
      const query = new URLSearchParams(Object.assign({ sortOrder: 'asc', sortKey: 'registeredAt' }, options || {}));
      return {
        url: `https://nvapi.nicovideo.jp/v1/playlist/mylist/${mylistId}?${query.toString()}`,
        cacheKey: `playlist; mylist: ${mylistId}, orderBy: ${query.get('sortKey')} ${query.get('sortOrder')}`,
      };
    }

    // 後で見る
    // https://nvapi.nicovideo.jp/v1/playlist/watch-later?sortOrder=${sortOrder}&sortKey=${sortKey}
    _buildWatchlaterURL(options: Record<string, string> | undefined = {}): PlaylistUrlPair {
      const query = new URLSearchParams(Object.assign({ sortOrder: 'asc', sortKey: 'registeredAt' }, options || {}));
      return {
        url: `https://nvapi.nicovideo.jp/v1/playlist/watch-later?${query.toString()}`,
        cacheKey: `playlist; watchlater, orderBy: ${query.get('sortKey')} ${query.get('sortOrder')}`,
      };
    }

    // 検索
    // https://nvapi.nicovideo.jp/v1/playlist/search?sortOrder=${sortOrder}&sortKey=${sortKey}&keyword=${keyword}&pageSize=${pageSize}&page=${page}
    _buildSearchURL(options: Record<string, string> | undefined = {}): PlaylistUrlPair {
      const query = new URLSearchParams(Object.assign({ sortOrder: 'desc', sortKey: 'registeredAt' }, options || {}));
      return {
        url: `https://nvapi.nicovideo.jp/v1/playlist/search?${query.toString()}`,
        cacheKey: `playlist; search, query: ${query.toString()}`,
      };
    }
  }

  return new PlaylistApiLoader();
})();

//===END===

export { PlaylistApiLoader };
