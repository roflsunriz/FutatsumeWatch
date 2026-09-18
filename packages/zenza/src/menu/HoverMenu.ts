import { ZenzaWatch } from '../../../../src/ZenzaWatchIndex';
import { uq } from '../../../lib/src/uQuery';
import { nicoUtil } from '../../../lib/src/nico/nicoUtil';
import { cssUtil } from '../../../lib/src/css/css';

interface PlayerConfigLike {
  props: Record<string, unknown>;
  getValue(key: string): unknown;
}

interface HoverMenuParams {
  playerConfig: PlayerConfigLike;
}

interface HoverMenuView {
  on(name: string, handler: (e: MouseEvent) => void): HoverMenuView;
  append(view: HoverMenuView): HoverMenuView;
  removeClass(name: string): HoverMenuView;
  addClass(name: string): HoverMenuView;
  css(styles: Record<string, string>): HoverMenuView;
}

interface UqStatic {
  (selector: string): HoverMenuView;
}

interface NicoUtilLike {
  isGinzaWatchUrl(url?: string): boolean;
  getWatchId(href: string): string;
  parseWatchQuery(query: string): unknown;
}

interface CssUtilLike {
  px(value: number): string;
}

interface ZenzaWatchLike {
  emitter: {
    on(name: string, handler: (...args: unknown[]) => void): void;
    emit(name: string, ...args: unknown[]): void;
  };
  external: {
    sendOrOpen(watchId: string, options: unknown): void;
    send(watchId: string, options: unknown): void;
  };
}

interface HoverPlayer {
  open(watchId: string, options: unknown): void;
}

interface ConsoleWithNicoru {
  nicoru(...args: unknown[]): void;
}
//===BEGIN===

class HoverMenu {
  declare _playerConfig: PlayerConfigLike;
  declare _$view: HoverMenuView;
  declare _player: HoverPlayer | undefined;
  declare _playerPromise: Promise<HoverPlayer> | undefined;
  declare _playerResolve: ((player: HoverPlayer) => void) | undefined;
  declare _hoverElement: Element | null;
  declare _watchId: string;
  declare _query: unknown;
  declare _playerOption: Record<string, unknown>;
  constructor(param: HoverMenuParams) {
    this.initialize(param);
  }
  initialize(param: HoverMenuParams): void {
    this._playerConfig = param.playerConfig;

    const uqFn = uq as unknown as UqStatic;
    const nicoUtilLike = nicoUtil as unknown as NicoUtilLike;
    const zenzaWatch = ZenzaWatch as unknown as ZenzaWatchLike;
    const $view = (this._$view = uqFn(
      '<zen-button class="ZenButton"><div class="ZenButtonInner scalingUI">Zen</div></zen-button>'
    ));

    if (
      !nicoUtilLike.isGinzaWatchUrl() &&
      this._playerConfig.props.overrideWatchLink &&
      location &&
      location.host.endsWith('.nicovideo.jp')
    ) {
      this._overrideWatchLink();
    } else {
      this._onHoverEnd = _.debounce(this._onHoverEnd.bind(this), 500);
      $view.on(location.host.includes('google') ? 'mouseup' : 'click', this._onClick.bind(this));
      zenzaWatch.emitter.on('hideHover', () => $view.removeClass('show'));
      uqFn('body')
        .on('mouseover', this._onHover.bind(this))
        .on('mouseover', (e) => this._onHoverEnd(e))
        .on('mouseout', this._onMouseout.bind(this))
        .append($view);
    }
  }
  setPlayer(player: HoverPlayer): void {
    this._player = player;
    if (this._playerResolve) {
      this._playerResolve(player);
    }
  }
  _getPlayer(): Promise<HoverPlayer> {
    if (this._player) {
      return Promise.resolve(this._player);
    }
    if (!this._playerPromise) {
      this._playerPromise = new Promise((resolve) => {
        this._playerResolve = resolve;
      });
    }
    return this._playerPromise;
  }
  _closest(target: EventTarget | null): Element | null {
    return (target as unknown as Element).closest(
      'a[href*="watch/"],a[href*="shorts/"],a[href*="nico.ms/"],.UadVideoItem-link'
    );
  }
  _onHover(e: MouseEvent): void {
    const target = this._closest(e.target);
    if (target) {
      this._hoverElement = target;
    }
  }
  _onMouseout(e: MouseEvent): void {
    if (this._hoverElement === this._closest(e.target)) {
      this._hoverElement = null;
    }
  }
  _onHoverEnd(e: MouseEvent): void {
    if (!this._hoverElement) {
      return;
    }
    const nicoUtilLike = nicoUtil as unknown as NicoUtilLike;
    const cssUtilLike = cssUtil as unknown as CssUtilLike;
    const target = this._closest(e.target);
    if (this._hoverElement !== target) {
      return;
    }
    if (!target || target.classList.contains('noHoverMenu')) {
      return;
    }
    const anchor = target as HTMLAnchorElement;
    const href = anchor.dataset.href || anchor.href;
    const watchId = nicoUtilLike.getWatchId(href);
    const host = anchor.hostname;
    if (!['www.nicovideo.jp', 'sp.nicovideo.jp', 'nico.ms'].includes(host)) {
      return;
    }
    this._query = nicoUtilLike.parseWatchQuery((anchor.search || '').substr(1));

    if (!watchId || !watchId.match(/^[a-z0-9]+$/)) {
      return;
    }
    if (watchId.startsWith('lv')) {
      return;
    }

    this._watchId = watchId;

    const offset = target.getBoundingClientRect();
    this._$view
      .css({
        top: cssUtilLike.px(offset.top + window.pageYOffset),
        left: cssUtilLike.px(offset.left + window.pageXOffset),
      })
      .addClass('show');
    document.body.addEventListener('click', () => this._$view.removeClass('show'), { once: true });
  }
  _onClick(e: MouseEvent): void {
    const watchId = this._watchId;
    if (e.ctrlKey) {
      return;
    }

    if (e.shiftKey) {
      // 秘密機能。最後にZenzaWatchを開いたウィンドウで開く
      void this._send(watchId);
    } else {
      void this._open(watchId);
    }
  }
  open(watchId: string, params?: unknown): void {
    void this._open(watchId, params);
  }
  async _open(watchId: string, params?: unknown): Promise<void> {
    const zenzaWatch = ZenzaWatch as unknown as ZenzaWatchLike;
    this._playerOption = Object.assign(
      {
        economy: this._playerConfig.getValue('forceEconomy'),
        query: this._query,
        eventType: 'click',
      },
      params
    );

    const player = await this._getPlayer();
    if (this._playerConfig.getValue('enableSingleton')) {
      zenzaWatch.external.sendOrOpen(watchId, this._playerOption);
    } else {
      player.open(watchId, this._playerOption);
    }
  }
  send(watchId: string, params?: unknown): void {
    void this._send(watchId, params);
  }
  async _send(watchId: string, params?: unknown): Promise<void> {
    const zenzaWatch = ZenzaWatch as unknown as ZenzaWatchLike;
    await this._getPlayer();
    zenzaWatch.external.send(watchId, Object.assign({ query: this._query }, params));
  }
  _overrideWatchLink(): void {
    const nicoruConsole = console as unknown as ConsoleWithNicoru;
    const nicoUtilLike = nicoUtil as unknown as NicoUtilLike;
    const zenzaWatch = ZenzaWatch as unknown as ZenzaWatchLike;
    const uqFn = uq as unknown as UqStatic;
    let userPageIntercept: ((e: MouseEvent) => void) | undefined;
    if (document.querySelector('.UserPageHeader') != null) {
      nicoruConsole.nicoru('user page');
      const blockNavigation = (e: Event): void => {
        if ((e as MouseEvent).ctrlKey) {
          return;
        }
        e.preventDefault();
        // e.stopPropagation();
      };
      userPageIntercept = (e: MouseEvent) => {
        const target = e.target as unknown as Element;
        if (target.tagName !== 'A' || !target.closest('.TimelineItem_video,.TimelineItem_shortVideo')) {
          return;
        }
        // console.nicoru('mouseover', target.tagName);
        target.removeEventListener('click', blockNavigation);
        target.addEventListener('click', blockNavigation);
      };
    }
    const requireIntercepts: Array<(e: MouseEvent) => boolean> = [];
    if (
      location.pathname.startsWith('/ranking') ||
      location.pathname.startsWith('/search') ||
      location.pathname.startsWith('/tag')
    ) {
      nicoruConsole.nicoru('ranking/search/tag page');
      requireIntercepts.push((e) => {
        const target = (e.target as unknown as Element).closest('button');
        return target != null && this._closest(target) != null;
      });
    }
    const onClick = (e: Event): void => {
      const mouse = e as MouseEvent;
      if (mouse.ctrlKey) {
        return;
      }
      const target = this._closest(e.target);
      if (!target || target.classList.contains('noHoverMenu')) {
        return;
      }
      const anchor = target as HTMLAnchorElement;
      const href = anchor.dataset.href || anchor.href;
      const watchId = nicoUtilLike.getWatchId(href);
      if (!watchId || !watchId.match(/^[a-z0-9]+$/)) {
        return;
      }
      if (watchId.startsWith('lv')) {
        return;
      }

      if (target.closest('.TimelineItem_video,.TimelineItem_shortVideo')) {
        // console.nicoru('nicorepoi', target, target.href);
        e.stopPropagation();
        // history.pushState(null, null, target.href);
      }
      e.preventDefault();

      this._query = nicoUtilLike.parseWatchQuery((anchor.search || '').substr(1));
      if (mouse.shiftKey) {
        // 秘密機能。最後にZenzaWatchを開いたウィンドウで開く
        void this._send(watchId);
      } else {
        void this._open(watchId);
      }

      window.setTimeout(() => zenzaWatch.emitter.emit('hideHover'), 1500);
    };
    uqFn('body').on('mouseover', (e) => {
      if (userPageIntercept) {
        userPageIntercept(e);
      }
      const target = this._closest(e.target);
      if (!target || target.classList.contains('noHoverMenu')) {
        return;
      }
      const host = (target as HTMLAnchorElement).hostname;
      if (!['www.nicovideo.jp', 'sp.nicovideo.jp', 'nico.ms'].includes(host)) {
        return;
      }
      target.removeEventListener('click', onClick);
      if (requireIntercepts.length > 0 && requireIntercepts.some((f) => f(e))) {
        return;
      }
      target.addEventListener('click', onClick);
    });
  }
}

//===END===

export { HoverMenu };
