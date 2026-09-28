interface HlsWorkerScope {
  onmessage: ((e: MessageEvent) => unknown) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

export const StorageWorker = function (self: HlsWorkerScope): void {
  const Config = {
    cache_expire_time: 6 * 60 * 60 * 1000,
  };

  interface HlsDbStore {
    transaction: IDBTransaction;
    store: IDBObjectStore;
  }
  interface HlsDbMeta {
    hash: string;
    videoId: string;
    meta: unknown;
    buffer?: ArrayBuffer | null;
    expiresAt?: number;
  }

  class IndexDBStorage {
    declare static _instance: IndexDBStorage | undefined;
    declare static db: IDBDatabase | null;
    declare isBusy: boolean;
    static get dbName(): string {
      return 'futatsume_hls';
    }
    static get ver(): number {
      return 4;
    }
    static get storeNames(): Array<string> {
      return ['ts-data'];
    }

    static get expireTime(): number {
      return Config.cache_expire_time;
    }

    static getInstance(): IndexDBStorage {
      if (this._instance) {
        return this._instance;
      }
      this._instance = new this();
      return this._instance;
    }

    static async init(): Promise<IDBDatabase> {
      if (this.db) {
        return Promise.resolve(this.db);
      }
      return new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(this.dbName, this.ver);
        req.onupgradeneeded = (e: IDBVersionChangeEvent): void => {
          const db = (e.target as IDBOpenDBRequest).result;

          if (db.objectStoreNames.contains(this.dbName)) {
            db.deleteObjectStore(this.dbName);
          }

          const [meta] = this.storeNames;
          const store = db.createObjectStore(meta as string, { keyPath: 'expiresAt', autoIncrement: false });
          store.createIndex('hash', 'hash', { unique: true });
          store.createIndex('videoId', 'videoId', { unique: false });
        };

        req.onsuccess = (e: Event): void => {
          this.db = (e.target as IDBOpenDBRequest).result;
          resolve(this.db);
        };

        req.onerror = reject;
      });
    }

    static close(): void {
      if (!this.db) {
        return;
      }
      this.db.close();
      this.db = null;
    }

    async getStore({ mode = 'readwrite' }: { mode?: IDBTransactionMode } = {}): Promise<HlsDbStore> {
      // eslint-disable-next-line no-async-promise-executor, @typescript-eslint/no-misused-promises -- 原文の非同期 executor を温存する
      return new Promise<HlsDbStore>(async (resolve, reject) => {
        const ctor = this.constructor as typeof IndexDBStorage;
        const db = await ctor.init();
        const [data] = ctor.storeNames;
        // window.console.log('getStore', this.storeName, mode);
        const tx = db.transaction(ctor.storeNames, mode);
        tx.oncomplete = resolve as unknown as (this: IDBTransaction, ev: Event) => void;
        tx.onerror = reject;
        return resolve({
          transaction: tx,
          store: tx.objectStore(data as string),
        });
      });
    }

    putRecord(store: IDBObjectStore, record: unknown): Promise<unknown> {
      return new Promise<unknown>((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = (e: Event): void => {
          resolve((e.target as IDBRequest).result);
        };
        req.onerror = reject;
      });
    }

    getRecord(
      store: IDBObjectStore,
      key: string,
      { index, timeout }: { index?: string; timeout?: number }
    ): Promise<unknown> {
      return new Promise<unknown>((resolve, reject) => {
        const req = index ? store.index(index).get(key) : store.get(key);
        req.onsuccess = (e: Event): void => {
          resolve((e.target as IDBRequest).result);
        };
        req.onerror = reject;
        if (timeout) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 既存プロトコルの拒否値を温存する
          setTimeout(() => reject(`timeout: key${key}`), timeout);
        }
      });
    }

    getCount(
      store: IDBObjectStore,
      key: string,
      { index, timeout }: { index?: string; timeout?: number }
    ): Promise<number> {
      return new Promise<number>((resolve, reject) => {
        const req = index ? store.index(index).count(key) : store.count(key);
        req.onsuccess = (): void => {
          resolve(req.result);
        };
        req.onerror = (): unknown => resolve;
        if (timeout) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 既存プロトコルの拒否値を温存する
          setTimeout(() => reject(`timeout: key${key}`), timeout);
        }
      });
    }

    deleteRecord(store: IDBObjectStore, key: string, { index }: { index?: string }): Promise<unknown> {
      return new Promise<unknown>((resolve, reject) => {
        let deleted = 0;
        const range = IDBKeyRange.only(key);
        const req = index ? store.index(index).openCursor(range) : store.openCursor(range);
        req.onsuccess = (e: Event): void => {
          const result = (e.target as IDBRequest).result as IDBCursorWithValue | null;
          if (!result) {
            return resolve(deleted > 0);
          }
          result.delete();
          deleted++;
          result.continue();
        };
        req.onerror = reject;
      });
    }

    async load({ hash }: { hash: string }): Promise<HlsDbMeta | null> {
      try {
        const { store } = await this.getStore({ mode: 'readonly' });
        const meta = (await this.getRecord(store, hash, { index: 'hash', timeout: 3000 })) as HlsDbMeta | null;
        // this.constructor.close();
        if (!meta) {
          return null;
        }
        return meta;
      } catch (e) {
        console.warn('exeption', e);
        return null;
      }
    }

    async hasData({ hash }: { hash: string }): Promise<boolean> {
      try {
        const { store } = await this.getStore({ mode: 'readonly' });
        return 0 < (await this.getCount(store, hash, { index: 'hash', timeout: 3000 }));
      } catch (e) {
        console.warn('exeption', e);
        return false;
      }
    }

    async save(
      { hash, videoId, meta }: { hash: string; videoId: string; meta: unknown },
      buffer: ArrayBuffer
    ): Promise<unknown> {
      const now = Date.now();
      const ctor = this.constructor as typeof IndexDBStorage;
      const expiresAt = now + ctor.expireTime;
      const record = {
        expiresAt,
        hash,
        videoId,
        expireDate: new Date(expiresAt).toLocaleString(),
        meta,
        updatedAt: now,
        buffer,
      };
      // console.log('save', record);
      const { transaction, store } = await this.getStore();
      try {
        await this.deleteRecord(store, hash, { index: 'hash' });
        const result = await this.putRecord(store, record);
        if (transaction.commit) {
          transaction.commit();
        }
        ctor.close();
        return result;
      } catch (e) {
        console.error('save fail', e);
        transaction.abort();
        return false;
      }
    }

    async gc(): Promise<unknown> {
      if (this.isBusy) {
        return;
      }
      const now = Date.now();
      const { store, transaction } = await this.getStore();
      this.isBusy = true;
      return new Promise<void>((resolve, reject) => {
        const range = IDBKeyRange.upperBound(now);
        const req = store.delete(range);
        req.onsuccess = (): void => {
          this.isBusy = false;
          (this.constructor as typeof IndexDBStorage).close();
          if (transaction.commit) {
            transaction.commit();
          }
          resolve();
        };
        req.onerror = (e: Event): void => {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 既存プロトコルの拒否値を温存する
          reject(e);
          this.isBusy = false;
        };
      }).catch((e: unknown) => {
        this.isBusy = false;
        console.error('gc fail', e);
        store.clear();
      });
    }

    async clear(): Promise<unknown> {
      const { store } = await this.getStore();
      return new Promise<void>((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = (): void => {
          resolve();
        };
        req.onerror = (e: Event): void => {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 既存プロトコルの拒否値を温存する
          reject(e);
        };
      });
    }
  }

  interface HlsStoredData {
    meta: unknown;
    buffer: ArrayBuffer;
  }
  const Storage = {
    async save(
      { hash, videoId, meta }: { hash: string; videoId: string; meta: unknown },
      buffer: ArrayBuffer
    ): Promise<unknown> {
      return IndexDBStorage.getInstance().save({ hash, videoId, meta }, buffer);
    },
    async load(...args: [{ hash: string }]): Promise<HlsStoredData | null> {
      try {
        const result = await IndexDBStorage.getInstance().load(...args);
        // console.log('Storage load result', result);
        if (!result) {
          return null;
        }
        const buffer = result.buffer;
        return { meta: result.meta, buffer: buffer as ArrayBuffer };
      } catch (e) {
        console.warn('Storage load fail', e);
        return null;
      }
    },
    async hasData(...args: [{ hash: string }]): Promise<{ result: boolean }> {
      const result = await IndexDBStorage.getInstance().hasData(...args);
      return { result };
    },
    async gc(): Promise<unknown> {
      if (navigator && navigator.locks) {
        return await navigator.locks.request('FutatsumeHLS_GC', { ifAvailable: true }, async (lock: Lock | null) => {
          if (!lock) {
            return;
          }
          await IndexDBStorage.getInstance().gc();
          await new Promise<void>((r) => setTimeout(r, 5000));
        });
      } else {
        return IndexDBStorage.getInstance().gc();
      }
    },
    async clear(): Promise<unknown> {
      return IndexDBStorage.getInstance().clear();
    },
  };

  self.onmessage = async (e: MessageEvent): Promise<void> => {
    const msg = e.data as {
      data: { hash: string; videoId: string; meta: unknown };
      id: string;
      command: string;
      buffer: ArrayBuffer;
    };
    let result: unknown;
    const data = msg.data;
    const id = msg.id;
    let status = 'ok';
    try {
      switch (msg.command) {
        case 'config':
          Object.assign(Config, e.data);
          return self.postMessage({ id, result: 'ok' });
        case 'save':
          // let {hash, videoId, meta} = data;
          result = await Storage.save(data, msg.buffer);
          return self.postMessage({ id, result });
        case 'load':
          result = await Storage.load(data);
          if (!result) {
            return self.postMessage({ id, status, result: null }, []);
          }
          return self.postMessage(
            { id, status, result: (result as HlsStoredData).meta, buffer: (result as HlsStoredData).buffer },
            [(result as HlsStoredData).buffer]
          );
        case 'hasData':
          result = await Storage.hasData(data);
          if (!result) {
            return self.postMessage({ id, status, result: false });
          }
          return self.postMessage({ id, status, result });
        case 'gc':
          void Storage.gc();
          return self.postMessage({ id, status, result: null });
        case 'clear':
          result = await Storage.clear();
          return self.postMessage({ id, status, result });
      }
    } catch (err) {
      status = 'fail';
      return self.postMessage({ e, id, status, result: err });
    }
  };
};
