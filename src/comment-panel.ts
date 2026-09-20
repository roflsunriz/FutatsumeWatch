import _ from 'lodash';
import { global } from './futatsume-watch-index';
import { BaseViewComponent } from './util';
import { FrameLayer } from '../packages/futatsume/src/parts/frame-layer';
import { CONSTANT } from './constant';
import { Emitter } from './baselib';
import { throttle } from '../packages/lib/src/infra/bounce';
import { textUtil } from '../packages/lib/src/text/text-util';
import { nicoUtil } from '../packages/lib/src/nico/nico-util';
import { css } from '../packages/lib/src/css/css';
import { uq } from '../packages/lib/src/u-query';
import { Clipboard } from '../packages/lib/src/dom/clipboard';
import { cssUtil } from '../packages/lib/src/css/css';
import { env } from '../packages/lib/src/infra/env';
import { ClassList } from '../packages/lib/src/dom/class-list-wrapper';
import type { NicoVideoPlayer } from './nico-video-player';
import type { EmitterCallback } from '../packages/lib/src/emitter';
import type { BounceCallback } from '../packages/lib/src/infra/bounce';

// コメントパネルと本体で同じアイコンを使用する。
import { NICORU } from './nicoru-icon';

// uq（u-query.js）は実行時に配列サブクラスのラッパーを返すが、
// ファクトリ本体の推論型は any[] のため、利用する表面だけを構造的に宣言する。
// （実体・呼び出しは変えない。型注釈のみの追加）
interface UqRaf {
  toggleClass(className: string, force?: boolean): Uq;
  addClass(className: string): Uq;
  removeClass(className: string): Uq;
  css(key: string, value: string): Uq;
}

// uq が返す配列ラッパーのうち利用する表面だけを構造的に宣言する。
// Array 継承は find 等の衝突を招くため、添字と利用メソッドのみ持つ。
interface Uq {
  [index: number]: Element | undefined;
  on(event: string, listener: unknown, options?: unknown): Uq;
  find(query: string): Uq;
  css(key: string, value: string): Uq;
  attr(key: string, value: string | number | undefined): Uq;
  attr(key: string): string | null;
  text(value: string | number): Uq;
  addClass(className: string): Uq;
  removeClass(className: string): Uq;
  toggleClass(className: string, force?: boolean): Uq;
  hasClass(className: string): boolean;
  hasFocus(): boolean;
  val(): string;
  val(value: string): Uq;
  focus(): Uq;
  blur(): Uq;
  prop(name: string, value?: unknown): unknown;
  append(child: unknown): Uq;
  appendTo(target: unknown): Uq;
  end(): Uq;
  raf: UqRaf;
}

interface UqFactory {
  (query: unknown, ...args: unknown[]): Uq;
  html(html: string): Uq;
}

interface ClassListLike {
  add(className: string): void;
  remove(className: string): void;
  toggle(className: string, force?: boolean): void;
  contains(className: string): boolean;
}

type CommentListItemViewInstance = InstanceType<typeof CommentListItemView>;

interface CommentListModelParams {
  uniq?: boolean;
  maxItems?: number;
}

interface NicoChatItem {
  vpos: string;
  text: string;
  userId: string;
  date: number;
  fork: number;
  no: number;
  color: string;
  fontCommand: string;
  isSubThread: boolean;
  cmd: string;
  uniqNo: string;
  threadId: string;
  time3d: number;
  time3dp: number;
  nicoru: number;
  nicotta: boolean;
  duration: number;
  valhalla: string;
  isMine: boolean;
}

interface ChatListData {
  top: NicoChatItem[];
  naka: NicoChatItem[];
  bottom: NicoChatItem[];
}

interface CommentListViewParams {
  className?: string;
  container?: Element | null;
  model?: CommentListModel;
  builder?: unknown;
  itemCss?: unknown;
}

interface CommentListItemViewParams {
  item: CommentListItem;
  index: number;
  height: number;
}

interface CommentPanelViewParams {
  $container: Uq;
  model: CommentListModel;
  commentPanel: CommentPanel;
  builder?: unknown;
  itemCss?: unknown;
}

interface CommentPanelParams {
  loader?: unknown;
  $container: Uq;
  player: NicoVideoPlayer;
  autoScroll?: boolean;
  language?: string;
}

interface ThreadInfo {
  threadId: number;
  isWaybackMode: boolean;
  when: number;
}

interface TimeMachineViewParams {
  parentNode: Element | null;
}

type TimeMachineState = {
  isWaybackMode: boolean;
  isSelecting: boolean;
};

type TimeMachineElements = {
  time: HTMLElement;
  back: HTMLElement;
  input: HTMLInputElement;
  submit: HTMLElement;
  cancel: HTMLElement;
};

//===BEGIN===

class CommentListModel extends Emitter {
  declare private _isUniq: boolean | undefined;
  declare private _items: CommentListItem[];
  declare private _positions: number[];
  declare private _maxItems: number;
  declare private _currentSortKey: string;
  declare private _isDesc: boolean | undefined;
  declare private _currentTime: number;
  declare private _currentIndex: number;
  constructor(params: CommentListModelParams) {
    super();
    this._isUniq = params.uniq;
    this._items = [];
    this._positions = [];
    this._maxItems = params.maxItems || 100;
    this._currentSortKey = 'vpos';
    this._isDesc = false;
    this._currentTime = 0;
    this._currentIndex = -1;
  }
  setItem(itemList: CommentListItem | CommentListItem[]): void {
    this._items = Array.isArray(itemList) ? itemList : [itemList];
  }
  clear(): this | undefined {
    this._items = [];
    this._positions = [];
    this._currentTime = 0;
    this._currentIndex = -1;
    this.emit('update', [], true);
    return undefined;
  }
  setChatList(chatList: ChatListData): void {
    const list = chatList.top.concat(chatList.naka, chatList.bottom);
    const items: CommentListItem[] = [];
    const positions: number[] = [];
    for (let i = 0, len = list.length; i < len; i++) {
      items.push(new CommentListItem(list[i] as NicoChatItem));
      positions.push(parseFloat((list[i] as NicoChatItem).vpos) / 100);
    }
    this._items = items;
    this._positions = positions.sort((a, b) => a - b);
    this._currentTime = 0;
    this._currentIndex = -1;

    this.sort();
    this.emit('update', this._items, true);
  }
  removeItemByIndex(index: number): void {
    const target = this._getItemByIndex(index);
    if (!target) {
      return;
    }
    this._items = this._items.filter((item) => item !== target);
  }
  get length(): number {
    return this._items.length;
  }
  _getItemByIndex(index: number): CommentListItem | undefined {
    return this._items[index];
  }
  indexOf(item: CommentListItem): number {
    return (this._items || []).indexOf(item);
  }
  getItemByIndex(index: number): CommentListItem | null {
    const item = this._getItemByIndex(index);
    if (!item) {
      return null;
    }
    return item;
  }
  findByItemId(itemId: string): CommentListItem | undefined {
    const id = parseInt(itemId, 10);
    return this._items.find((item) => item.itemId === id);
  }
  removeItem(item: CommentListItem): void {
    const beforeLen = this._items.length;
    this._items = this._items.filter((i) => i !== item); //_.pull(this._items, item);
    const afterLen = this._items.length;
    if (beforeLen !== afterLen) {
      this.emit('update', this._items);
    }
  }
  _onItemUpdate(item: CommentListItem, key: string, value: unknown): void {
    this.emit('itemUpdate', item, key, value);
  }
  sortBy(key: string, isDesc?: boolean): void {
    const table = {
      vpos: 'vpos',
      date: 'date',
      text: 'text',
      user: 'userId',
      nicoru: 'nicoru',
    };
    const func = table[key as keyof typeof table];
    if (!func) {
      return;
    }
    this._items = _.sortBy(this._items, (item) => item[func as keyof CommentListItem]);
    if (isDesc) {
      this._items.reverse();
    }
    this._currentSortKey = key;
    this._isDesc = isDesc;
    this.onUpdate(true);
  }
  sort(): void {
    this.sortBy(this._currentSortKey, this._isDesc);
  }
  get currentSortKey(): string {
    return this._currentSortKey;
  }
  onUpdate(replaceAll = false): void {
    this.emitAsync('update', this._items, replaceAll);
  }
  getInViewIndex(sec: number): number {
    return Math.max(0, _.sortedLastIndex(this._positions, sec + 1) - 1);
  }
  set currentTime(sec: number) {
    if (this._currentTime !== sec && typeof sec === 'number') {
      this._currentTime = sec;
      const inviewIndex = this.getInViewIndex(sec);
      if (this._currentSortKey === 'vpos' && this._currentIndex !== inviewIndex) {
        this.emit('currentTimeUpdate', sec, inviewIndex);
      }
      this._currentIndex = inviewIndex;
    }
  }
  get currentTime() {
    return this._currentTime;
  }
}

/**
 * DOM的に隔離したiframeの中に生成する。
 * かなり実験要素が多いのでまだまだ変わる。
 */
class CommentListView extends Emitter {
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

    window.console.time('update commentlistView');
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

    window.console.timeEnd('update commentlistView');
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
      <span class="comment-row-action addWordFilter"     data-command="addWordFilter" title="NGワード">NGword</span>
    </div>
    <div id="listContainerInner"></div>
  </div>
</body>
</html>

  `.trim();

const CommentListItemView = (() => {
  // なんか汎用性を持たせようとして失敗してる奴

  // ここはDOM的に隔離されてるので外部要因との干渉を考えなくてよい
  const CSS = `
      * {
        box-sizing: border-box;
      }

      body {
        background: #000;
        margin: 0;
        padding: 0;
        overflow: hidden;
        line-height: 0;
      }

      ${CONSTANT.SCROLLBAR_CSS}

      .listMenu {
        position: absolute;
        width: 100%;
        right: 0;
        z-index: 100;

        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        gap: 8px;
        padding-inline: 8px;
      }

      .listMenu:not(.show) {
        display: none;
      }

      .listMenu  .comment-row-action {
        font-size: 13px;
        line-height: 20px;
        border: 1px solid #666;
        color: #fff;
        background: #666;
        cursor: pointer;
        text-align: center;
        width: 48px;
      }

      .listMenu .comment-row-action:hover {
        border: 1px solid #ccc;
        box-shadow: 2px 2px 2px #333;
      }

      .listMenu .comment-row-action:active {
        box-shadow: none;
        transform: translate(0, 1px);
      }

      .listMenu .itemDetailRequest {
        width: auto;
        padding: 0 8px;
      }

      /* 自分の投稿をNGに突っ込む奴いるのかな？とは思いつつ残す。どっかで消すかなんかしたい
      .listMenu[data-is-mine="true"] .addWordFilter {
        display: none;
      }

      .listMenu[data-is-mine="true"] .addUserIdFilter {
        display: none;
      }*/

      .listMenu:not([data-is-mine="true"]) .removeComment {
        display: none;
      }

      .commentListItem {
        position: absolute;
        display: inline-block;
        will-change: transform;
        width: 100%;
        height: 40px;
        line-height: 20px;
        font-size: 20px;
        white-space: nowrap;
        margin: 0;
        padding: 0;
        background: #131923;
        z-index: 50;
        contain: strict;
      }
      .is-firefox .commentListItem {
        contain: layout !important;
        width: calc(100vw - 16px);
        will-change: auto;
      }

      .is-active .commentListItem {
        pointer-events: auto;
      }

      .commentListItem * {
        cursor: default;
      }

      .commentListItem.odd {
        background: #19212e;
      }
      .commentListItem[data-nicoru] {
        background: #332;
      }
      .commentListItem.odd[data-nicoru] {
        background: #443;
      }
      .commentListItem[data-nicoru]:hover::before {
        position: absolute;
        content: attr(data-nicoru);
        color: #ccc;
        font-size: 12px;
        left: 80px;
      }
      .commentListItem .nicoru-icon {
        position: absolute;
        pointer-events: auto;
        display: inline-block;
        cursor: pointer;
        visibility: hidden;
        transition: transform 0.2s linear, filter 0.2s;
        transform-origin: center;
        left: 50px;
        top: -2px;
        width: 24px;
        height: 24px;
        contain: strict;
      }
      .commentListItem:hover .nicoru-icon {
        visibility: visible;
      }
      .commentListItem.nicotta .nicoru-icon {
        visibility: visible;
        transform: rotate(270deg);
        filter: drop-shadow(0px 0px 6px gold);
        pointer-events: none;
      }

      .commentListItem.updating {
        opacity: 0.5;
        cursor: wait;
      }

      .commentListItem .info {
        display: flex;
        justify-content: space-between;
        width: 100%;
        font-size: 14px;
        height: 20px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: #aab4c6;
        margin: 0;
        padding: 0 8px 0;
      }
      .commentListItem[data-valhalla="1"] .info {
        color: #f88;
      }
      .commentListItem .timepos {
        display: inline-block;
        width: 100px;
      }

      .commentListItem .text {
        display: block;
        font-size: 16px;
        height: 20px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: #ccc;
        margin: 0;
        padding: 0 8px;
        font-family: '游ゴシック', 'Yu Gothic', 'YuGothic', arial, 'Menlo';
        font-feature-settings: "palt" 1;
      }
      .commentListItem[data-valhalla="1"] .text {
        color: red;
        font-weight: bold;
      }

      .is-active .commentListItem:hover {
        overflow-x: hidden;
        overflow-y: visible;
        z-index: 60;
        height: auto;
        box-shadow: 2px 2px 2px #000, 2px -2px 2px #000;
        contain: layout style paint;
      }

      .is-active .commentListItem:hover .text {
        white-space: normal;
        word-break: break-all;
        height: auto;
      }

      .commentListItem.fork1 .timepos {
        text-shadow: 1px 1px 0 #008800, -1px -1px 0 #008800 !important;
      }
      .commentListItem:where(.fork2, .fork3) .timepos {
        opacity: 0.6;
      }
      .commentListItem.fork1 .text {
        font-weight: bolder;
      }

      .commentListItem.subThread {
        opacity: 0.6;
      }

      .commentListItem.is-active {
        outline: dashed 2px #ff8;
        outline-offset: 4px;
      }

      .font-gothic .text {font-family: "游ゴシック", "Yu Gothic", 'YuGothic', "ＭＳ ゴシック", "IPAMonaPGothic", sans-serif, Arial, Menlo;}
      .font-mincho .text {font-family: "游明朝体", "Yu Mincho", 'YuMincho', Simsun, Osaka-mono, "Osaka−等幅", "ＭＳ 明朝", "ＭＳ ゴシック", "モトヤLシーダ3等幅", 'Hiragino Mincho ProN', monospace;}
      .font-defont .text {font-family: 'Yu Gothic', 'YuGothic', "ＭＳ ゴシック", "MS Gothic", "Meiryo", "ヒラギノ角ゴ", "IPAMonaPGothic", sans-serif, monospace, Menlo; }
/*
      .commentListItem .progress-negi {
        position: absolute;
        width: 2px;
        height: 100%;
        bottom: 0;
        right: 0;
        pointer-events: none;
        background: #888;
        will-change: transform;
        animation-duration: var(--duration);
        animation-delay: calc(var(--vpos-time) - var(--current-time) - 1s);
        animation-name: negi-moving;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
        animation-play-state: paused !important;
        contain: paint layout style size;
      }
      @keyframes negi-moving {
        0% { background: #ebe194;}
        50% { background: #fff; }
        80% { background: #fff; }
        100% { background: #039393; }
      }
*/
    `.trim();

  const TPL = `
      <div class="commentListItem" style="position: absolute;">
        <img src="${NICORU}" class="nicoru-icon" data-command="nicoru" title="Nicorü">
        <p class="info">
          <span class="timepos"></span>&nbsp;&nbsp;<span class="date"></span>
        </p>
        <p class="text"></p>
        <span class="progress-negi" style="position: absolute; will-change: transform; contain: strict;"></span>
      </div>
    `.trim();

  let counter = 0;
  let template:
    | {
        t: HTMLTemplateElement;
        clone: () => HTMLElement | null;
        commentListItem: HTMLElement;
        timepos: HTMLElement;
        date: HTMLElement;
        text: HTMLElement;
      }
    | undefined;

  class CommentListItemView {
    declare private _item: CommentListItem;
    declare private _index: number;
    declare private _height: number;
    declare private _id: number;
    declare private _view: HTMLElement | null;
    declare static TPL: string;
    declare static CSS: string;
    static get template(): {
      t: HTMLTemplateElement;
      clone: () => HTMLElement | null;
      commentListItem: HTMLElement;
      timepos: HTMLElement;
      date: HTMLElement;
      text: HTMLElement;
    } {
      if (!template) {
        const t = document.createElement('template');
        t.id = 'CommentListItemView-template' + Date.now();
        t.innerHTML = TPL;
        // document.body.append(t);
        template = {
          t,
          clone: () => {
            return document.importNode(t.content, true).firstChild as HTMLElement | null;
          },
          commentListItem: t.content.querySelector('.commentListItem') as HTMLElement,
          timepos: t.content.querySelector('.timepos') as HTMLElement,
          date: t.content.querySelector('.date') as HTMLElement,
          text: t.content.querySelector('.text') as HTMLElement,
        };
      }
      return template;
    }

    constructor(params: CommentListItemViewParams) {
      this.initialize(params);
    }

    initialize(params: CommentListItemViewParams): void {
      this._item = params.item;
      this._index = params.index;
      this._height = params.height;

      this._id = counter++;
    }

    build(): void {
      const template = (this.constructor as typeof CommentListItemView).template;
      const { commentListItem, timepos, date, text } = template;
      const item = this._item;
      const oden = this._index % 2 === 0 ? 'even' : 'odd';
      const time3dp = Math.round(this._item.time3dp * 100);

      const formattedDate = item.formattedDate;
      commentListItem.id = this.domId;
      const font = item.fontCommand || 'default';
      commentListItem.className = `commentListItem no${item.no} item${this._id} ${oden} fork${item.fork} font-${font} ${item.isSubThread ? 'subThread' : ''}`;
      commentListItem.classList.toggle('nicotta', item.nicotta);
      commentListItem.style.cssText = `top: ${this.top}px; content-visibility: hidden;`;
      /*--duration: ${item.duration}s;
          --vpos-time: ${item.vpos / 100}s;*/
      // commentListItem.style.transform = `translateZ(${time3dp}px)`;
      //commentListItem.setAttribute('data-time-3dp', time3dp);

      Object.assign(commentListItem.dataset, {
        itemId: item.itemId,
        no: item.no,
        uniqNo: item.uniqNo,
        vpos: item.vpos,
        top: this.top,
        thread: item.threadId,
        isMine: item.isMine,
        title: `${item.no}: ${formattedDate} ID:${item.userId}\n${item.text}`,
        time3dp,
        valhalla: item.valhalla,
      });
      if (item.nicoru > 0) {
        (commentListItem.dataset as Record<string, string | number | undefined>).nicoru = item.nicoru;
      } else {
        delete (commentListItem.dataset as Record<string, string | number | undefined>).nicoru;
      }

      timepos.textContent = item.timePos;
      date.textContent = formattedDate;
      text.textContent = item.text.trim();

      const color = item.color;
      text.style.textShadow = color ? `0px 0px 2px ${color}` : '';
      this._view = template.clone();
    }

    get viewElement(): HTMLElement {
      if (!this._view) {
        this.build();
      }
      return this._view as HTMLElement;
    }

    get itemId(): number {
      return this._item.itemId;
    }

    get domId(): string {
      return `item${this._item.itemId}`;
    }

    get top(): number {
      return this._index * this._height;
    }

    remove(): void {
      if (!this._view) {
        return;
      }
      this._view.remove();
    }

    toString(): string {
      return this.viewElement.outerHTML;
    }

    get time3dp(): number {
      return this._item.time3dp;
    }

    get time3d(): number {
      return this._item.time3d;
    }

    get nicotta(): boolean {
      return this._item.nicotta;
    }
    set nicotta(v: boolean) {
      this._item.nicotta = v;
      this._view!.classList.toggle('nicotta', v);
    }
    get nicoru(): number {
      return this._item.nicoru;
    }
    set nicoru(v: number) {
      this._item.nicoru = v;
      if (v > 0) {
        (this._view!.dataset as Record<string, string | number | undefined>).nicoru = v;
      } else {
        delete (this._view!.dataset as Record<string, string | number | undefined>).nicoru;
      }
    }
  }

  CommentListItemView.TPL = TPL;
  CommentListItemView.CSS = CSS;
  return CommentListItemView;
})();

class CommentListItem {
  declare nicoChat: NicoChatItem;
  declare private _itemId: number;
  declare private _vpos: number;
  declare private _text: string;
  declare private _escapedText: string;
  declare private _userId: string;
  declare private _date: number;
  declare private _fork: number;
  declare private _no: number;
  declare private _color: string;
  declare private _fontCommand: string;
  declare private _isSubThread: boolean;
  declare private _formattedDate: string;
  declare private _timePos: string;
  declare static _itemId: number;
  constructor(nicoChat: NicoChatItem) {
    this.nicoChat = nicoChat;
    this._itemId = CommentListItem._itemId++;
    this._vpos = nicoChat.vpos as unknown as number;
    this._text = nicoChat.text;
    this._escapedText = textUtil.escapeHtml(this._text);
    this._userId = nicoChat.userId;
    this._date = nicoChat.date;
    this._fork = nicoChat.fork;
    this._no = nicoChat.no;
    this._color = nicoChat.color;
    this._fontCommand = nicoChat.fontCommand;
    this._isSubThread = nicoChat.isSubThread;

    this._formattedDate = textUtil.dateToString(this._date * 1000);
    this._timePos = textUtil.secToTime(this._vpos / 100);
  }
  get itemId(): number {
    return this._itemId;
  }
  get vpos(): number {
    return this._vpos;
  }
  get timePos(): string {
    return this._timePos;
  }
  get cmd(): string {
    return this.nicoChat.cmd;
  }
  get text() {
    return this._text;
  }
  get escapedText() {
    return this._escapedText;
  }
  get userId() {
    return this._userId;
  }
  get color() {
    return this._color;
  }
  get date() {
    return this._date;
  }
  get time() {
    return this._date * 1000;
  }
  get formattedDate() {
    return this._formattedDate;
  }
  get fork() {
    return this._fork;
  }
  get no() {
    return this._no;
  }
  get uniqNo() {
    return this.nicoChat.uniqNo;
  }
  get fontCommand() {
    return this._fontCommand;
  }
  get isSubThread() {
    return this._isSubThread;
  }
  get threadId() {
    return this.nicoChat.threadId;
  }
  get time3d() {
    return this.nicoChat.time3d;
  }
  get time3dp() {
    return this.nicoChat.time3dp;
  }
  get nicoru(): number {
    return this.nicoChat.nicoru;
  }
  set nicoru(v: number) {
    this.nicoChat.nicoru = v;
  }
  get duration() {
    return this.nicoChat.duration;
  }
  get valhalla() {
    return this.nicoChat.valhalla;
  }
  get nicotta(): boolean {
    return this.nicoChat.nicotta;
  }
  set nicotta(v: boolean) {
    this.nicoChat.nicotta = v;
  }
  get isMine() {
    return this.nicoChat.isMine;
  }
}
CommentListItem._itemId = 0;

class CommentPanelView extends Emitter {
  declare static __css__: string;
  declare static __tpl__: string;
  declare private $container: Uq;
  declare private model: CommentListModel;
  declare private commentPanel: CommentPanel;
  declare private $view: Uq;
  declare private _$menu: Uq;
  declare private _listView: CommentListView;
  declare private _timeMachineView: TimeMachineView;
  declare private _lastCurrentTime: number | undefined;
  languages: [string, string][] = [
    ['ja-jp', '日本語'],
    ['en-us', 'English (US)'],
    ['zh-tw', '中文 (繁體)'],
  ];

  constructor(params: CommentPanelViewParams) {
    super();
    this.$container = params.$container;
    this.model = params.model;
    this.commentPanel = params.commentPanel;

    css.addStyle(CommentPanelView.__css__);
    const $view = (this.$view = (uq as unknown as UqFactory).html(CommentPanelView.__tpl__));
    this.$container.append($view);

    const langs = document.querySelector('.commentLanguageSelector');
    for (const [language, label] of this.languages) {
      const list = document.createElement('li');
      list.className = 'commentPanel-command';
      Object.assign(list.dataset, {
        command: 'update-commentLanguage',
        param: language,
      });
      list.textContent = label;
      langs!.append(list);
    }

    const $menu = (this._$menu = this.$view.find('.commentPanel-menu'));

    global.debug.commentPanelView = this;

    const listView = (this._listView = new CommentListView({
      container: this.$view.find('.commentPanel-frame')[0],
      model: this.model,
      className: 'commentList',
      builder: CommentListItemView,
      itemCss: (CommentListItemView as unknown as { __css__: unknown }).__css__,
    }));
    listView.on('command', this._onCommand.bind(this) as unknown as EmitterCallback);

    this._timeMachineView = new TimeMachineView({
      parentNode: document.querySelector('.timeMachineContainer'),
    });
    this._timeMachineView.on('command', this._onCommand.bind(this) as unknown as EmitterCallback);

    this.commentPanel.on('threadInfo', _.debounce(this._onThreadInfo.bind(this), 100) as unknown as EmitterCallback);
    this.commentPanel.on('update', _.debounce(this._onCommentPanelStatusUpdate.bind(this), 100));
    this.commentPanel.on(
      'itemDetailResp',
      _.debounce((item: CommentListItem) => listView.showItemDetail(item), 100) as unknown as EmitterCallback
    );
    this._onCommentPanelStatusUpdate();

    this.model.on('currentTimeUpdate', this._onModelCurrentTimeUpdate.bind(this) as unknown as EmitterCallback);

    this.$view.on('click', this._onCommentListCommandClick.bind(this));

    global.emitter.on('hideHover', () => $menu.removeClass('show'));
  }
  toggleClass(className: string, v: boolean): Uq {
    return this.$view.raf.toggleClass(className, v);
  }
  _onModelCurrentTimeUpdate(sec: number, viewIndex: number): void {
    if (!this.$view) {
      return;
    }

    this._lastCurrentTime = sec;
    this._listView.setCurrentPoint(sec, viewIndex, this.commentPanel.isAutoScroll);
  }
  _onCommand(command: string, param: Element & { nicotta?: unknown }, itemId?: string): void {
    switch (command) {
      case 'nicoru':
        this.emit('command', command, param, itemId);
        break;
      default:
        this.emit('command', command, param, itemId);
        break;
    }
  }
  _onCommentListCommandClick(e: Event): void {
    const target = (e.target as unknown as Element).closest<HTMLElement>('[data-command]');
    if (!target) {
      return;
    }
    const { command, param } = target.dataset;
    e.stopPropagation();
    if (!command) {
      return;
    }

    const $view = this.$view;
    const setUpdating = (): void => {
      (document.activeElement as HTMLElement).blur();
      $view.raf.addClass('updating');
      window.setTimeout(() => $view.removeClass('updating'), 1000);
    };

    switch (command) {
      case 'sortBy':
        setUpdating();
        this.emit('command', command, param);
        break;
      case 'reloadComment':
        setUpdating();
        this.emit('command', command, param);
        break;
      default:
        this.emit('command', command, param);
    }
    void global.emitter.emitAsync('hideHover');
  }
  _onThreadInfo(threadInfo: ThreadInfo): void {
    this._timeMachineView.update(threadInfo);
  }
  _onCommentPanelStatusUpdate(): void {
    const commentPanel = this.commentPanel;
    const $view = this.toggleClass('autoScroll', commentPanel.isAutoScroll);

    const langClass = `lang-${commentPanel.getLanguage()}`;
    if (!$view.hasClass(langClass)) {
      $view.raf.removeClass(this.languages.map(([x]) => `lang-${x}`).join(' '));
      $view.raf.addClass(langClass);
    }
  }
}
CommentPanelView.__css__ = `
    :root {
      --futatsume-comment-panel-header-height: 64px;
    }

    .commentPanel-container {
      height: 100%;
      overflow: hidden;
      user-select: none;
    }

    .commentPanel-header {
      height: var(--futatsume-comment-panel-header-height);
      border-bottom: 1px solid #000;
      background: #333;
      color: #ccc;
    }

    .commentPanel-menu-button {
      display: inline-block;
      cursor: pointer;
      border: 1px solid #333;
      padding: 0px 4px;
      margin: 0 4px;
      background: #666;
      font-size: 16px;
      line-height: 28px;
      white-space: nowrap;
    }
    .commentPanel-menu-button:hover {
      border: 1px outset;
    }
    .commentPanel-menu-button:active {
      border: 1px inset;
    }
    .commentPanel-menu-button .commentPanel-menu-icon {
      font-size: 24px;
      line-height: 28px;
    }

    .commentPanel-container.autoScroll .autoScroll {
      text-shadow: 0 0 6px #f99;
      color: #ff9;
    }

    .commentPanel-frame {
      height: calc(100% - var(--futatsume-comment-panel-header-height));
      transition: opacity 0.3s;
    }

    .updating .commentPanel-frame,
    .shuffle .commentPanel-frame {
      opacity: 0;
    }

    .commentPanel-menu-toggle {
      position: absolute;
      right: 8px;
      display: inline-block;
      font-size: 14px;
      line-height: 32px;
      cursor: pointer;
      outline: none;
    }
    .commentPanel-menu-toggle:focus-within {
      pointer-events: none;
    }
    .commentPanel-menu-toggle:focus-within .futatsumePopupMenu {
      pointer-events: auto;
      visibility: visible;
      opacity: 0.99;
      pointer-events: auto;
      transition: opacity 0.3s;
    }

    .commentPanel-menu {
      position: absolute;
      right: 0px;
      top: 24px;
      min-width: 150px;
    }

    .commentPanel-menu li {
      line-height: 20px;
    }

    .commentPanel-container.lang-ja-jp .commentPanel-command[data-param=ja-jp],
    .commentPanel-container.lang-en-us .commentPanel-command[data-param=en-us],
    .commentPanel-container.lang-zh-tw .commentPanel-command[data-param=zh-tw] {
      font-weight: bolder;
      color: #ff9;
    }


  `.trim();

CommentPanelView.__tpl__ = `
    <div class="commentPanel-container">
      <div class="commentPanel-header">
        <label class="commentPanel-menu-button autoScroll commentPanel-command"
          data-command="toggleScroll"><icon class="commentPanel-menu-icon">⬇️</icon> 自動スクロール</label>

        <div class="commentPanel-command commentPanel-menu-toggle" tabindex="-1">
          ▼ メニュー
          <div class="futatsumePopupMenu commentPanel-menu">
            <div class="listInner">
            <ul>
              <li class="commentPanel-command" data-command="sortBy" data-param="vpos">
                コメント位置順に並べる
              </li>
              <li class="commentPanel-command" data-command="sortBy" data-param="date:desc">
                コメントの新しい順に並べる
              </li>
              <li class="commentPanel-command" data-command="sortBy" data-param="nicoru:desc">
                ニコる数で並べる
              </li>
            </ul>
            <hr class="separator">
            <ul class="commentLanguageSelector">
            </ul>
            </div>
          </div>
        </div>
        <div class="timeMachineContainer"></div>
      </div>
      <div class="commentPanel-frame"></div>
    </div>
  `.trim();

class CommentPanel extends Emitter {
  private generation = 0;
  private readonly pendingChanges = new Set<string>();
  declare private _thumbInfoLoader: unknown;
  declare private _$container: Uq;
  declare private _player: NicoVideoPlayer;
  declare private _autoScroll: boolean;
  declare private _model: CommentListModel;
  declare private _language: string;
  declare private _view: CommentPanelView | undefined;
  declare private _timer: number | null | undefined;
  declare private _threadInfo: ThreadInfo | undefined;
  constructor(params: CommentPanelParams) {
    super();
    this._thumbInfoLoader = params.loader || global.api.ThumbInfoLoader;
    this._$container = params.$container;
    const player = (this._player = params.player);

    this._autoScroll = _.isBoolean(params.autoScroll) ? params.autoScroll : true;

    this._model = new CommentListModel({});
    this._language = params.language || 'ja-jp';

    player.on('commentParsed', _.debounce(this._onCommentParsed.bind(this), 500) as unknown as EmitterCallback);
    player.on('commentChange', _.debounce(this._onCommentChange.bind(this), 500) as unknown as EmitterCallback);
    player.on('commentReady', _.debounce(this._onCommentReady.bind(this), 500) as unknown as EmitterCallback);
    player.on('open', this._onPlayerOpen.bind(this));
    player.on('close', this._onPlayerClose.bind(this));

    global.debug.commentPanel = this;
  }
  _initializeView(): void {
    if (this._view) {
      return;
    }
    this._view = new CommentPanelView({
      $container: this._$container,
      model: this._model,
      commentPanel: this,
      builder: CommentListItemView,
      itemCss: (CommentListItemView as unknown as { __css__: unknown }).__css__,
    });
    this._view.on('command', this._onCommand.bind(this) as unknown as EmitterCallback);
  }
  startTimer() {
    this.stopTimer();
    this._timer = window.setInterval(this._onTimer.bind(this), 200);
  }
  stopTimer() {
    if (this._timer) {
      window.clearInterval(this._timer);
      this._timer = null;
    }
  }
  _onTimer(): void {
    if (this._autoScroll) {
      this.currentTime = (this._player as unknown as { currentTime: number }).currentTime;
    }
  }
  _onCommand(command: string, param: string | Record<string, unknown> | null, itemId?: string): void {
    let item: CommentListItem | undefined;
    if (itemId) {
      item = this._model.findByItemId(itemId);
    }
    switch (command) {
      case 'toggleScroll':
        this.toggleScroll();
        break;
      case 'sortBy': {
        const tmp = (param as string).split(':');
        this.sortBy(tmp[0] as string, tmp[1] === 'desc');
        break;
      }
      case 'select': {
        const vpos = item!.vpos;
        this.emit('command', 'seek', vpos / 100);
        // TODO: コメント強調
        break;
      }
      case 'clipBoard':
        void Clipboard.copyText(item!.text);
        this.emit('command', 'notify', 'クリップボードにコピーしました');
        break;
      case 'removeComment':
        if (item) this._changeComment('deleteChat', item);
        break;
      case 'addUserIdFilter':
        this._model.removeItem(item!);
        this.emit('command', command, item!.userId);
        break;
      case 'addWordFilter':
        this._model.removeItem(item!);
        this.emit('command', command, item!.text);
        break;
      case 'reloadComment':
        if (item) {
          param = { when: 0 };
          const dt = new Date(item.time);
          this.emit('command', 'notify', item.formattedDate + '頃のログ');
          param.when = Math.floor(dt.getTime() / 1000);
        }
        this.emit('command', command, param);

        break;
      case 'itemDetailRequest':
        if (item) {
          this.emit('itemDetailResp', item);
        }
        break;
      case 'nicoru':
        if (item && !item.nicotta) this._changeComment('nicoruChat', item);
        break;
      default:
        this.emit('command', command, param);
    }
  }
  _onCommentParsed(language: string): void {
    this.setLanguage(language);
    void this._initializeView();
    this.setChatList((this._player as unknown as { chatList: ChatListData }).chatList);
    this.startTimer();
  }
  _onCommentChange(language: string): void {
    this.setLanguage(language);
    void this._initializeView();
    this.setChatList((this._player as unknown as { chatList: ChatListData }).chatList);
  }
  _onCommentReady(result: unknown, threadInfo: ThreadInfo): void {
    this._threadInfo = threadInfo;
    this.emit('threadInfo', threadInfo);
  }
  _onPlayerOpen() {
    this.generation++;
    this.pendingChanges.clear();
    this._model.clear();
  }
  _onPlayerClose() {
    this.generation++;
    this.pendingChanges.clear();
    this._model.clear();
    this.stopTimer();
  }
  private _changeComment(operation: 'deleteChat' | 'nicoruChat', item: CommentListItem): void {
    const key = `${operation}:${item.itemId}`;
    if (this.pendingChanges.has(key)) return;
    this.pendingChanges.add(key);
    const generation = this.generation;
    void new Promise<{ count?: number } | void>((resolve, reject) =>
      this.emit(operation, { resolve, reject }, item.nicoChat)
    )
      .then((result) => {
        if (generation !== this.generation) return;
        if (operation === 'deleteChat') this._model.removeItem(item);
        else {
          item.nicotta = true;
          item.nicoru = result?.count ?? item.nicoru + 1;
          this._model.onUpdate(true);
        }
      })
      .catch((error: unknown) => {
        if (generation === this.generation)
          this.emit(
            'command',
            'alert',
            error instanceof Error ? error.message : 'コメントの変更に失敗しました。再試行してください。'
          );
      })
      .finally(() => this.pendingChanges.delete(key));
  }
  setChatList(chatList: ChatListData): void {
    if (!this._model) {
      return;
    }
    this.generation++;
    this.pendingChanges.clear();
    this._model.setChatList(chatList);
  }
  get isAutoScroll(): boolean {
    return this._autoScroll;
  }
  getLanguage(): string {
    return this._language || 'ja-jp';
  }
  getThreadInfo(): ThreadInfo | undefined {
    return this._threadInfo;
  }
  setLanguage(lang: string): void {
    if (lang !== this._language) {
      this._language = lang;
      this.emit('update');
    }
  }
  toggleScroll(v?: boolean): void {
    if (!_.isBoolean(v)) {
      this._autoScroll = !this._autoScroll;
      if (this._autoScroll) {
        this._model.sortBy('vpos');
      }
      this.emit('update');
      return;
    }

    if (this._autoScroll !== v) {
      this._autoScroll = v;
      if (this._autoScroll) {
        this._model.sortBy('vpos');
      }
      this.emit('update');
    }
  }
  sortBy(key: string, isDesc?: boolean): void {
    this._model.sortBy(key, isDesc);
    if (key !== 'vpos') {
      this.toggleScroll(false);
    }
  }
  set currentTime(sec: number) {
    if (!this._view || (this._player as unknown as { currentTab: string }).currentTab !== 'comment') {
      return;
    }
    this._model.currentTime = sec;
  }
  get currentTime() {
    return this._model.currentTime;
  }
}

class TimeMachineView extends BaseViewComponent {
  declare static _shadow_: string;
  declare static __tpl__: string;
  declare _bound: { _onTimer: () => void };
  declare _state: TimeMachineState;
  declare _elm: TimeMachineElements;
  declare _view: Element;
  declare _shadow: Element | null;
  declare setState: (state: Partial<TimeMachineState>) => void;
  declare private _currentTimestamp: number;
  declare private _currentTime: string | undefined;
  declare private _videoPostTime: number;
  constructor({ parentNode }: TimeMachineViewParams) {
    super({
      parentNode,
      name: 'TimeMachineView',
      template: '<div class="TimeMachineView"></div>',
      shadow: TimeMachineView._shadow_,
      css: '',
    });

    this._bound._onTimer = this._onTimer.bind(this);

    this._state = {
      isWaybackMode: false,
      isSelecting: false,
    };

    this._currentTimestamp = Date.now();

    global.debug.timeMachineView = this;

    window.setInterval(this._bound._onTimer, 3 * 1000);
  }

  _initDom(...args: unknown[]): void {
    super._initDom(
      args[0] as { parentNode?: Element | null; name?: string; template?: string; shadow?: string; css?: string }
    );

    const v = this._shadow || this._view;
    Object.assign(this._elm, {
      time: v.querySelector('.dateTime') as HTMLElement,
      back: v.querySelector('.backToTheFuture') as HTMLElement,
      input: v.querySelector('.dateTimeInput') as HTMLInputElement,
      submit: v.querySelector('.dateTimeSubmit') as HTMLElement,
      cancel: v.querySelector('.dateTimeCancel') as HTMLElement,
    });

    this._updateTimestamp();
    this._elm.time.addEventListener('click', this._toggle.bind(this));
    this._elm.back.addEventListener('mousedown', _.debounce(this._onBack.bind(this), 300));
    this._elm.submit.addEventListener('click', this._onSubmit.bind(this));
    this._elm.cancel.addEventListener('click', this._onCancel.bind(this));
  }

  update(threadInfo: ThreadInfo): void {
    //window.console.info('TimeMachineView update', threadInfo);
    this._videoPostTime = threadInfo.threadId * 1000;
    const isWaybackMode = threadInfo.isWaybackMode;
    this.setState({ isWaybackMode, isSelecting: false });

    if (isWaybackMode) {
      this._currentTimestamp = threadInfo.when * 1000;
    } else {
      this._currentTimestamp = Date.now();
    }
    this._updateTimestamp();
  }

  _updateTimestamp() {
    if (isNaN(this._currentTimestamp)) {
      return;
    }
    this._elm.time.textContent = this._currentTime = this._toDate(this._currentTimestamp);
  }

  openSelect() {
    const input = this._elm.input;
    const now = this._toTDate(Date.now());
    input.setAttribute('max', now);
    input.setAttribute('value', this._toTDate(this._currentTimestamp));
    input.setAttribute('min', this._toTDate(this._videoPostTime));
    this.setState({ isSelecting: true });
    window.setTimeout(() => {
      input.focus();
    }, 0);
  }

  closeSelect() {
    this.setState({ isSelecting: false });
  }

  _toggle() {
    if (this._state.isSelecting) {
      this.closeSelect();
    } else {
      this.openSelect();
    }
  }

  _onTimer(): void {
    if (this._state.isWaybackMode) {
      return;
    }
    const now = Date.now();
    const str = this._toDate(now);

    if (this._currentTime === str) {
      return;
    }
    this._currentTimestamp = now;
    this._updateTimestamp();
  }

  _padTime(time: number): { yyyy: number; mm: string; dd: string; h: string; m: string; s: string } {
    const pad = (v: number): string => v.toString().padStart(2, '0');
    const dt = new Date(time);
    return {
      yyyy: dt.getFullYear(),
      mm: pad(dt.getMonth() + 1),
      dd: pad(dt.getDate()),
      h: pad(dt.getHours()),
      m: pad(dt.getMinutes()),
      s: pad(dt.getSeconds()),
    };
  }

  _toDate(time: number): string {
    const { yyyy, mm, dd, h, m } = this._padTime(time);
    return `${yyyy}/${mm}/${dd} ${h}:${m}`;
  }

  _toTDate(time: number): string {
    const { yyyy, mm, dd, h, m, s } = this._padTime(time);
    return `${yyyy}-${mm}-${dd}T${h}:${m}:${s}`;
  }

  _onSubmit() {
    const input = this._elm.input;
    if (!input.checkValidity()) {
      input.reportValidity();
      return;
    }
    const val = input.value;
    if (!val || !/^\d\d\d\d-\d\d-\d\dT\d\d:\d\d(|:\d\d)$/.test(val)) {
      return;
    }
    const dt = new Date(val);
    const when = Math.floor(Math.max(dt.getTime(), this._videoPostTime) / 1000);
    this.emit('command', 'reloadComment', { when });
    this.closeSelect();
  }

  _onCancel() {
    this.closeSelect();
  }

  _onBack() {
    this.setState({ isWaybackMode: false });
    this.closeSelect();
    this.emit('command', 'reloadComment', { when: 0 });
  }
}

TimeMachineView._shadow_ = `
    <style>
      .dateTime {
        display: inline-block;
        margin: auto 4px 4px;
        padding: 0 4px;
        border: 1px solid;
        background: #888;
        color: #000;
        font-size: 20px;
        line-height: 24px;
        font-family: monospace;
        cursor: pointer;
      }

      .is-WaybackMode .dateTime {
        background: #000;
        color: #888;
        box-shadow: 0 0 4px #ccc, 0 0 4px #ccc inset;
      }
      .reloadButton {
        display: inline-block;
        line-height: 24px;
        font-size: 16px;
        margin: auto 4px;
        cursor: pointer;
        user-select: none;
        transition: transform 0.1s;
      }

      .is-WaybackMode .reloadButton {
        display: none;
      }
        .reloadButton .icon {
          display: inline-block;
          transform: rotate(90deg) scale(1.3);
          transition: transform 1s, color 0.2s, text-shadow 0.2s;
          text-shadow: none;
          font-family: 'STIXGeneral';
          margin-right: 8px;
        }
        .reloadButton:hover {
          text-decoration: underline;
        }
        .reloadButton:active {
          color: #888;
          cursor: wait;
        }
        .reloadButton:active .icon {
          text-decoration: none;
          transform: rotate(-270deg) scale(2);
          transition: none;
          color: #ff0;
          text-shadow: 0 0 4px #ff8;
        }

      .backToTheFuture {
        display: none;
        line-height: 24px;
        font-size: 16px;
        margin: auto 4px;
        cursor: pointer;
        transition: transform 0.1s;
        user-select: none;
      }
      .backToTheFuture:hover {
        text-shadow: 0 0 8px #ffc;
        transform: translate(0, -2px);
      }
      .backToTheFuture:active {
        text-shadow: none;
        transform: translate(0px, -1000px);
      }

      .is-WaybackMode .backToTheFuture {
        display: inline-block;
      }

      .inputContainer {
        display: none;
        position: absolute;
        top: 32px;
        left: 4px;
        background: #333;
        box-shadow: 0 0 4px #fff;
      }
      .is-Selecting .inputContainer {
        display: block;
      }
        .dateTimeInput {
          display: block;
          font-size: 16px;
          min-width: 256px;
        }
        .submitContainer {
          text-align: right;
        }
          .dateTimeSubmit, .dateTimeCancel {
            display: inline-block;
            min-width: 50px;
            cursor: pointer;
            padding: 4px 8px;
            margin: 4px;
            border: 1px solid #888;
            text-align: center;
            transition: background 0.2s, transform 0.2s, box-shadow 0.2s;
            user-select: none;
          }
          .dateTimeSubmit:hover, .dateTimeCancel:hover {
            background: #666;
            transform: translate(0, -2px);
            box-shadow: 0 4px 2px #000;
          }
          .dateTimeSubmit:active, .dateTimeCancel:active {
            background: #333;
            transform: translate(0, 0);
            box-shadow: 0 0 2px #000 inset;
          }

          .dateTimeSubmit {
          }
          .dateTimeCancel {
          }

    </style>
    <div class="root TimeMachine">
      <div class="dateTime" title="TimeMachine">0000/00/00 00:00</div>
      <div class="reloadButton command" data-command="reloadComment" data-param="0" title="コメントのリロード"><span class="icon">&#8635;</span>リロード</div>
      <div class="backToTheFuture" title="Back To The Future">&#11152; Back</div>
      <div class="inputContainer">
        <input type="datetime-local" class="dateTimeInput" step="1" required>
        <div class="submitContainer">
        <div class="dateTimeSubmit">G&nbsp;&nbsp;O</div>
        <div class="dateTimeCancel">Cancel</div>
        </div>
      </div>
    </div>
  `.trim();

TimeMachineView.__tpl__ = '<div class="TimeMachineView"></div>'.trim();

//===END===
// tb = FutatsumeWatch.debug.getFrameBodies().find(b => b.classList.contains('commentList')).querySelector('.timeBar');[...tb.computedStyleMap().entries()].filter(([key, vars]) => key.startsWith('--')).forEach(([key, vars]) => console.log(key, ...vars))
export { CommentPanel };

export type { Uq, UqFactory, UqRaf, ClassListLike };
