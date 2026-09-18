import { netUtil } from '../infra/netUtil';
import { CacheStorage } from '../infra/CacheStorage';

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

interface PlaylistApiEnvelope {
  meta: { status: number };
  data: { items?: unknown };
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

      // nvapi でソートされた結果をもらうのでそのままキャッシュする
      const cacheData: unknown = cacheStorage.getItem(cacheKey);
      if (cacheData) {
        return cacheData;
      }

      // nvapi に X-Frontend-Id header が必要
      const fetched: unknown = await (netUtil as unknown as NetUtilLike)
        .fetch(url, {
          headers: { 'X-Frontend-Id': frontendId, 'X-Frontend-Version': frontendVersion },
          credentials: 'include',
        })
        .then((r: Response) => r.json())
        .catch((e: unknown) => {
          throw new Error(`プレイリストの取得失敗(2) ${type}`, e as ErrorOptions);
        });

      const result = fetched as PlaylistApiEnvelope;
      if (result.meta.status !== 200 || !result.data.items) {
        throw new Error(`プレイリストの取得失敗(1) ${type}`, result as unknown as ErrorOptions);
      }

      const data: unknown = result.data.items;
      cacheStorage.setItem(cacheKey, data, CACHE_EXPIRE_TIME);
      return data;
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
