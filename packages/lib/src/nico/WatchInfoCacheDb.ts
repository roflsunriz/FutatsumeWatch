import { IndexedDbStorage } from '../infra/IndexedDbStorage';

interface IndexedDbOpen {
  open: (info: unknown) => Promise<unknown>;
}

interface WatchVideoInfo {
  videoId?: string;
  postedAt?: string | number;
  threadId?: string | number;
  owner?: { linkId?: string } | null;
  toJSON?: () => unknown;
  [key: string]: unknown;
}

interface WatchPutOptions {
  videoInfo?: WatchVideoInfo | null;
  watchCount?: number;
  currentTime?: number;
  threadInfo?: unknown;
  comment?: unknown;
  heatMap?: unknown;
  config?: unknown;
}

interface WatchCacheStore {
  put: (record: Record<string, unknown>) => Promise<unknown>;
  updateTime: (params: { key: string }) => Promise<Record<string, unknown> | null>;
  delete: (params: { key: string }) => Promise<unknown>;
  close: () => Promise<unknown>;
  gc: (expireTime: number) => Promise<unknown>;
}

interface WatchCacheDb {
  cache: WatchCacheStore;
}

interface BridgeApi {
  bridgeDb: (info: unknown) => Promise<unknown>;
}

interface WatchCacheDbApi {
  put: (watchId: string, options?: WatchPutOptions) => Promise<Record<string, unknown>>;
  get: (watchId: string) => Promise<Record<string, unknown> | null>;
  delete: (watchId: string) => Promise<unknown>;
  close: () => Promise<unknown>;
  gc: (expireTime: number) => Promise<unknown>;
}

//===BEGIN===
const WatchInfoCacheDb = (() => {
  const WATCH_INFO = {
    name: 'watch-info',
    ver: 2,
    stores: [
      {
        name: 'cache',
        indexes: [
          { name: 'videoId', keyPath: 'videoId', params: { unique: false } },
          { name: 'threadId', keyPath: 'threadId', params: { unique: false } },
          { name: 'ownerId', keyPath: 'ownerId', params: { unique: false } },
          { name: 'watchCount', keyPath: 'watchCount', params: { unique: false } },
          { name: 'postedAt', keyPath: 'postedAt', params: { unique: false } },
          { name: 'updatedAt', keyPath: 'updatedAt', params: { unique: false } },
        ],
        definition: { keyPath: 'watchId', autoIncrement: false },
      },
    ],
  };

  let db: WatchCacheDb | undefined;
  let instance: WatchCacheDbApi | undefined;
  let NicoVideoApi: BridgeApi | undefined;
  const initWorker = async () => {
    if (db) {
      return db;
    }
    if (location.host === 'www.nicovideo.jp') {
      db = db || ((await (IndexedDbStorage as unknown as IndexedDbOpen).open(WATCH_INFO)) as WatchCacheDb);
    } else {
      const opened: unknown = await NicoVideoApi!.bridgeDb(WATCH_INFO);
      db = db || (opened as WatchCacheDb);
    }
    return db;
  };

  const open = async () => {
    if (instance) {
      return instance;
    }
    await initWorker();
    const cacheDb = db!['cache'];
    return (instance = {
      async put(watchId: string, options: WatchPutOptions = {}) {
        const videoInfo: WatchVideoInfo | null = options.videoInfo || null;
        const videoInfoRawData: unknown = videoInfo && videoInfo.toJSON ? videoInfo.toJSON() : videoInfo;
        const cache: Record<string, unknown> = (await cacheDb.updateTime({ key: watchId })) || {};
        const now = Date.now();
        const videoId: unknown = videoInfo ? videoInfo.videoId : watchId;
        const postedAt: unknown = videoInfo ? new Date(videoInfo.postedAt as string).getTime() : 0;
        const threadId: unknown = videoInfo ? (videoInfo.threadId as unknown as number) * 1 : 0;
        const updatedAt = Date.now();
        const resume = (cache.resume as Array<{ now: number; time: number }>) || [];
        const watchCount = ((cache.watchCount as number) || 0) + (options.watchCount === 1 ? 1 : 0);

        if (typeof options.currentTime === 'number' && options.currentTime > 0) {
          resume.unshift({ now, time: options.currentTime });
        }
        resume.length = Math.min(10, resume.length);
        const ownerId = (videoInfo as { owner: { linkId?: string } } | null)?.owner.linkId ?? '';

        const comment = (cache.comment as Array<unknown>) || [];
        if (options.comment) {
          comment.push(comment);
        }
        const record: Record<string, unknown> = {
          watchId,
          videoId: (cache.videoId ? cache.videoId : videoId) || '',
          threadId: (cache.threadId ? cache.threadId : threadId) || '',
          ownerId: (ownerId ? ownerId : cache.ownerId) || '',
          watchCount,
          postedAt: cache && cache.postedAt ? cache.postedAt : postedAt,
          updatedAt,
          videoInfo: videoInfoRawData ? videoInfoRawData : cache.videoInfo,
          threadInfo: (options.threadInfo ? options.threadInfo : cache.threadInfo) || 0,
          comment,
          resume,
          heatMap: (options.heatMap ? options.heatMap : cache.heatMap) || null,
          config: (options.config ? options.config : cache.config) || '',
        };
        void cacheDb.put(record);
        return record;
      },
      get(watchId: string) {
        return cacheDb.updateTime({ key: watchId });
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
    });
  };
  const put = (watchId: string, options: WatchPutOptions = {}) => open().then((db) => db.put(watchId, options));
  const get = (watchId: string) => open().then((db) => db.get(watchId));
  const del = (watchId: string) => open().then((db) => db.delete(watchId));
  const close = () => open().then((db) => db.close());
  const gc = (expireTime: number) => open().then((db) => db.gc(expireTime));
  const api = (api: BridgeApi) => (NicoVideoApi = api);

  return { initWorker, open, put, get, delete: del, close, gc, api };
})();
//===END===
export { WatchInfoCacheDb };
