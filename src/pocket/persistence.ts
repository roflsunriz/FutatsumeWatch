import _ from 'lodash';
import { CrossDomainGate } from '../../packages/lib/src/infra/cross-domain-gate';
import { DataStorage } from '../../packages/lib/src/infra/data-storage';
import { parseThumbInfo } from '../../packages/lib/src/nico/parse-thumb-info';
import { Emitter } from '../../packages/lib/src/emitter';
import { bounce } from '../../packages/lib/src/infra/bounce';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import type { BounceCallback } from '../../packages/lib/src/infra/bounce';
import type { ThumbInfoOk, ThumbInfoData } from '../../packages/lib/src/nico/parse-thumb-info';
import type {
  CacheItemData,
  CrossDomainGateApi,
  MylistPocketApi,
  PocketBroadcast,
  PocketDataStorage,
  PocketStorage,
  PocketThumbInfo,
  PocketUtil,
  PocketWindowMessage,
  ThumbOwnerWithLocale,
} from './types';

export function createPocketPersistence({
  PRODUCT,
  util,
  pocket: MylistPocket,
}: {
  PRODUCT: string;
  util: PocketUtil;
  pocket: MylistPocketApi;
}) {
  const config = (() => {
    const DEFAULT_CONFIG = {
      debug: false,

      'videoInfo.openNewWindow': false,
      'mylist.enableAutoComment': true, // マイリストコメントに投稿者を入れる

      'responsive.matrix': false,

      'nicoad.hide': false,

      'ng.enable': false,
      'ng.owner': '',
      'ng.word': '',
      'ng.tag': '',

      'fav.owner': '',
      'fav.word': '',
      'fav.tag': '',
    };
    return new DataStorage(DEFAULT_CONFIG, {
      prefix: `${PRODUCT}_config`,
      ignoreExportKeys: [],
      readonly: !location || location.host !== 'www.nicovideo.jp',
      storage: localStorage,
    });
  })() as unknown as PocketDataStorage;

  MylistPocket.broadcast = (function (config: PocketDataStorage): PocketBroadcast | undefined {
    if (!window.BroadcastChannel) {
      return;
    }
    const broadcastChannel = new window.BroadcastChannel(PRODUCT);

    const onBroadcastMessage = (e: MessageEvent): void => {
      const data = e.data as { type?: unknown };
      switch (data.type) {
        case 'config-update':
          config.refresh(true);
          break;
      }
    };

    broadcastChannel.addEventListener('message', onBroadcastMessage);

    return {
      postMessage: (...args: [unknown]): void => {
        broadcastChannel.postMessage(...args);
      },
    };
  })(config);
  config.on('update', (key: string, value: unknown): void => {
    if (!Object.prototype.hasOwnProperty.call(config.props, key)) {
      return;
    }
    MylistPocket.broadcast?.postMessage({ type: 'config-update', key, value, storage: 'local' });
  });

  MylistPocket.config = config;

  const CacheStorage = (function () {
    const PREFIX = PRODUCT + '_cache_';

    class CacheStorage {
      _storage: PocketStorage;
      _memory: Record<string, unknown>;
      constructor(storage: PocketStorage, gc: boolean = false) {
        this._storage = storage;
        this._memory = {};
        if (gc) {
          this.gc();
        }
        Object.keys(storage).forEach((key) => {
          if (key.indexOf(PREFIX) === 0) {
            this._memory[key] = storage[key];
          }
        });
        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- debounce化関数の戻り値は呼び元が無視するため許容する
        this.gc = bounce.time(this.gc.bind(this) as unknown as BounceCallback, 100);
      }

      gc(now: number = -1): void {
        const storage = this._storage;
        now = now >= 0 ? now : Date.now();
        Object.keys(storage).forEach((key) => {
          if (key.indexOf(PREFIX) === 0) {
            let item: CacheItemData | null = null;
            try {
              item = JSON.parse(storage[key] as string) as CacheItemData;
            } catch {
              storage.removeItem(key);
            }
            //console.info(
            //  `${index}, key: ${key}, expiredAt: ${new Date(item.expiredAt).toLocaleString()}, now: ${new Date(now).toLocaleString()}`);
            if (item!.expiredAt === '' || (item!.expiredAt as number) > now) {
              //console.info('not expired: ', key);
              return;
            }
            //console.info('cache expired: ', key, item.expiredAt);
            storage.removeItem(key);
          }
        });
      }

      setItem(key: string, data: unknown, expireTime?: number): void {
        key = PREFIX + key;
        const expiredAt = typeof expireTime === 'number' ? Date.now() + expireTime : '';

        const cacheData = {
          data: data,
          type: typeof data,
          expiredAt: expiredAt,
        };

        this._memory[key] = cacheData;
        try {
          this._storage[key] = JSON.stringify(cacheData);
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
        if (!(Object.prototype.hasOwnProperty.call(this._storage, key) || this._storage[key] !== undefined)) {
          return null;
        }
        let item: CacheItemData | null;
        try {
          item = JSON.parse(this._storage[key] as string) as CacheItemData;
        } catch {
          delete this._memory[key];
          this._storage.removeItem(key);
          return null;
        }

        if (item.expiredAt === '' || (item.expiredAt as number) > Date.now()) {
          return item.data;
        }
        return null;
      }

      removeItem(key: string): void {
        if (Object.prototype.hasOwnProperty.call(this._memory, key)) {
          delete this._memory[key];
        }
        key = PREFIX + key;
        if (Object.prototype.hasOwnProperty.call(this._storage, key) || this._storage[key] !== undefined) {
          this._storage.removeItem(key);
        }
      }

      clear(): void {
        const storage = this._storage;
        this._memory = {};
        Object.keys(storage).forEach((v) => {
          if (v.indexOf(PREFIX) === 0) {
            storage.removeItem(v);
          }
        });
      }
    }
    return CacheStorage;
  })();
  MylistPocket.debug.sessionCache = new CacheStorage(sessionStorage, true);
  MylistPocket.debug.localCache = new CacheStorage(localStorage, true);

  const WindowMessageEmitter = (function () {
    const emitter = new Emitter();
    const knownSource: unknown[] = [];

    const onMessage = (event: MessageEvent): void => {
      if (
        _.indexOf(knownSource, event.source) < 0 //&&
        //event.origin !== location.protocol + '//ext.nicovideo.jp'
      ) {
        return;
      }

      try {
        const data = JSON.parse(event.data as string) as PocketWindowMessage;
        if (data.id !== PRODUCT) {
          return;
        }

        emitter.emit('onMessage', data.body, data.type);
      } catch {
        // 別製品や壊れたwindowメッセージは処理対象外。
      }
    };

    (emitter as unknown as { addKnownSource(win: Window | null): void }).addKnownSource = (
      win: Window | null
    ): void => {
      knownSource.push(win);
    };

    window.addEventListener('message', onMessage);

    return emitter;
  })();

  const CsrfTokenLoader = (() => {
    const cacheStorage = new CacheStorage(location.host === 'www.nicovideo.jp' ? localStorage : sessionStorage);
    const TIMEOUT = 10 * 1000;
    const CACHE_EXPIRE_TIME = 60 * 30 * 1000;

    class CsrfTokenLoader {
      static load(): Promise<unknown> {
        return new Promise((resolve, reject) => {
          const cache = cacheStorage.getItem('csrfToken');
          if (cacheStorage.getItem('csrfToken')) {
            return resolve(cache);
          }

          const timeoutTimer = window.setTimeout(() => {
            reject(new Error('timeout'));
          }, TIMEOUT);

          void CsrfTokenLoader._getToken().then((token) => {
            window.clearTimeout(timeoutTimer);
            CsrfTokenLoader.saveToCache(token);
            resolve(token);
          });
        });
      }

      static saveToCache(token: unknown): void {
        cacheStorage.setItem('csrfToken', token, CACHE_EXPIRE_TIME);
      }

      static _getToken(): Promise<string> {
        const url = 'https://www.nicovideo.jp/mylist_add/video/sm9';
        const tokenReg = /NicoAPI\.token *= *["']([a-z0-9-]+)["'];/;
        let m: RegExpExecArray | null;
        return fetch(url, { credentials: 'include', _format: 'text' } as RequestInit)
          .then((res) => res.text())
          .then((result) => {
            if ((m = tokenReg.exec(result))) {
              const token = m[1]!;
              return Promise.resolve(token);
            } else {
              return Promise.reject(new Error('token parse error'));
            }
          });
      }
    }

    util.emitter.on('csrfToken', ((token: string) => {
      CsrfTokenLoader.saveToCache(token);
    }) as unknown as EmitterCallback);

    return CsrfTokenLoader;
  })();

  MylistPocket.debug.CsrfTokenLoader = CsrfTokenLoader;

  const ThumbInfoLoader = (() => {
    const BASE_URL = 'https://ext.nicovideo.jp/';
    const MESSAGE_ORIGIN = 'https://ext.nicovideo.jp/';
    const CACHE_EXPIRE_TIME = 60 * 60 * 1000;
    //const CACHE_EXPIRE_TIME = 60 * 1000;
    let gate: CrossDomainGateApi | null = null;
    const cacheStorage = new CacheStorage(sessionStorage, true);
    const failedResult: Record<string, unknown> = {};

    class ThumbInfoLoader {
      _emitter: InstanceType<typeof Emitter>;
      constructor() {
        this._emitter = new Emitter();

        gate = new (
          CrossDomainGate as unknown as new (params: {
            baseUrl: string;
            origin: string;
            type: string;
            messager: unknown;
          }) => CrossDomainGateApi
        )({
          baseUrl: BASE_URL,
          origin: MESSAGE_ORIGIN,
          type: 'thumbInfo',
          messager: WindowMessageEmitter,
        });
      }

      _onMessage(data: { message: unknown }, type: string): void {
        if (type !== 'videoInfoLoader') {
          return;
        }
        const info = data.message;

        (this as unknown as InstanceType<typeof Emitter>).emit('load', info, 'THUMB_WATCH');
      }

      _parseXml(xmlText: string): ThumbInfoData {
        return parseThumbInfo(xmlText);
      }

      async load(watchId: string, options?: Record<string, unknown>): Promise<PocketThumbInfo> {
        const cacheKey = `thumbInfo_${watchId}`;
        const cache = cacheStorage.getItem(cacheKey);

        if (failedResult[`${watchId}`]) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 拒否理由のペイロード（呼び元が data/watchId を読む）のため Error 化しない
          return Promise.reject({ data: failedResult[`${watchId}`], watchId });
        }
        if (cache) {
          return cache as PocketThumbInfo;
        }

        const thumbInfo = (await gate!
          .fetch(`${BASE_URL}api/getthumbinfo/${watchId}`, options)
          .catch((e: { message?: unknown }) => {
            return { status: 'fail', message: e.message || `gate.fetch('${watchId}') failed` };
          })) as unknown as PocketThumbInfo;
        thumbInfo.fromCache = !!cache;
        if (thumbInfo.status !== 'ok') {
          failedResult[`${watchId}`] = thumbInfo;
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 拒否理由のペイロード（呼び元が status/message を読む）のため Error 化しない
          return Promise.reject(thumbInfo);
        }
        cacheStorage.setItem(cacheKey, thumbInfo, CACHE_EXPIRE_TIME);
        return thumbInfo;
      }
    }

    const loader = new ThumbInfoLoader();
    return {
      load: (watchId: string, options?: Record<string, unknown>): Promise<PocketThumbInfo> =>
        loader.load(watchId, options),
      loadOwnerInfo: async (watchId: string): Promise<ThumbOwnerWithLocale | Record<string, never>> => {
        const info = await loader.load(watchId);
        const owner: ThumbOwnerWithLocale | undefined = (info as ThumbInfoOk).owner;
        if (!owner) {
          return {};
        }

        const lang = util.getPageLanguage();
        const prefix = owner.type === 'user' ? '投稿者: ' : '提供: ';
        const suffix = owner.type === 'user' && lang.startsWith('ja') ? ' さん' : '';
        owner.linkId = owner.id ? (owner.type === 'user' ? `user/${owner.id}` : `ch${owner.id}`) : '';
        owner.localeName = `${prefix}${owner.name}${suffix}`;
        return owner;
      },
    };
  })();

  MylistPocket.debug.ThumbInfoLoader = ThumbInfoLoader;
  return { config, CsrfTokenLoader, ThumbInfoLoader };
}
