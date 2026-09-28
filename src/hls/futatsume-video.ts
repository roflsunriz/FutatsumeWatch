import type { HlsDebounced, HlsFragmentLoaderStatic } from './types';

interface HlsRuntimeConfig {
  get(key: string): unknown;
}

interface HlsElementOptions {
  Hls: HlsStatic;
  throttle: <A extends Array<unknown>>(func: (...args: A) => unknown, interval: number) => HlsDebounced<A>;
  Config: HlsRuntimeConfig;
  createFragmentLoader: (hls: HlsStatic) => HlsFragmentLoaderStatic;
  ErrorEvent: typeof ErrorEvent;
  MediaError: typeof MediaError;
  DOMException: typeof DOMException;
}

export function registerFutatsumeVideo(options: HlsElementOptions): void {
  let { Hls } = options;
  const { throttle, Config, createFragmentLoader, ErrorEvent, MediaError, DOMException } = options;
  const window: Window & typeof globalThis = globalThis.window;
  const PLAYER_MODE = { HLS_JS: 'HLS-JS', HLS_NATIVE: 'HLS-N', DEFAULT: 'N' };
  const HLS_ERROR_CODE = {
    ABORT: MediaError.MEDIA_ERR_ABORTED + 1000,
    NETWORK: MediaError.MEDIA_ERR_NETWORK + 1000,
    DECODE: MediaError.MEDIA_ERR_DECODE + 1000,
    UNKNOWN: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED + 1000,
  };
  const overrideTarget = (event: unknown): unknown => event;
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
}
