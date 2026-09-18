import { Emitter } from '../../../lib/src/Emitter';
import { NicoChatFilter } from './NicoChatFilter';
import { ZenzaWatch, global } from '../../../../src/FutatsumeWatchIndex';
import { Config } from '../../../../src/Config';
import { bounce, throttle } from '../../../lib/src/infra/bounce';
import { NicoChat } from './NicoChat';
import { NicoComment } from './NicoComment';
import { NicoTextParser } from './NicoTextParser';
import { env } from '../../../lib/src/infra/env';
import { PopupMessage } from '../../../lib/src/ui/PopupMessage';
import { VideoCaptureUtil } from '../../../lib/src/dom/VideoCaptureUtil';
import { NicoChatCss3View } from './NicoChatCss3View';
import { NicoChatViewModel } from './NicoChatViewModel';
import { watchResize } from '../../../lib/src/dom/watchResize';
import { cssUtil } from '../../../lib/src/css/css';
import { ClassList } from '../../../lib/src/dom/ClassListWrapper';
import type { NicoCommentViewModel } from './NicoCommentViewModel';

interface PlayerViewParams {
  viewModel: NicoCommentViewModel;
  playbackRate?: unknown;
  show?: unknown;
}

interface ConfigNamespaceLike {
  props: Record<string, unknown>;
  onkey(name: string, handler: (value: unknown) => void): void;
}

interface ConfigLike {
  props: Record<string, unknown>;
  namespace(name: string): ConfigNamespaceLike;
  onkey(name: string, handler: (value: unknown) => void): void;
}

interface GlobalLike {
  debug: Record<string, unknown>;
  emitter: {
    on(name: string, handler: (...args: unknown[]) => void): void;
  };
  innerWidth?: unknown;
}

interface ThrottleLike {
  raf<TFunc extends () => void>(func: TFunc): TFunc;
}

interface CssUtilLike {
  setProps(...props: unknown[]): void;
  px(value: number): string;
  number(value: number): string;
}

interface ClassListWrapper {
  add(...names: string[]): void;
  remove(...names: string[]): void;
  toggle(name: string, force?: boolean): boolean;
}

interface ClassListFactory {
  (view: Element): ClassListWrapper;
}

interface PopupMessageLike {
  alert(message: string): void;
}

interface WatchResizeLike {
  (target: unknown, handler: () => void): void;
}

interface WindowWithUnpollutedArray extends Window {
  Array: {
    (): Element[];
    from<T>(iterable: Iterable<T> | ArrayLike<T>): T[];
  };
}

interface ConsoleWithNicoru {
  nicoru(...args: unknown[]): void;
}

export type { PlayerViewParams };
//===BEGIN===
/**
 * ニコニコ動画のコメントをCSS3アニメーションだけで再現出来るよ
 * という一発ネタのつもりだったのだが意外とポテンシャルが高かった。
 *
 * DOM的に隔離されたiframeの領域内で描画する
 */
class NicoCommentCss3PlayerView extends Emitter {
  declare static MAX_DISPLAY_COMMENT: number;
  declare static __TPL__: string;
  declare _viewModel: NicoCommentViewModel;
  declare _lastCurrentTime: number;
  declare _currentTime: number;
  declare _isShow: boolean;
  declare _aspectRatio: number;
  declare _inViewTable: Set<NicoChatViewModel>;
  declare _inSlotTable: Set<NicoChatViewModel>;
  declare _domTable: Map<NicoChatViewModel, HTMLElement>;
  declare _playbackRate: number;
  declare _isPaused: boolean | undefined;
  declare _retryGetIframeCount: number;
  declare _config: ConfigNamespaceLike;
  declare _style: Element | null | undefined;
  declare commentLayer: Element | null | undefined;
  declare _view: HTMLIFrameElement | null | undefined;
  declare window: Window | undefined;
  declare document: Document | undefined;
  declare fragment: DocumentFragment | undefined;
  declare subFragment: DocumentFragment | undefined;
  declare removingElements: Element[];
  declare _optionStyle: Element | undefined;
  declare subLayer: Element | undefined;
  declare _node: Element | undefined;
  declare _msEdge: boolean | undefined;
  declare onResize: (() => void) | undefined;
  declare isUpdating: boolean | undefined;
  declare isStalled: boolean | undefined;
  declare totalWidth: number | undefined;
  constructor(params: PlayerViewParams) {
    super();

    this._viewModel = params.viewModel;

    this._viewModel.on('setData', this._onSetData.bind(this));
    this._viewModel.on('currentTime', (sec: unknown) => this._onCurrentTime(sec as number));

    this._lastCurrentTime = 0;
    this._isShow = true;

    this._aspectRatio = 9 / 16;

    this._inViewTable = new Set();
    this._inSlotTable = new Set();
    this._domTable = new Map();
    this._playbackRate = (params.playbackRate as number) || 1.0;

    this._isPaused = undefined;

    this._retryGetIframeCount = 0;

    console.log('NicoCommentCss3PlayerView playbackRate', this._playbackRate);

    this._initializeView(params, 0);

    const config = Config as unknown as ConfigLike;
    this._config = config.namespace('commentLayer');

    const throttleLike = throttle as unknown as ThrottleLike;
    this._updateDom = throttleLike.raf(this._updateDom.bind(this));

    // ウィンドウが非表示の時にブラウザが描画をサボっているので、
    // 表示になったタイミングで粛正する
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.refresh();
        this.onResize!();
      }
    });
    (global as unknown as GlobalLike).debug.css3Player = this;
  }
  _initializeView(params: { show?: unknown }, retryCount: number): void {
    const css = cssUtil as unknown as CssUtilLike;
    const classListFactory = ClassList as unknown as ClassListFactory;
    const config = Config as unknown as ConfigLike;
    const globalLike = global as unknown as GlobalLike;
    const popup = PopupMessage as unknown as PopupMessageLike;
    const watchResizeFn = watchResize as unknown as WatchResizeLike;
    const nicoruConsole = console as unknown as ConsoleWithNicoru;
    if (retryCount === 0) {
      self.console.time('initialize NicoCommentCss3PlayerView');
    }
    this._style = null;
    this.commentLayer = null;
    this._view = null;
    const iframe = this._getIframe();
    iframe.loading = 'eager';
    iframe.setAttribute('sandbox', 'allow-same-origin');

    iframe.className = 'commentLayerFrame';

    const html = NicoCommentCss3PlayerView.__TPL__
      .replace('%CSS%', '')
      .replace('%MSG%', '')
      .replace('%LAYOUT_CSS%', NicoTextParser.__css__)
      .replace('%OPTION_CSS%', '');

    const onload = (): void => {
      let win: Window, doc: Document;
      iframe.onload = null;
      try {
        win = iframe.contentWindow as Window;
        doc = (iframe.contentWindow as Window).document;
      } catch (e) {
        self.console.error(e);
        self.console.log('変な広告に乗っ取られました');
        iframe.remove();
        this._view = null;
        globalLike.debug.commentLayer = null;
        if (retryCount < 3) {
          this._initializeView(params, retryCount + 1);
        } else {
          popup.alert('コメントレイヤーの生成に失敗');
        }
        return;
      }
      // cssUtil.registerProps(
      //   {name: '--dokaben-scale', syntax: '<number>', initialValue: 1, inherits: true, window: win},
      //   {name: '--chat-trans-x', syntax: '<length-percentage>', initialValue: 0, inherits: false, window: win},
      //   {name: '--chat-trans-y', syntax: '<length-percentage>', initialValue: 0, inherits: false, window: win},
      //   {name: '--chat-scale-x', syntax: '<number>', initialValue: 1, inherits: false, window: win},
      //   {name: '--chat-scale-y', syntax: '<number>', initialValue: 1, inherits: false, window: win},
      //   {name: '--layer-scale',  syntax: '<number>', initialValue: 1, inherits: false, window: win}
      // );

      this.window = win;
      this.document = doc;
      this.fragment = doc.createDocumentFragment();
      this.subFragment = doc.createDocumentFragment();
      this.removingElements = (win as WindowWithUnpollutedArray).Array();
      this._optionStyle = doc.getElementById('optionCss')!;
      this._style = doc.getElementById('nicoChatAnimationDefinition')!;
      const commentLayer = (this.commentLayer = doc.getElementById('commentLayer')!);
      const commentLayerOuter = doc.getElementById('commentLayerOuter')!;
      const subLayer = (this.subLayer = doc.createElement('div'));
      subLayer.className = 'subLayer';
      commentLayer.append(subLayer);
      // Config直接参照してるのは手抜き
      classListFactory(doc.body).toggle('debug', config.props.debug as boolean);
      config.onkey('debug', (v: unknown) => classListFactory(doc.body).toggle('debug', v as boolean));
      // 手抜きその2
      void NicoComment.offscreenLayer.get().then((layer) => {
        const style = this._optionStyle as Element;
        style.innerHTML = layer.optionCss;
      });
      globalLike.emitter.on('updateOptionCss', (newCss: unknown) => {
        (this._optionStyle as Element).innerHTML = newCss as string;
      });

      globalLike.debug.getInViewElements = () => doc.getElementsByClassName('nicoChat');

      const onResize = (): void => {
        const w = win.innerWidth,
          h = win.innerHeight;
        if (!w || !h) {
          return;
        }
        // 基本は元動画の縦幅合わせだが、16:9より横長にはならない
        const aspectRatio = Math.max(this._aspectRatio, 9 / 16);
        const targetHeight = Math.min(h, w * aspectRatio);
        const scale = targetHeight / 384;
        css.setProps([commentLayerOuter, '--layer-scale', css.number(scale)]);
      };

      const chkSizeInit = (): void => {
        const h = win.innerHeight;
        if (!h) {
          window.setTimeout(chkSizeInit, 500);
        } else {
          watchResizeFn(iframe, _.throttle(onResize, 100));
          this.onResize = onResize;
          onResize();
        }
      };
      globalLike.emitter.on('fullscreenStatusChange', _.debounce(onResize, 2000));
      window.setTimeout(chkSizeInit, 100);

      if (this._isPaused) {
        this.pause();
      }

      const updateTextShadow = (type: unknown): void => {
        const types = ['shadow-type2', 'shadow-type3', 'shadow-stroke', 'shadow-dokaben'];
        const cl = classListFactory(doc.body);
        types.forEach((t) => cl.toggle(t, t === type));
      };
      updateTextShadow(this._config.props.textShadowType);
      this._config.onkey('textShadowType', _.debounce(updateTextShadow, 100));
      this._config.onkey(
        'easyCommentOpacity',
        _.debounce((v: unknown) => {
          nicoruConsole.nicoru(
            'update easyCommentOpacity',
            v,
            (this._config as unknown as Record<string, unknown>).easyCommentOpacity,
            commentLayerOuter
          );
          css.setProps([commentLayerOuter, '--easy-comment-opacity', css.number((v as number) * 1)]);
        }, 100)
      );
      this._config.onkey(
        'aiCommentOpacity',
        _.debounce((v: unknown) => {
          nicoruConsole.nicoru(
            'update aiCommentOpacity',
            v,
            (this._config as unknown as Record<string, unknown>).aiCommentOpacity,
            commentLayerOuter
          );
          css.setProps([commentLayerOuter, '--ai-comment-opacity', css.number((v as number) * 1)]);
        }, 100)
      );
      self.console.timeEnd('initialize NicoCommentCss3PlayerView');
    };

    this._view = iframe;
    if (this._node) {
      this._node.append(iframe);
    }

    if ((iframe as unknown as { srcdocType?: unknown }).srcdocType === 'string') {
      iframe.onload = onload;
      iframe.srcdoc = html;
    } else {
      // MS IE/Edge用
      if (!this._node) {
        this._msEdge = true;
        // ここに直接書いてるのは掟破り。 動かないよりはマシということで・・・
        (document.querySelector('.zenzaPlayerContainer') as Element).append(iframe);
      }
      const icd = (iframe.contentWindow as Window).document;
      icd.open();
      icd.write(html);
      icd.close();
      window.setTimeout(onload, 0);
    }

    globalLike.debug.commentLayer = iframe;
    if (!params.show) {
      this.hide();
    }
  }
  _getIframe(): HTMLIFrameElement & { srcdocType?: unknown } {
    const iframe = document.createElement('iframe');
    const frame = iframe as unknown as { srcdocType?: unknown };
    frame.srcdocType = frame.srcdocType || typeof iframe.srcdoc;
    iframe.srcdoc = '<html></html>';
    return iframe;
  }
  _onCommand(command: unknown, param: unknown): void {
    this.emit('command', command, param);
  }
  _adjust(): void {
    if (!this._view) {
      return;
    }
    if (typeof this.onResize === 'function') {
      return this.onResize();
    }
  }
  getView(): HTMLIFrameElement | null | undefined {
    return this._view;
  }
  set playbackRate(playbackRate: number) {
    // let isSpeedUp = this._playbackRate < playbackRate;
    this._playbackRate = Math.min(Math.max(playbackRate, 0.01), 10);
    const config = Config as unknown as ConfigLike;
    if (!config.props.autoCommentSpeedRate || this._playbackRate <= 1) {
      this.refresh();
    }
  }
  get playbackRate(): number {
    return this._playbackRate;
  }
  setAspectRatio(ratio: number): void {
    this._aspectRatio = ratio;
    this._adjust();
  }
  _onSetData(): void {
    this.clear();
  }
  _onCurrentTime(sec: number): void {
    const REFRESH_THRESHOLD = 1;
    this._lastCurrentTime = this._currentTime;
    this._currentTime = sec;

    if (this._lastCurrentTime === this._currentTime) {
      // pauseでもないのにcurrentTimeの更新が途絶えたらロードが詰まった扱い
      if (!this._isPaused) {
        // this._currentTime && console.warn('stalled', this._currentTime);
        this._setStall(true);
      }
    } else if (
      this._currentTime < this._lastCurrentTime ||
      Math.abs(this._currentTime - this._lastCurrentTime) > REFRESH_THRESHOLD
    ) {
      // 後方へのシーク、または 境界値以上の前方シーク時は全体を再描画
      this.refresh();
    } else {
      this._setStall(false);
      this._updateInviewElements();
    }
  }
  _addClass(name: string): void {
    const layer = this.commentLayer;
    if (!layer) {
      return;
    }
    const classListFactory = ClassList as unknown as ClassListFactory;
    classListFactory(layer).add(name);
  }
  _removeClass(name: string): void {
    const layer = this.commentLayer;
    if (!layer) {
      return;
    }
    const classListFactory = ClassList as unknown as ClassListFactory;
    classListFactory(layer).remove(name);
  }
  _setStall(v: unknown): void {
    this.isStalled = !!v;
    if (v) {
      this._addClass('is-stalled');
    } else {
      this._removeClass('is-stalled');
    }
  }
  pause(): void {
    if (this.commentLayer) {
      this._addClass('paused');
    }
    this._isPaused = true;
  }
  play(): void {
    if (this.commentLayer) {
      this._removeClass('paused');
    }
    this._isPaused = false;
  }
  clear(): this | undefined {
    const layer = this.commentLayer;
    if (layer) {
      layer.textContent = '';
      const sub = this.subLayer as Element;
      sub.textContent = '';
      layer.append(sub);
      (this.fragment as DocumentFragment).textContent = '';
      (this.subFragment as DocumentFragment).textContent = '';
    }
    if (this._style) {
      this._style.textContent = '';
    }

    this._inViewTable.clear();
    this._inSlotTable.clear();
    this._domTable.clear();
    this.isUpdating = false;
    return this;
  }
  refresh(): void {
    this.clear();
    this._updateInviewElements();
  }
  _updateInviewElements(): void {
    if (this.isUpdating || !this.commentLayer || !this._style || !this._isShow || document.hidden) {
      return;
    }

    const vm = this._viewModel;
    const inView = [
      vm.getGroup(NicoChat.TYPE.NAKA).inViewMembers,
      vm.getGroup(NicoChat.TYPE.BOTTOM).inViewMembers,
      vm.getGroup(NicoChat.TYPE.TOP).inViewMembers,
    ].flat() as unknown as NicoChatViewModel[];
    const dom: HTMLElement[] = [],
      subDom: HTMLElement[] = [],
      newView: NicoChatViewModel[] = [];
    const inSlotTable = this._inSlotTable,
      inViewTable = this._inViewTable;
    const ct = this._currentTime;
    for (let i = 0, len = inView.length; i < len; i++) {
      const nicoChat = inView[i] as NicoChatViewModel;
      if (inViewTable.has(nicoChat)) {
        continue;
      }
      inViewTable.add(nicoChat);
      inSlotTable.add(nicoChat);
      newView.push(nicoChat);
    }

    if (newView.length > 1) {
      newView.sort((a, b) => NicoChat.SORT_FUNCTION(a, b));
    }

    const doc = this.document!,
      playbackRate = this._playbackRate;
    const domTable = this._domTable;
    for (let i = 0, len = newView.length; i < len; i++) {
      const nicoChat = newView[i] as NicoChatViewModel;
      const type = nicoChat.type;
      const size = nicoChat.size;
      const cssText = NicoChatCss3View.buildChatCss(nicoChat, type, ct, playbackRate);
      const element = NicoChatCss3View.buildChatDom(nicoChat, type, size, cssText, doc);
      domTable.set(nicoChat, element);
      (nicoChat.isSubThread ? subDom : dom).push(element);
    }

    // DOMへの追加
    if (!newView.length) {
      return;
    }
    this.isUpdating = true;
    if (dom.length) {
      (this.fragment as DocumentFragment).append(...dom);
    }
    if (subDom.length) {
      (this.subFragment as DocumentFragment).append(...subDom);
    }
    const currentTime = this._currentTime;

    const margin = 2 * NicoChatViewModel.SPEED_RATE;
    for (const nicoChat of inSlotTable) {
      if (currentTime - margin < nicoChat.endRightTiming) {
        continue;
      }
      const elm = domTable.get(nicoChat);
      if (elm) {
        this.removingElements.push(elm);
      }
      inSlotTable.delete(nicoChat);
    }
    this._updateDom();
  }

  _updateDom(): void {
    const layer = this.commentLayer as Element;
    const sub = this.subLayer as Element;
    // performance.mark('updateDom:start-add');
    // this._removeOutviewElements(outViewChats);
    if ((this.fragment as DocumentFragment).firstElementChild) {
      layer.append(this.fragment as DocumentFragment);
    }
    if ((this.subFragment as DocumentFragment).firstElementChild) {
      sub.append(this.subFragment as DocumentFragment);
    }
    this._gcInviewElements();
    if (this.removingElements.length) {
      for (const e of this.removingElements) {
        e.remove();
      }
      this.removingElements.length = 0;
    }
    for (const e of layer.querySelectorAll('.hidden')) {
      (e as HTMLElement).classList.remove('hidden');
      (e as HTMLElement).style.contentVisibility = 'visible';
    }
    this.isUpdating = false;
    // performance.mark('updateDom:end-add');
    // performance.mark('updateDom:start-remove');
    // performance.mark('updateDom:end-remove');
    // performance.measure('updateDom');
  }
  /*
   * 古い順に要素を除去していく
   */
  _gcInviewElements(): void {
    if (!this.commentLayer || !this._style) {
      return;
    }

    const max = NicoCommentCss3PlayerView.MAX_DISPLAY_COMMENT;

    const commentLayer = this.commentLayer;
    const elements = this.removingElements;
    const win = this.window as unknown as WindowWithUnpollutedArray;
    const af = win.Array.from.bind(win.Array); // prototype.js汚染を警戒
    const inViewElements: Element[] = // 表示上限オーバー時、AIキャラクターコメントとかんたんコメントが優先的に消えるように
      af(commentLayer.querySelectorAll('.nicoChat.fork3'))
        .concat(af(commentLayer.querySelectorAll('.nicoChat.fork2')))
        .concat(af(commentLayer.querySelectorAll('.nicoChat.fork0')));
    for (let i = inViewElements.length - max - 1; i >= 0; i--) {
      elements.push(inViewElements[i] as Element);
    }
  }

  buildHtml(currentTime?: number): string {
    self.console.time('buildHtml');

    const vm = this._viewModel;
    const baseTime = currentTime || vm.currentTime;
    const members = [
      vm.getGroup(NicoChat.TYPE.NAKA).members,
      vm.getGroup(NicoChat.TYPE.BOTTOM).members,
      vm.getGroup(NicoChat.TYPE.TOP).members,
    ].flat() as unknown as NicoChatViewModel[];

    members.sort((a, b) => NicoChat.SORT_FUNCTION(a, b));

    const html: string[] = [];
    html.push(this._buildGroupHtml(members, baseTime));

    const tpl = NicoCommentCss3PlayerView.__TPL__
      .replace('%LAYOUT_CSS%', NicoTextParser.__css__)
      .replace('%OPTION_CSS%', NicoComment.offscreenLayer.optionCss)
      .replace('%CSS%', '')
      .replace('%MSG%', html.join(''));

    self.console.timeEnd('buildHtml');
    return tpl;
  }
  _buildGroupHtml(m: NicoChatViewModel[], currentTime = 0): string {
    const result: string[] = [];

    for (let i = 0, len = m.length; i < len; i++) {
      const chat = m[i]!;
      const type = chat.type;
      const cssText = NicoChatCss3View.buildChatCss(chat, type, currentTime);
      const element = NicoChatCss3View.buildChatHtml(chat, type, cssText, this.document);
      result.push(element);
    }
    return result.join('\n');
  }
  _buildGroupCss(m: NicoChatViewModel[], currentTime: number): string {
    const result: Array<{ inline: string; keyframes?: string }> = [];

    for (let i = 0, len = m.length; i < len; i++) {
      const chat = m[i]!;
      const type = chat.type;
      result.push(NicoChatCss3View.buildChatCss(chat, type, currentTime));
    }
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- CSSオブジェクト群の文字列表現をそのまま連結する原本の挙動を保つ
    return result.join('\n');
  }
  show(): void {
    if (!this._isShow) {
      this._isShow = true;
      this.refresh();
    }
  }
  hide(): void {
    this.clear();
    this._isShow = false;
  }
  appendTo(node: Element): void {
    if (this._msEdge) {
      return;
    } // MS IE/Edge...
    this._node = node;
    node.append(this._view!);
  }
  /**
   * exportで、コメントを静的なCSS3アニメーションHTMLとして出力する。
   * 生成されたHTMLを開くだけで、スクリプトもなにもないのに
   * ニコニコ動画のプレイヤーのようにコメントが流れる。 ふしぎ！
   */
  export(): string {
    return this.buildHtml(0).replace('<html', '<html class="saved"');
  }

  getCurrentScreenHtml(): string | null {
    const win = this.window;
    if (!win) {
      return null;
    }
    this.refresh();
    const body = win.document.body;
    body.classList.add('in-capture');
    const html = win.document.documentElement.outerHTML;
    body.classList.remove('in-capture');
    return html
      .replace('<html ', '<html xmlns="http://www.w3.org/1999/xhtml" ')
      .replace(/<meta.*?>/g, '')
      .replace(/data-meta=".*?"/g, '')
      .replace(/<br>/g, '<br/>');
  }

  getCurrentScreenSvg(): string | null {
    const win = this.window;
    if (!win) {
      return null;
    }

    this.refresh();
    const body = win.document.body;
    body.classList.add('in-capture');
    const style = (win.document.querySelector('style') as Element).innerHTML;

    const w = 682,
      h = 382;
    const head = `<svg
  xmlns="http://www.w3.org/2000/svg"
  version="1.1">
`;
    const defs = `
<defs>
  <style type="text/css" id="layoutCss"><![CDATA[
    ${style}

    .nicoChat {
      animation-play-state: paused !important;
    }
  ]]>
  </style>
</defs>
`.trim();

    const textList: string[] = [];
    Array.from(win.document.querySelectorAll('.nicoChat')).forEach((chat) => {
      const j = JSON.parse(chat.getAttribute('data-meta') as string) as { ypos: number };
      chat.removeAttribute('data-meta');
      chat.setAttribute('y', String(j.ypos));
      let c = chat.outerHTML;
      c = c.replace(/<span/g, '<text');
      c = c.replace(/<\/span>$/g, '</text>');
      c = c.replace(/<(\/?)(span|group|han_group|zen_group|spacer)/g, '<$1tspan');
      c = c.replace(/<br>/g, '<br/>');
      textList.push(c);
    });

    const view = `
<g fill="#00ff00">
  ${textList.join('\n\t')}
</g>

`;

    const foot = `
<g style="background-color: #333; overflow: hidden; width: ${w}; height: ${h}; padding: 0 69px;" class="shadow-dokaben in-capture paused">
  <g id="commentLayerOuter" class="commentLayerOuter" width="682" height="384">
    <g class="commentLayer is-stalled" id="commentLayer" width="544" height="384">
    </g>
  </g>
</g>
</svg> `.trim();

    return `${head}${defs}${view}${foot}`;
  }
}

NicoCommentCss3PlayerView.MAX_DISPLAY_COMMENT = 40;
/* eslint-disable */
NicoCommentCss3PlayerView.__TPL__ = ((config: { props: Record<string, string> }) => {
  let ownerShadowColor = config.props['commentLayer.ownerCommentShadowColor'] as string;
  ownerShadowColor = ownerShadowColor.replace(/([^a-z^0-9^#])/gi, '');
  const easyCommentOpacity = config.props['commentLayer.easyCommentOpacity'];
  const aiCommentOpacity = config.props['commentLayer.aiCommentOpacity'];
  const textShadowColor = '#000';
  // let textShadowColor2 = '#fff';
  const textShadowGray = '#888';
  return `
<!DOCTYPE html>
<html lang="ja"
 style="background-color: unset !important; background: none !important;"
>
<head>
<meta charset="utf-8">
<title>CommentLayer</title>
<style type="text/css" id="layoutCss">%LAYOUT_CSS%</style>
<style type="text/css" id="optionCss">%OPTION_CSS%</style>
<style type="text/css">
body {
  pointer-events: none;
  user-select: none;
  overflow: hidden;
  margin: 0;
  padding: 0;
  border: 0;
}
body.in-capture .commentLayerOuter {
  overflow: hidden;
  width: 682px;
  height: 384px;
  padding: 0 69px;
}
body.in-capture .commentLayer {
  transform: none !important;
}
.mode-3d .commentLayer {
  perspective: 50px;
}

.saved body {
  pointer-events: auto;
}

.debug .mincho  { background: rgba(128, 0, 0, 0.3); }
.debug .gulim   { background: rgba(0, 128, 0, 0.3); }
.debug .mingLiu { background: rgba(0, 0, 128, 0.3); }

@keyframes fixed {
   0% { opacity: 1; visibility: visible; }
  95% { opacity: 1; }
 100% { opacity: 0; visibility: hidden;}
}

@keyframes show-hide {
 0% { visibility: visible; opacity: 1; }
 /* Chrome 73のバグ？対策 hidden が適用されない */
 95% { visibility: visible; opacity: 1; }
 100% { visibility: hidden; opacity: 0; }

 /*100% { visibility: hidden; }*/
}

@keyframes dokaben {
  0% {
    visibility: visible;
    transform: translate3d(-50%, 0, 0) perspective(200px) rotateX(90deg) scale(var(--dokaben-scale));
  }
  50% {
    transform: translate3d(-50%, 0, 0) perspective(200px) rotateX(0deg) scale(var(--dokaben-scale));
  }
  90% {
    transform: translate3d(-50%, 0, 0) perspective(200px) rotateX(0deg) scale(var(--dokaben-scale));
  }
  100% {
    visibility: hidden;
    transform: translate3d(-50%, 0, 0) perspective(200px) rotateX(90deg) scale(var(--dokaben-scale));
  }
}

@keyframes idou-props {
  0%   {
    visibility: visible;
    transform: translateX(0);
  }
  100% {
    visibility: hidden;
    transform: translateX(var(--chat-trans-x));
  }
}
@keyframes idou-props-scaled {
  0%   {
    visibility: visible;
    transform:
      translateX(0)
      scale(var(--chat-scale-x), var(--chat-scale-y));
  }
  100% {
    visibility: hidden;
    transform:
      translateX(var(--chat-trans-x))
      scale(var(--chat-scale-x), var(--chat-scale-y));
  }
}
@keyframes idou-props-scaled-middle {
  0%   {
    visibility: visible;
    transform:
      translateX(0)
      scale(var(--chat-scale-x), var(--chat-scale-y))
      translateY(-50%);
  }
  100% {
    visibility: hidden;
    transform:
      translateX(var(--chat-trans-x))
      scale(var(--chat-scale-x), var(--chat-scale-y))
      translateY(-50%);
  }
}

.commentLayerOuter {
  position: fixed;
  top: 50vh;
  left: 50vw;
  width: 672px;
  height: 384px;
  transform: translate3d(-${672 / 2}px, -${384 / 2}px, 0);
  contain: layout style size;
}

.saved .commentLayerOuter {
  background: #333;
  position: absolute;
  top: auto; right: auto; bottom: auto;
  left: 50%;
  transform: translate(-50%, 0);
  contain: layout style size;
  overflow: visible;
}

.commentLayer {
  position: absolute;
  width: 544px;
  height: 384px;
  left: 50%;
  top: 50%;
  will-change: transform;
  transform: translate(-${544 / 2}px, -${384 / 2}px) scale(var(--layer-scale, 1));
  contain: layout style size;
}

.subLayer {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0.7;
  contain: layout style size;
}

.debug .commentLayer {
  outline: 1px solid green;
}

.nicoChat {
  position: absolute;
  display: inline-block;
  line-height: 1.235;
  visibility: hidden;
  text-shadow: 1px 1px 0 ${textShadowColor};
  transform-origin: 0 0;
  animation-timing-function: linear;
  /*animation-fill-mode: forwards;*/
  will-change: transform;
  contain: layout style paint;
  color: #fff;

  /*-webkit-font-smoothing: initial;
  font-smooth: auto;
  text-rendering: optimizeSpeed;
  font-kerning: none;*/
}

.shadow-type2 .nicoChat {
  text-shadow:
     1px  1px 0 rgba(0, 0, 0, 0.5),
    -1px  1px 0 rgba(0, 0, 0, 0.5),
    -1px -1px 0 rgba(0, 0, 0, 0.5),
     1px -1px 0 rgba(0, 0, 0, 0.5);
}

.shadow-type3 .nicoChat {
  text-shadow:
     1px  1px 1px rgba(  0,   0,   0, 0.8),
     0  0 2px rgba(  0,   0,   0, 0.8),
    -1px -1px 1px rgba(128, 128, 128, 0.8);
}

.shadow-stroke .nicoChat {
  text-shadow: none;
  -webkit-text-stroke: 1px rgba(0, 0, 0, 0.7);
  text-stroke:         1px rgba(0, 0, 0, 0.7);
}

/*「RGBは大体　文字200、80、0　縁150,50,0　くらい」らしい*/
.shadow-dokaben .nicoChat.ue,
.shadow-dokaben .nicoChat.shita {
  color: rgb(200, 80, 0);
  font-family: 'dokaben_ver2_1' !important;
  font-weight: bolder;
  animation-name: dokaben !important;
  text-shadow:
    1px  1px 0 rgba(150, 50, 0, 1),
   -1px  1px 0 rgba(150, 50, 0, 1),
   -1px -1px 0 rgba(150, 50, 0, 1),
    1px -1px 0 rgba(150, 50, 0, 1) !important;
  transform-origin: center bottom;
  animation-timing-function: steps(10);
  perspective-origin: center bottom;
}

.shadow-dokaben .nicoChat.ue *,
.shadow-dokaben .nicoChat.shita * {
  font-family: 'dokaben_ver2_1' !important;
}
.shadow-dokaben .nicoChat {
  text-shadow:
     1px  1px 0 rgba(0, 0, 0, 0.5),
    -1px  1px 0 rgba(0, 0, 0, 0.5),
    -1px -1px 0 rgba(0, 0, 0, 0.5),
     1px -1px 0 rgba(0, 0, 0, 0.5);
}


.nicoChat.ue, .nicoChat.shita {
  animation-name: fixed;
  visibility: hidden;
  will-change: transform, opacity;
}

.nicoChat.ue.html5, .nicoChat.shita.html5 {
  animation-name: show-hide;
  animation-timing-function: steps(20, jump-none);
}

.nicoChat.black, .nicoChat.black.fork1 {
  text-shadow:
   -1px -1px 0 ${textShadowGray},
   1px  1px 0 ${textShadowGray};
}

.nicoChat.ue,
.nicoChat.shita {
  display: inline-block;
  text-shadow: 0 0 3px #000;
}
.nicoChat.ue.black,
.nicoChat.shita.black {
  text-shadow: 0 0 3px #fff;
}

.nicoChat .type0655,
.nicoChat .zero_space {
  text-shadow: none;
  -webkit-text-stroke: unset;
  opacity: 0;
}

.nicoChat .han_space,
.nicoChat .zen_space {
  text-shadow: none;
  -webkit-text-stroke: unset;
  opacity: 0;
}

.debug .nicoChat .han_space,
.debug .nicoChat .zen_space {
  text-shadow: none;
  -webkit-text-stroke: unset;
  color: yellow;
  background: #fff;
  opacity: 0.3;
}

.debug .nicoChat .tab_space {
  text-shadow: none;
  -webkit-text-stroke: unset;
  background: #ff0;
  opacity: 0.3;
}

.nicoChat .invisible_code {
  text-shadow: none;
  -webkit-text-stroke: unset;
  opacity: 0;
}

.nicoChat .zero_space {
  text-shadow: none;
  -webkit-text-stroke: unset;
  opacity: 0;
}

.debug .nicoChat .zero_space {
  display: inline;
  position: absolute;
}
.debug .html5_zen_space {
  color: #888;
  opacity: 0.5;
}

.nicoChat .fill_space, .nicoChat .html5_fill_space {
  text-shadow: none;
  -webkit-text-stroke: unset !important;
  text-stroke: unset !important;
  background: currentColor;
}

.nicoChat .mesh_space {
  text-shadow: none;
  -webkit-text-stroke: unset;
}

.nicoChat .block_space, .nicoChat .html5_block_space {
  text-shadow: none;
}

.debug .nicoChat.ue {
  text-decoration: overline;
}

.debug .nicoChat.shita {
  text-decoration: underline;
}

.nicoChat.mine {
  border: 1px solid yellow;
}
.nicoChat.nicotta {
  border: 1px solid orange;
}

.nicoChat.updating {
  border: 1px dotted;
}

.nicoChat.fork1 {
  text-shadow:
   1px 1px 0 ${ownerShadowColor},
   -1px -1px 0 ${ownerShadowColor};
  -webkit-text-stroke: unset;
}
.nicoChat.ue.fork1,
.nicoChat.shita.fork1 {
  display: inline-block;
  text-shadow: 0 0 3px ${ownerShadowColor};
  -webkit-text-stroke: unset;
}

.nicoChat.fork2 {
  opacity: var(--easy-comment-opacity, ${easyCommentOpacity}) !important;
}

.nicoChat.fork3 {
  opacity: var(--ai-comment-opacity, ${aiCommentOpacity}) !important;
}

.nicoChat.blink {
  border: 1px solid #f00;
}

.nicoChat.subThread {
  filter: opacity(0.7);
}

@keyframes spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(3600deg); }
}

.nicoChat.updating::before {
  content: '❀';
  opacity: 0.8;
  color: #f99;
  display: inline-block;
  text-align: center;
  animation-name: spin;
  animation-iteration-count: infinite;
  animation-duration: 10s;
}

.nicoChat.updating::after {
  content: ' 通信中...';
  font-size: 50%;
  opacity: 0.8;
  color: #ccc;
}

.nicoChat.updating::after {
  animation-direction: alternate;
}

.nicoChat.fail {
  border: 1px dotted red;
  text-decoration: line-through;
}

.nicoChat.fail:after {
  content: ' 投稿失敗...';
  text-decoration: none;
  font-size: 80%;
  opacity: 0.8;
  color: #ccc;
}

.debug .nicoChat {
  outline: 1px outset;
}

spacer {
  visibility: hidden;
}
.debug spacer {
  visibility: visible;
  outline: 3px dotted orange;
}

.is-stalled *,
.paused *{
  animation-play-state: paused !important;
}

</style>
<style id="nicoChatAnimationDefinition">
%CSS%
</style>
</head>
<body style="background-color: unset !important; background: none !important;">
<div hidden="true" id="keyframesContainer"></div>
<div id="commentLayerOuter" class="commentLayerOuter">
<div class="commentLayer" id="commentLayer">%MSG%</div>
</div>
</body></html>
  `.trim();
})(Config as unknown as { props: Record<string, string> });

//===END===

export { NicoCommentCss3PlayerView };
