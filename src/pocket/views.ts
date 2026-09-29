import { Emitter } from '../../packages/lib/src/emitter';
import { getNicodicArticleExists } from '../shared/external-api';
import { createDicIconHtml } from '../../packages/lib/src/nico/nico-dic-icon';
import { bounce } from '../../packages/lib/src/infra/bounce';
import type { BounceCallback } from '../../packages/lib/src/infra/bounce';
import type {
  FutatsumeLike,
  NgObserveParams,
  PocketConfigNamespace,
  PocketDataStorage,
  PocketUtil,
  PocketVideoInfo,
  PocketVideoTag,
  PocketWindow,
  PocketMatchChecker,
  PocketNgChecker,
  PocketCommandResult,
} from './types';

interface PocketViewDependencies {
  util: PocketUtil;
  config: PocketDataStorage;
  pocket: { debug: Record<string, unknown>; external: { observe(params: NgObserveParams): unknown } };
  futatsumeDetector: { detect(): Promise<unknown> };
  initNgChecker(
    this: void,
    params: { ngConfig: PocketConfigNamespace; favConfig: PocketConfigNamespace }
  ): {
    ngChecker: PocketNgChecker;
    favChecker: PocketMatchChecker;
  };
}

export function createPocketViews({
  util,
  config,
  pocket: MylistPocket,
  futatsumeDetector: FutatsumeDetector,
  initNgChecker,
}: PocketViewDependencies) {
  class HoverMenu extends Emitter {
    _view!: HTMLElement;
    _x!: number;
    _y!: number;
    _watchId!: string;
    _hoverElement!: Element | null;
    _isFutatsumeReady?: boolean;
    _deflistButton!: HTMLElement;
    _isBusy?: boolean;
    constructor() {
      super();
      this._init();
    }

    _init(): void {
      this._view = document.querySelector('.mylistPocketHoverMenu') as unknown as HTMLElement;

      this._view.addEventListener(location.host.includes('google') ? 'mouseup' : 'click', this._onClick.bind(this));
      this._view.addEventListener('mousedown', (e) => this._onMousedown(e));
      this._view.addEventListener('contextmenu', this._onContextMenu.bind(this));

      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- debounce化関数の戻り値は呼び元が無視するため許容する
      this._onHoverEnd = bounce.time(this._onHoverEnd.bind(this) as unknown as BounceCallback, 500);
      document.body.addEventListener('mouseover', this._onHover.bind(this), { passive: true });
      document.body.addEventListener('mouseout', this._onMouseout.bind(this), { passive: true });
      document.body.addEventListener('mouseover', (e) => this._onHoverEnd(e), { passive: true });
      document.body.addEventListener(
        'click',
        () => {
          this.hide();
        },
        { passive: true }
      );

      util.emitter.on('hideHover', () => this.hide());

      this._x = this._y = 0;

      void FutatsumeDetector.detect().then((FutatsumeWatch: unknown) => {
        this._isFutatsumeReady = true;
        this.addClass('is-futatsumeReady');
        (FutatsumeWatch as FutatsumeLike).emitter.on(
          'DialogPlayerOpen',
          bounce.time(() => {
            this.hide();
          }, 1000)
        );
      });

      this.toggleClass('is-otherDomain', location.host !== 'www.nicovideo.jp');
      this.toggleClass('is-guest', !util.isLogin());
      this._deflistButton = this._view.querySelector('.mylistPocketButton.deflist-add') as unknown as HTMLElement;
      MylistPocket.debug.hoverMenu = this._view;
    }

    toggleClass(className: string, v?: boolean): void {
      className.split(/ +/).forEach((c) => {
        this._view.classList.toggle(c, v);
      });
    }

    addClass(className: string): void {
      this.toggleClass(className, true);
    }
    removeClass(className: string): void {
      this.toggleClass(className, false);
    }

    hide(): void {
      this.removeClass('is-show');
    }

    show(): void {
      this.addClass('is-show');
    }

    moveTo(x: number, y: number): void {
      this._x = x;
      this._y = y;
      this._view.style.left = x + 'px';
      this._view.style.top = y + 'px';
    }

    _onClick(e: Event): void {
      e.preventDefault();
      e.stopPropagation();
    }

    _onContextMenu(e: Event): void {
      e.preventDefault();
      e.stopPropagation();
    }

    _onMousedown(e: MouseEvent): void {
      const watchId = this._watchId;
      const target = (e.target instanceof Element && e.target.classList.contains('command')
        ? e.target
        : e.target instanceof Element
          ? e.target.closest('.command')
          : null) as unknown as HTMLElement;
      const command = target.getAttribute('data-command');
      e.preventDefault();
      e.stopPropagation();

      if (command === 'info') {
        this._videoInfo(watchId);
        this.hide();
      } else if (command === 'playlist-queue') {
        this.emit('playlist-queue', watchId, this);
      } else {
        if (e.button !== 0 || e.shiftKey) {
          this._deflistRemove(watchId);
        } else {
          this._deflist(watchId);
        }
      }
    }

    _videoInfo(watchId: string): void {
      this.emit('info', watchId || this._watchId, this);
    }

    _deflist(watchId: string): void {
      this.emit('deflist-add', watchId || this._watchId, this);
    }

    _deflistRemove(watchId: string): void {
      this.emit('deflist-remove', watchId || this._watchId, this);
    }

    _onHover(e: Event): void {
      const target = this._isTargetElement(e);
      if (!target) {
        return;
      }

      this._hoverElement = target;
    }

    _onHoverEnd(e: Event): void {
      const target = (e.target instanceof Element && e.target.tagName === 'A'
        ? e.target
        : e.target instanceof Element
          ? e.target.closest('a')
          : null) as unknown as HTMLElement | null;
      if (!target || this._hoverElement !== target) {
        return;
      }
      const href = target.getAttribute('data-href') || target.getAttribute('href');
      const watchId = target.dataset.nicoVideoId || util.getWatchId(href as string);
      const offset = target.getBoundingClientRect();
      //const bodyOffset = document.body.getBoundingClientRect();
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop || 0;
      const scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft || 0;
      const left = offset.left + scrollLeft;
      const top = offset.top + scrollTop;
      const host = (target as unknown as HTMLAnchorElement).hostname;
      if (host !== 'www.nicovideo.jp' && host !== 'nico.ms' && host !== 'sp.nicovideo.jp') {
        return;
      }

      if (target.classList.contains('noHoverMenu')) {
        return;
      }
      if (!watchId || !watchId.match(/^[a-z0-9]+$/)) {
        return;
      }
      if (watchId.indexOf('lv') === 0) {
        return;
      }

      this._watchId = watchId;
      this.show();
      this.moveTo(
        left + target.offsetWidth - this._view.offsetWidth / 2,
        top + target.offsetHeight / 2 - this._view.offsetHeight / 2
      );
    }

    _onMouseout(e: Event): void {
      const target = this._isTargetElement(e);
      if (!target) {
        return;
      }

      if (this._hoverElement === e.target) {
        this._hoverElement = null;
      }
    }

    _isTargetElement(e: Event): Element | false {
      const target = (e.target instanceof Element && e.target.tagName === 'A'
        ? e.target
        : e.target instanceof Element
          ? e.target.closest('a')
          : null) as unknown as HTMLElement | null;
      if (!target) {
        return false;
      }
      const href = (target as unknown as HTMLAnchorElement).href || '';
      if (!/((watch|shorts)\/[a-z0-9]+|nico\.ms\/[a-z0-9]+)/.test(href)) {
        return false;
      }
      return target;
    }

    set isBusy(v: boolean) {
      this._isBusy = v;
      this.toggleClass('is-busy', v);
    }

    get isBusy(): boolean {
      return !!this._isBusy;
    }

    notifyBeginDeflistUpdate(): void {
      this.addClass('is-deflistUpdating');
    }

    notifyEndDeflistUpdate(result: PocketCommandResult): void {
      this.addClass('is-deflistSuccess');
      window.setTimeout(() => {
        this.removeClass('is-deflistSuccess');
      }, 3000);

      this._deflistButton.setAttribute('data-result', result.message || '登録しました');
      this.removeClass('is-deflistUpdating');
    }

    notifyFailDeflistUpdate(result: PocketCommandResult): void {
      this.addClass('is-deflistFail');
      window.setTimeout(() => {
        this.removeClass('is-deflistFail');
      }, 3000);

      this._deflistButton.setAttribute('data-result', result.message || '登録失敗');
      this.removeClass('is-deflistUpdating');
    }
  }

  class VideoInfoView extends Emitter {
    _host!: Element;
    _tpl!: HTMLTemplateElement;
    _slot!: Record<string, Element>;
    _baseConfig!: PocketDataStorage;
    _config!: PocketConfigNamespace;
    _mylistConfig!: PocketConfigNamespace;
    _ngConfig!: PocketConfigNamespace;
    _favConfig!: PocketConfigNamespace;
    _nicoadConfig!: PocketConfigNamespace;
    _ngChecker!: PocketNgChecker;
    _favChecker!: PocketMatchChecker;
    _shadowRoot!: ShadowRoot;
    _rootDom!: Element;
    _hostDom!: Element;
    _videoInfoArea!: HTMLElement;
    _deflistButton!: HTMLElement;
    _videoInfo!: PocketVideoInfo;
    _isInitialized?: boolean;
    _isFutatsumeReady?: boolean;
    _boundOnBodyMouseDown!: (e: Event) => void;
    constructor({ host, tpl }: { host: Element; tpl: HTMLTemplateElement }) {
      super();
      this._host = host;
      this._tpl = tpl;
      this._slot = {};

      this._baseConfig = config;
      this._config = config.namespace('videoInfo');
      this._mylistConfig = config.namespace('mylist');
      const ngConfig = (this._ngConfig = config.namespace('ng'));
      const favConfig = (this._favConfig = config.namespace('fav'));
      this._nicoadConfig = config.namespace('nicoad');

      const { ngChecker, favChecker } = initNgChecker({ ngConfig, favConfig });
      this._ngChecker = ngChecker;
      this._favChecker = favChecker;
    }

    _initialize(): void {
      if (this._isInitialized) {
        return;
      }
      const host = this._host;
      const tpl = this._tpl;

      this._shadowRoot = util.attachShadowDom({ host, tpl });
      Array.prototype.forEach.call(this._host.querySelectorAll('*'), (elm: Element) => {
        //this._host.querySelectorAll('*').forEach((elm) => {
        const slot = elm.getAttribute('slot');
        if (!slot) {
          return;
        }
        //const type = elm.getAttribute('data-type') || 'string';
        this._slot[slot] = elm;
      });

      this._rootDom = this._shadowRoot.querySelector('.root')!;
      this._hostDom = this._host;

      this._rootDom.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      this._shadowRoot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      this._initSettingPanel();
      const updateNgEnable = (v: unknown): void => {
        this.toggleClass('is-ng-enable', v as boolean);
      };
      updateNgEnable(this._ngConfig.props.enable);
      this._ngConfig.onkey('enable', updateNgEnable);

      this._rootDom.addEventListener('click', this._onClick.bind(this));

      this._boundOnBodyMouseDown = this._onBodyMouseDown.bind(this);

      MylistPocket.debug.view = this;

      util.emitter.on('hideHover', () => {
        this.hide();
      });

      const debUpdateFavNg = bounce.time(this._updateFavNg.bind(this), 100) as unknown as (...args: never[]) => void;
      this._ngConfig.on('update', debUpdateFavNg);
      this._favConfig.on('update', debUpdateFavNg);
      //this._mylistConfig.on('update', debUpdateFavNg);

      void FutatsumeDetector.detect().then(() => {
        this._isFutatsumeReady = true;
        this.addClass('is-futatsumeReady');
        (window as unknown as PocketWindow).FutatsumeWatch!.emitter.on(
          'DialogPlayerOpen',
          bounce.time(() => {
            this.hide();
          }, 1000)
        );
      });

      this._videoInfoArea = this._rootDom.querySelector('.video-info') as unknown as HTMLElement;
      this._deflistButton = this._rootDom.querySelector('.mylistPocketButton.deflist-add') as unknown as HTMLElement;

      this.toggleClass('is-otherDomain', location.host !== 'www.nicovideo.jp');
      this.toggleClass('is-firefox', util.isFirefox());

      MylistPocket.external.observe({
        query: 'a.videoLink',
        container: this._hostDom.querySelector('.description'),
      });

      this._isInitialized = true;
    }

    _initSettingPanel(): void {
      const onSettingFormChange = this._onSettingFormChange.bind(this);

      const refresh = (): void => {
        Array.from(this._rootDom.querySelectorAll('.setting-form')).forEach((elm) => {
          const name = elm.getAttribute('data-config-name');
          if (!name) {
            return;
          }
          const namespace = elm.getAttribute('data-config-namespace') || '';
          let config: { props: Record<string, unknown> };
          switch (namespace) {
            case 'ng':
              config = this._ngConfig;
              break;
            case 'fav':
              config = this._favConfig;
              break;
            case 'mylist':
              config = this._mylistConfig;
              break;
            case 'nicoad':
              config = this._nicoadConfig;
              break;
            default:
              config = this._baseConfig;
          }
          const tagName = elm.tagName.toLowerCase().toLowerCase();
          if (tagName === 'input') {
            const type = ((elm as unknown as HTMLInputElement).type || '').toLowerCase();
            switch (type) {
              case 'checkbox':
                (elm as unknown as HTMLInputElement).checked = !!config.props[name];
                break;
              default:
                (elm as unknown as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = config.props[
                  name
                ] as string;
                break;
            }
          } else if (tagName === 'select' || tagName === 'textarea') {
            (elm as unknown as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = config.props[
              name
            ] as string;
          }

          elm.removeEventListener('change', onSettingFormChange);
          elm.addEventListener('change', onSettingFormChange);
        });
      };

      const onUpdate = bounce.time(refresh, 100) as unknown as (...args: never[]) => void;

      refresh();

      this._config.on('update', onUpdate);
      this._favConfig.on('update', onUpdate);
      this._ngConfig.on('update', onUpdate);
    }

    _onSettingFormChange(e: Event): void {
      const elm = e.target as unknown as HTMLElement;
      const name = elm.getAttribute('data-config-name');
      if (!name) {
        return;
      }
      const namespace = elm.getAttribute('data-config-namespace') || '';
      let config: { props: Record<string, unknown> };
      switch (namespace) {
        case 'ng':
          config = this._ngConfig;
          break;
        case 'fav':
          config = this._favConfig;
          break;
        case 'mylist':
          config = this._mylistConfig;
          break;
        case 'nicoad':
          config = this._nicoadConfig;
          break;
        default:
          config = this._baseConfig;
      }
      const tagName = elm.tagName.toLowerCase().toLowerCase();
      if (tagName === 'input') {
        const type = ((elm as unknown as HTMLInputElement).type || '').toLowerCase();
        switch (type) {
          case 'checkbox':
            config.props[name] = (elm as unknown as HTMLInputElement).checked;
            break;
          default:
            config.props[name] = (elm as unknown as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
            break;
        }
      } else if (tagName === 'select' || tagName === 'textarea') {
        config.props[name] = (elm as unknown as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
      }
    }

    toggleClass(className: string, v?: boolean): void {
      className.split(/ +/).forEach((c) => {
        this._rootDom.classList.toggle(c, v);
        this._hostDom.classList.toggle(c, v);
      });
    }

    addClass(className: string): void {
      this.toggleClass(className, true);
    }
    removeClass(className: string): void {
      this.toggleClass(className, false);
    }

    bind(videoInfo: PocketVideoInfo): void {
      this._videoInfo = videoInfo;
      if (videoInfo.status === 'ok') {
        this._bindSuccess(videoInfo);
      } else {
        this._bindFail(videoInfo);
      }
      window.setTimeout(() => {
        this.removeClass('is-loading');
      }, 0);
    }

    _onClick(e: Event): void {
      const t = e.target as unknown as Element;
      const elm = t.classList.contains('command') ? t : (e.target as unknown as Element).closest('.command');
      if (!elm) {
        return;
      }

      // 簡易 throttle
      if (elm.classList.contains('is-active')) {
        return;
      }
      elm.classList.add('is-active');
      window.setTimeout(() => {
        elm.classList.remove('is-active');
      }, 500);

      e.preventDefault();
      e.stopPropagation();
      const command = elm.getAttribute('data-command');
      const param = elm.getAttribute('data-param');
      switch (command) {
        case 'add-ng-tag':
        case 'add-fav-tag':
        case 'toggle-ng-tag':
        case 'toggle-fav-tag':
          {
            const tag = elm.getAttribute('data-tag') || '';
            if (!tag) {
              break;
            }
            this.emit(
              'command',
              command,
              {
                watchId: this._videoInfo.watchId,
                value: tag,
              },
              this
            );
          }
          break;
        case 'add-ng-owner':
        case 'add-fav-owner':
        case 'toggle-ng-owner':
        case 'toggle-fav-owner':
          {
            const owner =
              (this._videoInfo.isChannel ? 'ch' : '') + this._videoInfo.ownerId + '#' + this._videoInfo.ownerName;
            this.emit(
              'command',
              command,
              {
                watchId: this._videoInfo.watchId,
                value: owner,
              },
              this
            );
          }
          break;
        case 'mylist-comment-open':
          this.emit('command', command, this._videoInfo.watchId);
          break;
        case 'close':
          this.hide();
          break;
        default:
          this.emit('command', command, param, this);
      }
    }

    _updateFavNg(): void {
      if (!this._isInitialized) {
        return;
      }
      if (!this._videoInfo || this._videoInfo.status !== 'ok') {
        return;
      }

      const videoInfo = this._videoInfo;
      const ownerInfo = this._rootDom.querySelector('.owner-info')!;
      ownerInfo.classList.toggle(
        'is-favorited',
        this._favChecker.isMatchOwner(videoInfo.owner as { type: string; id: string })
      );
      ownerInfo.classList.toggle(
        'is-ng',
        this._ngChecker.isMatchOwner(videoInfo.owner as { type: string; id: string })
      );

      Array.prototype.forEach.call(this._rootDom.querySelectorAll('.tag-container'), (elm: Element) => {
        const tag = elm.getAttribute('data-tag');
        elm.classList.toggle('is-favorited', this._favChecker.isMatchTag(tag as string));
        elm.classList.toggle('is-ng', this._ngChecker.isMatchTag(tag as string));
      });
    }

    toggleSettingPanel(): void {
      this.toggleClass('is-setting');
    }

    _onBodyMouseDown(): void {
      document.body.removeEventListener('mousedown', this._boundOnBodyMouseDown);
      this.hide();
    }

    reset(): void {
      this._initialize();
      window.setTimeout(() => {
        this._videoInfoArea.scrollTop = 0;
      }, 0);
      this.removeClass('noclip');
      this.addClass('is-loading');
    }

    show(): void {
      this.addClass('show');
      document.body.addEventListener('mousedown', this._boundOnBodyMouseDown);
    }

    hide() {
      this._videoInfoArea.scrollTop = 0;
      this.removeClass('show is-ok is-fail noclip is-setting');
    }

    _bindSuccess(videoInfo: PocketVideoInfo): void {
      const toCamel = (p: string): string => {
        return p.replace(/-./g, (s) => {
          return s.charAt(1).toUpperCase();
        });
      };

      Object.keys(this._slot).forEach((key) => {
        const camelKey = toCamel(key);
        const data = (videoInfo as unknown as Record<string, unknown>)[camelKey];

        const elm = this._slot[key]!;
        const type = elm.getAttribute('data-type') || 'string';
        switch (type) {
          case 'html':
            this._createDescription(elm, data as string);
            break;
          case 'int':
            {
              const i = parseInt(data as string, 10);
              elm.textContent = `${i.toLocaleString ? i.toLocaleString() : i}`;
            }
            break;
          case 'link':
            (elm as unknown as HTMLAnchorElement).href = data as string;
            break;
          case 'image':
            (elm as unknown as HTMLImageElement).src = (data as string).replace('http:', 'https:');
            break;
          case 'date':
            elm.textContent = (data as { toLocaleString(): string }).toLocaleString();
            break;
          default:
            elm.textContent = data as string;
        }
      });

      const df = document.createDocumentFragment();
      //Array.prototype.forEach.call(this._host.querySelectorAll('.tag'), t => { t.remove(); });
      videoInfo.tags.forEach((tag) => {
        df.appendChild(this._createTagSlot(tag, videoInfo));
      });
      const videoTags = this._rootDom.querySelector('.video-tags')!;
      videoTags.innerHTML = '';
      videoTags.appendChild(df);

      Array.prototype.forEach.call(this._rootDom.querySelectorAll('.command-watch-id'), (elm: Element) => {
        elm.setAttribute('data-param', videoInfo.watchId);
      });
      Array.prototype.forEach.call(this._rootDom.querySelectorAll('.command-video-id'), (elm: Element) => {
        elm.setAttribute('data-param', videoInfo.videoId);
      });

      const target = this._config.props.openNewWindow ? '_blank' : '_self';
      Array.prototype.forEach.call(this._host.querySelectorAll('.target-change'), (elm: Element) => {
        (elm as unknown as HTMLAnchorElement).target = target;
        (elm as unknown as HTMLAnchorElement).rel = 'noopener';
      });

      this._updateFavNg();

      this.toggleClass('is-channel', videoInfo.isChannel);
      this.addClass('is-ok');
      this.removeClass('is-fail');
      window.setTimeout(() => {
        this.addClass('noclip');
      }, 800);
    }

    _createDescription(elm: Element, data: string): void {
      (elm as unknown as HTMLElement).innerHTML = util.httpLink(data);
      const watchReg = /(watch|shorts)\/([a-z0-9]+)/;
      const isFutatsumeReady = this._isFutatsumeReady;
      //if (util.isFirefox()) { return; }
      Array.from(elm.querySelectorAll('.videoLink[href*="watch/"],.videoLink[href*="shorts/"]')).forEach((link) => {
        const href = link.getAttribute('href');
        if (!watchReg.test(href as string)) {
          return;
        }
        const watchId = RegExp.$2;
        if (isFutatsumeReady) {
          link.classList.add('noHoverMenu');
          link.classList.add('command');
          link.setAttribute('data-command', 'futatsume-open');
          link.setAttribute('data-param', watchId);
        }
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = link.textContent;
        link.textContent = '';
        link.append(label);

        const btn = document.createElement('button');
        btn.innerHTML = '？';
        btn.className = 'command command-button noHoverMenu';
        btn.setAttribute('slot', 'command-button');
        btn.setAttribute('tooltip', '動画情報');
        btn.setAttribute('data-command', 'info');
        btn.setAttribute('data-param', watchId);
        link.appendChild(btn);

        const img = document.createElement('img');
        img.className = 'videoThumbnail preview';
        img.src = 'https://nicovideo.cdn.nimg.jp/uni/img/common/video_deleted.jpg'; //(thumbnail || '').replace(/^http:/, '');
        link.classList.add('popupThumbnail');
        link.appendChild(img);

        (link as unknown as HTMLElement).dataset.videoId = watchId;
        link.classList.add('watch');
      });
    }

    _bindFail(videoInfo: PocketVideoInfo): void {
      this._slot['error-description']!.textContent = `動画情報の取得に失敗しました (${videoInfo.description})`;
      this.addClass('is-fail');
      this.removeClass('is-ok');
    }

    _createTagSlot(tag: PocketVideoTag, { isChannel, watchId }: PocketVideoInfo): Element {
      const text = util.escapeHtml(tag.text);
      const lock = tag.isLocked ? 'is-locked' : '';
      const span = document.createElement('span');

      const a = document.createElement('a');
      const target = this._config.props.openNewWindow ? '_blank' : '_self';
      a.textContent = tag.text;
      a.className = `tag ${lock}`;
      a.target = target;
      a.rel = 'noopener';
      a.href = `https://www.nicovideo.jp/tag/${encodeURIComponent(text)}`;
      span.appendChild(a);

      if (isChannel) {
        const ch = document.createElement('a');
        const target = this._config.props.openNewWindow ? '_blank' : '_self';
        ch.textContent = '[ch]';
        ch.className = `tag ${lock} channel-search`;
        ch.target = target;
        ch.rel = 'noopener';
        ch.title = 'チャンネル検索';
        //ch.href      = `http://ch.nicovideo.jp/search/${encodeURIComponent(text)}?channel_id=ch${ownerId}&type=video&mode=t`;
        ch.href = `https://ch.nicovideo.jp/search/${encodeURIComponent(text)}?type=video&mode=t`;
        span.appendChild(ch);
      }

      const fav = document.createElement('button');
      fav.className = 'add-fav-button command';
      fav.setAttribute('data-command', 'toggle-fav-tag');
      fav.setAttribute('data-tag', tag.text);
      fav.innerHTML = '★'; //'&#8416;'; // &#x2716;
      span.appendChild(fav);

      const bt = document.createElement('button');
      bt.className = 'add-ng-button command';
      bt.setAttribute('data-command', 'toggle-ng-tag');
      bt.setAttribute('data-tag', tag.text);
      bt.innerHTML = '&#x2716;'; //'&#8416;'; // &#x2716;
      span.appendChild(bt);

      // 大百科アイコンの描画と存在解決は TagListView と共通化する。
      // 初期表示は未取得、記事APIの応答で futatsume-tag-item-menu を作り直す。
      span.insertAdjacentHTML('afterbegin', createDicIconHtml(tag.text));
      void getNicodicArticleExists(tag.text).then((exists) => {
        if (this._videoInfo.watchId !== watchId || !span.isConnected) {
          return;
        }
        const menu = span.querySelector('futatsume-tag-item-menu');
        if (!menu) {
          return;
        }
        const resolved = document.createElement('div');
        resolved.innerHTML = createDicIconHtml(tag.text, exists);
        menu.replaceWith(resolved.firstElementChild as Element);
      });

      span.className = 'tag-container';
      span.setAttribute('data-tag', tag.text);
      span.slot = 'tag';
      return span;
    }

    notifyBeginDeflistUpdate(): void {
      this.addClass('is-deflistUpdating');
    }

    notifyEndDeflistUpdate(result: PocketCommandResult): void {
      this.addClass('is-deflistSuccess');
      window.setTimeout(() => {
        this.removeClass('is-deflistSuccess');
      }, 3000);

      this._deflistButton.setAttribute('data-result', result.message || '登録しました');
      this.removeClass('is-deflistUpdating');
    }

    notifyFailDeflistUpdate(result: PocketCommandResult): void {
      this.addClass('is-deflistFail');
      window.setTimeout(() => {
        this.removeClass('is-deflistFail');
      }, 3000);

      this._deflistButton.setAttribute('data-result', result.message || '登録失敗');
      this.removeClass('is-deflistUpdating');
    }
  }
  return { HoverMenu, VideoInfoView };
}
