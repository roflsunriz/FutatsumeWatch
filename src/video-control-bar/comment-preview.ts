import _ from 'lodash';
import { global } from '../futatsume-watch-index';
import { util } from '../util';
import { Emitter } from '../baselib';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import { throttle } from '../../packages/lib/src/infra/bounce';
import { cssUtil } from '../../packages/lib/src/css/css';
import type { VcbChat, VcbChatList, VcbChatTemplate, VcbQuery, VcbUtil } from './types';
export class CommentPreviewModel extends Emitter {
  declare _chatReady: boolean;
  declare _vpos: number;
  declare _chatList: Array<VcbChat> | undefined;
  reset(): void {
    this._chatReady = false;
    this._vpos = -1;
    this.emit('reset');
  }
  set chatList(chatList: VcbChatList) {
    const list = chatList.top.concat(chatList.naka, chatList.bottom).sort((a, b) => a.vpos - b.vpos);

    this._chatList = list;
    this._chatReady = true;
    this.update();
  }
  get chatList(): Array<VcbChat> {
    return this._chatList || [];
  }
  set currentTime(sec: number) {
    this.vpos = sec * 100;
  }
  set vpos(vpos: number) {
    if (this._vpos !== vpos) {
      this._vpos = vpos;
      this.emit('vpos', vpos);
    }
  }
  get currentIndex(): number {
    if (this._vpos < 0 || !this._chatReady) {
      return -1;
    }
    return this.getVposIndex(this._vpos);
  }
  getVposIndex(vpos: number): number {
    const list = this._chatList;
    if (!list) {
      return -1;
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const chat = list[i]!,
        cv = chat.vpos;
      if (cv <= vpos - 400) {
        return i + 1;
      }
    }
    return -1;
  }
  get currentChatList(): Array<VcbChat> {
    if (this._vpos < 0 || !this._chatReady) {
      return [];
    }
    return this.getItemByVpos(this._vpos);
  }
  getItemByVpos(vpos: number): Array<VcbChat> {
    const list = this._chatList as Array<VcbChat>;
    const result: Array<VcbChat> = [];
    for (let i = 0, len = list.length; i < len; i++) {
      const chat = list[i]!,
        cv = chat.vpos,
        diff = vpos - cv;
      if (diff >= -100 && diff <= 400) {
        result.push(chat);
      }
    }
    return result;
  }
  getItemByUniqNo(uniqNo: unknown): VcbChat | undefined {
    return (this._chatList as Array<VcbChat>).find((chat) => chat.uniqNo === uniqNo);
  }
  update(): void {
    this.emit('update');
  }
}

export class CommentPreviewView {
  declare static ITEM_HEIGHT: number;
  declare static MAX_HEIGHT: number;
  declare static WIDTH: number;
  declare static HOVER_WIDTH: number;
  declare static __tpl__: string;
  declare _model: CommentPreviewModel;
  declare _$parent: VcbQuery;
  declare _inviewTable: Map<number, Element>;
  declare _chatList: Array<VcbChat>;
  declare _view: HTMLElement;
  declare _list: HTMLElement;
  declare _mode: string;
  declare _left: number;
  declare _currentStartIndex: number;
  declare _currentEndIndex: number;
  declare _scrollTop: number;
  declare _currentTime: number;
  declare _newListElements: DocumentFragment | null;
  declare _isListUpdated: boolean;
  declare _innerWidth: number | undefined;
  constructor(params: { model: CommentPreviewModel; $container: VcbQuery }) {
    const model = (this._model = params.model);
    this._$parent = params.$container;

    this._inviewTable = new Map();
    this._chatList = [];
    this._initializeDom(this._$parent);

    model.on('reset', this._onReset.bind(this));
    model.on('update', _.debounce(this._onUpdate.bind(this), 10));
    model.on('vpos', this._onVpos.bind(this) as EmitterCallback);

    this._mode = 'hover';

    this._left = 0;
    this.update = _.throttle(this.update.bind(this), 200);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- void 関数の throttle 化であり戻り値は使わない
    this.applyView = throttle.raf(this.applyView.bind(this));
  }
  _initializeDom($parent: VcbQuery): void {
    cssUtil.registerProps(
      { name: '--buffer-range-left', syntax: '<percentage>', initialValue: '0%', inherits: false },
      { name: '--buffer-range-scale', syntax: '<number>', initialValue: 0 as unknown as string, inherits: false }
    );
    const $view = (util as unknown as VcbUtil).$.html(CommentPreviewView.__tpl__);
    const view = (this._view = $view[0] as HTMLElement);
    this._list = view.querySelector('.listContainer') as HTMLElement;
    $view
      .on('click', this._onClick.bind(this))
      .on('wheel', (e: Event) => e.stopPropagation(), { passive: true })
      .on('scroll', _.throttle(this._onScroll.bind(this), 50, { trailing: false }), { passive: true });

    $parent.append($view);
  }
  set mode(v: string) {
    if (v === 'list') {
      (util as unknown as VcbUtil).StyleSwitcher.update({
        on: '.commentPreview.list',
        off: '.commentPreview.hover',
      });
    } else {
      (util as unknown as VcbUtil).StyleSwitcher.update({
        on: '.commentPreview.hover',
        off: '.commentPreview.list',
      });
    }
    this._mode = v;
  }
  _onClick(e: Event): void {
    e.stopPropagation();
    const target: HTMLElement | null = (e.target as Element).closest('[data-command]');
    const view = this._view;
    const command = target ? target.dataset.command : '';
    const nicoChatElement: HTMLElement | null = (e.target as Element).closest('.nicoChat');
    const uniqNo = parseInt((nicoChatElement as HTMLElement).dataset.nicochatUniqNo as string, 10);
    const nicoChat = this._model.getItemByUniqNo(uniqNo);

    if (command && nicoChat) {
      view.classList.add('is-updating');

      window.setTimeout(() => view.classList.remove('is-updating'), 3000);

      switch (command) {
        case 'addUserIdFilter':
          (util as unknown as VcbUtil).dispatchCommand(e.target, command, nicoChat.userId);
          break;
        case 'addWordFilter':
          (util as unknown as VcbUtil).dispatchCommand(e.target, command, nicoChat.text);
          break;
        case 'addCommandFilter':
          (util as unknown as VcbUtil).dispatchCommand(e.target, command, nicoChat.cmd);
          break;
      }
      return;
    }
    const vpos = (nicoChatElement as HTMLElement).dataset.vpos;
    if (vpos !== undefined) {
      (util as unknown as VcbUtil).dispatchCommand(e.target, 'seek', Number(vpos) / 100);
    }
  }
  _onUpdate(): void {
    this.updateList();
  }
  _onVpos(vpos: number): void {
    const itemHeight = CommentPreviewView.ITEM_HEIGHT;
    const index = (this._currentStartIndex = Math.max(0, this._model.currentIndex));
    this._currentEndIndex = Math.max(0, this._model.getVposIndex(vpos + 400));
    this._scrollTop = itemHeight * index;
    this._currentTime = vpos / 100;
    this._refreshInviewElements(this._scrollTop);
  }
  _onResize(): void {
    this._refreshInviewElements();
  }
  _onScroll(): void {
    this._scrollTop = -1;
    this._refreshInviewElements();
  }
  _onReset(): void {
    this._list.textContent = '';
    this._inviewTable.clear();
    this._scrollTop = 0;
    this._newListElements = null;
    this._chatList = [];
  }
  updateList(): void {
    const chatList = (this._chatList = this._model.chatList);
    if (!chatList.length) {
      this._isListUpdated = false;
      return;
    }

    const itemHeight = CommentPreviewView.ITEM_HEIGHT;

    this._list.style.height = `${(chatList.length + 2) * itemHeight}px`;
    this._isListUpdated = false;
  }
  _refreshInviewElements(scrollTop?: number): void {
    if (!this._view) {
      return;
    }
    const itemHeight = CommentPreviewView.ITEM_HEIGHT;

    scrollTop = _.isNumber(scrollTop) ? scrollTop : this._view.scrollTop;

    const viewHeight = CommentPreviewView.MAX_HEIGHT;
    const viewBottom = scrollTop + viewHeight;
    const chatList = this._chatList;
    if (!chatList || chatList.length < 1) {
      return;
    }
    const startIndex =
      this._mode === 'list' ? Math.max(0, Math.floor(scrollTop / itemHeight) - 5) : this._currentStartIndex;
    const endIndex =
      this._mode === 'list'
        ? Math.min(chatList.length, Math.floor(viewBottom / itemHeight) + 5)
        : Math.min(this._currentEndIndex, this._currentStartIndex + 15);

    const newItems: Array<Element> = [],
      inviewTable = this._inviewTable;
    for (let i = startIndex; i < endIndex; i++) {
      const chat = chatList[i];
      if (inviewTable.has(i) || !chat) {
        continue;
      }
      const listItem = CommentPreviewChatItem.create(chat, i);
      newItems.push(listItem);
      inviewTable.set(i, listItem);
    }

    if (newItems.length < 1) {
      return;
    }

    for (const i of inviewTable.keys()) {
      if (i >= startIndex && i <= endIndex) {
        continue;
      }
      inviewTable.get(i)!.remove();
      inviewTable.delete(i);
    }

    this._newListElements = this._newListElements || document.createDocumentFragment();
    this._newListElements.append(...newItems);

    this.applyView();
  }
  get isEmpty(): boolean {
    return this._chatList.length < 1;
  }
  update(left: number): void {
    if (this._isListUpdated) {
      this.updateList();
    }
    if (this.isEmpty) {
      return;
    }
    const width = this._mode === 'list' ? CommentPreviewView.WIDTH : CommentPreviewView.HOVER_WIDTH;
    const containerWidth = (this._innerWidth = this._innerWidth || global.innerWidth);

    left = Math.min(Math.max(0, left - CommentPreviewView.WIDTH / 2), containerWidth - width);
    this._left = left;
    this.applyView();
  }
  applyView(): void {
    const view = this._view;
    void cssUtil.setProps(
      [view, '--current-time', cssUtil.s(this._currentTime)],
      [view, '--scroll-top', cssUtil.px(this._scrollTop)],
      [view, '--trans-x-pp', cssUtil.px(this._left)]
    );
    if (this._newListElements && this._newListElements.childElementCount) {
      this._list.append(this._newListElements);
    }
    if (this._scrollTop > 0 && this._mode === 'list') {
      this._view.scrollTop = this._scrollTop;
      this._scrollTop = -1;
    }
  }
  hide(): void {
    // intentionally empty
  }
}

class CommentPreviewChatItem {
  declare static _template: VcbChatTemplate;
  static get html(): string {
    return `
       <li class="nicoChat">
         <span class="vposTime"></span>
         <span class="text"></span>
         <span class="addFilter addUserIdFilter"
           data-command="addUserIdFilter" title="NGユーザー">NGuser</span>
         <span class="addFilter addWordFilter"
           data-command="addWordFilter" title="NG正規表現へ追加">NGword</span>
       </li>
      `.trim();
  }

  static get template(): VcbChatTemplate {
    if (!this._template) {
      const t = document.createElement('template');
      t.id = `${this.name}_${Date.now()}`;
      t.innerHTML = this.html;
      const content = t.content;
      this._template = {
        clone: () => document.importNode(t.content, true),
        chat: content.querySelector('.nicoChat') as HTMLElement,
        time: content.querySelector('.vposTime') as HTMLElement,
        text: t.content.querySelector('.text') as HTMLElement,
      };
    }
    return this._template;
  }

  /**
   * @param {NicoChatViewModel} chat
   */
  static create(chat: VcbChat, idx: number): Element {
    const itemHeight = CommentPreviewView.ITEM_HEIGHT;
    const text = chat.text;
    const date = new Date((chat.date as number) * 1000).toLocaleString();
    const vpos = chat.vpos;
    const no = chat.no;
    const uniqNo = chat.uniqNo;
    const oe = idx % 2 === 0 ? 'even' : 'odd';
    const title = `${no} : 投稿日 ${date}\nID:${chat.userId}\n${text}\n`;
    const color = chat.color || '#fff';
    const shadow = color === '#fff' ? '' : `text-shadow: 0 0 1px ${color};`;

    const vposToTime = (vpos: number): string => (util as unknown as VcbUtil).secToTime(Math.floor(vpos / 100));
    const t = this.template;
    t.chat.className = `nicoChat fork${chat.fork} ${oe}`;
    t.chat.id = `commentPreviewItem${idx}`;
    t.chat.dataset.vpos = String(vpos);
    t.chat.dataset.nicochatUniqNo = String(uniqNo);
    t.time.textContent = `${vposToTime(vpos)}: `;
    t.text.title = title;
    (t.text as unknown as { style: unknown }).style = shadow;
    t.text.textContent = text as string;
    t.chat.style.cssText = `
        top: ${idx * itemHeight}px;
        --duration: ${chat.duration}s;
        --vpos-time: ${chat.vpos / 100}s;
      `;
    return t.clone().firstElementChild as Element;
  }
}

CommentPreviewView.MAX_HEIGHT = 200;
CommentPreviewView.WIDTH = 350;
CommentPreviewView.HOVER_WIDTH = 180;
CommentPreviewView.ITEM_HEIGHT = 20;
CommentPreviewView.__tpl__ = `
  <div class="futatsumeCommentPreview">
    <div class="listContainer"></div>
  </div>
  `.trim();

(util as unknown as VcbUtil).addStyle(
  `
  .futatsumeCommentPreview {
    display: none;
    position: absolute;
    bottom: 16px;
    opacity: 0.8;
    max-height: ${CommentPreviewView.MAX_HEIGHT}px;
    width: ${CommentPreviewView.WIDTH}px;
    box-sizing: border-box;
    color: #ccc;
    overflow: hidden;
    transform: translate(var(--trans-x-pp), 0);
    transition: --trans-x-pp 0.2s;
    will-change: transform;
  }
  .futatsumeCommentPreview * {
    box-sizing: border-box;
  }
  .is-wheelSeeking .futatsumeCommentPreview,
  .seekBarContainer:hover .futatsumeCommentPreview {
    display: block;
  }

`,
  { className: 'commentPreview' }
);

(util as unknown as VcbUtil).addStyle(
  `
  .futatsumeCommentPreview {
    border-bottom: 24px solid transparent;
    background: rgba(0, 0, 0, 0.4);
    z-index: 100;
    overflow: auto;
  }
  .futatsumeCommentPreview:hover {
    background: black;
  }
  .futatsumeCommentPreview.is-updating {
    transition: opacity 0.2s ease;
    opacity: 0.3;
    cursor: wait;
  }
  .futatsumeCommentPreview.is-updating * {
    pointer-evnets: none;
  }
  .listContainer {
    bottom: auto;
    padding: 4px;
    pointer-events: none;
  }
  .futatsumeCommentPreview:hover .listContainer {
    pointer-events: auto;
  }
  .listContainer .nicoChat {
    position: absolute;
    left: 0;
    display: block;
    width: 100%;
    height: ${CommentPreviewView.ITEM_HEIGHT}px;
    padding: 2px 4px;
    cursor: pointer;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    animation-duration: var(--duration);
    animation-delay: calc(var(--vpos-time) - var(--current-time) - 1s);
    animation-name: preview-text-inview;
    animation-timing-function: linear;
    animation-play-state: paused !important;
  }
  @keyframes preview-text-inview {
    0% {
      color: #ffc;
    }
    100% {
      color: #ffc;
    }
  }

  .listContainer:hover .nicoChat.odd {
    background: #333;
  }
  .listContainer .nicoChat.fork1 .vposTime {
    color: #6f6;
  }
  .listContainer .nicoChat:where(.fork2, .fork3) .vposTime {
    color: #66f;
  }

  .listContainer .nicoChat .no,
  .listContainer .nicoChat .date,
  .listContainer .nicoChat .userId {
    display: none;
  }

  .listContainer .nicoChat:hover .no,
  .listContainer .nicoChat:hover .date,
  .listContainer .nicoChat:hover .userId {
    display: inline-block;
    white-space: nowrap;
  }

  .listContainer .nicoChat .text {
    color: inherit !important;
  }
  .listContainer .nicoChat:hover .text {
    color: #fff !important;
  }

  .listContainer .nicoChat .text:hover {
    text-decoration: underline;
  }

  .listContainer .nicoChat .addFilter {
    display: none;
    position: absolute;
    font-size: 10px;
    color: #fff;
    background: #666;
    cursor: pointer;
    top: 0;
  }

  .listContainer .nicoChat:hover .addFilter {
    display: inline-block;
    border: 1px solid #ccc;
    box-shadow: 2px 2px 2px #333;
  }

  .listContainer .nicoChat .addFilter.addUserIdFilter {
    right: 8px;
    width: 48px;
  }
  .listContainer .nicoChat .addFilter.addWordFilter {
    right: 64px;
    width: 48px;
  }
  .listContainer .nicoChat .addFilter:active {
    transform: translateY(2px);
  }

  .futatsumeScreenMode_sideView .futatsumeCommentPreview,
  .futatsumeScreenMode_small .futatsumeCommentPreview {
    background: rgba(0, 0, 0, 0.9);
  }
`,
  { className: 'commentPreview list' }
);

(util as unknown as VcbUtil).addStyle(
  `
  .futatsumeCommentPreview {
    bottom: 24px;
    box-sizing: border-box;
    height: 140px;
    z-index: 160;
    transition: none;
    color: #fff;
    opacity: 0.6;
    overflow: hidden;
    pointer-events: none;
    user-select: none;
    contain: layout style size paint;
    filter: drop-shadow(0 0 1px #000);
  }
  .listContainer {
    bottom: auto;
    width: 100%;
    height: 100% !important;
    margin: auto;
    border: none;
    contain: layout style size paint;
  }
  .listContainer .nicoChat {
    display: block;
    top: auto !important;
    font-size: 16px;
    line-height: 18px;
    height: 18px;
    white-space: nowrap;
  }
  .listContainer .nicoChat:nth-child(n + 8) {
    transform: translateY(-144px);
  }
  .listContainer .nicoChat:nth-child(n + 16) {
    transform: translateY(-288px);
  }
  .listContainer .nicoChat .text {
    display: inline-block;
    text-shadow: 1px 1px 1px #fff;

    transform: translateX(260px);
    visibility: hidden;
    will-change: transform;
    animation-duration: var(--duration);
    animation-delay: calc(var(--vpos-time) - var(--current-time) - 1s);
    animation-play-state: paused !important;
    animation-name: preview-text-moving;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }
  .listContainer .nicoChat .vposTime,
  .listContainer .nicoChat .addFilter {
    display: none !important;
  }

  @keyframes preview-text-moving {
    0% {
      visibility: visible;
    }
    100% {
      visibility: hidden;
      transform: translateX(85px) translateX(-100%);
    }
  }

`,
  { className: 'commentPreview hover', disabled: true }
);

export class CommentPreview {
  declare _model: CommentPreviewModel;
  declare _view: CommentPreviewView;
  declare _mode: string;
  constructor(params: { $container: VcbQuery }) {
    this._model = new CommentPreviewModel();
    this._view = new CommentPreviewView({
      model: this._model,
      $container: params.$container,
    });

    this.reset();
  }
  reset(): void {
    this._model.reset();
    this._view.hide();
  }
  set chatList(chatList: VcbChatList) {
    this._model.chatList = chatList;
  }
  set currentTime(sec: number) {
    this._model.currentTime = sec;
  }
  update(left: number): void {
    this._view.update(left);
  }
  hide(): void {
    // intentionally empty
  }
  set mode(v: string) {
    if (v === this._mode) {
      return;
    }
    this._mode = v;
    this._view.mode = v;
  }
  get mode(): string {
    return this._mode;
  }
}
