interface StoreIndexMeta {
  name: string;
  keyPath: string | string[];
  params?: IDBIndexParameters;
}

interface StoreMeta {
  name: string;
  definition?: IDBObjectStoreParameters;
  indexes?: StoreIndexMeta[];
}

interface DbOpenParams {
  name: string;
  ver?: number;
  stores?: StoreMeta[];
}

interface DbRecord {
  updatedAt?: number;
  [key: string]: unknown;
}

interface DbWorker {
  post: (message: unknown, transfer?: unknown) => Promise<unknown>;
  [key: string]: unknown;
}

import { workerUtil } from './workerUtil';
//===BEGIN===
const IndexedDbStorage = (() => {
  const workerFunc = function (self: { onmessage: unknown }) {
    const db: Record<string, IDBDatabase | null> = {};

    const controller = {
      async init({ name, ver, stores }: DbOpenParams & { name: string }): Promise<IDBDatabase | null> {
        if (db[name]) {
          return Promise.resolve(db[name]);
        }
        return new Promise((resolve, reject) => {
          const req = indexedDB.open(name, ver);
          req.onupgradeneeded = (e) => {
            const _db = (e.target as IDBRequest).result as IDBDatabase;

            for (const meta of stores as StoreMeta[]) {
              if (_db.objectStoreNames.contains(meta.name)) {
                _db.deleteObjectStore(meta.name);
              }
              const store = _db.createObjectStore(meta.name, meta.definition);
              const indexes = meta.indexes || [];
              for (const idx of indexes) {
                store.createIndex(idx.name, idx.keyPath, idx.params);
              }
              store.transaction.oncomplete = () => {
                console.log('store.transaction.complete', JSON.stringify({ name, ver, store: meta }));
              };
            }
          };
          req.onsuccess = (e) => {
            db[name] = (e.target as IDBRequest).result as IDBDatabase;
            resolve(db[name]);
          };
          req.onerror = reject as (e: Event) => void;
        });
      },
      close({ name }: { name: string }): void {
        if (!db[name]) {
          return;
        }
        db[name].close();
        db[name] = null;
      },
      async getStore({
        name,
        storeName,
        mode = 'readonly',
      }: {
        name: string;
        storeName: string;
        mode?: IDBTransactionMode;
      }): Promise<{ store: IDBObjectStore; transaction: IDBTransaction }> {
        const db = await this.init({ name });
        return new Promise((resolve, reject) => {
          const tx = (db as IDBDatabase).transaction(storeName, mode);
          tx.onerror = reject as (e: Event) => void;
          return resolve({
            store: tx.objectStore(storeName),
            transaction: tx,
          });
        });
      },
      async put({ name, storeName, data }: { name: string; storeName: string; data: unknown }): Promise<unknown> {
        const { store, transaction } = await this.getStore({ name, storeName, mode: 'readwrite' });
        return new Promise((resolve, reject) => {
          const req = store.put(data);
          req.onsuccess = (e) => {
            if (transaction.commit) {
              transaction.commit();
            }
            resolve((e.target as IDBRequest).result);
          };
          req.onerror = reject as (e: Event) => void;
        });
      },
      async get({
        name,
        storeName,
        data: { key, index, timeout },
      }: {
        name: string;
        storeName: string;
        data: { key?: unknown; index?: string; timeout?: number };
      }): Promise<unknown> {
        const { store } = await this.getStore({ name, storeName });
        // console.log('get', {name, storeName, key, index, timeout});
        return new Promise((resolve, reject) => {
          const req = index ? store.index(index).get(key as IDBValidKey) : store.get(key as IDBValidKey);
          req.onsuccess = (e) => resolve((e.target as IDBRequest).result);
          req.onerror = reject as (e: Event) => void;
          if (timeout) {
            setTimeout(() => {
              // timeout 通知は文字列プロトコルのため Error 限定しない
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
              reject(`timeout: key${key as string}`);
            }, timeout);
          }
        });
      },
      // データ取得しつつupdatedAt更新
      async updateTime({
        name,
        storeName,
        data: { key, index, timeout },
      }: {
        name: string;
        storeName: string;
        data: { key?: unknown; index?: string; timeout?: number };
      }): Promise<DbRecord | null> {
        const record = (await this.get({ name, storeName, data: { key, index, timeout } })) as
          DbRecord | null | undefined;
        if (!record) {
          return null;
        }
        record.updatedAt = Date.now();
        void this.put({ name, storeName, data: record });
        return record;
      },
      async delete({
        name,
        storeName,
        data: { key, index },
      }: {
        name: string;
        storeName: string;
        data: { key?: unknown; index?: string };
      }): Promise<boolean> {
        const { store, transaction } = await this.getStore({ name, storeName, mode: 'readwrite' });
        return new Promise((resolve, reject) => {
          let remove = 0;
          const range = IDBKeyRange.only(key);
          const req = index ? store.index(index).openCursor(range) : store.openCursor(range);
          req.onsuccess = (e) => {
            const result = (e.target as IDBRequest).result as IDBCursorWithValue | null;
            if (!result) {
              if (transaction.commit) {
                transaction.commit();
              }
              return resolve(remove > 0);
            }
            result.delete();
            remove++;
            result.continue();
          };
          req.onerror = reject as (e: Event) => void;
        });
      },
      async clear({ name, storeName }: { name: string; storeName: string }): Promise<void> {
        const { store } = await this.getStore({ name, storeName, mode: 'readwrite' });
        return new Promise((resolve, reject) => {
          const req = store.clear();
          req.onsuccess = () => {
            console.timeEnd('storage clear');
            resolve();
          };
          req.onerror = (e) => {
            console.timeEnd('storage clear');
            // IDB の失敗はイベントオブジェクトのまま透過させるため Error 限定しない
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(e);
          };
        });
      },
      async gc({
        name,
        storeName,
        data: { expireTime, index },
      }: {
        name: string;
        storeName: string;
        data: { expireTime: number; index?: string };
      }): Promise<{ status: string; count: number; time: number } | undefined> {
        index = index || 'updatedAt';
        const { store, transaction } = await this.getStore({ name, storeName, mode: 'readwrite' });
        void transaction;
        const now = Date.now(),
          ptime = performance.now();
        const expiresAt = index !== 'expiresAt' ? now - expireTime : now;
        const expireDateTime = new Date(expiresAt).toLocaleString();
        const timekey = `GC [DELETE FROM ${name}.${storeName} WHERE ${index} < '${expireDateTime}'] `;
        console.time(timekey);
        let count = 0;
        return new Promise<{ status: string; count: number; time: number } | undefined>((resolve, reject) => {
          const range = IDBKeyRange.upperBound(expiresAt);
          const idx = store.index(index);
          const req = idx.openCursor(range);
          req.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null;
            if (cursor) {
              count++;
              cursor.delete();
              return cursor.continue();
            }
            console.timeEnd(timekey);
            resolve({ status: 'ok', count, time: performance.now() - ptime });
            if (count) {
              console.log('deleted %s records.', count);
            }
          };
          req.onerror = reject as (e: Event) => void;
        }).catch((e) => {
          console.error('gc fail', { name, storeName, data: { expireTime, index }, timekey }, e);
          store.clear();
          return undefined;
        });
      },
    };

    self.onmessage = async ({
      command,
      params,
    }: {
      command: string;
      params: DbOpenParams & Record<string, unknown>;
    }) => {
      try {
        switch (command) {
          case 'init':
            await (controller as unknown as Record<string, (params: unknown) => Promise<unknown>>)[command]!(params);
            return 'ok';
          case 'put':
            return controller.put(params as { name: string; storeName: string; data: unknown });
          case 'updateTime':
          case 'get':
            return (controller as unknown as Record<string, (params: unknown) => Promise<unknown>>)[command]!(params);
          default:
            // controller メソッドは常に Promise を返すため `|| 'ok'` は到達不能 (温存せず除去)
            return (controller as unknown as Record<string, (params: unknown) => Promise<unknown>>)[command]!(params);
        }
      } catch (err) {
        console.warn('command failed: ', { command, params });
        throw err;
      }
    };
    return controller;
  };

  const workers: Map<unknown, DbWorker> = new Map();
  const open = async (
    { name, ver, stores }: DbOpenParams,
    func?: { toString: () => string } | string
    // open は Promise 連鎖の API のため async を維持する
    // eslint-disable-next-line @typescript-eslint/require-await
  ): Promise<Record<string, unknown>> => {
    let worker: DbWorker;
    if (func) {
      let _func: string | typeof workerFunc = workerFunc;
      if (func) {
        _func = `
        (() => {
        const controller = (${workerFunc.toString()})(self);
        (${func.toString()})(self)
        })
        `;
      }
      worker =
        workers.get(func) ||
        (workerUtil.createCrossMessageWorker(_func, { name: `IndexedDb[${name}]` }) as unknown as DbWorker);
      workers.set(func, worker);
    } else {
      worker =
        workers.get(workerFunc) ||
        (workerUtil.createCrossMessageWorker(workerFunc, { name: 'IndexedDb' }) as unknown as DbWorker);
      workers.set(workerFunc, worker);
    }

    void worker.post({ command: 'init', params: { name, ver, stores } });

    const post = (command: string, data: unknown, storeName: string, transfer?: unknown): Promise<unknown> => {
      const params = { data, name, storeName, transfer };
      return worker.post({ command, params }, transfer);
    };

    const result: Record<string, unknown> = { worker };
    for (const meta of stores as StoreMeta[]) {
      const storeName = meta.name;
      result[storeName] = ((storeName: string) => {
        return {
          close: (params: unknown) => post('close', params, storeName),
          put: (record: unknown, transfer?: unknown) => post('put', record, storeName, transfer),
          get: ({ key, index, timeout }: { key?: unknown; index?: string; timeout?: number }) =>
            post('get', { key, index, timeout }, storeName),
          updateTime: ({ key, index, timeout }: { key?: unknown; index?: string; timeout?: number }) =>
            post('updateTime', { key, index, timeout }, storeName),
          delete: ({ key, index, timeout }: { key?: unknown; index?: string; timeout?: number }) =>
            post('delete', { key, index, timeout }, storeName),
          gc: (expireTime = 30 * 24 * 60 * 60 * 1000, index = 'updatedAt') =>
            post('gc', { expireTime, index }, storeName),
        };
      })(storeName);
    }
    return result;
  };
  return { open };
})();

//===END===

export { IndexedDbStorage };
export type { StoreMeta, DbOpenParams };
