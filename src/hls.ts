import HlsRuntime from 'hls.js';
import { StorageWorker } from './hls/storage-worker';
import type { HlsDebounced, HlsFragmentLoaderStatic } from './hls/types';
import { registerFutatsumeVideo } from './hls/futatsume-video';
const Hls = HlsRuntime as unknown as HlsStatic;
import { AntiPrototypeJs } from '../packages/lib/src/infra/anti-prototype-js';
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
interface HlsMonkeyModules {
  ErrorEvent: typeof ErrorEvent;
  MediaError: typeof MediaError;
  DOMException: typeof DOMException;
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

// hls.js@latest だと再生が始まらない動画がたまにある。 0.8.9ならok

export async function initializeHls(): Promise<void> {
  await AntiPrototypeJs();
  const PRODUCT = 'FutatsumeWatchHLS';
  const monkey = (PRODUCT: string, { ErrorEvent, MediaError, DOMException }: HlsMonkeyModules): void => {
    const window: Window & typeof globalThis = globalThis.window;
    const console = window.console;

    const Array = (window as unknown as HlsWindowExtension).PureArray || window.Array;

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

    const Config = {
      raw: Object.assign({}, DEFAULT_CONFIG),
      get: (key: string): HlsConfigValue => DEFAULT_CONFIG[key],
    };

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

    registerFutatsumeVideo({ Hls, throttle, Config, createFragmentLoader, ErrorEvent, MediaError, DOMException });

    const init = (): void => {
      const hlsConfig: Record<string, unknown> = Object.assign({}, Config.raw);
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
          video.hlsConfig = Object.assign({}, hlsConfig, {
            autoStartLoad: false,
            // maxBufferSize: 0,
            // maxBufferLength: 5,
            // maxMaxBufferLength: 5,
            manifestLoadingRetryDelay: 5000,
            levelLoadingRetryDelay: 5000,
            fragLoadingRetryDelay: 5000,
            fragLoadingMaxRetry: 3,
            levelLoadingMaxRetry: 1,
            abrEwmaDefaultEstimate: hlsConfig.abrEwmaDefaultEstimate,
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
              hlsConfig.abrEwmaDefaultEstimate = Math.round(detail.bitrate * 0.8);
            }
          });
        }
        video.setAttribute('use-native-hls', Config.get('use_native_hls') ? 'yes' : 'no');
        return video;
      };

      (window as unknown as Record<string, unknown>).FutatsumeHLS = {
        createVideoElement,
      };

      const FutatsumeWatch = (
        window as unknown as {
          FutatsumeWatch?: { debug: Record<string, unknown> };
        }
      ).FutatsumeWatch;
      if (FutatsumeWatch) {
        FutatsumeWatch.debug.isHLSSupported = true;
        FutatsumeWatch.debug.createVideoElement = createVideoElement;
      }
    };

    init();
  };

  monkey(PRODUCT, {
    ErrorEvent,
    MediaError,
    DOMException,
  });
}
