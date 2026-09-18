interface CacheItem {
  data: unknown;
  type: string;
  expiredAt: string | number;
}

type LooseStorage = Storage & Record<string, string | undefined>;

import { textUtil } from '../text/textUtil';
import { netUtil } from './netUtil';

const PRODUCT = 'TEST';
// _ は連結スコープの UMD グローバル（@types/lodash、src/concat-globals.d.ts 参照）。
//===BEGIN===

const CacheStorage = (() => {
  const PREFIX = `${PRODUCT}_cache_`;

  class CacheStorage {
    _storage: Storage;
    constructor(storage: Storage) {
      this._storage = storage;
      this.gc = _.debounce(this.gc.bind(this), 100);
    }

    gc(now = NaN): void {
      const storage = this._storage as unknown as LooseStorage;
      now = isNaN(now) ? Date.now() : now;
      Object.keys(storage).forEach((key) => {
        if (key.indexOf(PREFIX) === 0) {
          let item: CacheItem | undefined;
          try {
            item = JSON.parse(String(storage[key])) as CacheItem;
          } catch (e) {
            storage.removeItem(key);
          }
          if (item!.expiredAt === '' || (item!.expiredAt as number) > now) {
            return;
          }
          storage.removeItem(key);
        }
      });
    }

    setItem(key: string, data: unknown, expireTime?: number): void {
      key = PREFIX + key;
      const expiredAt = typeof expireTime === 'number' ? Date.now() + expireTime : '';

      const cacheData: CacheItem = {
        data: data,
        type: typeof data,
        expiredAt: expiredAt,
      };

      try {
        (this._storage as unknown as LooseStorage)[key] = JSON.stringify(cacheData);
        this.gc();
      } catch (e) {
        if (
          (e as { name?: unknown }).name === 'QuotaExceededError' ||
          (e as { name?: unknown }).name === 'NS_ERROR_DOM_QUOTA_REACHED'
        ) {
          this.gc(0);
        }
      }
    }

    getItem(key: string): unknown {
      key = PREFIX + key;
      const storage = this._storage as unknown as LooseStorage;
      if (!(Object.prototype.hasOwnProperty.call(storage, key) || storage[key] !== undefined)) {
        return null;
      }
      let item: CacheItem;
      try {
        item = JSON.parse(String(storage[key])) as CacheItem;
      } catch {
        storage.removeItem(key);
        return null;
      }

      if (item.expiredAt === '' || (item.expiredAt as number) > Date.now()) {
        return item.data;
      }
      return null;
    }

    removeItem(key: string): void {
      key = PREFIX + key;
      const storage = this._storage as unknown as LooseStorage;
      if (Object.prototype.hasOwnProperty.call(storage, key) || storage[key] !== undefined) {
        storage.removeItem(key);
      }
    }

    clear(): void {
      const storage = this._storage as unknown as LooseStorage;
      Object.keys(storage).forEach((v) => {
        if (v.indexOf(PREFIX) === 0) {
          storage.removeItem(v);
        }
      });
    }
  }

  return CacheStorage;
})();

//===END===

export { CacheStorage };
export type { CacheItem };
