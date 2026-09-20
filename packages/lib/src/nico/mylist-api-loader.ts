import { netUtil } from '../infra/net-util';
import { CacheStorage } from '../infra/cache-storage';
import { Emitter } from '../emitter';

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

interface CacheStorageLike {
  getItem: (key: string) => unknown;
  setItem: (key: string, data: unknown, expireTime?: number) => void;
  removeItem: (key: string) => void;
}

interface MylistItem {
  watchId?: string;
  itemId?: string;
  [key: string]: unknown;
}

interface MylistCollection {
  hasInvisibleItems?: boolean;
  hasNext?: boolean;
  items: Array<MylistItem>;
}

interface MylistApiEnvelope {
  meta: { status: number };
  data: {
    watchLater?: MylistCollection;
    mylist?: MylistCollection;
    mylists?: Array<Record<string, unknown>>;
  };
  error?: { description?: string; code?: string };
  status?: unknown;
  message?: unknown;
}

interface FrontendIdVersion {
  frontendId?: number;
  frontendVersion?: number;
}
interface MylistListOptions extends FrontendIdVersion {
  forceRefresh?: boolean;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function readMylistList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error('マイリスト一覧の応答形式が不正です。再取得してください。');
  const lists: Array<Record<string, unknown>> = [];
  for (const entry of value as unknown[]) {
    if (
      !isRecord(entry) ||
      (typeof entry.id !== 'string' && typeof entry.id !== 'number') ||
      typeof entry.name !== 'string'
    )
      throw new Error('マイリスト一覧の応答形式が不正です。再取得してください。');
    lists.push(entry);
  }
  return lists;
}
async function readMylistResponse(response: Response): Promise<MylistApiEnvelope> {
  if (!response.ok) throw new Error(`マイリストの通信に失敗しました (HTTP ${response.status})。再試行してください。`);
  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    !isRecord(body.meta) ||
    typeof body.meta.status !== 'number' ||
    !Number.isInteger(body.meta.status) ||
    body.meta.status < 100 ||
    body.meta.status > 599
  )
    throw new Error('マイリストの応答形式が不正です。');
  if (body.data !== undefined && body.data !== null && !isRecord(body.data))
    throw new Error('マイリストのデータ形式が不正です。');
  const raw = isRecord(body.data) ? body.data : {};
  const data: MylistApiEnvelope['data'] = {};
  if (raw.mylists !== undefined) data.mylists = readMylistList(raw.mylists);
  for (const name of ['watchLater', 'mylist'] as const) {
    const value = raw[name];
    if (value === undefined) continue;
    if (
      !isRecord(value) ||
      !Array.isArray(value.items) ||
      (value.items as unknown[]).some((item) => !isRecord(item)) ||
      (value.hasNext !== undefined && typeof value.hasNext !== 'boolean') ||
      (value.hasInvisibleItems !== undefined && typeof value.hasInvisibleItems !== 'boolean')
    )
      throw new Error('マイリストの動画一覧の形式が不正です。');
    data[name] = {
      items: value.items as MylistItem[],
      hasNext: value.hasNext,
      hasInvisibleItems: value.hasInvisibleItems,
    };
  }
  const error = isRecord(body.error) ? body.error : {};
  return {
    meta: { status: body.meta.status },
    data,
    error: {
      description:
        typeof error.description === 'string'
          ? error.description
          : `マイリストの処理が拒否されました (${body.meta.status})`,
      code: typeof error.code === 'string' ? error.code : undefined,
    },
  };
}

const emitter = new Emitter();
//===BEGIN===
const MylistApiLoader = (() => {
  // マイリスト/とりあえずマイリストの取得APIには
  // www.nicovideo.jp配下とflapi.nicovideo.jp配下の２種類がある
  // 他人のマイリストを取得するにはflapi、マイリストの編集にはwwwのapiが必要
  // データのフォーマットが微妙に異なるのでめんどくさい
  //
  // おかげでソート処理が悲しいことに
  //
  const CACHE_EXPIRE_TIME = 5 * 60 * 1000;
  const TOKEN_EXPIRE_TIME = 59 * 60 * 1000;
  let cacheStorage: CacheStorageLike = null as unknown as CacheStorageLike;
  let token = '';

  if ((window as unknown as { FutatsumeWatch?: unknown }).FutatsumeWatch) {
    emitter.on('csrfTokenUpdate', (t: unknown) => {
      token = t as string;
      if (cacheStorage) {
        cacheStorage.setItem('csrfToken', token, TOKEN_EXPIRE_TIME);
      }
    });
  }

  class MylistApiLoader {
    constructor() {
      if (!cacheStorage) {
        cacheStorage = new CacheStorage(sessionStorage);
      }
      if (!token) {
        token = cacheStorage.getItem('csrfToken') as string;
        if (token) {
          console.log('cached token exists', token);
        }
      }
    }
    setCsrfToken(t: string) {
      token = t;
      if (cacheStorage) {
        cacheStorage.setItem('csrfToken', token, TOKEN_EXPIRE_TIME);
      } else {
        cacheStorage = new CacheStorage(sessionStorage);
        cacheStorage.setItem('csrfToken', token, TOKEN_EXPIRE_TIME);
      }
    }

    // どうにもトークンが取れなくなっていたので、専用の関数作成。
    // 一応、キャッシュもされている(はず)
    async _getCsrfToken(): Promise<string> {
      if (!cacheStorage) {
        cacheStorage = new CacheStorage(sessionStorage);
      }

      token = cacheStorage.getItem('csrfToken') as string;

      //キャッシュにあったらそこで返す
      if (token) {
        console.log('cached token exists', token);
      } else {
        //そもそもemit元からは取れる物がないんだから、
        //マイリストページからトークン持ってくるしかないでしょ
        const tokenUrl = 'https://www.nicovideo.jp/my/mylist';
        const result = await (netUtil as unknown as NetUtilLike)
          .fetch(tokenUrl, {
            cledentials: 'include',
          })
          .then((r: Response) => r.text())
          .catch((err: unknown) => {
            throw new Error('マイリストトークン取得失敗', { result: err, status: 'fail' } as unknown as ErrorOptions);
          });

        const dom = new DOMParser().parseFromString(result, 'text/html');
        const initUserpageDataContena = dom.querySelector('#js-initial-userpage-data')!;
        const envRaw: unknown = JSON.parse(String(initUserpageDataContena.getAttribute('data-environment')));
        const env = envRaw as { csrfToken?: string };

        this.setCsrfToken(env.csrfToken as string);
      }

      return token;
    }
    async _getDeflistItems(frontendId = 6, frontendVersion = 0): Promise<Array<MylistItem>> {
      const url = 'https://nvapi.nicovideo.jp/v1/users/me/watch-later?sortKey=addedAt&sortOrder=desc';
      const page = new URLSearchParams({ pageSize: '100', page: '1' });
      let data: MylistCollection | undefined;

      do {
        // nvapi に X-Frontend-Id header が必要
        const raw: unknown = await (netUtil as unknown as NetUtilLike)
          .fetch(`${url}&${page.toString()}`, {
            headers: { 'X-Frontend-Id': frontendId, 'X-Frontend-Version': frontendVersion },
            credentials: 'include',
          })
          .then(readMylistResponse)
          .catch((e: unknown) => {
            throw new Error('とりあえずマイリストの取得失敗(2)', e as ErrorOptions);
          });
        const res = raw as MylistApiEnvelope;
        if (res.meta.status !== 200 || !res.data.watchLater) {
          throw new Error('とりあえずマイリストの取得失敗(1)', res as unknown as ErrorOptions);
        }
        if (data == null) {
          data = res.data.watchLater;
        } else {
          data.hasInvisibleItems = data.hasInvisibleItems || res.data.watchLater.hasInvisibleItems;
          data.hasNext = res.data.watchLater.hasNext;
          data.items.push(...res.data.watchLater.items);
        }
        page.set('page', String(parseInt(String(page.get('page'))) + 1));
      } while (data && data.hasNext);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- do-whileで必ず代入されることをtscに伝えられないため。ランタイムは消去により同一
      return data!.items;
    }
    async _getMylistItems(id: string, frontendId = 6, frontendVersion = 0): Promise<Array<MylistItem>> {
      const url = `https://nvapi.nicovideo.jp/v1/users/me/mylists/${id}`;
      const page = new URLSearchParams({ pageSize: '100', page: '1' });
      let data: MylistCollection | undefined;

      do {
        // nvapi に X-Frontend-Id header が必要
        const raw: unknown = await (netUtil as unknown as NetUtilLike)
          .fetch(`${url}?${page.toString()}`, {
            headers: { 'X-Frontend-Id': frontendId, 'X-Frontend-Version': frontendVersion },
            credentials: 'include',
          })
          .then(readMylistResponse)
          .catch((e: unknown) => {
            throw new Error('マイリスト取得失敗(2)', e as ErrorOptions);
          });
        const res = raw as MylistApiEnvelope;
        if (res.meta.status !== 200 || !res.data.mylist) {
          throw new Error('マイリスト取得失敗(1)', res as unknown as ErrorOptions);
        }
        if (data == null) {
          data = res.data.mylist;
        } else {
          data.hasInvisibleItems = data.hasInvisibleItems || res.data.mylist.hasInvisibleItems;
          data.hasNext = res.data.mylist.hasNext;
          data.items.push(...res.data.mylist.items);
        }
        page.set('page', String(parseInt(String(page.get('page'))) + 1));
      } while (data && data.hasNext);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- do-whileで必ず代入されることをtscに伝えられないため。ランタイムは消去により同一
      return data!.items;
    }
    async getMylistList({ frontendId = 6, frontendVersion = 0, forceRefresh = false }: MylistListOptions = {}): Promise<
      Array<Record<string, unknown>>
    > {
      const url = 'https://nvapi.nicovideo.jp/v1/users/me/mylists';
      const cacheKey = 'mylistList';

      const cacheData: unknown = cacheStorage.getItem(cacheKey);
      if (cacheData && !forceRefresh) {
        try {
          return readMylistList(cacheData);
        } catch {
          cacheStorage.removeItem(cacheKey);
        }
      }

      // nvapi に X-Frontend-Id header が必要
      const raw: unknown = await (netUtil as unknown as NetUtilLike)
        .fetch(url, {
          headers: { 'X-Frontend-Id': frontendId, 'X-Frontend-Version': frontendVersion },
          credentials: 'include',
        })
        .then(readMylistResponse)
        .catch((e: unknown) => {
          throw new Error('マイリスト一覧の取得失敗(2)', e as ErrorOptions);
        });
      const result = raw as MylistApiEnvelope;
      if (result.meta.status !== 200 || !result.data.mylists) {
        throw new Error(
          `マイリスト一覧の取得失敗(1) ${String(result.status)}${String(result.message)}`,
          result as unknown as ErrorOptions
        );
      }

      const data = result.data.mylists;
      cacheStorage.setItem(cacheKey, data, CACHE_EXPIRE_TIME);
      return data;
    }
    async findDeflistItemByWatchId(watchId: string): Promise<MylistItem> {
      const items: Array<MylistItem> = await this._getDeflistItems().catch(() => []);

      for (const item of items) {
        if (item.watchId === watchId) {
          return item;
        }
      }
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 旧実装は引数なしでrejectする契約のため維持する
      return Promise.reject();
    }
    async findMylistItemByWatchId(watchId: string, groupId: string): Promise<MylistItem> {
      const items: Array<MylistItem> = await this._getMylistItems(groupId).catch(() => []);

      for (const item of items) {
        if (item.watchId === watchId) {
          return item;
        }
      }
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 旧実装は引数なしでrejectする契約のため維持する
      return Promise.reject();
    }

    //nvapiに frontendId と frontendVersion の値が必要
    async removeDeflistItem(watchId: string, { frontendId = 6, frontendVersion = 0 }: FrontendIdVersion = {}) {
      const item = await this.findDeflistItemByWatchId(watchId).catch((err: unknown) => {
        throw new Error('動画が見つかりません', { result: err, status: 'fail' } as unknown as ErrorOptions);
      });

      const body = `itemIds=${item.itemId}`;
      const url = 'https://nvapi.nicovideo.jp/v1/users/me/watch-later?' + body;
      const cacheKey = 'deflistItems';

      const raw: unknown = await (netUtil as unknown as NetUtilLike)
        .fetch(url, {
          method: 'DELETE',
          headers: {
            'X-Frontend-Id': frontendId,
            'X-Frontend-Version': frontendVersion,
            'X-Request-With': 'https://www.nicovideo.jp',
          },
          credentials: 'include',
        })
        .then(readMylistResponse)
        .catch((err: unknown) => {
          throw new Error('とりあえずマイリストから削除失敗(2)', {
            result: err,
            status: 'fail',
          } as unknown as ErrorOptions);
        });
      const result = raw as MylistApiEnvelope;

      if (result.meta.status && result.meta.status === 200) {
        cacheStorage.removeItem(cacheKey);
        void emitter.emitAsync('deflistRemove', watchId);
        return {
          status: 'ok',
          result,
          message: 'とりあえずマイリストから削除',
        };
      }

      throw new Error(result.error!.description, {
        status: 'fail',
        result,
        code: result.error!.code,
      } as unknown as ErrorOptions);
    }

    //nvapiに frontendId と frontendVersion の値が必要
    async removeMylistItem(
      watchId: string,
      groupId: string,
      { frontendId = 6, frontendVersion = 0 }: FrontendIdVersion = {}
    ) {
      await this.findMylistItemByWatchId(watchId, groupId).catch((err: unknown) => {
        throw new Error('動画が見つかりません', { result: err, status: 'fail' } as unknown as ErrorOptions);
      });

      const body = 'itemIds=' + watchId;
      const url = 'https://nvapi.nicovideo.jp/v1/users/me/mylists/' + groupId + '/items?' + body;
      const cacheKey = `mylistItems: ${groupId}`;

      const raw: unknown = await (netUtil as unknown as NetUtilLike)
        .fetch(url, {
          method: 'DELETE',
          headers: {
            'X-Frontend-Id': frontendId,
            'X-Frontend-Version': frontendVersion,
            'X-Request-With': 'https://www.nicovideo.jp',
          },
          credentials: 'include',
        })
        .then(readMylistResponse)
        .catch((err: unknown) => {
          throw new Error('マイリストから削除失敗(2)', { result: err, status: 'fail' } as unknown as ErrorOptions);
        });
      const result = raw as MylistApiEnvelope;

      if (result.meta.status && result.meta.status === 200) {
        cacheStorage.removeItem(cacheKey);
        void emitter.emitAsync('mylistRemove', watchId, groupId);
        return {
          status: 'ok',
          result,
          message: 'マイリストから削除',
        };
      }

      throw new Error(result.error!.description, {
        status: 'fail',
        result,
        code: result.error!.code,
      } as unknown as ErrorOptions);
    }

    //nvapiに frontendId と frontendVersion の値が必要
    async addDeflistItem(
      watchId: string,
      description: string | undefined,
      isRetry = false,
      { frontendId = 6, frontendVersion = 0 }: FrontendIdVersion = {}
    ): Promise<{ status: string; result: unknown; message: string }> {
      const url = 'https://nvapi.nicovideo.jp/v1/users/me/watch-later';
      let body = `watchId=${watchId}&memo=`;
      if (description) {
        body += `${encodeURIComponent(description)}`;
      }
      const cacheKey = 'deflistItems';

      const raw: unknown = await (netUtil as unknown as NetUtilLike)
        .fetch(url, {
          method: 'POST',
          body,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Frontend-Id': frontendId,
            'X-Frontend-Version': frontendVersion,
            'X-Request-With': 'https://www.nicovideo.jp',
          },
          credentials: 'include',
        })
        .then(readMylistResponse)
        .catch((err: unknown) => {
          throw new Error('とりあえずマイリスト登録失敗(200)', {
            status: 'fail',
            result: err,
          } as unknown as ErrorOptions);
        });
      const result = raw as MylistApiEnvelope;
      if (result.meta.status && (result.meta.status === 200 || result.meta.status === 201)) {
        cacheStorage.removeItem(cacheKey);
        void emitter.emitAsync('deflistAdd', watchId, description);
        return {
          status: 'ok',
          result,
          message: 'とりあえずマイリスト登録',
        };
      }

      if (result.meta.status && result.meta.status === 409 && !isRetry) {
        /**
           すでに登録されている場合は、いったん削除して再度追加(先頭に移動)
           例えば、とりマイの300番目に登録済みだった場合に「登録済みです」と言われても探すのがダルいし、
           他の動画を追加していけば、そのうち押し出されて消えてしまう。
           なので、重複時にエラーを出すのではなく、「消してから追加」することによって先頭に持ってくる。
           登録済みの場合、409が返ってくるようになったのでこちらで処理
           */
        await this.removeDeflistItem(watchId).catch((err: { result?: unknown; code?: string }) => {
          throw new Error('とりあえずマイリスト登録失敗(101)', {
            status: 'fail',
            result: err.result,
            code: err.code,
          } as unknown as ErrorOptions);
        });
        const added = await this.addDeflistItem(watchId, description, true, { frontendId, frontendVersion });
        return {
          status: 'ok',
          result: added,
          message: 'とりあえずマイリストの先頭に移動',
        };
      }

      if (!result.meta.status || !result.error) {
        // result.errorが残っているかは不明
        throw new Error('とりあえずマイリスト登録失敗(100)', {
          status: 'fail',
          result,
        } as unknown as ErrorOptions);
      }

      throw new Error(result.error.description, {
        status: 'fail',
        result,
        code: result.error.code,
        message: result.error.description,
      } as unknown as ErrorOptions);
    }

    //nvapiに frontendId と frontendVersion の値が必要
    async addMylistItem(
      watchId: string,
      groupId: string,
      description: string | undefined,
      { frontendId = 6, frontendVersion = 0 }: FrontendIdVersion = {}
    ) {
      //const url = 'https://www.nicovideo.jp/api/mylist/add';
      let body = 'itemId=' + watchId + '&description='; //+ '&token=' + token + '&group_id=' + groupId;
      if (description) {
        body += encodeURIComponent(description);
      }
      const url = 'https://nvapi.nicovideo.jp/v1/users/me/mylists/' + groupId + '/items?' + body;
      const cacheKey = `mylistItems: ${groupId}`;

      const raw: unknown = await (netUtil as unknown as NetUtilLike)
        .fetch(url, {
          method: 'POST',
          body,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Frontend-Id': frontendId,
            'X-Frontend-Version': frontendVersion,
            'X-Request-With': 'https://www.nicovideo.jp',
          },
          credentials: 'include',
        })
        .then(readMylistResponse)
        .catch((err: unknown) => {
          throw new Error('マイリスト登録失敗(200)', {
            status: 'fail',
            result: err,
          } as unknown as ErrorOptions);
        });
      const result = raw as MylistApiEnvelope;

      if (result.meta.status && (result.meta.status === 200 || result.meta.status === 201)) {
        cacheStorage.removeItem(cacheKey);
        // マイリストに登録したらとりあえずマイリストから除去(=移動)
        this.removeDeflistItem(watchId).catch(() => {});
        return { status: 'ok', result, message: 'マイリスト登録' };
      }

      if (!result.meta.status /*|| !result.error*/) {
        throw new Error('マイリスト登録失敗(100)', { status: 'fail', result } as unknown as ErrorOptions);
      }

      // マイリストの場合は重複があっても「追加して削除」しない。
      // とりまいと違って押し出されることがないし、
      // シリーズ物が勝手に入れ替わっても困るため
      void emitter.emitAsync('mylistAdd', watchId, groupId, description);

      throw new Error(result.error!.description, {
        status: 'fail',
        result,
        code: result.error!.code,
      } as unknown as ErrorOptions);
    }
  }

  return new MylistApiLoader();
})();

//===END===

export { MylistApiLoader };
