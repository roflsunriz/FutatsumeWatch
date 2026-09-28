import _ from 'lodash';
import { global } from '../futatsume-watch-index';
import { FrameLayer } from '../../packages/futatsume/src/parts/frame-layer';
import { CONSTANT } from '../constant';
import { Emitter } from '../baselib';
import { throttle } from '../../packages/lib/src/infra/bounce';
import { nicoUtil } from '../../packages/lib/src/nico/nico-util';
import { uq } from '../../packages/lib/src/u-query';
import { cssUtil } from '../../packages/lib/src/css/css';
import { env } from '../../packages/lib/src/infra/env';
import { ClassList } from '../../packages/lib/src/dom/class-list-wrapper';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import type { BounceCallback } from '../../packages/lib/src/infra/bounce';
import type { CommentListModel } from './comment-list-model';
import type { CommentListItem } from './comment-list-item';
import { CommentListItemView } from './comment-list-item-view';
import type { ClassListLike, Uq } from './types';

type CommentListItemViewInstance = InstanceType<typeof CommentListItemView>;

interface CommentListViewParams {
  className?: string;
  container?: Element | null;
  model?: CommentListModel;
  builder?: unknown;
  itemCss?: unknown;
}
export class CommentListView extends Emitter {
  declare private _ItemView: typeof CommentListItemView;
  declare private _itemCss: string;
  declare private _className: string;
  declare private _retryGetIframeCount: number;
  declare private _maxItems: number;
  declare private _inviewItemList: Map<number, CommentListItemViewInstance>;
  declare private _scrollTop: number;
  declare timeScrollTop: number;
  declare newItems: HTMLElement[];
  declare removedItems: HTMLElement[];
  declare private _innerHeight: number;
  declare private _model: CommentListModel | undefined;
  declare frameLayer: FrameLayer;
  declare contentWindow: Window;
  declare document: Document;
  declare body: HTMLElement;
  declare classList: ClassListLike;
  declare private _$body: Uq;
  declare private _container: Element;
  declare private _$container: Uq;
  declare private _list: HTMLElement;
  declare private _$menu: Uq;
  declare private _$itemDetail: Uq;
  declare private _html: string | undefined;
  declare isActive: boolean;
  declare isAutoScroll: boolean;
  declare private _itemViews: CommentListItemViewInstance[] | undefined;
  declare private _isFrameReady: boolean | undefined;
  declare private _appendFragment: DocumentFragment | undefined;
  declare private _debouncedOnItemClick: (e: Event, item: HTMLElement) => void;
  declare static ITEM_HEIGHT: number;
  declare static __css__: string;
  declare static __tpl__: string;
  constructor(params: CommentListViewParams) {
    super();
    this._ItemView = CommentListItemView;
    this._itemCss = CommentListItemView.CSS;
    this._className = params.className || 'commentList';

    this._retryGetIframeCount = 0;

    this._maxItems = 100000;
    this._inviewItemList = new Map();
    this._scrollTop = 0;
    this.timeScrollTop = 0;
    this.newItems = [];
    this.removedItems = [];
    this._innerHeight = 100;

    this._model = params.model;
    if (this._model) {
      this._model.on('update', _.debounce(this._onModelUpdate.bind(this), 500) as unknown as EmitterCallback);
    }

    // this.syncScrollTop = throttle.raf(this.syncScrollTop.bind(this));
    // BounceResult は thenable を返す型だが、戻値は従来どおり破棄する呼び出しのため誤検知として抑制する。
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.setScrollTop = throttle.raf(this.setScrollTop.bind(this) as unknown as BounceCallback);
    void this._initializeView(params);
  }
  async _initializeView(params?: CommentListViewParams): Promise<void> {
    const html = CommentListView.__tpl__.replace('%CSS%', this._itemCss);
    const frame = (this.frameLayer = new FrameLayer({
      container: params?.container as Element,
      html,
      className: 'commentListFrame',
    }));
    const contentWindow = await frame.wait();
    this._initFrame(contentWindow);
  }
  _initFrame(w: Window): void {
    this.contentWindow = w;
    const doc = (this.document = w.document);
    const body = (this.body = doc.body);
    const classList = (this.classList = ClassList(body) as ClassListLike);
    const $body = (this._$body = uq(body) as unknown as Uq);
    if (this._className) {
      classList.add(this._className);
    }
    this._container = doc.querySelector('#listContainer') as Element;
    this._$container = uq(this._container) as unknown as Uq;
    this._list = doc.getElementById('listContainerInner') as HTMLElement;
    if (this._html) {
      this._list.innerHTML = this._html;
    }
    this._$menu = $body.find('.listMenu');

    this._$itemDetail = $body.find('.itemDetailContainer');

    $body
      .on('click', this._onClick.bind(this))
      .on('dblclick', this._onDblClick.bind(this))
      .on('keydown', (e: Event) => global.emitter.emit('keydown', e))
      .on('keyup', (e: Event) => global.emitter.emit('keyup', e))
      .toggleClass('is-guest', !nicoUtil.isLogin())
      .toggleClass('is-premium', nicoUtil.isPremium())
      .toggleClass('is-firefox', env.isFirefox());
    // this.frameLayer.addEventBridge('keydown').addEventBridge('keyup');
    this.frameLayer.frame.addEventListener('visibilitychange', (e: Event) => {
      const { isVisible } = (e as CustomEvent<{ isVisible: boolean }>).detail;
      if (!isVisible) {
        return;
      }
      if (this.isAutoScroll) {
        this.setScrollTop(this.timeScrollTop);
      }
      this._refreshInviewElements();
    });

    this._$menu.on('click', this._onMenuClick.bind(this));
    this._$itemDetail.on('click', this._onItemDetailClick.bind(this));

    this._onScroll = this._onScroll.bind(this);
    this._onScrolling = _.throttle(this._onScrolling.bind(this), 100);
    this._onScrollEnd = _.debounce(this._onScrollEnd.bind(this), 500);
    this._container.addEventListener('scroll', this._onScroll.bind(this), { passive: true });

    this._$container
      .on('mouseover', this._onMouseOver.bind(this))
      .on('mouseleave', this._onMouseOut.bind(this))
      .on('wheel', _.throttle(this._onWheel.bind(this), 100), { passive: true });

    w.addEventListener('resize', this._onResize.bind(this));
    this._innerHeight = w.innerHeight;

    this._refreshInviewElements = _.throttle(this._refreshInviewElements.bind(this), 100);
    // BounceResult は thenable を返す型だが、戻値は従来どおり破棄する呼び出しのため誤検知として抑制する。
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this._appendNewItems = throttle.raf(this._appendNewItems.bind(this));
    // cssUtil.registerProps(
    // {name: '--current-time', syntax: '<time>', initialValue: cssUtil.s(0), inherits: true, window: w},
    // {name: '--duration', syntax: '<time>', initialValue: cssUtil.s(4), inherits: true, window: w},
    // {name: '--scroll-top',   syntax: '<number>', initialValue: 0, inherits: true, window: w},
    // {name: '--time-scroll-top',   syntax: '<number>', initialValue: 0, inherits: true, window: w},
    // {name: '--inner-height', syntax: '<number>', initialValue: 0, inherits: true, window: w},
    // {name: '--list-height', syntax: '<number>', initialValue: 0, inherits: true, window: w},
    // {name: '--height-pp', syntax: '<length>', initialValue: cssUtil.px(0), inherits: true, window: w},
    // {name: '--trans-y-pp', syntax: '<length>', initialValue: cssUtil.px(0), inherits: true, window: w},
    // {name: '--vpos-time', syntax: '<time>', initialValue: cssUtil.s(0), inherits: true, window: w}
    // );
    void cssUtil.setProps([body, '--inner-height', this._innerHeight]);
    this._debouncedOnItemClick = _.debounce(this._onItemClick.bind(this), 300);

    // 互換用
    global.debug.$commentList = uq(this._list);
    global.debug.getCommentPanelItems = () => Array.from(doc.querySelectorAll('.commentListItem'));
    void this.emitResolve('frame-ready');
  }
  async _onModelUpdate(itemList: CommentListItem | CommentListItem[], replaceAll?: boolean): Promise<void> {
    if (!this._isFrameReady) {
      await this.promise('frame-ready');
    }
    this._isFrameReady = true;

    this.addClass('updating');
    itemList = Array.isArray(itemList) ? itemList : [itemList];
    this.isActive = false;

    if (replaceAll) {
      this._scrollTop = this._container ? this._container.scrollTop : 0;
    }

    const itemViews = itemList.map(
      (item, i) => new this._ItemView({ item: item, index: i, height: CommentListView.ITEM_HEIGHT })
    );

    this._itemViews = itemViews;

    await cssUtil.setProps([
      this.body,
      '--list-height',
      Math.max(CommentListView.ITEM_HEIGHT * itemViews.length, this._innerHeight) + 100,
    ]);

    if (!this._list) {
      return;
    }
    this._list.textContent = '';
    this._inviewItemList.clear();
    this._$menu.removeClass('show');
    this._refreshInviewElements();
    this.hideItemDetail();

    window.setTimeout(() => {
      this.removeClass('updating');
      this.emit('update');
    }, 100);
  }
  _onClick(e: Event): void {
    e.stopPropagation();
    void global.emitter.emitAsync('hideHover');
    const item = (e.target as unknown as Element).closest<HTMLElement>('.commentListItem');
    if (item) {
      return this._debouncedOnItemClick(e, item);
    }
  }
  _onItemClick(e: Event, item: HTMLElement): void {
    if ((e.target as unknown as Element).closest('.nicoru-icon')) {
      this.emit('command', 'nicoru', item, item.dataset.itemId);
      return;
    }
    this._$menu
      .css('transform', `translate(0, ${item.dataset.top}px)`)
      .attr('data-item-id', item.dataset.itemId)
      .attr('data-is-mine', item.dataset.isMine)
      .addClass('show');
  }
  _onMenuClick(e: Event): void {
    const target = (e.target as unknown as Element).closest<HTMLElement>('.comment-row-action');
    this._$menu.removeClass('show');
    if (!target) {
      return;
    }
    const { itemId } = ((e.target as unknown as Element).closest<HTMLElement>('.listMenu') as HTMLElement).dataset;
    if (!itemId) {
      return;
    }

    const { command } = target.dataset;

    if (command === 'addUserIdFilter' || command === 'addWordFilter') {
      Array.from(this._list.querySelectorAll(`.item${itemId}`)).forEach((e) => e.remove());
    }

    this.emit('command', command, null, itemId);
  }
  _onItemDetailClick(e: Event): void {
    const target = (e.target as unknown as Element).closest<HTMLElement>('.command');
    if (!target) {
      return;
    }
    const itemId = this._$itemDetail.attr('data-item-id');
    if (!itemId) {
      return;
    }
    const { command, param } = target.dataset;
    if (command === 'hideItemDetail') {
      return this.hideItemDetail();
    }
    if (command === 'reloadComment') {
      this.hideItemDetail();
    }
    this.emit('command', command, param, itemId);
  }
  _onDblClick(e: Event): void {
    e.stopPropagation();
    const item = (e.target as unknown as Element).closest<HTMLElement>('.commentListItem');
    if (!item) {
      return;
    }
    e.preventDefault();

    const itemId = item.dataset.itemId;
    this.emit('command', 'select', null, itemId);
  }
  _onMouseMove() {
    this.isActive = true;
    this.addClass('is-active');
  }
  _onMouseOver() {
    this.isActive = true;
    this.addClass('is-active');
  }
  _onWheel() {
    this.isActive = true;
    // this.syncScrollTop();
    this.addClass('is-active');
  }
  _onMouseOut() {
    this.isActive = false;
    // this.syncScrollTop();
    this.removeClass('is-active');
  }
  _onResize(): void {
    this._innerHeight = this.contentWindow.innerHeight;
    void cssUtil.setProps([this.body, '--inner-height', this._innerHeight]);
    // this.syncScrollTop();
    this._refreshInviewElements();
  }
  _onScroll(): void {
    if (!this.hasClass('is-scrolling')) {
      this.addClass('is-scrolling');
    }
    // self.console.log('scroll', this._container.scrollTop, e);
    this._onScrolling();
    this._onScrollEnd();
  }
  _onScrolling() {
    this.syncScrollTop();
    this._refreshInviewElements();
  }
  _onScrollEnd() {
    this.removeClass('is-scrolling');
    // this.syncScrollTop();
  }
  _refreshInviewElements() {
    if (!this._list || !this.frameLayer.isVisible) {
      return;
    }
    const itemHeight = CommentListView.ITEM_HEIGHT;
    const scrollTop = this._scrollTop;
    const innerHeight = this._innerHeight;
    const windowBottom = scrollTop + innerHeight;
    const itemViews = this._itemViews || [];
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 10);
    const endIndex = Math.min(itemViews.length, Math.floor(windowBottom / itemHeight) + 10);
    let changed = 0;
    const newItems = this.newItems,
      inviewItemList = this._inviewItemList;
    for (let i = startIndex; i < endIndex; i++) {
      if (inviewItemList.has(i) || !itemViews[i]) {
        continue;
      }
      changed++;
      newItems.push(itemViews[i]!.viewElement);
      inviewItemList.set(i, itemViews[i]!);
    }

    const removedItems = this.removedItems;
    for (const i of inviewItemList.keys()) {
      if (i >= startIndex && i <= endIndex) {
        continue;
      }
      changed++;
      removedItems.push(inviewItemList.get(i)!.viewElement);
      inviewItemList.delete(i);
    }

    if (changed < 1) {
      return;
    }

    this._appendNewItems();
  }
  _appendNewItems() {
    if (this.removedItems.length) {
      for (const e of this.removedItems) {
        e.remove();
      }
      this.removedItems.length = 0;
    }
    if (!this.newItems.length) {
      return;
    }
    const f = (this._appendFragment = this._appendFragment || document.createDocumentFragment());
    f.append(...this.newItems);
    this._list.append(f);
    for (const e of this.newItems) {
      e.style.contentVisibility = 'visible';
    }
    this.newItems.length = 0;
  }
  _updatePerspective() {
    const keys = Object.keys(this._inviewItemList);
    let avr = 0;
    if (!this._inviewItemList.size) {
      avr = 50;
    } else {
      let min = 0xffff;
      let max = -0xffff;
      keys.forEach((key) => {
        const item = this._inviewItemList.get(key as unknown as number)!;
        min = Math.min(min, item.time3dp);
        max = Math.max(max, item.time3dp);
        avr += item.time3dp;
      });
      avr = (avr / keys.length) * 100 + 50; //max * 100; //(min + max) / 2 + 10; //50 + avr / keys.length;
    }
    this._list.style.transform = `translateZ(-${avr}px)`;
  }
  addClass(className: string): void {
    if (this.classList) {
      this.classList.add(className);
    }
  }
  removeClass(className: string): void {
    if (this.classList) {
      this.classList.remove(className);
    }
  }
  toggleClass(className: string, v: boolean): void {
    if (this.classList) {
      this.classList.toggle(className, v);
    }
  }
  hasClass(className: string): boolean {
    return this.classList.contains(className);
  }
  find(query: string): NodeListOf<Element> {
    return this.document.querySelectorAll(query);
  }
  syncScrollTop() {
    if (!this.contentWindow || !this.frameLayer.isVisible) {
      return;
    }
    if (this.isActive) {
      this._scrollTop = this._container.scrollTop;
    }
  }
  setScrollTop(v: number): void {
    if (!this.contentWindow) {
      return;
    }
    this._scrollTop = v;
    if (!this.frameLayer.isVisible) {
      return;
    }
    // this._container.removeEventListener('scroll', this._onScroll);
    this._container.scrollTop = v;
    // this._container.addEventListener('scroll', this._onScroll, {passive: true});
  }
  setCurrentPoint(sec: number, idx: number, isAutoScroll: boolean): void {
    if (!this.contentWindow || !this._itemViews || !this.frameLayer.isVisible) {
      return;
    }
    const innerHeight = this._innerHeight;
    const itemViews = this._itemViews;
    const len = itemViews.length;
    const view = itemViews[idx];
    if (len < 1 || !view) {
      return;
    }

    const itemHeight = CommentListView.ITEM_HEIGHT;
    const top = Math.max(0, view.top - innerHeight + itemHeight);
    this.timeScrollTop = top;
    this.isAutoScroll = isAutoScroll;
    // cssUtil.setProps(
    //   [this.body, '--time-scroll-top', top],
    //   [this.body, '--current-time', css.s(sec)]
    // );
    if (!this.isActive && isAutoScroll) {
      this.setScrollTop(top);
    }
  }
  showItemDetail(item: CommentListItem): void {
    const $d = this._$itemDetail;
    $d.attr('data-item-id', item.itemId);
    $d.find('.resNo')
      .text(item.no)
      .end()
      .find('.vpos')
      .text(item.timePos)
      .end()
      .find('.time')
      .text(item.formattedDate)
      .end()
      .find('.userId')
      .text(item.userId)
      .end()
      .find('.cmd')
      .text(item.cmd)
      .end()
      .find('.text')
      .text(item.text)
      .end()
      .addClass('show');
    global.debug.$itemDetail = $d;
  }
  hideItemDetail(): void {
    this._$itemDetail.removeClass('show');
  }
}
CommentListView.ITEM_HEIGHT = 40;

CommentListView.__css__ = '';

CommentListView.__tpl__ = `
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>CommentList</title>
<style type="text/css">
  ${CONSTANT.BASE_CSS_VARS}

  body {
    user-select: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  body .is-debug {
    perspective: 100px;
    perspective-origin: left top;
    transition: perspective 0.2s ease;
  }

  body.is-scrolling #listContainerInner *{
    pointer-events: none;
  }

  .is-firefox .virtualScrollBarContainer {
    content: '';
    position: fixed;
    top: 0;
    right: 0;
    width: 16px;
    height: 100vh;
    background: rgba(0, 0, 0, 0.6);
    z-index: 100;
    contain: strict;
    pointer-events: none;
  }

  #listContainer {
    position: absolute;
    top: -1px;
    left:0;
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
    overflow-y: scroll;
    overflow-x: hidden;
    overscroll-behavior: none;
    will-change: transform;
    scrollbar-width: thin;
    scrollbar-color: #526173 #131923;
  }
  .is-firefox #listContainer {
    will-change: auto;
  }

  #listContainerInner {
    height: calc(var(--list-height) * 1px);
    min-height: calc(100vh + 100px);
  }

  .is-debug #listContainerInner {
    transform-style: preserve-3d;
    transform: translateZ(-50px);
    transition: transform 0.2s;
  }

  #listContainerInner:empty::after {
    content: 'コメントは空です';
    color: #666;
    display: inline-block;
    text-align: center;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .is-guest .forMember {
    display: none !important;
  }

  .itemDetailContainer {
    position: fixed;
    display: block;
    top: 50%;
    left: 50%;
    line-height: normal;
    min-width: 280px;
    max-height: 100%;
    overflow-y: scroll;
    overscroll-behavior: none;
    font-size: 14px;
    transform: translate(-50%, -50%);
    opacity: 0;
    pointer-events: none;
    z-index: 100;
    border: 2px solid #fc9;
    background-color: rgba(255, 255, 232, 0.9);
    box-shadow: 4px 4px 0 rgba(99, 99, 66, 0.8);
    transition: opacity 0.2s;
  }

  .itemDetailContainer.show {
    opacity: 1;
    pointer-events: auto;
  }
  .itemDetailContainer>* {
  }
  .itemDetailContainer * {
    word-break: break-all;
  }
  .itemDetailContainer .reloadComment {
    display: inline-block;
    padding: 0 4px;
    cursor: pointer;
    transform: scale(1.4);
    transition: transform 0.1s;
  }
  .itemDetailContainer .reloadComment:hover {
    transform: scale(1.8);
  }
  .itemDetailContainer .reloadComment:active {
    transform: scale(1.2);
    transition: none;
  }
  .itemDetailContainer .resNo,
  .itemDetailContainer .vpos,
  .itemDetailContainer .time,
  .itemDetailContainer .userId,
  .itemDetailContainer .cmd {
    font-size: 12px;
  }
  .itemDetailContainer .time {
    cursor: pointer;
    color: #339;
  }
  .itemDetailContainer .time:hover {
    text-decoration: underline;
  }
  .itemDetailContainer .time:hover:after {
    position: absolute;
    content: '${'\\00231A'} 過去ログ';
    right: 16px;
    text-decoration: none;
    transform: scale(1.4);
  }
  .itemDetailContainer .resNo:before,
  .itemDetailContainer .vpos:before,
  .itemDetailContainer .time:before,
  .itemDetailContainer .userId:before,
  .itemDetailContainer .cmd:before {
    display: inline-block;
    min-width: 50px;
  }
  .itemDetailContainer .resNo:before {
    content: 'no';
  }
  .itemDetailContainer .vpos:before {
    content: 'pos';
  }
  .itemDetailContainer .time:before {
    content: 'date';
  }
  .itemDetailContainer .userId:before {
    content: 'user';
  }
  .itemDetailContainer .cmd:before {
    content: 'cmd';
  }
  .itemDetailContainer .text {
    border: 1px inset #ccc;
    padding: 8px;
    margin: 4px 8px;
  }
  .itemDetailContainer .close {
    border: 2px solid #666;
    width: 50%;
    cursor: pointer;
    text-align: center;
    margin: auto;
    user-select: none;
  }

  .is-firefox .timeBar { display: none !important; }
  /*.timeBar {
    position: fixed;
    visibility: hidden;
    z-index: 110;
    right: 0;
    top: 1px;
    width: 14px;
    --height-pp:  calc(1px * var(--inner-height) * var(--inner-height) / var(--list-height));
    --trans-y-pp: calc((1px * var(--inner-height) - var(--height-pp)) * var(--time-scroll-top) / var(--list-height));
    min-height: 10px;
    height: var(--height-pp);
    max-height: 100vh;
    transform: translateY(var(--trans-y-pp));
    pointer-events: none;
    will-change: transform;
    border: 1px dashed #e12885;
    opacity: 0.8;
  }
  .timeBar::after {
    width: calc(100% + 6px);
    height: calc(100% + 6px);
    left: -3px;
    top: -3px;
    content: '';
    position: absolute;
    border: 2px solid #2b2b2b;
    outline: 2px solid #2b2b2b;
    outline-offset: -5px;
    box-sizing: border-box;
  }*/
  body:hover .timeBar {
    visibility: visible;
  }
  .virtualScrollBar {
    display: none;
  }
/*
  .is-firefox .virtualScrollBar {
    display: inline-block;
    position: fixed;
    z-index: 100;
    right: 0;
    top: 0px;
    width: 16px;
    --height-pp: calc( 1px * var(--inner-height) * var(--inner-height) / var(--list-height) );
    --trans-y-pp: calc( 1px * var(--inner-height) * var(--scroll-top) / var(--list-height));
    height: var(--height-pp);
    background: #039393;
    max-height: 100vh;
    transform: translateY(var(--trans-y-pp));
    pointer-events: none;
    will-change: transform;
    z-index: 110;
  }
*/
</style>
<style id="listItemStyle">%CSS%</style>
<body class="futatsumeRoot">
  <div class="itemDetailContainer">
    <div class="resNo"></div>
    <div class="vpos"></div>
    <div class="time command" data-command="reloadComment"></div>
    <div class="userId"></div>
    <div class="cmd"></div>
    <div class="text"></div>
    <div class="command close" data-command="hideItemDetail">O K</div>
  </div>
  <div class="virtualScrollBarContainer"><div class="virtualScrollBar"></div></div><div class="timeBar"></div>
  <div id="listContainer">
    <div class="listMenu">
      <span class="comment-row-action itemDetailRequest" data-command="itemDetailRequest" title="詳細">？</span>
      <span class="comment-row-action removeComment"     data-command="removeComment" title="コメントを削除">delete</span>
      <span class="comment-row-action clipBoard"         data-command="clipBoard" title="クリップボードにコピー">copy</span>
      <span class="comment-row-action addUserIdFilter"   data-command="addUserIdFilter" title="NGユーザー">NGuser</span>
      <span class="comment-row-action addWordFilter"     data-command="addWordFilter" title="NG正規表現へ追加">NGword</span>
    </div>
    <div id="listContainerInner"></div>
  </div>
</body>
</html>

  `.trim();
