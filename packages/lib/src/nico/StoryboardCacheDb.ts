import { IndexedDbStorage } from '../infra/IndexedDbStorage';

interface IndexedDbOpen {
  open: (info: unknown) => Promise<unknown>;
}

interface StoryboardInfo {
  status?: string;
  [key: string]: unknown;
}

interface StoryboardCacheRecord {
  watchId: string;
  updatedAt: number;
  sbInfo: StoryboardInfo;
}

interface StoryboardCacheStore {
  put: (record: StoryboardCacheRecord) => Promise<unknown>;
  updateTime: (params: { key: string }) => Promise<StoryboardCacheRecord | null>;
  delete: (params: { key: string }) => Promise<unknown>;
  close: () => Promise<unknown>;
  gc: (expireTime: number) => Promise<unknown>;
}

interface StoryboardCacheDb {
  cache: StoryboardCacheStore;
}

interface BridgeApi {
  bridgeDb: (info: unknown) => Promise<unknown>;
}

interface StoryboardCacheDbApi {
  put: (watchId: string, sbInfo?: StoryboardInfo) => Promise<StoryboardCacheRecord | undefined>;
  get: (watchId: string) => Promise<unknown>;
  delete: (watchId: string) => Promise<unknown>;
  close: () => Promise<unknown>;
  gc: (expireTime: number) => Promise<unknown>;
}

//===BEGIN===
const StoryboardCacheDb = (() => {
  const WATCH_INFO = {
    name: 'storyboard',
    ver: 2,
    stores: [
      {
        name: 'cache',
        indexes: [{ name: 'updatedAt', keyPath: 'updatedAt', params: { unique: false } }],
        definition: { keyPath: 'watchId', autoIncrement: false },
      },
    ],
  };

  let db: StoryboardCacheDb | undefined;
  let instance: StoryboardCacheDbApi | undefined;
  let NicoVideoApi: BridgeApi | undefined;
  const initWorker = async () => {
    if (db) {
      return db;
    }
    if (location.host === 'www.nicovideo.jp') {
      db = db || ((await (IndexedDbStorage as unknown as IndexedDbOpen).open(WATCH_INFO)) as StoryboardCacheDb);
    } else {
      const opened: unknown = await NicoVideoApi!.bridgeDb(WATCH_INFO);
      db = db || (opened as StoryboardCacheDb);
    }
    return db;
  };

  const open = async () => {
    if (instance) {
      return instance;
    }
    await initWorker();
    const cacheDb = db!['cache'];
    instance = {
      // eslint-disable-next-line @typescript-eslint/require-await -- 旧実装はasyncでPromiseを返却する契約のため維持する
      async put(watchId: string, sbInfo: StoryboardInfo = {}) {
        if (sbInfo.status !== 'ok') {
          console.warn('invalid sbInfo', watchId, sbInfo);
          return;
        }
        const record: StoryboardCacheRecord = {
          watchId,
          updatedAt: Date.now(),
          sbInfo,
        };
        void cacheDb.put(record);
        return record;
      },
      async get(watchId: string) {
        const record = await cacheDb.updateTime({ key: watchId });
        if (!record) {
          return null;
        }
        return record.sbInfo;
      },
      delete(watchId: string) {
        return cacheDb.delete({ key: watchId });
      },
      close() {
        return cacheDb.close();
      },
      gc(expireTime: number) {
        return cacheDb.gc(expireTime);
      },
    };
    void instance.gc(7 * 24 * 60 * 60 * 1000);
    return instance;
  };
  const put = (watchId: string, sbInfo: StoryboardInfo = {}) => open().then((db) => db.put(watchId, sbInfo));
  const get = (watchId: string) => open().then((db) => db.get(watchId));
  const del = (watchId: string) => open().then((db) => db.delete(watchId));
  const close = () => open().then((db) => db.close());
  const gc = (expireTime = 24 * 60 * 60 * 1000) => open().then((db) => db.gc(expireTime));
  const api = (api: BridgeApi) => (NicoVideoApi = api);

  return { initWorker, open, put, get, delete: del, close, gc, db, api };
})();
//===END===
export { StoryboardCacheDb };
