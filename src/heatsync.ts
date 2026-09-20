import _ from 'lodash';
import { SettingsDialog } from '../packages/components/src/settings-dialog';
import { Emitter } from '../packages/lib/src/emitter';
import type { EmitterCallback } from '../packages/lib/src/emitter';
import { FutatsumeDetector } from '../packages/components/src/util/futatsume-detector';

// 型宣言のみを置く（transpile で除去され、生成物には含まれない）。
// ランタイムコードへの変更は、型注釈・as キャスト・declare フィールドに留める。
type HeatsyncConfigValue = boolean | number | string;
interface HeatsyncEmitter {
  on<A extends Array<unknown>>(event: string, handler: (...args: A) => void): void;
  emit(event: string, ...args: Array<unknown>): void;
  promise(name: string): Promise<Record<string, unknown>>;
}
interface HeatsyncConfigNamespace {
  getValue(key: string): HeatsyncConfigValue;
  setValue(key: string, value?: HeatsyncConfigValue): void;
  refresh(): void;
  on(key: string, func: (update: { key: string; value: unknown }) => void): void;
}
interface HeatsyncConfig extends HeatsyncEmitter {
  refresh(emitChange?: boolean): void;
  refreshValue(key: string): void;
  getValue(key: string, refresh?: boolean): HeatsyncConfigValue;
  setValue(key: string, value?: HeatsyncConfigValue): void;
  clearConfig(): void;
  getKeys(): Array<string>;
  namespace(name: string): HeatsyncConfigNamespace;
}
interface HeatsyncUtil {
  addStyle(styles: { toString(): string }, id?: string): HTMLStyleElement;
  mixin(self: Record<string, unknown>, o: Record<string, (...args: Array<never>) => unknown>): void;
  attachShadowDom(options: { host: HeatsyncShadowHost; tpl: HTMLTemplateElement; mode?: string }): ShadowRoot;
  getWatchId(url?: string): string;
  isLogin(): boolean;
  escapeHtml(text: string): string;
  unescapeHtml(text: string): string;
  escapeRegs(text: string): string;
  hasLargeThumbnail(videoId: string): boolean;
  getThumbnailUrlByVideoId(videoId: string): string | null;
  isFirefox(): boolean;
  emitter: HeatsyncEmitter;
}
interface HeatsyncDialog {
  on<A extends Array<unknown>>(event: string, handler: (...args: A) => void): void;
}
interface HeatsyncVideoInfo {
  tagList?: Array<{ name: string }>;
}
interface HeatsyncFutatsumeWatch {
  config: {
    getValue(key: string): HeatsyncConfigValue;
    setValue(key: string, value?: unknown): void;
  };
  external: {
    getVideoElement(): HTMLVideoElement | null;
  };
  debug: {
    dialog: HeatsyncDialog;
  };
  emitter: HeatsyncEmitter;
}
interface HeatsyncProduct {
  debug: { _const: { BASE_Z_INDEX: number } };
  util?: HeatsyncUtil;
  config?: HeatsyncConfig;
  external?: { syncer: unknown };
  isReady?: boolean;
  toggleButton?: unknown;
}
interface BaseViewParams {
  parentNode?: Element | null;
  name?: string;
  template?: string;
  shadow?: string;
  css?: string;
  mode?: string;
}
interface HeatsyncBoundHandlers {
  onClick: EventListener;
  onBodyClick: EventListener;
}
interface HeatsyncConfigElements {
  red: HTMLInputElement;
  max: HTMLInputElement;
  minDur: HTMLInputElement;
  enabled: HTMLInputElement;
  ignores: HTMLInputElement;
}
interface HeatsyncShadowHost extends Element {
  createShadowRoot(): ShadowRoot;
}

(() => {
  const PRODUCT = 'HeatSync';
  const monkey = function (PRODUCT: string): void {
    const console = window.console;

    //const $ = window.jQuery;
    console.log(`exec ${PRODUCT}..`);

    const CONSTANT = {
      BASE_Z_INDEX: 150000,
    };
    const product: HeatsyncProduct = { debug: { _const: CONSTANT } };
    (window as unknown as Record<string, unknown>)[PRODUCT] = product;
    const { util } = (function (): { util: HeatsyncUtil; Emitter: unknown } {
      const util = {} as HeatsyncUtil;

      util.addStyle = function (styles: { toString(): string }, id?: string): HTMLStyleElement {
        const elm = document.createElement('style');
        elm.type = 'text/css';
        if (id) {
          elm.id = id;
        }

        let text: string | Text = styles.toString();
        text = document.createTextNode(text);
        elm.appendChild(text);
        const head = document.getElementsByTagName('head');
        const headElm = head[0] as Element;
        headElm.appendChild(elm);
        return elm;
      };

      util.mixin = function (
        self: Record<string, unknown>,
        o: Record<string, (...args: Array<never>) => unknown>
      ): void {
        _.each(Object.keys(o), (f: string) => {
          if (!_.isFunction(o[f])) {
            return;
          }
          if (_.isFunction(self[f])) {
            return;
          }
          self[f] = (o[f] as (...args: Array<never>) => unknown).bind(o);
        });
      };

      util.attachShadowDom = function ({
        host,
        tpl,
        mode = 'open',
      }: {
        host: HeatsyncShadowHost;
        tpl: HTMLTemplateElement;
        mode?: string;
      }): ShadowRoot {
        const root = host.attachShadow ? host.attachShadow({ mode: mode as ShadowRootMode }) : host.createShadowRoot();
        const node = document.importNode(tpl.content, true);
        root.appendChild(node);
        return root;
      };

      util.getWatchId = function (url?: string): string {
        /\/?watch\/([a-z0-9]+)/.test(url || location.pathname);
        return RegExp.$1;
      };

      util.isLogin = function (): boolean {
        return document.getElementsByClassName('siteHeaderLogin').length < 1;
      };

      util.escapeHtml = function (text: string): string {
        const map: Record<string, string> = {
          '&': '&amp;',
          '\x27': '&#39;',
          '"': '&quot;',
          '<': '&lt;',
          '>': '&gt;',
        };
        return text.replace(/[&"'<>]/g, (char: string) => {
          return map[char] as string;
        });
      };

      util.unescapeHtml = function (text: string): string {
        const map: Record<string, string> = {
          '&amp;': '&',
          '&#39;': '\x27',
          '&quot;': '"',
          '&lt;': '<',
          '&gt;': '>',
        };
        return text.replace(/(&amp;|&#39;|&quot;|&lt;|&gt;)/g, (char: string) => {
          return map[char] as string;
        });
      };

      util.escapeRegs = function (text: string): string {
        const map: Record<string, string> = {
          '\\': '\\\\',
          '*': '\\*',
          '+': '\\+',
          '.': '\\.',
          '?': '\\?',
          '{': '\\{',
          '}': '\\}',
          '(': '\\(',
          ')': '\\)',
          '[': '\\[',
          ']': '\\]',
          '^': '\\^',
          $: '\\$',
          '-': '\\-',
          '|': '\\|',
          '/': '\\/',
        };
        return text.replace(
          // eslint-disable-next-line no-useless-escape -- 文字クラス内のエスケープは原文のまま温存する
          /[\\\*\+\.\?\{\}\(\)\[\]\^\$\-\|\/]/g,
          (char: string) => {
            return map[char] as string;
          }
        );
      };

      util.hasLargeThumbnail = function (videoId: string): boolean {
        // return true;
        // 大サムネが存在する最初の動画ID。 ソースはちゆ12歳
        // ※この数字以降でもごく稀に例外はある。
        const threthold = 16371888;
        const cid = videoId.substr(0, 2);
        if (cid !== 'sm') {
          return false;
        }

        const fid = Number(videoId.substr(2));
        if (fid < threthold) {
          return false;
        }

        return true;
      };

      const videoIdReg = /^[a-z]{2}\d+$/;
      util.getThumbnailUrlByVideoId = function (videoId: string): string | null {
        if (!videoIdReg.test(videoId)) {
          return null;
        }
        const fileId = parseInt(videoId.substr(2), 10);
        const num = (fileId % 4) + 1;
        const large = util.hasLargeThumbnail(videoId) ? '.L' : '';
        return '//tn-skr' + num + '.smilevideo.jp/smile?i=' + fileId + large;
      };

      util.isFirefox = function (): boolean {
        return navigator.userAgent.toLowerCase().indexOf('firefox') >= 0;
      };

      util.emitter = new Emitter() as HeatsyncEmitter;

      return { util, Emitter };
    })();
    product.util = util;

    const broadcast: { send(packet?: unknown): void } = (() => {
      if (!window.BroadcastChannel) {
        return { send: () => {} };
      }
      const bc = new window.BroadcastChannel(PRODUCT);

      const onMessage = (e: MessageEvent): void => {
        const packet: unknown = e.data;
        //console.log('%creceive message', 'background: cyan;', packet);
        util.emitter.emit('broadcast', packet);
      };

      const send = (packet: unknown): void => {
        //console.log('%csend message', 'background: cyan;', packet);
        bc.postMessage(packet);
      };

      bc.addEventListener('message', onMessage);

      return {
        send,
      };
    })();

    const config = (function (): HeatsyncConfig {
      const prefix = PRODUCT + '_config_';
      const emitter = new Emitter() as unknown as HeatsyncConfig;

      const defaultConfig: Record<string, HeatsyncConfigValue> = {
        debug: false,

        'turbo.enabled': true,
        'turbo.red': 1,
        'turbo.blue': 1.7,
        'turbo.minDuration': 30,

        'turbo.ignoreTags': 'VOCALOID 音楽 作業用BGM 演奏してみた 歌ってみた',
      };

      const maxRateStorageKey = prefix + 'turbo.blue';
      const previousMaxRateStorageKey = prefix + 'turbo.dmc-blue';
      if (localStorage.getItem(maxRateStorageKey) === null) {
        const previousMaxRate = localStorage.getItem(previousMaxRateStorageKey);
        if (previousMaxRate !== null) localStorage.setItem(maxRateStorageKey, previousMaxRate);
      }

      const config: Record<string, HeatsyncConfigValue> = {};

      emitter.refresh = (emitChange = false) => {
        Object.keys(defaultConfig).forEach((key) => {
          const storageKey = prefix + key;
          if (localStorage.getItem(storageKey) !== null) {
            try {
              const lastValue = config[key];
              const newValue = JSON.parse(localStorage.getItem(storageKey) as string) as HeatsyncConfigValue;
              if (lastValue !== newValue) {
                config[key] = newValue;
                if (emitChange) {
                  emitter.emit('key', newValue);
                  emitter.emit('@update', { key, value: newValue });
                }
              }
            } catch (e) {
              window.console.error('config parse error key:"%s" value:"%s" ', key, localStorage.getItem(storageKey), e);
              config[key] = defaultConfig[key] as HeatsyncConfigValue;
            }
          } else {
            config[key] = defaultConfig[key] as HeatsyncConfigValue;
          }
        });
      };
      emitter.refresh();

      emitter.getValue = function (key: string, refresh?: boolean): HeatsyncConfigValue {
        if (refresh) {
          emitter.refreshValue(key);
        }
        return config[key] as HeatsyncConfigValue;
      };

      emitter.setValue = function (key: string, value?: HeatsyncConfigValue): void {
        if (config[key] !== value && arguments.length >= 2) {
          const storageKey = prefix + key;
          localStorage.setItem(storageKey, JSON.stringify(value));
          config[key] = value as HeatsyncConfigValue;
          emitter.emit(key, value);
          emitter.emit('@update', { key, value });
          broadcast.send('configUpdate');
          //console.log('%cconfig update "%s" = "%s"', 'background: cyan', key, value);
        }
      };

      emitter.clearConfig = function (): void {
        Object.keys(defaultConfig).forEach((key) => {
          if (
            (_ as unknown as { contains(list: Array<string>, value: string): boolean }).contains(
              ['message', 'debug'],
              key
            )
          ) {
            return;
          }
          const storageKey = prefix + key;
          try {
            if (Object.prototype.hasOwnProperty.call(localStorage, storageKey)) {
              localStorage.removeItem(storageKey);
            }
            config[key] = defaultConfig[key] as HeatsyncConfigValue;
          } catch {
            // ストレージ異常時は既定値を維持する
          }
        });
      };

      emitter.getKeys = function (): Array<string> {
        return Object.keys(defaultConfig);
      };

      emitter.namespace = function (name: string): HeatsyncConfigNamespace {
        return {
          getValue: (key: string): HeatsyncConfigValue => {
            return emitter.getValue(name + '.' + key);
          },
          setValue: (key: string, value?: HeatsyncConfigValue): void => {
            emitter.setValue(name + '.' + key, value);
          },
          refresh: (): void => {
            emitter.refresh();
          },
          on: (key: string, func: (update: { key: string; value: unknown }) => void): void => {
            if (key === '@update') {
              emitter.on('@update', ({ key, value }: { key: string; value: unknown }) => {
                const pre = name + '.';
                //console.log('@update', key, value, pre);
                if (key.startsWith(pre)) {
                  func({ key: key.replace(pre, ''), value });
                }
              });
            } else {
              emitter.on(name + '.' + key, func);
            }
          },
        };
      };

      util.emitter.on('broadcast', () => {
        //if (type !== 'configUpdate') { return; }
        emitter.refresh(false);
        emitter.emit('refresh');
      });

      return emitter;
    })();
    product.config = config;

    class Syncer extends Emitter {
      declare _timer: ReturnType<typeof setInterval> | null;
      declare _videoElement: HTMLVideoElement | null;
      declare _rate: number;
      declare _config: HeatsyncConfigNamespace;
      declare _enabled: boolean;
      declare _dialog: HeatsyncDialog;
      declare _tags: Array<string>;
      declare _map: Array<number>;
      declare _duration: number;
      declare _lastEnabled: HeatsyncConfigValue;
      constructor() {
        super();
        this._timer = null;
        this._videoElement = null;
        this._rate = 1.0;

        this._config = config.namespace('turbo');

        util.emitter.on('heatMapUpdate', this._onHeatMapUpdate.bind(this));
        util.emitter.on('futatsumeClose', this._onFutatsumeClose.bind(this));
        util.emitter.on('futatsumeOpen', this._onFutatsumeOpen.bind(this));
        util.emitter.on('broadcast', this._onBroadcast.bind(this));
        config.on('turbo.enabled', () => {
          if (!config.getValue('turbo.enabled')) this.disable();
          else if (this._map?.length) this._onHeatMapUpdate({ map: this._map, duration: this._duration });
        });
      }

      enable(): void {
        if (this._timer) {
          return;
        }
        console.info('start timer', this._timer, this._rate); //, this._map);
        this._enabled = true;
        this._timer = setInterval(this._onTimer.bind(this), 500);
      }

      disable(): void {
        clearInterval(this._timer as ReturnType<typeof setInterval>);
        const appliedRate = Math.floor(this._rate * 100) / 100;
        this._rate = config.getValue('turbo.red') as number;
        // Restore only a speed this controller applied. A user's manual slow
        // speed must survive disabling HeatSync and closing the player.
        if (this._enabled && this._videoElement && Math.abs(this._videoElement.playbackRate - appliedRate) < 0.011) {
          (window as unknown as { FutatsumeWatch: HeatsyncFutatsumeWatch }).FutatsumeWatch.config.setValue(
            'playbackRate',
            this._rate
          );
        }
        this._enabled = false;
        this._timer = null;
      }

      _onFutatsumeOpen(): void {
        if (
          this._dialog ||
          !(window as unknown as { FutatsumeWatch: HeatsyncFutatsumeWatch }).FutatsumeWatch.debug.dialog
        ) {
          return;
        }
        this._dialog = (window as unknown as { FutatsumeWatch: HeatsyncFutatsumeWatch }).FutatsumeWatch.debug.dialog;
        this._dialog.on('loadVideoInfo', this._onVideoInfoLoad.bind(this));
      }

      _onFutatsumeClose(): void {
        this.disable();
      }

      _onVideoInfoLoad(videoInfo: HeatsyncVideoInfo): void {
        const tags = (videoInfo.tagList || []).map((t) => {
          return t.name.toUpperCase();
        });
        this._tags = tags;
      }

      _onHeatMapUpdate({ map, duration }: { map: Array<number>; duration: number }): void {
        this._map = map;
        this._duration = duration;
        if (!config.getValue('turbo.enabled')) return this.disable();
        if (duration < (config.getValue('turbo.minDuration') as number)) {
          window.console.log('disable HeatSync by duration', duration);
          return this.disable();
        }
        //if (this._videoElement && this._videoElement.playbackRate < this._rate) {
        //  window.console.log('disable HeatSync by playbackRate',
        //    this._videoElement.playbackRate);
        //  return this.disable();
        //}
        const currentTags = this._tags || [];
        const ignoreTags = (config.getValue('turbo.ignoreTags') as string)
          .toUpperCase()
          .split(/[ \u3000]+/)
          .filter(Boolean);
        if (
          currentTags.some((t) => {
            return ignoreTags.includes(t.toUpperCase());
          })
        ) {
          window.console.log('disable HeatSync by tag'); //, currentTags, ignoreTags);
          return this.disable();
        }
        this._rate = config.getValue('turbo.red') as number;
        this.enable();
      }

      _onTimer(): void {
        //if (!this._videoElement) {
        this._videoElement = (
          window as unknown as { FutatsumeWatch: HeatsyncFutatsumeWatch }
        ).FutatsumeWatch.external.getVideoElement();
        if (!this._videoElement) {
          return;
        }
        //}
        const video = this._videoElement;
        // eslint-disable-next-line no-useless-escape -- 文字クラス内のエスケープは原文のまま温存する
        const isEconomy = /smile\?m=[\d\.]+low$/.test(video.src);
        this._lastEnabled = config.getValue('turbo.enabled');
        if (video.paused || !this._lastEnabled || isEconomy) {
          return;
        }
        const duration = video.duration;
        const current = video.currentTime;
        const per = current / duration;
        const perNear = Math.min(duration, current + 3) / duration;
        const map = this._map;
        const pos = Math.floor(map.length * per);
        const posNear = Math.floor(map.length * perNear);

        const blue = parseFloat(String(config.getValue('turbo.blue')));
        const red = parseFloat(String(config.getValue('turbo.red')));

        const pt = Math.max(map[pos]!, map[posNear]!);

        let ratePer = (256 - pt) / 256;
        if (ratePer > 0.95) {
          ratePer = 1;
        }
        if (ratePer < 0.4) {
          ratePer = 0;
        }
        let rate = red + (blue - red) * ratePer;

        rate = Math.round(rate * 100) / 100;
        //console.info('onTimer', pt, pt / 255, Math.round(ratePer * 100) / 100, rate);
        if (isNaN(rate)) {
          return;
        }
        if (Math.abs(rate - this._rate) < 0.05) {
          return;
        }
        // ユーザーが自分でスロー再生してるっぽい時は何もしない
        if (video.playbackRate < red) {
          return;
        }
        // スローは即時、加速はちょっと遅く反映
        this._rate = rate > this._rate ? (rate * 2 + this._rate) / 3 : rate;
        (window as unknown as { FutatsumeWatch: HeatsyncFutatsumeWatch }).FutatsumeWatch.config.setValue(
          'playbackRate',
          Math.floor(this._rate * 100) / 100
        );
      }

      _onBroadcast(): void {
        const lastEnabled = this._lastEnabled;
        window.setTimeout(() => {
          const currentEnabled = config.getValue('turbo.enabled');
          if (lastEnabled && !currentEnabled) {
            this.disable();
          }
        }, 1000);
      }
    }

    class BaseViewComponent extends Emitter {
      declare _params: BaseViewParams;
      declare _bound: HeatsyncBoundHandlers;
      declare _state: Record<string, unknown>;
      declare _props: Record<string, unknown>;
      declare _elm: HeatsyncConfigElements;
      declare _view: Element;
      declare _shadow: Element;
      declare _shadowRoot: ShadowRoot | Element;
      declare _isDummyShadow: boolean;
      declare _parentNode: Element | null;
      constructor({ parentNode = null, name = '', template = '', shadow = '', css = '' }: BaseViewParams) {
        super();

        this._params = { parentNode, name, template, shadow, css };
        this._bound = {} as HeatsyncBoundHandlers;
        this._state = {};
        this._props = {};
        this._elm = {} as HeatsyncConfigElements;

        this._initDom({
          parentNode,
          name,
          template,
          shadow,
          css,
        });
      }

      _initDom({ parentNode, name, template, css = '', shadow = '' }: BaseViewParams) {
        const tplId = `${PRODUCT}${name}Template`;
        let tpl = document.getElementById(tplId) as HTMLTemplateElement | null;
        if (!tpl) {
          if (css) {
            util.addStyle(css, `${name}Style`);
          }
          tpl = document.createElement('template');
          tpl.innerHTML = template as string;
          tpl.id = tplId;
          document.body.appendChild(tpl);
        }
        const onClick = (this._bound.onClick = this._onClick.bind(this));

        const view = document.importNode(tpl.content, true);
        this._view = (view.querySelector('*') || document.createDocumentFragment()) as Element;
        if (this._view) {
          this._view.addEventListener('click', onClick);
        }
        this.appendTo(parentNode);

        if (shadow) {
          this._attachShadow({ host: this._view as HeatsyncShadowHost, name, shadow });
          if (!this._isDummyShadow) {
            this._shadow.addEventListener('click', onClick);
          }
        }
      }

      _attachShadow({ host, shadow, name, mode = 'open' }: { host: HeatsyncShadowHost } & BaseViewParams) {
        const tplId = `${PRODUCT}${name}Shadow`;
        let tpl = document.getElementById(tplId) as HTMLTemplateElement | null;
        if (!tpl) {
          tpl = document.createElement('template');
          tpl.innerHTML = shadow as string;
          tpl.id = tplId;
          document.body.appendChild(tpl);
        }

        if (!host.attachShadow && !host.createShadowRoot) {
          return this._fallbackNoneShadowDom({ host, tpl, name });
        }

        const root = host.attachShadow ? host.attachShadow({ mode: mode as ShadowRootMode }) : host.createShadowRoot();
        const node = document.importNode(tpl.content, true);
        root.appendChild(node);
        this._shadowRoot = root;
        this._shadow = root.querySelector('.root') as Element;
        this._isDummyShadow = false;
      }

      _fallbackNoneShadowDom({
        host,
        tpl,
        name,
      }: {
        host: HeatsyncShadowHost;
        tpl: HTMLTemplateElement;
        name?: string;
      }) {
        const node = document.importNode(tpl.content, true);
        const style = node.querySelector('style') as HTMLStyleElement;
        style.remove();
        util.addStyle(style.innerHTML, `${name}Shadow`);
        host.appendChild(node);
        this._shadow = this._shadowRoot = host.querySelector('.root') as Element;
        this._isDummyShadow = true;
      }

      setState(key: string | Record<string, unknown>, val?: unknown) {
        if (typeof key === 'string') {
          this._setState(key, val);
        }
        Object.keys(key as Record<string, unknown>).forEach((k: string) => {
          this._setState(k, (key as Record<string, unknown>)[k]);
        });
      }

      _setState(key: string, val?: unknown) {
        if (this._state[key] !== val) {
          this._state[key] = val;
          if (/^is(.*)$/.test(key)) {
            this.toggleClass(`is-${RegExp.$1}`, !!val);
          }
          this.emit('update', { key, val });
        }
      }

      _onClick(e: Event) {
        const target = (e.target as Element).classList.contains('command')
          ? (e.target as Element)
          : (e.target as Element).closest('.command');

        if (!target) {
          return;
        }

        const command = target.getAttribute('data-command');
        if (!command) {
          return;
        }
        const type = target.getAttribute('data-type') || 'string';
        let param: string | HeatsyncConfigValue | null = target.getAttribute('data-param');
        e.stopPropagation();
        e.preventDefault();
        param = this._parseParam(param, type);
        this._onCommand(command, param);
      }

      _parseParam(param: string | HeatsyncConfigValue | null, type: string | null): string | HeatsyncConfigValue {
        switch (type) {
          case 'json':
          case 'bool':
          case 'number':
            param = JSON.parse(param as string) as HeatsyncConfigValue;
            break;
        }
        return param as string | HeatsyncConfigValue;
      }

      appendTo(parentNode?: Element | null) {
        if (!parentNode) {
          return;
        }
        this._parentNode = parentNode;
        parentNode.append(this._view);
      }

      _onCommand(command: string, param?: unknown) {
        this.emit('command', command, param);
      }

      toggleClass(className: string, v?: boolean) {
        (className || '').split(/ +/).forEach((c: string) => {
          if (this._view && this._view.classList) {
            this._view.classList.toggle(c, v);
          }
          if (this._shadow && this._shadow.classList) {
            this._shadow.classList.toggle(c, this._view.classList.contains(c));
          }
        });
      }

      addClass(name: string) {
        this.toggleClass(name, true);
      }
      removeClass(name: string) {
        this.toggleClass(name, false);
      }
    }

    class ConfigPanel extends BaseViewComponent {
      declare private modal: SettingsDialog;
      declare static __shadow__: string;
      constructor({ parentNode }: BaseViewParams) {
        super({
          parentNode,
          name: 'HeatSyncConfigPanel',
          shadow: ConfigPanel.__shadow__,
          template: '<div class="HeatSyncConfigPanelContainer"></div>',
          css: '',
        });
        this._state = {
          isOpen: false,
          isVisible: false,
        };
        config.on('refresh', this._onBeforeShow.bind(this));
      }

      get view(): Element {
        return this._view;
      }

      _initDom(...args: [BaseViewParams]) {
        super._initDom(...args);
        const v = this._shadow;
        this.modal = new SettingsDialog(v as HTMLDialogElement, 'heatsync', () =>
          this.setState({ isOpen: false, isVisible: false })
        );

        this._elm.red = v.querySelector('*[data-config-name="turbo.red"]') as HTMLInputElement;
        this._elm.max = v.querySelector('*[data-config-name="turbo.blue"]') as HTMLInputElement;
        this._elm.minDur = v.querySelector('*[data-config-name="turbo.minDuration"]') as HTMLInputElement;
        this._elm.enabled = v.querySelector('*[data-config-name="turbo.enabled"]') as HTMLInputElement;
        this._elm.ignores = v.querySelector('*[data-config-name="turbo.ignoreTags"]') as HTMLInputElement;

        const onChange = (e: Event) => {
          const target = e.target as HTMLInputElement,
            name = target.getAttribute('data-config-name');
          switch (target.tagName) {
            case 'INPUT':
            case 'SELECT':
              if (target.type === 'checkbox') {
                config.setValue(name as string, target.checked);
              } else {
                const type = target.getAttribute('data-type');
                const value = this._parseParam(target.value, type);
                config.setValue(name as string, value);
              }
              break;
            default:
              //console.info('target', e, target, name, target.checked);
              config.setValue(name as string, !!target.checked);
              break;
          }
        };
        this._elm.red.addEventListener('change', onChange);
        this._elm.max.addEventListener('change', onChange);
        this._elm.minDur.addEventListener('change', onChange);
        this._elm.enabled.addEventListener('change', onChange);
        this._elm.ignores.addEventListener('change', onChange);

        (v.querySelector('.closeButton') as Element).addEventListener('click', this.hide.bind(this));
      }

      _onClick(e: Event) {
        super._onClick(e);
        e.stopPropagation();
      }

      _onMouseDown(e: Event) {
        this.hide();
        this._onClick(e);
      }

      show(): void {
        this._onBeforeShow();
        this.setState({ isOpen: true, isVisible: true });
        this.modal.open();
      }

      hide(): void {
        this.modal.close();
      }

      toggle(): void {
        if (this._state.isOpen) {
          this.hide();
        } else {
          this.show();
        }
      }

      _onBeforeShow(): void {
        this._elm.red.value = '' + config.getValue('turbo.red');
        this._elm.max.value = '' + config.getValue('turbo.blue');
        this._elm.minDur.value = '' + config.getValue('turbo.minDuration');
        this._elm.ignores.value = '' + config.getValue('turbo.ignoreTags');

        this._elm.enabled.checked = !!config.getValue('turbo.enabled');
      }
    }

    ConfigPanel.__shadow__ = `
      <style>
        .HeatSyncConfigPanel {
          display: none;
          position: fixed;
          z-index: ${CONSTANT.BASE_Z_INDEX};
          top: 50vh;
          left: 50vw;
          padding: 8px;
          border: 2px outset;
          box-shadow: 0 0 8px #000;
          background: #ccc;
          transform: translate(-50%, -50%);
          /*transform: translate(-50%, -50%) perspective(200px) rotateX(90deg);*/
          transition: opacity 0.5s;
          transform-origin: center bottom;
          animation-timing-function: steps(10);
          perspective-origin: center bottom;
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          pointer-events: auto !important;
        }

        .HeatSyncConfigPanel.is-Open {
          display: block;
          opacity: 0;
          /*animation-name: dokahide;*/
        }

        .HeatSyncConfigPanel.is-Open.is-Visible {
          opacity: 1;
          /*animation-name: dokashow;*/
          /*transform: translate(-50%, -50%) perspective(200px) rotateX(0deg);*/
        }

        @keyframes dokashow {
           0% {
            opacity: 1;
            transform: translate(-50%, -50%) perspective(200px) rotateX(90deg);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) perspective(200px) rotateX(0deg);
          }
        }

        @keyframes dokahide {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) perspective(200px) rotateX(0deg);
          }
          99% {
            opacity: 1;
            transform: translate(-50%, -50%) perspective(200px) rotateX(90deg);
          }
          100% {
            opacity: 0;
          }
        }

        .title {
          margin: 0;
          font-weight: bolder;
          font-size: 120%;
        }

        .speedSelect {
          margin: 8px;
        }

        .minDuration {
          margin: 8px;
        }

        .ignoreTags {
          margin: 8px;
        }
          .ignoreTags input {
            margin: auto;
            width: 100%;
            font-size: 110%;
          }


        .enableSelect {
          margin: 8px;
        }

        .closeButton {
          display: block;
          text-align: center;
        }

        .closeButton {
          display: block;
          pading: 8px;
          cursor: pointer;
          margin: auto;
        }

        label {
          cursor: pointer;
        }

        input[type="number"] {
          width: 50px;
        }
      </style>
      <dialog class="root HeatSyncConfigPanel">
        <p class="title">†HeatSync†</p>

        <div class="speedSelect maximum">
          <span>最高倍率</span>
          <select data-config-name="turbo.blue" data-type="number">
            <option value="3">3.0</option>
            <option>2.9</option>
            <option>2.8</option>
            <option>2.7</option>
            <option>2.6</option>
            <option>2.5</option>
            <option>2.4</option>
            <option>2.3</option>
            <option>2.2</option>
            <option>2.1</option>
            <option value="2">2.0</option>
            <option>1.9</option>
            <option>1.8</option>
            <option>1.7</option>
            <option>1.6</option>
            <option>1.5</option>
            <option>1.4</option>
            <option>1.3</option>
            <option>1.2</option>
            <option>1.1</option>
            <option value="1">1</option>
          </select>
        </div>

        <div class="speedSelect minimum">
          <span>最低倍率</span>
          <select data-config-name="turbo.red" data-type="number">
            <option value="3">3.0</option>
            <option>2.9</option>
            <option>2.8</option>
            <option>2.7</option>
            <option>2.6</option>
            <option>2.5</option>
            <option>2.4</option>
            <option>2.3</option>
            <option>2.2</option>
            <option>2.1</option>
            <option value="2">2.0</option>
            <option>1.9</option>
            <option>1.8</option>
            <option>1.7</option>
            <option>1.6</option>
            <option>1.5</option>
            <option>1.4</option>
            <option>1.3</option>
            <option>1.2</option>
            <option>1.1</option>
            <option value="1">1.0</option>
          </select>
        </div>

        <div class="minDuration">
          <label>
            <input type="number" data-config-name="turbo.minDuration" data-type="number">
            秒未満の動画には適用しない
          </label>
        </div>

        <div class="ignoreTags">
          <label>
            このタグが含まれる動画では無効(スペース区切)
            <input type="text" data-config-name="turbo.ignoreTags">
          </label>
        </div>

        <div class="enableSelect">
          <label>
            <input type="checkbox" data-config-name="turbo.enabled" data-type="bool">
            HeatSyncを有効にする
          </label>
        </div>

        <div class="closeButtonContainer">
          <button class="closeButton" type="button">
           閉じる
          </button>
        </div>

      </dialog>
    `.trim();

    class ToggleButton extends BaseViewComponent {
      declare static __shadow__: string;
      constructor({ parentNode }: BaseViewParams) {
        super({
          parentNode,
          name: 'HeatSyncToggleButton',
          shadow: ToggleButton.__shadow__,
          template: '<div class="HeatSyncToggleButtonContainer"></div>',
          css: '',
        });

        this._state = {
          isEnabled: undefined,
        };

        config.on('turbo.enabled', () => {
          this.refresh();
        });
      }

      refresh(): void {
        this.setState({ isEnabled: config.getValue('turbo.enabled') });
      }
    }

    ToggleButton.__shadow__ = `
      <style>
        .controlButton {
          position: relative;
          display: inline-block;
          transition: opacity 0.4s ease, margin-left 0.2s ease, margin-top 0.2s ease;
          box-sizing: border-box;
          text-align: center;
          cursor: pointer;
          color: #fff;
          opacity: 0.8;
          vertical-align: middle;
        }
        .controlButton:hover {
          text-shadow: 0 0 8px #ff9;
          cursor: pointer;
          opacity: 1;
        }
        .heatSyncSwitch {
          font-size: 16px;
          width: 32px;
          height: 32px;
          line-height: 30px;
          cursor: pointer;
        }
        .is-Enabled .controlButtonInner {
          color: #aef;
          text-shadow: 0 0 4px #fea, 0 0 8px orange;
        }

        .controlButton .tooltip {
          display: none;
          pointer-events: none;
          position: absolute;
          left: 16px;
          top: -30px;
          transform:  translate(-50%, 0);
          font-size: 12px;
          line-height: 16px;
          padding: 2px 4px;
          border: 1px solid #000;
          background: #ffc;
          color: #000;
          text-shadow: none;
          white-space: nowrap;
          z-index: 100;
          opacity: 0.8;
        }

        .controlButton:hover {
          background: #222;
        }

        .controlButton:hover .tooltip {
          display: block;
          opacity: 1;
        }

      </style>
      <div class="heatSyncSwitch controlButton root command" data-command="toggleHeatSyncDialog">
        <div class="controlButtonInner" title="HeatSync">HS</div>
        <div class="tooltip">HeatSync</div>
      </div>
    `.trim();

    const initExternal = (syncer: Syncer): void => {
      product.external = {
        syncer,
      };

      product.isReady = true;
      const ev = new CustomEvent(`${PRODUCT}Initialized`, { detail: { product } });
      document.body.dispatchEvent(ev);
    };

    let configPanel: ConfigPanel | undefined;
    const initDom = async (FutatsumeWatch: HeatsyncFutatsumeWatch): Promise<void> => {
      const li = document.createElement('li');
      li.innerHTML = '<a href="javascript:;">†HeatSync†設定</a>';
      li.addEventListener('click', () => {
        if (!configPanel) {
          configPanel = new ConfigPanel({ parentNode: document.body });
        }
        configPanel.toggle();
      });
      const header = document.querySelector('#siteHeaderRightMenuContainer');
      if (header) {
        header.appendChild(li);
      }

      const initButton = (container: Element | null, handler: EmitterCallback): void => {
        const toggleButton = new ToggleButton({ parentNode: container });
        product.toggleButton = toggleButton;
        toggleButton.on('command', handler);
        if (!configPanel) {
          configPanel = new ConfigPanel({ parentNode: document.querySelector('.futatsumePlayerContainer') });
        }
        toggleButton.refresh();
      };
      if (FutatsumeWatch.emitter.promise) {
        const { container, handler } = (await FutatsumeWatch.emitter.promise('videoControBar.addonMenuReady')) as {
          container: Element | null;
          handler: EmitterCallback;
        };
        initButton(container, handler);
      } else {
        FutatsumeWatch.emitter.on('videoControBar.addonMenuReady', initButton);
      }
    };

    const init = (): void => {
      let syncer: Syncer;
      console.log('init HeatSync...');
      void FutatsumeDetector.detect().then(() => {
        const FutatsumeWatch = (window as unknown as { FutatsumeWatch: HeatsyncFutatsumeWatch }).FutatsumeWatch;
        FutatsumeWatch.emitter.on('DialogPlayerOpen', () => {
          util.emitter.emit('futatsumeOpen');
          if (configPanel) {
            (document.querySelector('.futatsumePlayerContainer') as Element).append(configPanel.view);
          }
        });

        FutatsumeWatch.emitter.on('DialogPlayerClose', () => {
          util.emitter.emit('futatsumeClose');
          if (configPanel) {
            document.body.append(configPanel.view);
          }
        });

        FutatsumeWatch.emitter.on('heatMapUpdate', (p: unknown) => {
          util.emitter.emit('heatMapUpdate', p);
        });

        FutatsumeWatch.emitter.on('command-toggleHeatSyncDialog', () => {
          if (!configPanel) {
            configPanel = new ConfigPanel({ parentNode: document.querySelector('.futatsumePlayerContainer') });
          }
          configPanel.toggle();
        });

        void initDom(FutatsumeWatch);

        //console.info('detect futatsumewatch...');

        syncer = new Syncer();

        initExternal(syncer);
      });
    };

    init();
  };

  monkey(PRODUCT);
})();
