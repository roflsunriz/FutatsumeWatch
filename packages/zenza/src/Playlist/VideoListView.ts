import _ from 'lodash';
import { Emitter } from '../../../lib/src/Emitter';
import { global } from '../../../../src/FutatsumeWatchIndex';
import { bounce } from '../../../lib/src/infra/bounce';
import { cssUtil } from '../../../lib/src/css/css';
import { uq } from '../../../lib/src/uQuery';
import { ClassList } from '../../../lib/src/dom/ClassListWrapper';
import { sleep } from '../../../lib/src/infra/sleep';
import { VideoListItemView } from './VideoListItemView';
import type { VideoListItem } from './VideoListItem';
import type { VideoListModel } from './VideoListModel';
import { MylistPocketDetector } from '../init/MylistPocketDetector.js';
import { CONSTANT } from '../../../../src/constant';
import { FrameLayer } from '../parts/FrameLayer';
import { dll } from '../../../components/src/dll';

interface VideoListViewParams {
  itemCss?: string;
  className?: string;
  max?: unknown;
  dragdrop?: unknown;
  dropfile?: unknown;
  enablePocketWatch?: unknown;
  model?: VideoListModel | null;
  container?: unknown;
}

interface UqCollection {
  on(name: string, handler: (e: MouseEvent) => void, options?: unknown): UqCollection;
  off(name: string): UqCollection;
  find(selector: string): UqCollection;
  readonly length: number;
  [index: number]: Element;
}

interface UqStatic {
  (selector: string): UqCollection;
  (element: Element): UqCollection;
}

interface CssUtilLike {
  registerProps(...props: unknown[]): void;
  setProps(...props: unknown[]): void;
  px(value: number): string;
  percent(value: number): string;
  number(value: number): string;
}

interface ClassListWrapper {
  add(name: string): void;
  remove(name: string): void;
  toggle(name: string, force?: boolean): boolean;
}

interface ClassListFactory {
  (view: Element): ClassListWrapper;
}

interface BounceLike {
  time<TFunc extends (...args: never[]) => void>(func: TFunc, interval?: number): TFunc;
}

interface DllLitLike {
  render(...args: unknown[]): unknown;
  html(strings: TemplateStringsArray, ...values: unknown[]): unknown;
}

interface DllLike {
  lit?: DllLitLike;
}

interface GlobalEmitterLike {
  emitter: {
    emit(name: string, ...args: unknown[]): void;
    emitAsync(name: string, ...args: unknown[]): void;
    promise(name: string): Promise<unknown>;
  };
}

interface PocketExternal {
  observe?(options: unknown): void;
  info(param: unknown): void;
}

interface PocketLike {
  external: PocketExternal;
}

interface DragState {
  item: VideoListItem;
  itemView: Element;
  dragOffset: { x: number; y: number; st: number };
  dragOver: { item?: VideoListItem; itemView?: Element } | null;
}

//===BEGIN===
/**
 * DOM的に隔離したiframeの中に生成する。
 * かなり実験要素が多いのでまだまだ変わる。
 */
class VideoListView extends Emitter {
  declare static __tpl__: string;
  declare _hasFocus: boolean;
  declare _itemCss: string;
  declare _className: string;
  declare _retryGetIframeCount: number;
  declare _maxItems: number;
  declare _dragdrop: boolean;
  declare _dropfile: boolean;
  declare _enablePocketWatch: unknown;
  declare items: VideoListItem[];
  declare model: VideoListModel;
  declare frameLayer: FrameLayer;
  declare contentWindow: Window;
  declare document: Document | undefined;
  declare $body: UqCollection | undefined;
  declare classList: ClassListWrapper | undefined;
  declare listContainer: Element | null;
  declare list: Element | null;
  declare _pocket: PocketLike | undefined;
  declare _dragging: DragState | null;
  declare intersectionObserver: IntersectionObserver | undefined;
  declare _boundOnItemInview: IntersectionObserverCallback | undefined;
  declare innerWidth: number;
  declare lastBuild: { result: unknown; time: number } | undefined;
  constructor(...args: [VideoListViewParams]) {
    super();
    this.initialize(...args);
  }

  get hasFocus(): boolean {
    return this._hasFocus;
  }
  initialize(params: VideoListViewParams): void {
    this._itemCss = params.itemCss || VideoListItemView.CSS;
    this._className = params.className || 'videoList';

    this._retryGetIframeCount = 0;

    this._maxItems = (params.max as number) || 100;
    this._dragdrop = typeof params.dragdrop === 'boolean' ? params.dragdrop : false;
    this._dropfile = typeof params.dropfile === 'boolean' ? params.dropfile : false;
    this._enablePocketWatch = params.enablePocketWatch;
    this._hasFocus = false;
    this.items = [];

    this.model = params.model as VideoListModel;
    if (this.model) {
      const onUpdate = this._onModelUpdate.bind(this);
      const bounceUtil = bounce as unknown as BounceLike;
      const debouncedUpdate = bounceUtil.time(onUpdate);
      this.model.on('update', (...args: unknown[]) => debouncedUpdate(args[0] as VideoListItem[]));
    }

    this._initializeView(params);
  }
  _initializeView(params: VideoListViewParams): void {
    const html = VideoListView.__tpl__.replace('%CSS%', this._itemCss);
    const frame = (this.frameLayer = new FrameLayer({
      container: params.container as Element,
      html,
      className: 'videoListFrame',
    }));
    frame.wait().then((w) => this._initializeFrame(w));
  }
  _initializeFrame(w: Window): void {
    this.contentWindow = w;
    const doc = (this.document = w.document);
    const uqFn = uq as unknown as UqStatic;
    const classListFactory = ClassList as unknown as ClassListFactory;
    const css = cssUtil as unknown as CssUtilLike;
    const globalLike = global as unknown as GlobalEmitterLike;
    const $body = (this.$body = uqFn(doc.body));
    this.classList = classListFactory(doc.body);
    if (this._className) {
      this.addClass(this._className);
    }

    css.registerProps(
      { name: '--list-length', syntax: '<integer>', initialValue: 1, inherits: true, window: w },
      { name: '--active-index', syntax: '<integer>', initialValue: 1, inherits: true, window: w },
      // {name: '--trans-x-pp', syntax: '<length-percentage>', initialValue: css.px(0), inherits: false, window: w},
      // {name: '--trans-y-pp', syntax: '<length-percentage>', initialValue: css.px(0), inherits: false, window: w},
      { name: '--progress', syntax: '<length-percentage>', initialValue: css.percent(0), inherits: true, window: w }
    );

    const container = (this.listContainer = doc.querySelector('#listContainer') as Element);
    const list = (this.list = doc.getElementById('listContainerInner'));
    if (this.items && this.items.length) {
      void this.renderList(this.items);
    }

    $body
      .on('click', this._onClick.bind(this))
      // this.frameLayer.addEventBridge('keydown').addEventBridge('keyup');
      .on('keydown', (e) => globalLike.emitter.emit('keydown', e))
      .on('keyup', (e) => globalLike.emitter.emit('keyup', e));
    w.addEventListener('focus', () => (this._hasFocus = true));
    w.addEventListener('blur', () => (this._hasFocus = false));
    w.addEventListener(
      'resize',
      _.debounce(() => (this.innerWidth = Math.max(w.innerWidth, 300)), 100)
    );

    this.innerWidth = Math.max(w.innerWidth, 300);
    this._updateCSSVars();

    if (this._dragdrop) {
      $body.on('mousedown', this._onBodyMouseDown.bind(this), { passive: true });
    }

    const ccl = classListFactory(container);
    const onScroll = _.throttle(() => {
      ccl.add('is-scrolling');
      onScrollEnd();
    }, 100);
    const onScrollEnd = _.debounce(() => ccl.remove('is-scrolling'), 500);
    container.addEventListener('scroll', onScroll, { passive: true });

    if (this._dropfile) {
      $body
        .on('dragover', this._onBodyDragOverFile.bind(this))
        .on('dragenter', this._onBodyDragEnterFile.bind(this))
        .on('dragleave', this._onBodyDragLeaveFile.bind(this))
        .on('drop', this._onBodyDropFile.bind(this));
    }

    void MylistPocketDetector.detect().then(async (pocket) => {
      const pocketLike = pocket as PocketLike;
      this._pocket = pocketLike;
      await sleep.idle();
      this.addClass('is-pocketReady');
      if (pocketLike.external.observe && this._enablePocketWatch) {
        pocketLike.external.observe({
          query: '.is-not-resolved a.videoLink',
          container: list,
          closest: '.videoItem',
          callback: this._onMylistPocketInfo.bind(this),
        });
      }
    });
  }
  _onMylistPocketInfo(
    itemView: Element,
    {
      info,
      isNg,
      isFav,
    }: {
      info: { watchId: string };
      isNg: unknown;
      isFav: boolean;
    }
  ): void {
    const item = this.findItemByItemView(itemView);
    if (!item) {
      return;
    }
    if (isNg) {
      this.model.removeItem(item);
      return;
    }
    item.isFavorited = isFav;
    item.isPocketResolved = true;
    item.watchId = info.watchId;
    (item as unknown as Record<string, unknown>).info = info;
  }
  _onBodyMouseDown(e: MouseEvent): void {
    const itemView = (e.target as unknown as Element).closest('.videoItem');
    if (!itemView) {
      return;
    }
    if ((e.target as unknown as Element).closest('[data-command]')) {
      return;
    }
    const item = this.findItemByItemView(itemView);
    if (!item) {
      console.warn('no-item');
      return;
    }
    const dragOffset = {
      x: e.pageX,
      y: e.pageY,
      st: this.scrollTop(),
    };
    this._dragging = { item, itemView, dragOffset, dragOver: {} };
    const css = cssUtil as unknown as CssUtilLike;
    css.setProps([itemView, '--trans-x-pp', 0], [itemView, '--trans-y-pp', 0]);
    this._bindDragStartEvents();
  }
  _bindDragStartEvents(): void {
    const body = this.$body!;
    body
      .on('mousemove.drag', this._onBodyDragMouseMove.bind(this))
      .on('mouseup.drag', this._onBodyDragMouseUp.bind(this))
      .on('blur.drag', this._onBodyBlur.bind(this))
      .on('mouseleave.drag', this._onBodyMouseLeave.bind(this));
  }
  _unbindDragStartEvents(): void {
    const body = this.$body!;
    body.off('mousemove.drag').off('mouseup.drag').off('blur.drag').off('mouseleave.drag');
  }
  _onBodyDragMouseMove(e: MouseEvent): void {
    const dragging = this._dragging;
    if (!dragging) {
      return;
    }
    const css = cssUtil as unknown as CssUtilLike;
    const { item, itemView, dragOffset, dragOver } = dragging;
    const x = e.pageX - dragOffset.x;
    const y = e.pageY - dragOffset.y + (this.scrollTop() - dragOffset.st);

    if (x * x + y * y < 100) {
      return;
    }
    css.setProps([itemView, '--trans-x-pp', css.px(x)], [itemView, '--trans-y-pp', css.px(y)]);
    item.isDragging = true;
    this.addClass('is-dragging');
    const targetView = (e.target as unknown as Element).closest('.videoItem');
    if (!targetView) {
      if (dragOver && dragOver.item) {
        dragOver.item.isDragover = false;
      }
      dragging.dragOver = null;
      return;
    }
    const targetItem = this.findItemByItemView(targetView);
    if (!targetItem || (dragOver && dragOver.item === targetItem)) {
      return;
    }
    if (dragOver && dragOver.item) {
      dragOver.item.isDragover = false;
    }
    targetItem.isDragover = true;
    dragging.dragOver = {
      item: targetItem,
      itemView: targetView,
    };
  }
  _onBodyDragMouseUp(): void {
    this._unbindDragStartEvents();
    const dragging = this._dragging;
    if (!dragging) {
      return;
    }
    const { item, itemView, dragOver } = dragging;
    this._endBodyMouseDragging();

    const over = dragOver;
    if (!over || !over.itemView || itemView === over.itemView) {
      return;
    }
    const targetItem = over.item as VideoListItem;
    item.isUpdating = true;

    this.addClass('is-updating');

    this._dragging = null;
    this.emit('moveItem', item.itemId, targetItem.itemId);
  }
  _onBodyBlur(): void {
    this._endBodyMouseDragging();
  }
  _onBodyMouseLeave(): void {
    this._endBodyMouseDragging();
  }
  _endBodyMouseDragging(): void {
    this._unbindDragStartEvents();
    this.removeClass('is-dragging');
    const dragging = this._dragging;
    if (dragging && dragging.item) {
      dragging.item.isDragging = false;
    }
    this._dragging = null;
  }
  _onBodyDragOverFile(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.addClass('is-dragover');
  }
  _onBodyDragEnterFile(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.addClass('is-dragover');
  }
  _onBodyDragLeaveFile(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.removeClass('is-dragover');
  }
  _onBodyDropFile(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.removeClass('is-dragover');

    const transfer = (e as unknown as { originalEvent: DragEvent }).originalEvent.dataTransfer as DataTransfer;
    const file = transfer.files[0] as File;
    if (!/\.playlist\.json$/.test(file.name)) {
      return;
    }

    const fileReader = new FileReader();
    fileReader.onload = (ev: ProgressEvent<FileReader>) => {
      window.console.log('file data: ', (ev.target as FileReader).result);
      this.emit('filedrop', (ev.target as FileReader).result, file.name);
    };

    fileReader.readAsText(file);
  }
  async _onModelUpdate(items: VideoListItem[]): Promise<void> {
    this.items = items;
    this.addClass('is-updating');
    await this.renderList(items);
    this.removeClass('is-updating');
    this.emit('update');
  }
  findItemByItemView(itemView: Element): VideoListItem | undefined {
    const itemId = Number((itemView as HTMLElement).dataset.itemId);
    return this.model.findByItemId(itemId);
  }
  async renderList(items?: VideoListItem[]): Promise<void> {
    const list = this.list;
    if (!list) {
      return;
    }
    const targets = items || this.items || [];
    const dllLike = dll as unknown as DllLike;
    const globalLike = global as unknown as GlobalEmitterLike;
    const lit = dllLike.lit || ((await globalLike.emitter.promise('lit-html')) as DllLitLike);
    const timeLabel = `update playlistView items = ${targets.length}`;
    console.time(timeLabel);
    lit.render(await this._buildList(targets), list);
    console.timeEnd(timeLabel);
    this._updateCSSVars();
    this._setInviewObserver();
  }
  async _buildList(items?: VideoListItem[]): Promise<unknown> {
    const targets = items || this.items || [];
    const dllLike = dll as unknown as DllLike;
    const globalLike = global as unknown as GlobalEmitterLike;
    const lit = dllLike.lit || ((await globalLike.emitter.promise('lit-html')) as DllLitLike);
    const mapper = (item: VideoListItem, index: number): unknown => VideoListItemView.build(item, index);
    const result = lit.html`${targets.map(mapper)}`;
    this.lastBuild = { result, time: performance.now() };
    return result;
  }
  _setInviewObserver(): void {
    const doc = this.document;
    if (!doc) {
      return;
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    const targets = [...doc.querySelectorAll('.videoItem')];
    if (!targets.length) {
      return;
    }
    const onInview = (this._boundOnItemInview = this._boundOnItemInview || this._onItemInview.bind(this));
    const observer = (this.intersectionObserver = new IntersectionObserver(onInview, {
      rootMargin: '800px',
      root: this.listContainer,
    }));
    targets.forEach((target) => observer.observe(target));
  }
  _onItemInview(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const itemView = entry.target;
      const item = this.findItemByItemView(itemView);
      if (!item) {
        continue;
      }
      item.isLazy = !entry.isIntersecting;
    }
  }
  _updateCSSVars(): void {
    const doc = this.document;
    if (!doc) {
      return;
    }
    const css = cssUtil as unknown as CssUtilLike;
    const body = doc.body;
    css.setProps(
      [body, '--list-length', css.number(this.model.length)],
      [body, '--active-index', css.number(this.model.activeIndex)]
    );
  }
  _onClick(e: MouseEvent): void {
    const globalLike = global as unknown as GlobalEmitterLike;
    e.stopPropagation();
    void globalLike.emitter.emitAsync('hideHover');
    const eventTarget = e.target as unknown as Element;
    const target = eventTarget.closest('.command');
    const itemView = eventTarget.closest('.videoItem');
    const item = itemView ? this.findItemByItemView(itemView) : null;
    if (!target) {
      return;
    }
    e.preventDefault();
    const { command, param } = (target as HTMLElement).dataset;
    const itemId = item ? item.itemId : 0;
    switch (command) {
      case 'deflistAdd':
        this.emit('deflistAdd', param, itemId);
        break;
      case 'playlistAppend':
        this.emit('playlistAppend', param, itemId);
        break;
      case 'pocket-info':
        window.setTimeout(() => (this._pocket as PocketLike).external.info(param), 100);
        break;
      case 'scrollToTop':
        this.scrollTop(0, 300);
        break;
      case 'playlistRemove':
        if (item) {
          item.isUpdating = true;
        }
        this.emit('command', command, param, itemId);
        break;
      default:
        this.emit('command', command, param, itemId);
    }
  }
  addClass(name: string): void {
    if (this.classList) {
      this.classList.add(name);
    }
  }
  removeClass(name: string): void {
    if (this.classList) {
      this.classList.remove(name);
    }
  }
  toggleClass(name: string, v?: boolean): void {
    if (this.classList) {
      this.classList.toggle(name, v);
    }
  }
  scrollTop(v: number, _animateMs?: unknown): void;
  scrollTop(): number;
  scrollTop(v?: number): number | undefined {
    if (!this.listContainer) {
      return 0;
    }
    if (typeof v === 'number') {
      this.listContainer.scrollTop = v;
      return;
    } else {
      return this.listContainer.scrollTop;
    }
  }
  scrollToItem(itemId: number | { itemId: number }): void {
    const body = this.$body;
    if (!body) {
      return;
    }
    if (typeof itemId === 'object') {
      itemId = itemId.itemId;
    }
    const $target = body.find(`.item${itemId}`);
    if (!$target.length) {
      return;
    }
    ($target[0] as Element).scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

VideoListView.__tpl__ = `
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>VideoList</title>
<style type="text/css">

  ${CONSTANT.BASE_CSS_VARS}
  ${CONSTANT.SCROLLBAR_CSS}

  body {
    user-select: none;
    background: #333;
    overflow: hidden;
  }

  .drag-over>* {
    opacity: 0.5;
    pointer-events: none;
  }

  .is-updating #listContainer {
    pointer-events: none;
    opacity: 0.5;
    transition: none;
  }

  #listContainer {
    position: absolute;
    top: 0;
    left:0;
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
    overflow-x: hidden;
    overflow-y: scroll;
    overscroll-behavior: none;
    transition: 0.2s opacity;
    counter-reset: itemIndex;
    will-change: transform;
  }

  #listContainerInner {
    display: grid;
    grid-auto-rows: 100px;
  }

  .is-scrolling #listContainerInner {
    pointer-events: none;
    animation-play-state: paused !important;
  }

  .scrollToTop, .scrollToActive {
    position: fixed;
    width: 32px;
    height: 32px;
    right: 48px;
    bottom: 8px;
    font-size: 24px;
    line-height: 32px;
    text-align: center;
    z-index: 100;
    background: #ccc;
    color: #000;
    border-radius: 100%;
    cursor: pointer;
    opacity: 0.3;
    transition: opacity 0.4s ease;
  }

  .scrollToActive {
    --progress: calc(var(--active-index) / var(--list-length) * 100%);
    display: none;
    top: var(--progress);
    border-radius: 0;
    bottom: auto;
    right: 0;
    transform: translateY(calc(var(--progress) * -1));
    background: none;
    opacity: 0.5;
    color: #f99;
  }
  .playlist .scrollToActive {
    display: block;
  }
  .playlist .scrollToActive:hover {
    background: #ccc;
  }

  .scrollToTop:hover {
    opacity: 0.9;
    box-shadow: 0 0 8px #fff;
  }

</style>
<style id="listItemStyle">%CSS%</style>
<body class="zenzaRoot">
<div id="listContainer">
  <div id="listContainerInner"></div>
</div>
<div class="scrollToActive command" title="いまここ" data-command="scrollToActiveItem">&#9658;</div>

<div class="scrollToTop command" title="一番上にスクロール" data-command="scrollToTop">&#x2303;</div>
</body>
</html>

  `.trim();

//===END===
export { VideoListView };
