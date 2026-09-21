import { migrateAddonConfig } from './config-migration';
import HlsRuntime from 'hls.js';
import { SettingsDialog } from '../packages/components/src/settings-dialog';
import { SETTINGS_FIELD_THEME } from '../packages/components/src/settings-dialog-theme';
const Hls = HlsRuntime as unknown as HlsStatic;
import { html, render } from 'lit/html.js';
import { AntiPrototypeJs } from '../packages/lib/src/infra/anti-prototype-js';
import { Emitter } from '../packages/lib/src/emitter';
import type { EmitterCallback, AnyEmitter } from '../packages/lib/src/emitter';
import { workerUtil } from '../packages/lib/src/infra/worker-util';

// workerUtil は //@require 解決のための import であるため参照を残す。
// transpile で消えるとビルド時の解決が壊れる。実行時の振る舞いは変えない。
if (workerUtil) {
  // referred for //@require resolution
}

// 型宣言のみを置く（transpile で除去され、生成物には含まれない）。
// ランタイムコードへの変更は、型注釈・as キャスト・declare フィールドに留める。
type HlsConfigValue = boolean | number | string | undefined | HlsConfigFunction;
interface HlsConfigFunction {
  (...args: Array<never>): unknown;
}
interface HlsThrottle {
  <A extends Array<unknown>>(func: (...args: A) => unknown, interval: number): HlsDebounced<A>;
}
interface HlsStoredMeta {
  url: string;
  stats: unknown;
}
interface HlsFutatsumeVideo extends HTMLElement {
  hlsConfig: Record<string, unknown>;
}
interface HlsVideoDebugDialog extends HTMLElement {
  hlsConfig: Record<string, unknown>;
  reset(config?: Record<string, unknown>): void;
  setValue(key: string, value: unknown): void;
  open(): void;
  toggle(): void;
}
interface HlsMonkeyModules {
  ErrorEvent: typeof ErrorEvent;
  MediaError: typeof MediaError;
  HTMLDialogElement: typeof HTMLDialogElement;
  DOMException: typeof DOMException;
}
interface HlsEmitter {
  on<A extends Array<unknown>>(event: string, handler: (...args: A) => void): void;
  off<A extends Array<unknown>>(event: string, handler?: (...args: A) => void): void;
  emit(event: string, ...args: Array<unknown>): void;
}
interface HlsConfig extends HlsEmitter {
  refresh(emitChange?: boolean): void;
  refreshValue(key: string): void;
  get(key: string, refresh?: boolean): HlsConfigValue;
  set(key: string, value?: HlsConfigValue): void;
}
interface HlsDebounced<A extends Array<unknown> = Array<unknown>> {
  (...args: A): void;
  cancel(): void;
}
interface HlsWindowExtension {
  PureArray?: ArrayConstructor;
  FutatsumeWatch?: {
    util?: {
      dimport(url: string): Promise<unknown>;
    };
  };
  Prototype?: unknown;
  BroadcastChannel?: typeof BroadcastChannel;
}
interface HlsWorkerScope {
  onmessage: ((e: MessageEvent) => unknown) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}
interface HlsFragment {
  url: string;
  level: number;
  sn: number;
  failed: number;
  hasCache?: boolean;
  levelkey?: { reluri?: string };
}
interface HlsLoadContext {
  url: string;
  frag: HlsFragment & { loaded?: number };
  rangeStart?: number;
  rangeEnd?: number;
}
interface HlsLoadResponse {
  url: string;
  data: ArrayBuffer;
}
interface HlsLoadCallbacks {
  onSuccess: (resp: HlsLoadResponse, stats: unknown, context: HlsLoadContext, details?: unknown) => unknown;
  onError: (resp: { code: number; text: string }, context: HlsLoadContext, xhr?: unknown) => unknown;
  onTimeout?: (...args: Array<unknown>) => unknown;
  onProgress?: (...args: Array<unknown>) => unknown;
}
interface HlsFragmentLoaderConfig {
  fragLoadingMaxRetry?: number;
  fragLoadingRetryDelay?: number;
}
interface HlsFragmentLoaderStatic {
  new (config: unknown): HlsLoaderBase;
  frag2hash: (fragment: HlsFragment) => { hash: string; videoId: string };
  hasCache: (fragment: HlsFragment) => Promise<unknown>;
  preloadFragment: (fragment: HlsFragment, url: string) => Promise<boolean | undefined>;
  levels?: ReadonlyArray<HlsLevel>;
}

// hls.js@latest だと再生が始まらない動画がたまにある。 0.8.9ならok

export async function initializeHls(): Promise<void> {
  await AntiPrototypeJs();
  const PRODUCT = 'FutatsumeWatchHLS';
  const monkey = (
    PRODUCT: string,
    { ErrorEvent, MediaError, HTMLDialogElement, DOMException }: HlsMonkeyModules
  ): void => {
    const window: Window & typeof globalThis = globalThis.window;
    const console = window.console;

    const Array = (window as unknown as HlsWindowExtension).PureArray || window.Array;
    let primaryVideo: (HTMLElement & { hlsConfig?: unknown }) | null = null;

    const DEFAULT_CONFIG: Record<string, HlsConfigValue> = {
      // hls.js 以外のパラメータ
      segment_duration: 4000,
      use_native_hls: true, // SafariなどブラウザがHLS対応だったらそっちを使う
      show_video_label: false, //
      autoAbrEwmaDefaultEstimate: true,
      hls_js_ver: 'latest',

      enable_db_cache: !true,
      cache_expire_time: 6 * 60 * 60 * 1000,

      // 以下、 hls.js 関連

      // Domand動画にはcookiesが必要
      xhrSetup: (xhr: XMLHttpRequest): void => {
        xhr.withCredentials = true;
      },

      // なんとなくわかる物
      debug: false, // used by logger
      autoStartLoad: true, // used by stream-controller
      startLevel: -1, // undefined, // used by level-controller
      capLevelOnFPSDrop: false, // used by fps-controller
      capLevelToPlayerSize: false, // used by cap-level-controller
      maxBufferLength: 30, // used by stream-controller
      maxBufferSize: 60 * 1000 * 1000, // used by stream-controller
      maxMaxBufferLength: 600, //600, // used by stream-controller
      minAutoBitrate: 0, // used by hls
      abrEwmaFastVoD: 3, // used by abr-controller
      abrEwmaSlowVoD: 9, // used by abr-controller
      abrEwmaDefaultEstimate: 5e5, // 500 kbps  // used by abr-controller
      abrBandWidthFactor: 0.95, // used by abr-controller
      abrBandWidthUpFactor: 0.7, // used by abr-controller
      abrMaxWithRealBitrate: false, // used by abr-controller
      manifestLoadingTimeOut: 30000, // used by playlist-loader
      manifestLoadingMaxRetry: 3, // used by playlist-loader
      manifestLoadingRetryDelay: 3000, //1000, // used by playlist-loader
      manifestLoadingMaxRetryTimeout: 64000, // used by playlist-loader
      levelLoadingTimeOut: 10000, // used by playlist-loader
      levelLoadingMaxRetry: 4, // used by playlist-loader
      levelLoadingRetryDelay: 3000, //1000, // used by playlist-loader
      levelLoadingMaxRetryTimeout: 64000, // used by playlist-loader
      fragLoadingTimeOut: 20000, // used by fragment-loader
      fragLoadingMaxRetry: 5, //6 // used by fragment-loader
      fragLoadingRetryDelay: 1000, // used by fragment-loader
      fragLoadingMaxRetryTimeout: 64000, // used by fragment-loader

      // よくわからん物
      startPosition: -1, // used by stream-controller
      maxBufferHole: 0.5, // used by stream-controller
      maxSeekHole: 2, // used by stream-controller
      lowBufferWatchdogPeriod: 0.5, // used by stream-controller
      highBufferWatchdogPeriod: 3, // used by stream-controller
      nudgeOffset: 0.1, // used by stream-controller
      nudgeMaxRetry: 3, // used by stream-controller
      maxFragLookUpTolerance: 0.25, // used by stream-controller
      enableWorker: true, // used by demuxer
      enableSoftwareAES: true, // used by decrypter

      startFragPrefetch: false, // used by stream-controller
      fpsDroppedMonitoringPeriod: 5000, // used by fps-controller
      fpsDroppedMonitoringThreshold: 0.2, // used by fps-controller
      appendErrorMaxRetry: 3, // used by buffer-controller
      stretchShortVideoTrack: false, // used by mp4-remuxer
      maxAudioFramesDrift: 1, // used by mp4-remuxer
      forceKeyFrameOnDiscontinuity: true, // used by ts-demuxer
      maxStarvationDelay: 4, // used by abr-controller
      maxLoadingDelay: 4, // used by abr-controller
      emeEnabled: false, // used by eme-controller

      // 生放送関連っぽい物
      abrEwmaFastLive: 3, // used by abr-controller
      abrEwmaSlowLive: 9, // used by abr-controller
      initialLiveManifestSize: 1, // used by stream-controller
      liveSyncDurationCount: 3, // used by stream-controller
      liveMaxLatencyDurationCount: Infinity, // used by stream-controller
      liveSyncDuration: undefined, // used by stream-controller
      liveMaxLatencyDuration: undefined, // used by stream-controller
      liveDurationInfinity: false, // used by buffer-controller
    };
    DEFAULT_CONFIG.clone = () => {
      return Object.assign({}, DEFAULT_CONFIG);
    };

    const dimport: ((url: string) => Promise<unknown>) & { map: Record<string, Promise<unknown>> } = Object.assign(
      (url: string): Promise<unknown> => {
        const win = window as unknown as HlsWindowExtension;
        if (win.FutatsumeWatch && win.FutatsumeWatch.util && win.FutatsumeWatch.util.dimport) {
          return win.FutatsumeWatch.util.dimport(url);
        }
        if (dimport.map[url]) {
          return dimport.map[url];
        }
        const now = Date.now();
        const callbackName = `dimport_${now}`;
        const loader = `
        import * as module${now} from "${url}";
        window.${callbackName}(module${now});
        `.trim();
        const p: Promise<unknown> = new Promise((res: (value: unknown) => void) => {
          const s = document.createElement('script');
          s.type = 'module';
          s.append(document.createTextNode(loader));
          s.dataset.import = url;
          (window as unknown as Record<string, (module: unknown) => void>)[callbackName] = (module: unknown): void => {
            res(module);
            delete (window as unknown as Record<string, unknown>)[callbackName];
          };
          document.documentElement.append(s);
        });
        dimport.map[url] = p;
        return p;
      },
      { map: {} }
    );

    const Config = (() => {
      const config: Record<string, HlsConfigValue> = {},
        emitter = new Emitter() as unknown as HlsConfig;
      const storage = localStorage as unknown as Record<string, string>;
      migrateAddonConfig(localStorage, 'hls', Object.keys(DEFAULT_CONFIG));
      Object.keys(DEFAULT_CONFIG).forEach((key) => {
        const storageKey = `FutatsumeWatch_video.hls.${key}`;
        if (storage[storageKey]) {
          try {
            config[key] = JSON.parse(storage[storageKey]) as HlsConfigValue;
          } catch {
            console.error(storageKey, storage[storageKey]);
            localStorage.removeItem(storageKey);
            config[key] = DEFAULT_CONFIG[key];
          }
        } else {
          config[key] = DEFAULT_CONFIG[key];
        }
      });

      return {
        raw: config,
        get: (key: string): HlsConfigValue => {
          return config[key];
        },
        set: (key: string, value?: HlsConfigValue): void => {
          if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)) {
            return;
          }
          const storageKey = `FutatsumeWatch_video.hls.${key}`;
          if (config[key] !== value) {
            config[key] = value;
            storage[storageKey] = JSON.stringify(value);
            emitter.emit(`update-${key}`, value);
            emitter.emit('update', { key, value });
          }
        },
        on: (event: string, handler: EmitterCallback): void => {
          emitter.on(event, handler);
        },
        off: (event: string, handler?: EmitterCallback): void => {
          if (handler) {
            emitter.off(event, handler);
          }
        },
        emit: (event: string, ...args: Array<unknown>): void => {
          emitter.emit(event, ...args);
        },
      };
    })();

    const debounce = <A extends Array<unknown>>(func: (...args: A) => unknown, interval: number): HlsDebounced<A> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result: HlsDebounced<A> = (...args: A): void => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        timer = setTimeout(() => {
          func(...args);
        }, interval);
      };
      result.cancel = (): void => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      };
      return result;
    };

    const throttle: HlsThrottle = <A extends Array<unknown>>(
      func: (...args: A) => unknown,
      interval: number
    ): HlsDebounced<A> => {
      let lastTime = 0;
      let lastArgs: A | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result: HlsDebounced<A> = (...args: A): void => {
        const now = performance.now();
        const timeDiff = now - lastTime;

        if (timeDiff < interval) {
          lastArgs = args;
          if (!timer) {
            timer = setTimeout(
              () => {
                lastTime = performance.now();
                timer = undefined;
                func(...(lastArgs as A));
                lastArgs = null;
              },
              Math.max(interval - timeDiff, 0)
            );
          }
          return;
        }

        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        lastTime = now;
        lastArgs = null;
        func(...args);
      };
      result.cancel = (): void => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      };
      return result;
    };

    const StorageWorker = function (self: HlsWorkerScope): void {
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
            return await navigator.locks.request(
              'FutatsumeHLS_GC',
              { ifAvailable: true },
              async (lock: Lock | null) => {
                if (!lock) {
                  return;
                }
                await IndexDBStorage.getInstance().gc();
                await new Promise<void>((r) => setTimeout(r, 5000));
              }
            );
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

    const createWebWorker = (
      func: (...args: Array<never>) => unknown,
      { type, name }: { type?: string; name?: string } = {}
    ): Worker | SharedWorker => {
      const src = func
        .toString()
        .replace(/^function.*?{/, '')
        .replace(/}$/, '');

      const blob = new Blob([src], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);

      if (type === 'SharedWorker') {
        return new SharedWorker(url, { name });
      }
      return new Worker(url, { name });
    };

    interface HlsWorkerRequest {
      id: string;
      command: string;
      resolve: (value: unknown) => void;
    }
    const Storage: {
      request: Record<string, HlsWorkerRequest>;
      worker: Worker | SharedWorker | null;
      onMessage(e: MessageEvent): void;
      getId(): string;
      sendRequest(command: string, data: unknown, buffer?: ArrayBuffer | null): Promise<unknown>;
      setConfig(config: unknown): Promise<unknown>;
      save(
        { hash, videoId, meta }: { hash: string; videoId: string; meta: unknown },
        buffer: ArrayBuffer
      ): Promise<unknown>;
      load({ hash }: { hash: string }): Promise<unknown>;
      hasData({ hash }: { hash: string }): Promise<unknown>;
      gc: (...args: Array<never>) => unknown;
      clear(): Promise<unknown>;
    } = {
      request: {},
      worker: null,
      onMessage(e: MessageEvent): void {
        const msg = e.data as { id: string; result: unknown; buffer: ArrayBuffer };
        const id = msg.id;
        const request = this.request[id];
        if (!request) {
          window.console.warn('unkwnown request id', id);
          return;
        }
        delete this.request[id];
        switch (request.command) {
          case 'load':
            if (msg.result) {
              return request.resolve([msg.result, msg.buffer]);
            } else {
              return request.resolve([null, null]);
            }
          default:
            return request.resolve(msg.result);
        }
      },
      getId(): string {
        return `id:${Math.random()}-${performance.now()}`;
      },
      async sendRequest(command: string, data: unknown, buffer: ArrayBuffer | null = null): Promise<unknown> {
        if ((window as unknown as HlsWindowExtension).Prototype) {
          return Promise.resolve(null);
        }
        const id = this.getId();
        // window.console.info('sendrequest', command, data, buffer);
        return new Promise<unknown>((resolve) => {
          this.request[id] = { id, command, resolve };
          if (buffer) {
            (this.worker as Worker).postMessage({ id, command, data, buffer }, [buffer]);
          } else {
            (this.worker as Worker).postMessage({ id, command, data });
          }
        });
      },
      async setConfig(config: unknown): Promise<unknown> {
        return this.sendRequest('config', config);
      },
      async save(
        { hash, videoId, meta }: { hash: string; videoId: string; meta: unknown },
        buffer: ArrayBuffer
      ): Promise<unknown> {
        return this.sendRequest('save', { hash, videoId, meta }, buffer);
      },
      async load({ hash }: { hash: string }): Promise<unknown> {
        return await this.sendRequest('load', { hash });
      },
      async hasData({ hash }: { hash: string }): Promise<unknown> {
        return await this.sendRequest('hasData', { hash });
      },
      async gc(): Promise<unknown> {
        if (Config.get('enable_db_cache') && !(window as unknown as HlsWindowExtension).Prototype) {
          return this.sendRequest('gc', {});
        } else {
          return Promise.resolve();
        }
      },
      async clear(): Promise<unknown> {
        return this.sendRequest('clear', {});
      },
    };
    Storage.worker = createWebWorker(StorageWorker, { name: 'FutatsumeWatchHLSWorker' });
    (Storage.worker as Worker).addEventListener('message', Storage.onMessage.bind(Storage));
    void Storage.setConfig({ cache_expire_time: Config.get('cache_expire_time') });
    Storage.gc = debounce(Storage.gc.bind(Storage), 10 * 1000);

    (({ Hls, throttle }: { Hls: HlsStatic; throttle: HlsThrottle }) => {
      // TODO: ニコニコ動画の仕様に依存する部分を切り離して、もう少し汎用的にする

      const PLAYER_MODE = {
        HLS_JS: 'HLS-JS',
        HLS_NATIVE: 'HLS-N',
        DEFAULT: 'N',
      };

      const HLS_ERROR_CODE = {
        ABORT: MediaError.MEDIA_ERR_ABORTED + 1000,
        NETWORK: MediaError.MEDIA_ERR_NETWORK + 1000,
        DECODE: MediaError.MEDIA_ERR_DECODE + 1000,
        UNKNOWN: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED + 1000,
      };

      // readonly の Event.target を無理やり書き換える (意味ないかも)
      const overrideTarget = (event: unknown): unknown => {
        return event;
      };

      let FragmentLoaderClass: HlsFragmentLoaderStatic;
      const createFragmentLoader = (Hls: HlsStatic): HlsFragmentLoaderStatic => {
        const frag2hash = (fragment: HlsFragment): { hash: string; videoId: string } => {
          const url = fragment.url;
          const levels = (globalThis as unknown as { levels?: ReadonlyArray<HlsLevel> }).levels;

          const [, videoId, , sn] = /\/nicovideo-([a-z0-9]+)_.*\/([\d]+)\/ts\/([\d]+)\.ts/.exec(url) as RegExpExecArray;
          let rel = '';
          if (fragment.levelkey && fragment.levelkey.reluri) {
            const m = /h=(.*?)&/.exec(fragment.levelkey.reluri);
            rel = m ? `-${m[1]}` : '';
          }
          if (levels && levels[fragment.level]) {
            const { width, height, bitrate, attrs } = levels[fragment.level] as HlsLevel;
            const fps = attrs['FRAME-RATE'] ? `${attrs['FRAME-RATE']}fps` : '(unknown)fps';
            return {
              hash: `${videoId}-${width}x${height}-${bitrate}bps-${fps}-${sn}${rel}`,
              videoId: videoId as string,
            };
          }
          return { hash: `${videoId}-${fragment.level}-${sn}${rel}`, videoId: videoId as string };
        };

        const hasCache = async (fragment: HlsFragment): Promise<unknown> => {
          const { hash } = frag2hash(fragment);
          return await Storage.hasData({ hash });
        };

        const preloadFragment = async (fragment: HlsFragment, url: string): Promise<boolean | undefined> => {
          if (fragment.hasCache) {
            return true;
          }
          if (await hasCache(fragment)) {
            fragment.hasCache = true;
            return true;
          }
          if (fragment.failed >= 3) {
            return false;
          }
          const { level, sn } = fragment;

          const { hash, videoId } = frag2hash(fragment);

          const abc = new AbortController();
          const debounceTimeout = debounce(() => abc.abort(), 30000);

          const params: RequestInit = {
            method: 'GET',
            // mode: 'cors',
            credentials: 'include',
            cache: 'force-cache',
            signal: abc.signal,
          };
          const requestStart = performance.now();
          const request = new Request(url, params);
          debounceTimeout();
          let res!: Response;
          for (let i = 0; i < 3; i++) {
            res = await fetch(request, params).catch((e: unknown) => ({ e }) as unknown as Response);
            if (res.ok && res.status !== 206) {
              break;
            }
            fragment.failed = i;
            const status = res.status;
            console.warn('fetch fail', { i, res, url, request, params });
            if (status >= 400 && status < 499) {
              break;
            }
            await new Promise<void>((res) => setTimeout(res, 3000));
          }
          if (!res.ok) {
            return;
          }
          const responseStart = performance.now();
          const data = await res.arrayBuffer();
          const responseEnd = performance.now();
          debounceTimeout.cancel();

          const buffer = data.slice();
          fragment.hasCache = true;
          void Storage.save(
            {
              hash,
              videoId,
              meta: {
                contentLength: buffer.byteLength,
                sn,
                resp: { url },
                level,
                total: buffer.byteLength,
                stats: {
                  aborted: false,
                  loaded: buffer.byteLength,
                  total: buffer.byteLength,
                  retry: 0,
                  chunkCount: 1,
                  bwEstimate: 0,
                  loading: { start: requestStart, first: responseStart, end: responseEnd },
                  parsing: { start: 0, end: 0 },
                  buffering: { start: 0, first: 0, end: 0 },
                },
                url,
              },
            },
            buffer
          );
          return true;
        };

        // hls.config.fLoader にはクラスのインスタンスではなく定義を渡す
        // loaderはexportされていないため、Hls.DefaultConfig.loader経由で継承する
        // @see https://github.com/video-dev/hls.js/blob/master/docs/API.md#loader
        let lastFragLoadingTime = 0;
        const BLOCK_INTERVAL = 3000;
        class FragmentLoader extends Hls.DefaultConfig.loader {
          declare _config: HlsFragmentLoaderConfig;
          declare _isAborted: boolean;
          declare _isDestroyed: boolean;

          constructor(config: unknown) {
            super(config);
            this._config = config as HlsFragmentLoaderConfig;
            this._isAborted = false;
            this._isDestroyed = false;
            void Storage.gc();
          }

          /***
           *
           * @param {{url: string, frag: fragment, responseType: string, progressData: boolean}} context
           * @param config
           * @param {{onSuccess: function, onError: function, onTimout: function, onProgress: function}} callbacks
           * @returns {*}
           */
          // eslint-disable-next-line @typescript-eslint/no-misused-promises -- hls.js が戻り値を待たない loader 規約のため async を維持する
          async load(context: HlsLoadContext, config: unknown, callbacks: HlsLoadCallbacks): Promise<void> {
            if (!context.frag || !/\.(ts|cmfa|cmfv)/.test(context.url)) {
              return super.load(context, config, callbacks);
            }

            if (/\.cmf(a|v)/.test(context.url)) {
              return super.load(context, config, callbacks);
            }

            const frag = context.frag;
            const level = frag.level;

            const { hash, videoId } = frag2hash(frag);

            const { onSuccess, onError } = callbacks;
            if (!context.rangeStart && !context.rangeEnd) {
              callbacks.onSuccess = (
                resp: HlsLoadResponse,
                stats: unknown,
                context: HlsLoadContext,
                details: unknown = null
              ): void => {
                const status = details instanceof XMLHttpRequest ? details.status : 200;

                if (
                  status === 206
                  //     buffer.byteLength !== contentLength
                ) {
                  console.warn(
                    'CONTENT LENGTH MISMATCH!',
                    (resp.data.slice() as unknown as { length: number }).length,
                    frag.loaded
                  ); //, contentLength);
                } else if (Config.get('enable_db_cache') && !(window as unknown as HlsWindowExtension).Prototype) {
                  const buffer = resp.data.slice();
                  frag.hasCache = true;
                  void Storage.save(
                    {
                      hash,
                      videoId,
                      meta: {
                        contentLength: context.frag.loaded,
                        sn: context.frag.sn,
                        resp: {
                          url: resp.url,
                        },
                        level,
                        total: context.frag.loaded,
                        stats,
                        url: context.url,
                      },
                    },
                    buffer
                  );
                }

                onSuccess(resp, stats, context, details);
              };

              // prototype.js のあるページでは動かないどころかブラクラ化する
              if (Config.get('enable_db_cache')) {
                // console.log('***load', hash, Config.get('enable_db_cache'),window.Prototype);
                const [meta, buffer] = (await Storage.load({ hash })) as [HlsStoredMeta | null, ArrayBuffer];
                // console.log('cache?', !!meta, hash);
                if (meta) {
                  frag.hasCache = true;
                  callbacks.onSuccess({ url: meta.url, data: buffer }, meta.stats, context, null);
                  return;
                }
              }
            }

            callbacks.onError = (resp: { code: number; text: string }, context: HlsLoadContext, xhr: unknown): void => {
              if (this._isAborted) {
                console.warn('error after aborted', resp, context);
                onError({ code: 0, text: `error after aborted ${resp.code}: ${resp.text}` }, context, xhr);
                return;
              }
              onError(resp, context, xhr);
            };

            return this._load(context, config, callbacks, this._config.fragLoadingMaxRetry);
          }

          /**
           * バッドノウハウの塊
           * シーク連打などで短時間に多量のアクセスがあると弾かれるようになるため、
           * クライアント側でウェイトをかける。
           */
          _load(context: HlsLoadContext, config: unknown, callbacks: HlsLoadCallbacks, maxRetry = 3): void {
            if (this._isDestroyed) {
              return;
            }
            const now = performance.now();
            const timeDiff = now - lastFragLoadingTime;

            const sn = context.frag.sn; // ts の番号が入ってる

            if (!this._isBoostTime(sn) && timeDiff < BLOCK_INTERVAL) {
              if (maxRetry > 0) {
                setTimeout(
                  () => {
                    if (this._isAborted) {
                      return;
                    }
                    this._load(context, config, callbacks, maxRetry - 1);
                  },
                  Math.max(this._config.fragLoadingRetryDelay as number, BLOCK_INTERVAL - timeDiff)
                );
              } else {
                callbacks.onError({ code: 429, text: 'Too Many Requests(blocked)' }, context, {
                  status: 429,
                  statusText: '',
                });
              }
              return;
            }

            lastFragLoadingTime = now;
            super.load(context, config, callbacks);
          }

          abort(): void {
            this._isAborted = true;
            super.abort();
          }

          destroy(): void {
            this._isDestroyed = true;
            this._isAborted = true;
            super.destroy();
          }

          // 再生開始直後だけは自粛したくないタイム
          _isBoostTime(sn: number): boolean {
            return sn <= 3;
          }
        }

        FragmentLoaderClass = FragmentLoader as unknown as HlsFragmentLoaderStatic;
        FragmentLoaderClass.frag2hash = frag2hash;
        FragmentLoaderClass.hasCache = hasCache;
        FragmentLoaderClass.preloadFragment = preloadFragment;
        return FragmentLoaderClass;
      };

      let idCounter = 0;

      interface HlsManifestData {
        levels: ReadonlyArray<HlsLevel>;
      }
      interface HlsLevelDetails {
        endSN?: number;
      }
      interface HlsLevelData {
        level: number;
        details: HlsLevelDetails;
      }
      interface HlsFragBufferedStats {
        trequest: number;
        tfirst: number;
        tbuffered: number;
        total: number;
      }
      interface HlsFragBufferedData {
        stats: HlsFragBufferedStats;
        frag: { duration: number; level: number; sn: number };
      }
      interface HlsErrorData {
        type: string;
        details?: string;
        fatal?: boolean;
        frag?: { url?: string };
        context?: { url?: string };
        response?: { code?: number };
      }

      class FutatsumeVideoElement extends HTMLElement {
        declare _src: string;
        declare _hls: HlsInstance | null;
        declare _hlsConfig: Record<string, unknown>;
        declare _videoCount: number;
        declare _id: string;
        declare _bufferStats: Array<unknown>;
        declare _playerMode: string;
        declare _eventWrapperMap: Map<EventListener, Record<string, EventListener>>;
        declare _shadow: ShadowRoot;
        declare _root: Element;
        declare _video: HTMLVideoElement;
        declare _label: HTMLElement;
        declare _throttledCurrentTime: HlsDebounced<[number]>;
        declare _isSeeking: boolean;
        declare _seekingTime: number;
        declare _error: { code: number; message: unknown } | null;
        declare _isForbidden403: boolean;
        declare _isStalledBy403: boolean;
        declare _error429Count: number;
        declare _isBufferCompleted: boolean;
        declare _manifest: unknown;
        declare _levelData: Array<unknown>;
        declare _fragmentLoader: HlsFragmentLoaderStatic | undefined;
        declare buffered: TimeRanges | null;
        static get template() {
          return `
            <style>
              .root {
                width: 100%; height: 100%;
                display: contents;
              }
              video {
                width: 100%;
                height: 100%;
              }
              .label {
                position: absolute;
                z-index: 100;
                top: 16px;
                right: 32px;
                padding: 0 4px;
                font-size: 14pt;
                color: #000;
                background: #888;
                border: 1px solid #888;
                font-family: 'Arial Black';
                pointer-events: none;
                mix-blend-mode: luminosity;
                transition: 0.2s opacity;
                opacity: 0.5;
              }

              .label:empty {
                opacity: 0 !important;
                transition: none;
              }

              .is-playing .label {
                opacity: 0;
              }

              :host([show-video-label="on"]) .root .label:not(:empty) {
                opacity: 1 !important;
              }

              .label.blink {
                transform: rotateX(360deg);
                transition: 0.4s transform;
              }

            </style>
            <div class="root">
              <video></video>
              <div class="label"></div>
            </div>
          `;
        }

        constructor() {
          super();

          this._src = '';
          this._hls = null;
          this._hlsConfig = {};
          this._videoCount = 0;
          this._id = `id:${idCounter++}`;
          this._bufferStats = [];

          this._playerMode = PLAYER_MODE.DEFAULT;
          this._eventWrapperMap = new Map();

          const shadow = (this._shadow = this.attachShadow({ mode: 'open' }));
          shadow.innerHTML = (this.constructor as typeof FutatsumeVideoElement).template;

          const root = (this._root = shadow.querySelector('.root') as Element);
          const video = (this._video = root.querySelector('video') as HTMLVideoElement);
          this._label = root.querySelector('.label') as HTMLElement;

          video.addEventListener('playing', () => {
            root.classList.add('is-playing');
            this.label = `${this.playerMode}: ${this._video.videoWidth}x${this._video.videoHeight}`;
          });

          video.addEventListener('pause', () => {
            root.classList.remove('is-playing');
          });

          this._throttledCurrentTime = throttle((sec: number): void => {
            this._isSeeking = false;
            this._video.currentTime = sec;
          }, 500);

          this._resetPlayingStatus();

          this._bridgeProps(video, [
            'autoplay',
            'buffered',
            'crossOrigin',
            'controls',
            'controlslist',
            'currentSrc',
            //'currentTime',
            'defaultMuted',
            'defaultPlaybackRate',
            'duration',
            'ended',
            'loop',
            'muted',
            'networkState',
            'paused',
            'playbackRate',
            'played',
            'playsinline',
            'poster',
            'preload',
            'readyState',
            'seekable',
            //'seeking',
            'videoHeight',
            'videoWidth',
            'volume',

            'tagName',

            'fastSeek',
            'getVideoPlaybackQuality',
            'pause',
            //'play',
            'unload',
            'requestPictureInPicture',
          ]);
        }

        play(): Promise<unknown> {
          if (this._isStalledBy403) {
            return Promise.reject(new DOMException('SessionClosedError'));
          }
          return this._video.play().catch((e: unknown) => {
            //if (this._isForbidden403) {
            //  return Promise.reject(new DOMException('SessionClosedError'));
            //}
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- hls.js 互換のため非 Error の reject を温存する
            return Promise.reject(e);
          });
        }

        get shadow(): ShadowRoot {
          return this._shadow;
        }

        get drawableElement(): HTMLVideoElement {
          // 使用例
          // ctx.drawImage(video.drawableElement || video, 0, 0);
          return this._video;
        }

        get currentTime(): number {
          if (this._isSeeking) {
            return this._seekingTime;
          }
          return this._video.currentTime;
        }

        set currentTime(v: number) {
          if (this.playerMode === PLAYER_MODE.HLS_JS && this._hlsConfig.autoStartLoad === false) {
            this._hls!.startLoad(v);
            return;
          }

          this._seekingTime = v;
          if (this.isInBuffer(v)) {
            // シーク先がバッファ内にある時は即反映
            this._isSeeking = false;
            this._throttledCurrentTime.cancel();
            this._video.currentTime = v;
          } else {
            // シーク連打時のネットワークアクセス抑制
            this._isSeeking = true;
            this._throttledCurrentTime(v);
            this.dispatchEvent(new Event('seeking'));
          }
        }

        isInBuffer(sec: number): boolean {
          if (sec < this.currentTime) {
            return true;
          }
          const range = this.buffered;
          if (!range || !range.length) {
            return false;
          }
          try {
            for (let i = 0, len = range.length; i < len; i++) {
              const start = range.start(i);
              const end = range.end(i);
              if (start <= sec && end >= sec) {
                return true;
              }
            }
          } catch (e) {
            console.error(e);
          }
          return false;
        }

        get seeking(): boolean {
          return this._isSeeking || this._video.seeking;
        }

        get src(): string {
          return this._src;
        }

        set src(v: string) {
          this._videoCount++;
          this._resetPlayingStatus();
          if (v === '' || v === '//') {
            this._src = '';
            this._destroyHLSJS();
            this._video.src = '';
            this.playerMode = PLAYER_MODE.DEFAULT;
            return;
          }

          if (/\.m3u8(|\?.*?)$/.test(v)) {
            if (this._useNativeHLS) {
              this._src = v;
              this.playerMode = PLAYER_MODE.HLS_NATIVE;
              this._video.src = v;
              return;
            }
            this._initHLSJS(v);

            this._src = v;
            //hls.attachMedia(this._video);
            this.playerMode = PLAYER_MODE.HLS_JS;
            return;
          }

          this._src = v;
          this.playerMode = PLAYER_MODE.DEFAULT;
          this._video.src = v;
        }

        canPlayType(type: string): string {
          switch (type) {
            case 'application/x-mpegURL':
            case 'vnd.apple.mpegURL':
              return Hls.isSupported() ? 'maybe' : '';
            default:
              return this._video.canPlayType(type);
          }
        }

        get error(): { code: number; message: unknown } | MediaError | null {
          return this._error || this._video.error;
        }

        load(): void {
          if (this.playerMode === PLAYER_MODE.HLS_JS) {
            return;
          }
          this._video.load();
        }

        disconnectedCallback(): void {
          this._destroyHLSJS();
          for (const [func, events] of this._eventWrapperMap.entries()) {
            for (const eventName of Object.keys(events)) {
              this.removeEventListener(eventName, func);
            }
          }
          this._eventWrapperMap.clear();
        }

        setAttribute(attr: string, value: string): void {
          this._video.setAttribute(attr, value);
          super.setAttribute(attr, value);
        }

        removeAttribute(attr: string): void {
          this._video.removeAttribute(attr);
          super.removeAttribute(attr);
        }

        getAttribute(attr: string): string | null {
          return this._video.getAttribute(attr);
        }

        addEventListener(
          eventName: string,
          callback: EventListener,
          ...options: [options?: boolean | AddEventListenerOptions]
        ): void {
          const map = this._eventWrapperMap.get(callback) || {};

          if (map[eventName]) {
            return;
          }

          const wrapper = (event: unknown): void => {
            callback(overrideTarget(event) as Event);
          };

          map[eventName] = wrapper;
          this._eventWrapperMap.set(callback, map);
          super.addEventListener(eventName, wrapper, ...options);
          this._video.addEventListener(eventName, wrapper, ...options);
        }

        removeEventListener(eventName: string, callback: EventListener): void {
          super.removeEventListener(eventName, callback);
          this._video.removeEventListener(eventName, callback);

          const map = this._eventWrapperMap.get(callback);
          if (!map || !map[eventName]) {
            return;
          }

          super.removeEventListener(eventName, map[eventName]);
          this._video.removeEventListener(eventName, map[eventName]);

          delete map[eventName];
          if (Object.keys(map).length < 1) {
            this._eventWrapperMap.delete(callback);
          }
        }

        _bridgeProps(obj: HTMLVideoElement, props: Array<string> = []): void {
          const record = obj as unknown as Record<string, unknown>;
          props.forEach((prop: string) => {
            if (!(prop in obj)) {
              return;
            }
            if (typeof record[prop] === 'function') {
              (this as unknown as Record<string, unknown>)[prop] = (...args: Array<unknown>): unknown => {
                return (record[prop] as (...args: Array<unknown>) => unknown)(...args);
              };
            } else {
              Object.defineProperty(this, prop, {
                get() {
                  return record[prop];
                },
                set(v: unknown) {
                  record[prop] = v;
                },
              });
            }
          });
        }

        _resetPlayingStatus(): void {
          this._error = null;
          this._isForbidden403 = false;
          this._isStalledBy403 = false;
          this._error429Count = 0;
          this._seekingTime = 0;
          this._isSeeking = false;
          this._isBufferCompleted = false;
          this._throttledCurrentTime.cancel();
          this._bufferStats = [];
        }

        get _useNativeHLS(): boolean {
          return !!this._video.canPlayType('application/x-mpegURL') && this.getAttribute('use-native-hls') === 'no';
        }

        set playerMode(v: string) {
          this._playerMode = v;
          this.label = v;
          super.setAttribute('data-player-mode', v);
        }

        get playerMode(): string {
          return this._playerMode;
        }

        get label(): string | null {
          return this._label.textContent;
        }

        set label(v: string) {
          if (this._label.textContent === v) {
            return;
          }
          this._label.textContent = v;
        }

        get hlsConfig(): Record<string, unknown> {
          return this._hlsConfig;
        }

        set hlsConfig(config: Record<string, unknown>) {
          this._hlsConfig = config;
          if (this._hls) {
            const hls = this._hls;
            Object.keys(config).forEach((prop: string) => {
              if (prop in hls.config) {
                hls.config[prop] = config[prop];
              }
            });
          }
        }

        get hls(): HlsInstance | null {
          return this._hls;
        }

        _destroyHLSJS(): void {
          if (this._hls) {
            this._hls.stopLoad();
            this._hls.detachMedia();
            this._hls.destroy();
            if (this._fragmentLoader) {
              delete this._hlsConfig.fLoader;
              delete this._fragmentLoader;
            }
            this._hls = null;
          }
        }

        _initHLSJS(src: string): HlsInstance {
          this._destroyHLSJS();

          if (!this._hls) {
            //if (this.dataset.usecase !== 'capture') {
            //if (Config.get('enable_db_cache') && !window.Prototype) {
            //  Storage.gc();
            //}
            //setTimeout(() => {Storage.gc(); }, 30000);
            //}
            this._fragmentLoader = createFragmentLoader(Hls);
            this._hlsConfig.fLoader = this._fragmentLoader;
            const hls = new Hls(this._hlsConfig);
            this._hls = hls;

            this._hls.on(Hls.Events.MANIFEST_PARSED, this._onHLSJSManifestParsed.bind(this));
            this._hls.on(Hls.Events.LEVEL_LOADED, this._onHLSJSLevelLoaded.bind(this));
            this._hls.on(Hls.Events.LEVEL_SWITCHED, this._onHLSJSLevelSwitched.bind(this));
            this._hls.on(Hls.Events.ERROR, this._onHLSJSError.bind(this));
            this._hls.on(Hls.Events.FRAG_LOADED, this._onHLSJSFragLoaded.bind(this));
            // this._hls.on(Hls.Events.FRAG_BUFFERED,
            //   this._onHLSJSFragBuffered.bind(this));
            this._hls.on(Hls.Events.BUFFER_EOS, this._onHLSJSBufferEOS.bind(this));
            this.dispatchEvent(new CustomEvent('init-hls-js', { detail: { hls: hls } }));
            this._hls.on(Hls.Events.MEDIA_ATTACHED, () => {
              this._hls!.loadSource(src);
            });
            // overrideKeyloader(hls);
            this._hls.attachMedia(this._video);
          }
          return this._hls;
        }

        _onHLSJSManifestParsed(eventName: unknown, data: HlsManifestData): void {
          //console.log('%cHls.Events.MANIFEST_PARSED', 'background: cyan;', this._src);
          this._manifest = data;
          this._levelData = [];
          if (this._fragmentLoader) {
            this._fragmentLoader.levels = data.levels;
          }
          this.dispatchEvent(new Event('loadedmetadata'));
          this.dispatchEvent(new Event('canplay'));
        }

        _onHLSJSLevelLoaded(eventName: unknown, data: HlsLevelData): void {
          //console.log('%cHls.Events.LEVEL_LOADED', 'background: cyan;', this._src);//, data);
          this._levelData[data.level] = data.details;
          this._bufferStats.length = data.details.endSN || 0;
        }

        _onHLSJSLevelSwitched(): void {
          const hls = this._hls as HlsInstance;
          const level = hls.levels[hls.currentLevel];

          const labelText = `${this.playerMode}: ${this._video.videoWidth}x${this._video.videoHeight}`;
          if (this.label !== labelText) {
            this.label = labelText;
            this._blinkLabel();
          }

          if (hls.levels.length > 1 && level && typeof level.bitrate === 'number') {
            this._hls!.config.abrEwmaDefaultEstimate = this.hlsConfig.abrEwmaDefaultEstimate = Math.round(
              level.bitrate * 0.8
            );

            this.dispatchEvent(
              new CustomEvent('levelswitched', {
                detail: {
                  level: hls.currentLevel,
                  width: this._video.videoWidth,
                  height: this._video.videoHeight,
                  bitrate: level.bitrate,
                },
              })
            );
          }
        }

        _onHLSJSFragBuffered(eventName: unknown, data: HlsFragBufferedData): void {
          const { trequest, tfirst, tbuffered, total } = data.stats;
          const { duration, level, sn } = data.frag;
          const totalTime = tbuffered - trequest;
          const transferKbps = Math.round((total * 8) / (tbuffered - trequest - (tfirst - trequest)));
          const dataKbps = Math.round((total * 8) / duration);
          this._bufferStats[sn] = { totalTime, transferKbps, dataKbps, level, sn };
          // console.log('rate', {totalTime, transferKbps, dataKbps, level, sn});
        }

        _blinkLabel(): void {
          this._label.classList.add('blink');
          setTimeout(() => {
            this._label.classList.remove('blink');
          }, 1000);
        }

        // @see https://github.com/video-dev/hls.js/blob/master/docs/API.md#fifth-step-error-handling
        _onHLSJSError(e: unknown, data: HlsErrorData): void {
          if (data.fatal) {
            return this._onHLSJSFatalError(e, data);
          }

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              {
                if (this._isBufferCompleted) {
                  return;
                }
                const code = data.response ? data.response.code : 0;

                if (code === 429) {
                  // 短時間でアクセスしすぎると出る
                  this._error429Count++;
                  // TODO: インターバルを伸ばす？ (そしていつ戻す？)
                  //this._hls.config.fragLoadingRetryDelay += 500;
                } else if (code === 403) {
                  // 403になるとそのセッションは死ぬ
                  console.warn('Forbidden 403: %s\n%s', this._id, this.src);
                  this._isForbidden403 = true;
                  //this._hls.stopLoad();
                }
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              if (
                [Hls.ErrorDetails.BUFFER_STALLED_ERROR, Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE].includes(
                  data.details as string
                )
              ) {
                // 403でバッファも尽きた時はどうしようもないのでエラー飛ばす
                if (this._isForbidden403) {
                  this._isStalledBy403 = true;
                  const event = new ErrorEvent('error');
                  this._error = {
                    code: HLS_ERROR_CODE.NETWORK,
                    message: `403 Forbidden, ${data.details}`,
                  };
                  this.dispatchEvent(overrideTarget(event) as Event);
                } else {
                  // this.dispatchEvent(new Event('stalled'));
                }
              }
              break;
          }
          return;
        }

        _onHLSJSFatalError(e: unknown, data: HlsErrorData): void {
          console.error('%cHls.Events.ERROR: FATAL', 'background: cyan;', this._id, data);
          let code: number;
          // サンプルコードではここで自動リカバーしているが、
          // サーバーの障害でエラーが起きてる場合は追加攻撃になりかねないので、やめておく
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              code = HLS_ERROR_CODE.NETWORK;
              if (this._isBufferCompleted) {
                return;
              }
              //hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              code = HLS_ERROR_CODE.DECODE;
              //hls.recoverMediaError();
              break;
            default:
              code = HLS_ERROR_CODE.UNKNOWN;
              break;
          }

          const event = new ErrorEvent('error');
          this._error = {
            code,
            message: data.details,
          };
          this.dispatchEvent(overrideTarget(event) as Event);
        }

        _onHLSJSFragLoaded(): void {
          // intentionally empty
        }

        _onHLSJSBufferEOS(): void {
          this._isBufferCompleted = true;
          this.dispatchEvent(new CustomEvent('buffercomplete', { detail: { src: this._src } }));
        }
      }

      if (window.customElements) {
        window.customElements.define('futatsume-video', FutatsumeVideoElement);
      }
      if (!Hls) {
        const s = document.createElement('script');
        s.onload = (): void => {
          Hls = (window as unknown as { Hls?: HlsStatic }).Hls as HlsStatic;
        };
        s.src = `https://cdn.jsdelivr.net/npm/hls.js@${String(Config.get('hls_js_ver'))}`;
        // console.info('load hls.js from', s.src);
        (document.head || document.documentElement).append(s);
      }
      return FutatsumeVideoElement;
    })({ Hls, throttle });

    interface HlsDebugPropDef {
      name: string;
      type: string;
    }
    type HlsDebugPropValue = string | number | boolean | null;
    interface HlsDebugElement extends Element {
      name: string;
      value: unknown;
      defaultValue: unknown;
      reset(): void;
    }
    interface HlsDebugTemplates {
      html: (strings: TemplateStringsArray, ...values: Array<unknown>) => unknown;
      render: (node: unknown, target: HTMLElement | ShadowRoot) => void;
    }
    const initDebugElements = (config: Record<string, unknown>, { html, render }: HlsDebugTemplates): unknown => {
      if (!HTMLDialogElement || !window.customElements) {
        return;
      }

      class VideoDebugInput extends HTMLElement {
        declare _props: Record<string, HlsDebugPropValue>;
        declare _shadow: ShadowRoot;
        declare _input: HTMLInputElement;
        declare _root: Element;
        declare _details: HTMLElement;
        declare _detailsText: HTMLElement;
        declare _defaultValue: HlsDebugPropValue;
        static get observedAttributes(): Array<string> {
          return ['value'];
        }

        static get props(): Array<HlsDebugPropDef> {
          return [
            { name: 'name', type: 'string' },
            { name: 'value', type: 'string' },
          ];
        }

        constructor() {
          super();

          this._props = {};
          (this.constructor as typeof VideoDebugInput).props.forEach(({ name, type }: HlsDebugPropDef) => {
            const attr = this.getAttribute(name);
            switch (type) {
              case 'boolean':
                this._props[name] = attr === 'true';
                break;
              case 'number':
                if (!attr) {
                  return;
                }
                this._props[name] = parseFloat(attr);
                break;
              default:
                this._props[name] = attr;
            }
          });

          this._shadow = this.attachShadow({ mode: 'open' });
          render(this.html(this._props), this._shadow);
          const theme = document.createElement('style');
          theme.textContent = SETTINGS_FIELD_THEME;
          this._shadow.append(theme);

          this._input = this._shadow.querySelector('input') as HTMLInputElement;
          this._root = this._shadow.querySelector('.root, input') as Element;
          this._details = this._shadow.querySelector('.details') as HTMLElement;
          this._detailsText = this._shadow.querySelector('.detailsText') as HTMLElement;
          const details = (this.getAttribute('details') || '').trim();
          this._details.hidden = !details;
          if (details) {
            this._detailsText.innerHTML = details.replace(/\n/g, '<br>');
          }

          const text = (this.getAttribute('text') || '').trim();
          if (text) {
            (this._root.querySelector('.labelText') as Element).textContent = text;
          }
        }

        html(props: Record<string, HlsDebugPropValue>): unknown {
          return html` <input name="${props.name}" value="${props.value}" /> `;
        }

        set defaultValue(v: string) {
          this._defaultValue = v;
          this.setAttribute('default-value', v);
          this._root.classList.toggle('is-changed', this.value !== this.defaultValue);
        }

        set value(v: string) {
          if (this._props.value === v) {
            return;
          }
          this._props.value = v;
          this._input.value = v;
          this.setAttribute('value', v);
          this._input.setAttribute('data-value', v);
          this._root.classList.toggle('is-changed', this.value !== this.defaultValue);
          this.dispatchEvent(new Event('change'));
        }

        get name(): string {
          return (this._props.name as string) || '';
        }

        get value(): HlsDebugPropValue {
          return this._props.value as HlsDebugPropValue;
        }

        get defaultValue(): HlsDebugPropValue {
          return this._defaultValue;
        }

        reset(): void {
          this.value = this.defaultValue as string;
        }

        attributeChangedCallback(attrName: string, oldVal: string | null, newVal: string | null): void {
          if (attrName === 'value' && oldVal !== newVal) {
            this.value = newVal as string;
          }
        }
      }

      class VideoDebugCheckbox extends VideoDebugInput {
        static get props(): Array<HlsDebugPropDef> {
          return [
            { name: 'name', type: 'string' },
            { name: 'value', type: 'boolean' },
          ];
        }

        constructor() {
          super();

          this._input.checked = this._props.value as boolean;
          this._input.addEventListener('change', () => {
            this.value = this._input.checked;
          });
        }

        html(props: Record<string, HlsDebugPropValue>): unknown {
          return html`
            <style>
              .root {
                display: block;
                position: relative;
                white-space: nowrap;
                padding: 8px 8px 16px;
              }

              .labelText {
                display: inline-block;
                text-align: right;
                font-family: monospace;
                padding: 0 8px;
              }

              .is-changed .labelText {
                font-weight: bolder;
                color: blue;
              }

              input[type='checkbox'] {
                transform: scale(2);
                margin-right: 8px;
              }

              label {
                min-width: 300px;
                padding: 8px;
                cursor: pointer;
              }

              label:hover {
              }

              .details {
                padding-left: 16px;
              }
              .detailsText {
                color: #666;
              }
            </style>
            <div class="root">
              <label>
                <input type="checkbox" name="${props.name}" />
                <span class="labelText">${props.name}<content></content></span>
              </label>
              <slot></slot>
              <aside class="details">
                <div class="detailsText"></div>
              </aside>
            </div>
          `;
        }

        set value(v: string | boolean) {
          v = typeof v === 'boolean' ? v : v === 'true';
          if (this._props.value === v) {
            return;
          }
          this._props.value = v;
          this._input.checked = v;
          this.setAttribute('value', String(v));
          this._root.classList.toggle('is-changed', v !== this.defaultValue);
          this.dispatchEvent(new Event('change'));
        }

        get value(): HlsDebugPropValue {
          return this._props.value as HlsDebugPropValue;
        }
      }
      window.customElements.define('video-debug-checkbox', VideoDebugCheckbox);

      class VideoDebugSlider extends VideoDebugInput {
        static get props(): Array<HlsDebugPropDef> {
          return [
            { name: 'name', type: 'string' },
            { name: 'value', type: 'number' },
            { name: 'min', type: 'number' },
            { name: 'max', type: 'number' },
            { name: 'step', type: 'number' },
          ];
        }

        constructor() {
          super();

          this._input.addEventListener('input', () => {
            this.value = this._input.value;
          });
        }

        html(props: Record<string, HlsDebugPropValue>): unknown {
          return html` <style>
              .root {
                display: block;
                position: relative;
                white-space: nowrap;
                padding: 0 8px 16px;
              }
              .labelText {
                display: inline-block;
                text-align: right;
                font-family: monospace;
                padding: 0 16px;
              }

              .is-changed .labelText {
                font-weight: bolder;
                color: blue;
              }

              input[type='range'] {
                position: relative;
                -webkit-appearance: none;
                min-width: 400px;
                vertical-align: baseline;
              }

              input[type='range']:focus,
              input[type='range']:active {
                outline: none;
              }

              input[type='range']::after {
                content: attr(data-value);
                position: absolute;
                bottom: 20px;
                right: 4px;
                transform: scale(1.2);
              }

              input[type='range']::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                pointer-events: none;
                position: relative;
                border: none;
                width: 16px;
                height: 16px;
                display: block;
                background-color: #262626;
                border-radius: 50%;
                -webkit-border-radius: 50%;
              }
              input[type='range']:active::-webkit-slider-thumb {
                box-shadow: 0 0 4px #888;
              }

              label {
                display: inline-block;
                min-width: 300px;
                cursor: pointer;
              }

              label:hover {
              }

              .details {
                padding-left: 16px;
              }
              .detailsText {
                color: #666;
              }
            </style>
            <div class="root">
              <label>
                <input type="range" min="${props.min}" max="${props.max}" step="${props.step}" value="${props.value}" />
                <span class="labelText">${props.name}<content></content></span>
                <output class="current-value"></output>
              </label>
              <aside class="details">
                <div class="detailsText"></div>
              </aside>
            </div>`;
        }

        set value(v: string | number) {
          v = parseFloat(String(v));
          const diff = Math.abs((this._props.value as number) - v);
          if (typeof this._props.value === 'number' && diff <= 0.01) {
            return;
          }
          this._props.value = v;
          this._input.value = String(v);
          this.setAttribute('value', String(v));
          this._input.setAttribute('data-value', v.toLocaleString());
          this._root.querySelector('output')!.textContent = v.toLocaleString();
          this._root.classList.toggle('is-changed', this.value !== this.defaultValue);
          this.dispatchEvent(new Event('change'));
        }

        get value(): HlsDebugPropValue {
          return this._props.value as HlsDebugPropValue;
        }
      }
      window.customElements.define('video-debug-slider', VideoDebugSlider);

      class VideoDebugDialog extends HTMLElement {
        declare private modal: SettingsDialog;
        declare _hlsConfig: Record<string, unknown>;
        declare _elm: Record<string, HlsDebugElement>;
        declare _shadow: ShadowRoot;
        declare _root: HTMLDialogElement;
        static get observedAttributes(): Array<string> {
          return [
            'enable_db_cache',
            'cache_expire_time',
            'debug',
            'startLevel',
            'capLevelOnFPSDrop',
            'capLevelToPlayerSize',
            'maxBufferLength',
            'maxBufferSize',
            'maxMaxBufferLength',
            'minAutoBitrate',
            'abrEwmaFastVoD',
            'abrEwmaSlowVoD',
            'abrEwmaDefaultEstimate',
            'abrBandWidthFactor',
            'abrBandWidthUpFactor',
            'abrMaxWithRealBitrate',
          ];
        }

        constructor() {
          super();
          this._hlsConfig = {};
          this._elm = {};
        }

        set hlsConfig(v: Record<string, unknown>) {
          this._hlsConfig = v;
          Object.keys(v).forEach((key: string) => {
            const elm = this._elm[key];
            if (elm) {
              elm.value = v[key];
            }
            //this.setAttribute(key, v[key]);
          });
        }

        get hlsConfig(): Record<string, unknown> {
          return this._hlsConfig;
        }

        reset(config?: Record<string, unknown>): void {
          if (!this._shadow) {
            return;
          }
          Object.keys(this._elm).forEach((key: string) => {
            const elm = this._elm[key] as HlsDebugElement;
            if (config && Object.hasOwn(config, key)) {
              elm.defaultValue = config[key];
            }
            elm.reset();
          });
        }

        get isOpen(): boolean | undefined {
          if (!this._root) {
            return;
          }
          return !!this._root.open;
        }

        open(): void {
          if (!this._root) {
            return;
          }
          if (!this._root.open) {
            this.modal.open();
          }
        }

        close(): void {
          if (!this._root) {
            return;
          }
          if (this._root.open) {
            this.modal.close();
          }
        }

        toggle(): void {
          if (!this._root) {
            return;
          }
          if (this.isOpen) {
            this.close();
          } else {
            this.open();
          }
        }

        connectedCallback(): void {
          if (!this._shadow) {
            this._shadow = this.attachShadow({ mode: 'open' });
            render(this.html(), this._shadow);
            this._root = this._shadow.querySelector('.root') as HTMLDialogElement;
            this.modal = new SettingsDialog(this._root, 'hls', () => {});

            Array.from(
              this._shadow.querySelectorAll<HlsDebugElement>('video-debug-checkbox, video-debug-slider')
            ).forEach((elm) => {
              this._elm[elm.name] = elm;
              elm.defaultValue = this.hlsConfig[elm.name];
              elm.value = this.hlsConfig[elm.name];

              elm.addEventListener('change', (e: Event) => {
                //this.setAttribute(e.target.name, e.target.value);
                this.dispatchEvent(
                  new CustomEvent('change', {
                    detail: { name: (e.target as HlsDebugElement).name, value: (e.target as HlsDebugElement).value },
                  })
                );
              });
            });
            this._root.addEventListener('click', this._onClick.bind(this));
          }
        }

        setValue(key: string, value: unknown): void {
          const elm = this._elm[key];
          if (elm) {
            elm.value = value;
          }
        }

        getValue(key: string): unknown {
          const elm = this._elm[key];
          if (elm) {
            return elm.value;
          }
        }

        _onClick(e: Event): void {
          const target = e.target as Element | null;
          const commandElement = (target as Element).closest('[data-command]');
          if (!commandElement) {
            return;
          }
          const command = commandElement.getAttribute('data-command');
          //const param   = commandElement.getAttribute('data-param');
          switch (command) {
            case 'toggle':
              this.toggle();
              break;
            case 'save':
              {
                const config: Record<string, unknown> = {};
                Object.keys(this._elm).forEach((key: string) => {
                  const elm = this._elm[key] as HlsDebugElement;
                  config[key] = elm.value;
                });
                this.dispatchEvent(new CustomEvent('save', { detail: { config } }));
              }
              break;
            case 'reset':
              this.dispatchEvent(new CustomEvent('reset'));
              break;
            case 'clear-cache':
              if ((target as Element).classList.contains('is-busy')) {
                break;
              }
              (target as Element).classList.add('is-busy');
              void Storage.clear();
              setTimeout(() => (target as Element).classList.remove('is-busy'), 5000);
              break;
            default:
              return;
          }
          e.preventDefault();
          e.stopPropagation();
        }

        attributeChangedCallback(attrName: string, oldVal: string | null, newVal: string | null): void {
          const elm = this._elm[attrName];
          if (elm) {
            elm.value = newVal;
          }
        }
        //adoptedCallback() {}

        html(): unknown {
          return html` <style>
              .root {
                position: fixed;
                width: 640px;
                max-height: 80vh;
                /*max-height: calc(100vh - 32px);*/
                /*top: 100vh;*/
                z-index: 10000;
                overflow-x: hidden;
                overflow-y: auto;
                /*transform: translate(0, -32px);*/
                background: rgba(240, 240, 240, 0.95);
                color: #000;
                padding: 0;
                border: 0;
                border-radius: 4px;
                transition:
                  0.2s transform ease,
                  0.2s box-shadow ease,
                  0.2s opacity;
                user-select: none;
                opacity: 1;
                box-shadow: 0px 0px 4px rgba(0, 0, 0, 0.8);
                /* mix-blend-mode: hard-light;*/
              }

              .root::backdrop {
                /*
              background:
                linear-gradient(to bottom, rgba(0, 0, 80, 0.5), rgba(0, 0, 0, 0.5));
                */
                background: rgba(0, 0, 0, 0.2);
              }

              a {
                outline: none;
              }

              .dialogInner {
                padding: 0 8px 8px;
              }

              .title {
                padding: 0 8px;
                text-shadow: 2px 2px 2px #ccc;
              }

              .description {
                padding: 0px 8px 8px;
              }

              .buttomContainer {
                text-align: center;
              }

              button[data-command] {
                width: 100px;
                margin: 8px;
                padding: 8px;
                cursor: pointer;
                white-space: nowrap;
              }

              button[data-command='clear-cache'] {
                width: auto;
              }
              button[data-command='clear-cache']:active,
              button[data-command='clear-cache'].is-busy {
                cursor: wait;
                opacity: 0.5;
              }

              .video-debug-checkbox {
                display: inline-block;
              }
            </style>
            <dialog class="root">
              <div class="dialogInner">
                <h1 class="title">HLS 設定</h1>
                <p class="description">
                  設定はリロード後に反映されます。 詳しいドキュメントは
                  <a href="https://github.com/video-dev/hls.js/blob/master/docs/API.md#fine-tuning" target="_blank"
                    >こちら</a
                  >
                </p>
                <video-debug-slider
                  name="maxBufferLength"
                  text="最少バッファ量(秒)"
                  details="
最低限バッファを確保する量 (秒数指定)
↓と比較して大きいほうが確保される
          "
                  min="0"
                  max="300"
                  step="5"
                ></video-debug-slider>

                <video-debug-slider
                  name="maxBufferSize"
                  text="最少バッファ量(byte)"
                  details="
最低限バッファを確保する量 (バイト数指定)
↑と比較して大きいほうが確保される
          "
                  min="0"
                  max="1000000000"
                  step="1000"
                ></video-debug-slider>

                <video-debug-slider
                  name="maxMaxBufferLength"
                  text="最大バッファ量(秒)"
                  details="
バッファを確保する量の上限 (秒数指定)。
あまり大きな値を入れてもブラウザの制限に引っかかるので効果なし。
"
                  min="0"
                  max="1200"
                  step="5"
                ></video-debug-slider>

                <video-debug-slider
                  name="minAutoBitrate"
                  text="下限ビットレート"
                  details="
自動画質選択時のビットレート下限。
これより低いビットレートは選択されなくなる。
          "
                  min="0"
                  max="6000000"
                  step="100000"
                ></video-debug-slider>

                <video-debug-slider
                  name="startLevel"
                  details="
自動画質再生時に最初に選択される画質。-1 はオート。
0 からは画質の低い順
"
                  min="-1"
                  max="4"
                  step="1"
                ></video-debug-slider>

                <video-debug-slider
                  name="abrEwmaDefaultEstimate"
                  details="
自動画質再生時に最初に見積もる回線速度。
大きめの値を入れると最初から高画質が選択されやすくなる。
          "
                  min="0"
                  max="6000000"
                  step="1000"
                ></video-debug-slider>

                <video-debug-checkbox
                  name="autoAbrEwmaDefaultEstimate"
                  text="abrEwmaDefaultEstimate の値を自動で調整する"
                ></video-debug-checkbox>

                <video-debug-checkbox
                  name="capLevelOnFPSDrop"
                  text="フレームレートが落ちたら画質を下げる"
                ></video-debug-checkbox>

                <video-debug-checkbox
                  name="capLevelToPlayerSize"
                  text="プレイヤーの表示サイズで画質を制限する"
                ></video-debug-checkbox>

                <video-debug-checkbox name="show_video_label" text="再生中に動画情報を表示"></video-debug-checkbox>

                <video-debug-checkbox
                  name="enable_db_cache"
                  text="IndexedDBに動画データをキャッシュする(実験中)"
                  details="画質ごとにキャッシュが作られるので、画質設定は「自動」以外を推奨"
                >
                  <button type="button" data-command="clear-cache">キャッシュのクリア</button>
                </video-debug-checkbox>

                <video-debug-checkbox name="debug"></video-debug-checkbox>

                <div class="buttomContainer">
                  <button type="button" data-command="save">設定の保存</button>
                  <button type="button" data-command="reset">リセット</button>
                  <button type="button" data-command="toggle">閉じる</button>
                </div>
              </div>
            </dialog>`;
        }
      }

      window.customElements.define('video-debug-dialog', VideoDebugDialog);
      return VideoDebugDialog;
    };

    interface HlsLocalFutatsumeWatch {
      ready?: boolean;
      debug: Record<string, unknown>;
      emitter: HlsRuntimeEmitter;
      util: { addStyle(css: string, options?: unknown): unknown };
    }
    interface HlsRuntimeEmitter {
      promise(event: string): Promise<{ container: Element }>;
      once(event: string, handler: (...args: Array<never>) => void): void;
      on(event: string, handler: (...args: Array<never>) => void): void;
    }
    interface HlsDebugModule {
      html: (strings: TemplateStringsArray, ...values: Array<unknown>) => unknown;
      render: (node: unknown, target: HTMLElement | ShadowRoot) => void;
    }
    const FutatsumeDetector: { initialize(): void; detect(timing?: string): Promise<HlsLocalFutatsumeWatch> } = (() => {
      let FutatsumeWatch: HlsLocalFutatsumeWatch | null = null;
      let emitter: AnyEmitter | undefined;

      const initialize = (): void => {
        if (emitter) {
          return;
        }
        emitter = new Emitter();
        const onBeforeFutatsumeReady = (): void => {
          FutatsumeWatch = (window as unknown as { FutatsumeWatch: HlsLocalFutatsumeWatch }).FutatsumeWatch;
          void emitter!.emitResolve('beforeReady', FutatsumeWatch);
        };

        const onFutatsumeReady = (): void => {
          FutatsumeWatch = (window as unknown as { FutatsumeWatch: HlsLocalFutatsumeWatch }).FutatsumeWatch;
          void emitter!.emitResolve('beforeReady', FutatsumeWatch);
          void emitter!.emitResolve('afterReady', FutatsumeWatch);
        };

        if ((window as unknown as { FutatsumeWatch?: HlsLocalFutatsumeWatch }).FutatsumeWatch) {
          onBeforeFutatsumeReady();
          if ((window as unknown as { FutatsumeWatch: HlsLocalFutatsumeWatch }).FutatsumeWatch.ready) {
            return onFutatsumeReady();
          }
        }
        window.addEventListener('BeforeFutatsumeWatchInitialize', onBeforeFutatsumeReady, { once: true });
        window.addEventListener('FutatsumeWatchInitialize', onFutatsumeReady, { once: true });
      };

      const detect = (timing = 'ready'): Promise<HlsLocalFutatsumeWatch> => {
        initialize();
        if (timing === 'beforeready') {
          return emitter!.promise('beforeReady') as unknown as Promise<HlsLocalFutatsumeWatch>;
        } else {
          return emitter!.promise('afterReady') as unknown as Promise<HlsLocalFutatsumeWatch>;
        }
      };

      return { initialize, detect };
    })();

    const initDebug = ({
      hlsConfig,
      html,
      render,
      FutatsumeWatch,
    }: {
      hlsConfig: Record<string, unknown>;
      html: HlsDebugModule['html'];
      render: HlsDebugModule['render'];
      FutatsumeWatch: HlsLocalFutatsumeWatch;
    }): void => {
      void FutatsumeWatch.emitter.promise('videoControBar.addonMenuReady').then(({ container }) => {
        const div = html`<div class="command controlButton" data-command="toggleHLSDebug">
          <div class="controlButtonInner">hls</div>
        </div>`;
        FutatsumeWatch.util.addStyle(
          `
          .controlButton[data-command=toggleHLSDebug] {
            font-family: Avenir;
          }`,
          { className: 'FutatsumeHLS' }
        );
        const mount = document.createElement('span');
        container.append(mount);
        render(div, mount);
      });
      void FutatsumeWatch.emitter.promise('videoContextMenu.addonMenuReady.list').then(({ container }) => {
        const li = html`<li class="command" data-command="toggleHLSDebug">HLS設定</li>`;
        const mount = document.createElement('li');
        container.append(mount);
        render(li, mount);
      });

      FutatsumeWatch.emitter.once('command-toggleHLSDebug', () => {
        initDebugElements(hlsConfig, { html, render });
        const d = document.createElement('video-debug-dialog') as unknown as HlsVideoDebugDialog;
        d.className = 'futatsume-family';
        d.hlsConfig = hlsConfig;
        d.addEventListener('change', (e: Event) => {
          const detail = (e as CustomEvent).detail as { name: string; value: HlsConfigValue };
          if (detail.name === 'show_video_label') {
            Config.set(detail.name, detail.value);
            if (primaryVideo) {
              primaryVideo.setAttribute('show-video-label', detail.value ? 'on' : 'off');
            }
          } else if (detail.name === 'autoAbrEwmaDefaultEstimate') {
            Config.set(detail.name, detail.value);
          }
        });
        d.addEventListener('save', (e: Event) => {
          const config = ((e as CustomEvent).detail as { config: Record<string, unknown> }).config;
          Object.keys(config).forEach((key: string) => {
            if (config[key] !== Config.get(key)) {
              Config.set(key, config[key] as HlsConfigValue);
            }
          });
          if (primaryVideo) {
            primaryVideo.hlsConfig = config;
          }
        });
        d.addEventListener('reset', () => {
          const config: Record<string, unknown> = Object.assign({}, DEFAULT_CONFIG);
          d.reset(config);
          if (primaryVideo) {
            primaryVideo.hlsConfig = config;
          }
        });
        Config.on('update-abrEwmaDefaultEstimate', (value: unknown) => {
          if (typeof value !== 'number' || isNaN(value)) {
            return;
          }
          d.setValue('abrEwmaDefaultEstimate', value);
        });

        FutatsumeWatch.debug.hlsDebugDialog = d;
        document.body.append(d);
        d.open();

        FutatsumeWatch.emitter.on('command-toggleHLSDebug', () => {
          (FutatsumeWatch.debug.hlsDebugDialog as HlsVideoDebugDialog).toggle();
        });
      });
    };

    const init = (): void => {
      const hlsConfig: Record<string, unknown> = Object.assign({}, Config.raw);
      Config.on('update', (key: unknown, value: unknown): void => {
        hlsConfig[key as string] = value;
      });

      let lastLevel = -1;
      const createVideoElement = (usecase?: string): HTMLVideoElement | HlsFutatsumeVideo => {
        if (!window.customElements) {
          return document.createElement('video');
        }
        const video = document.createElement('futatsume-video') as unknown as HlsFutatsumeVideo;
        if (usecase === 'capture') {
          //return null;
          // 静止画キャプチャ用なのにどんどんバッファするのは無駄なので抑える
          video.setAttribute('data-usecase', 'capture');
          video.hlsConfig = Object.assign(hlsConfig, {
            autoStartLoad: false,
            // maxBufferSize: 0,
            // maxBufferLength: 5,
            // maxMaxBufferLength: 5,
            manifestLoadingRetryDelay: 5000,
            levelLoadingRetryDelay: 5000,
            fragLoadingRetryDelay: 5000,
            fragLoadingMaxRetry: 3,
            levelLoadingMaxRetry: 1,
            abrEwmaDefaultEstimate: (
              (globalThis as unknown as { FutatsumeWatch: HlsLocalFutatsumeWatch }).FutatsumeWatch.debug
                .hlsConfig as Record<string, unknown>
            ).abrEwmaDefaultEstimate,
            startLevel: lastLevel,
          });
          video.addEventListener('init-hls-js', (e: Event): void => {
            const hls = ((e as CustomEvent).detail as { hls: HlsInstance }).hls;
            hls.autoLevelCapping = lastLevel;
          });
        } else {
          video.setAttribute('show-video-label', Config.get('show_video_label') ? 'on' : 'off');
          video.hlsConfig = hlsConfig;
          video.addEventListener('levelswitched', (e: Event): void => {
            const detail = (e as CustomEvent).detail as { level: number; bitrate: number };
            //const kbps = Math.round(detail.bitrate * 10 / 1024) / 10;
            //console.log('Hls.Events.LEVEL_SWITCHED level: %s, size: %sx%s, %sKbps',
            //  detail.level,
            //  detail.width,
            //  detail.height,
            //  kbps
            //);
            lastLevel = detail.level;
            if (Config.get('autoAbrEwmaDefaultEstimate')) {
              (
                (globalThis as unknown as { FutatsumeWatch: HlsLocalFutatsumeWatch }).FutatsumeWatch.debug
                  .hlsConfig as Record<string, unknown>
              ).abrEwmaDefaultEstimate = Math.round(detail.bitrate * 0.8);
            }
          });
          primaryVideo = video;
        }
        video.setAttribute('use-native-hls', Config.get('use_native_hls') ? 'yes' : 'no');
        return video;
      };

      (window as unknown as Record<string, unknown>).FutatsumeHLS = {
        createVideoElement,
      };

      void FutatsumeDetector.detect('beforeready')
        .then((FutatsumeWatch: HlsLocalFutatsumeWatch) => {
          FutatsumeWatch.debug.isHLSSupported = true;

          FutatsumeWatch.debug.hlsConfig = {};
          Object.keys(Config.raw).forEach((key: string) => {
            Object.defineProperty(FutatsumeWatch.debug.hlsConfig, key, {
              get() {
                return Config.get(key);
              },
              set(v: HlsConfigValue) {
                Config.set(key, v);
              },
            });
          });

          FutatsumeWatch.debug.createVideoElement = createVideoElement;
          return FutatsumeWatch;
        })
        .then((FutatsumeWatch: HlsLocalFutatsumeWatch) => {
          initDebug({ hlsConfig, html, render, FutatsumeWatch });
        });
    };

    init();
  };

  monkey(PRODUCT, {
    ErrorEvent,
    MediaError,
    HTMLDialogElement: window.HTMLDialogElement || HTMLDivElement,
    DOMException,
  });
}
