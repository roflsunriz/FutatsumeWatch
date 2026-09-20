import { IndexedDbStorage } from '../infra/IndexedDbStorage';
import { parseThumbInfo } from './parseThumbInfo';
import type { ThumbInfoData } from './parseThumbInfo';

interface IndexedDbOpen {
  open: (info: unknown) => Promise<unknown>;
}

interface ThumbCacheRecord {
  watchId: string;
  videoId: string;
  postedAt: number;
  updatedAt: number;
  xml: string;
  thumbInfo: ThumbInfoData;
}

interface ThumbCacheStore {
  put: (record: ThumbCacheRecord) => Promise<unknown>;
  updateTime: (params: { key: string }) => Promise<ThumbCacheRecord | null>;
  delete: (params: { key: string }) => Promise<unknown>;
  close: () => Promise<unknown>;
  gc: (expireTime: number) => Promise<unknown>;
}

interface ThumbCacheDb {
  cache: ThumbCacheStore;
}
//===BEGIN===
const ThumbInfoCacheDb = (() => {
  const THUMB_INFO = {
    name: 'thumb-info',
    ver: 1,
    stores: [
      {
        name: 'cache',
        indexes: [
          { name: 'postedAt', keyPath: 'postedAt', params: { unique: false } },
          { name: 'updatedAt', keyPath: 'updatedAt', params: { unique: false } },
        ],
        definition: { keyPath: 'watchId', autoIncrement: false },
      },
    ],
  };

  let db: ThumbCacheDb | undefined;
  const open = async () => {
    db = db || ((await (IndexedDbStorage as unknown as IndexedDbOpen).open(THUMB_INFO)) as ThumbCacheDb);
    const cacheDb = db['cache'];
    void cacheDb.gc(90 * 24 * 60 * 60 * 1000);
    return {
      /**
       * @params {string} xmlText
       * @params {ThumbInfoData?}
       */
      put: (xml: string, thumbInfo: ThumbInfoData | null = null) => {
        thumbInfo = thumbInfo || parseThumbInfo(xml);
        if (thumbInfo.status !== 'ok') {
          return;
        }
        const watchId = thumbInfo.v;
        const videoId = thumbInfo.id;
        const postedAt = new Date(thumbInfo.postedAt).getTime();
        const updatedAt = Date.now();
        const record: ThumbCacheRecord = {
          watchId,
          videoId,
          postedAt,
          updatedAt,
          xml,
          thumbInfo,
        };
        void cacheDb.put(record);
        return { watchId, updatedAt };
      },
      get: (watchId: string) => cacheDb.updateTime({ key: watchId }),
      delete: (watchId: string) => cacheDb.delete({ key: watchId }),
      close: () => cacheDb.close(),
    };
  };

  return { open };
})();

//===END===
export { ThumbInfoCacheDb };
