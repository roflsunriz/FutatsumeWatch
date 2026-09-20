import _ from 'lodash';
import { Emitter } from '../../../lib/src/emitter';
import type { StoryboardInfoModel } from './storyboard-info-model';
import { global } from '../../../../src/futatsume-watch-index';
import { cssUtil } from '../../../lib/src/css/css';
import { textUtil } from '../../../lib/src/text/text-util';
import { uq } from '../../../lib/src/u-query';
import { domEvent } from '../../../lib/src/dom/dom-event';
import { TextLabel } from '../../../lib/src/ui/text-label';
import { StoryboardWorker } from './storyboard-worker';
import { MediaTimeline } from '../../../lib/src/dom/media-timeline';
import { ClassList } from '../../../lib/src/dom/class-list-wrapper';

interface StoryboardViewParams {
  container?: Element;
  model: StoryboardInfoModel;
  enable?: unknown;
  state: StoryboardViewState;
}

interface StoryboardViewState {
  isDragging: boolean;
  onkey(name: string, handler: (...args: unknown[]) => void): void;
}

interface BoardHandle {
  resize(size: { width: number; height: number }): void;
  setInfo(info: unknown): void;
  currentTime: number;
  scrollLeft: number;
  sharedMemory(params: { buffer: ArrayBuffer; MAP: unknown }): void;
  startAnimation(): void;
  stopAnimation(): void;
  readonly isAnimating: boolean;
}

interface StoryboardWorkerLike {
  createBoard(args: { container: Element | null; canvas: Element | null; info: unknown; name: string }): BoardHandle;
}

interface UqCollection {
  on(name: string, handler: (e: MouseEvent) => void, options?: unknown): UqCollection;
  readonly length: number;
  [index: number]: Element;
}

interface UqStatic {
  (element: Element): UqCollection;
  html(html: string): UqCollection;
}

interface CssUtilLike {
  addStyle(css: string, id?: string): void;
  setProps(...props: unknown[]): void;
  px(value: number): string;
}

interface TextUtilLike {
  secToTime(value: number): string;
}

interface DomEventLike {
  dispatchCommand(target: unknown, command: string, param: unknown): void;
}

interface TextLabelLike {
  text: unknown;
}

interface TextLabelFactory {
  create(options: unknown): TextLabelLike;
}

interface ClassListWrapper {
  add(...names: string[]): ClassListWrapper;
  remove(...names: string[]): ClassListWrapper;
  toggle(name: string, force?: boolean): boolean;
}

interface ClassListFactory {
  (view: Element): ClassListWrapper;
}

interface MediaTimelineMain {
  currentTime: number;
  buffer: ArrayBuffer;
}

interface MediaTimelineLike {
  readonly isSharable: boolean;
  get(name: string): MediaTimelineMain;
  readonly MAP: unknown;
}

interface GlobalLike {
  readonly innerWidth: number;
  debug: Record<string, unknown>;
  emitter: { on(name: string, handler: (...args: unknown[]) => void): void };
}

// import {bounce} from '';
//===BEGIN===

class StoryboardView extends Emitter {
  declare static __tpl__: string;
  declare static __css__: string;
  declare _container: Element | undefined;
  declare _model: StoryboardInfoModel;
  declare _isHover: boolean;
  declare _scrollLeft: number;
  declare _pointerLeft: number;
  declare isOpen: boolean;
  declare isEnable: boolean;
  declare totalWidth: number;
  declare state: StoryboardViewState;
  declare _view: Element | undefined;
  declare _body: Element | undefined;
  declare _inner: Element | null | undefined;
  declare _cursorTime: Element | null | undefined;
  declare _pointer: Element | null | undefined;
  declare cursorTimeLabel: TextLabelLike | undefined;
  declare _bouncedOnToucheMoveEnd: () => void;
  declare canvas: BoardHandle | undefined;
  declare _scrollLeftChanged: boolean | undefined;
  declare _pointerLeftChanged: boolean | undefined;
  declare _pointerUpdating: boolean | undefined;
  declare isMouseMoving: boolean | undefined;
  declare isTouchMoving: boolean | undefined;
  declare _currentTime: number | undefined;
  constructor(...args: [StoryboardViewParams]) {
    super();
    this.initialize(...args);
  }

  initialize(params: StoryboardViewParams): void {
    console.log('%c initialize StoryboardView', 'background: lightgreen;');
    this._container = params.container;

    /** @type {StoryboardInfoModel} */
    const sb = (this._model = params.model);

    this._isHover = false;
    this._scrollLeft = 0;
    this._pointerLeft = 0;
    this.isOpen = false;
    this.isEnable = _.isBoolean(params.enable) ? params.enable : true;
    this.totalWidth = (global as unknown as GlobalLike).innerWidth;
    this.state = params.state;
    this.state.onkey('isDragging', () => this.updateAnimation());

    sb.on('update', this._onStoryboardUpdate.bind(this));
    sb.on('reset', this._onStoryboardReset.bind(this));
  }
  get isHover(): boolean {
    return this._isHover;
  }
  set isHover(v: boolean) {
    this._isHover = v;
    this.updateAnimation();
  }
  updateAnimation(): void {
    const mediaTimeline = MediaTimeline as unknown as MediaTimelineLike;
    if (!this.canvas || !mediaTimeline.isSharable) {
      return;
    }
    if (!this.isHover && this.isOpen && !this.state.isDragging) {
      this.canvas.startAnimation();
    } else {
      this.canvas.stopAnimation();
    }
  }
  enable(): void {
    this.isEnable = true;
    if (this._view && this._model.isAvailable) {
      this.open();
    }
  }
  open(): void {
    const classListFactory = ClassList as unknown as ClassListFactory;
    if (!this._view) {
      return;
    }
    this.isOpen = true;
    classListFactory(this._view).add('is-open');
    classListFactory(this._body!).add('futatsumeStoryboardOpen');
    classListFactory(this._container!).add('futatsumeStoryboardOpen');
    this.updateAnimation();
    this.updatePointer();
  }
  close(): void {
    const classListFactory = ClassList as unknown as ClassListFactory;
    if (!this._view) {
      return;
    }
    this.isOpen = false;
    classListFactory(this._view).remove('is-open');
    classListFactory(this._body!).remove('futatsumeStoryboardOpen');
    classListFactory(this._container!).remove('futatsumeStoryboardOpen');
    this.updateAnimation();
  }
  disable(): void {
    this.isEnable = false;
    this.close();
  }
  toggle(v?: unknown): void {
    if (typeof v === 'boolean') {
      this.isEnable = !v;
    }
    if (this.isEnable) {
      this.disable();
    } else {
      this.enable();
    }
  }
  _initializeStoryboard(): void {
    if (this._view) {
      return;
    }
    window.console.log('%cStoryboardView.initializeStoryboard', 'background: lightgreen;');

    const css = cssUtil as unknown as CssUtilLike;
    const uqFn = uq as unknown as UqStatic;
    const labelFactory = TextLabel as unknown as TextLabelFactory;
    this._body = document.body;

    css.addStyle(StoryboardView.__css__);
    const view = (this._view = uqFn.html(StoryboardView.__tpl__)[0]!);

    const inner = (this._inner = view.querySelector('.storyboardInner'));
    this._cursorTime = view.querySelector('.cursorTime');
    this._pointer = view.querySelector('.storyboardPointer');
    this._inner = inner;
    this.cursorTimeLabel = labelFactory.create({
      container: this._cursorTime,
      name: 'cursorTimeLabel',
      text: '00:00',
      style: {
        widthPx: 54,
        heightPx: 29,
        fontFamily: 'monospace',
        fontWeight: '',
        fontSizePx: 13.3,
        color: '#000',
      },
    });

    const onHoverIn = (): void => {
      this.isHover = true;
    };
    const onHoverOut = (): void => {
      this.isHover = false;
    };
    uqFn(inner as Element)
      .on('click', this._onBoardClick.bind(this))
      .on('mousemove', this._onBoardMouseMove.bind(this))
      .on('mousemove', _.debounce(this._onBoardMouseMoveEnd.bind(this), 300))
      .on('wheel', this._onMouseWheel.bind(this))
      .on('wheel', _.debounce(this._onMouseWheelEnd.bind(this), 300), { passive: true })
      .on('mouseenter', onHoverIn)
      .on('mouseleave', _.debounce(onHoverOut, 1000))
      .on('touchstart', this._onTouchStart.bind(this), { passive: true })
      .on('touchmove', this._onTouchMove.bind(this), { passive: true });
    this._bouncedOnToucheMoveEnd = _.debounce(this._onTouchMoveEnd.bind(this), 2000);

    this._container!.append(view);
    (view.closest('.futatsume-root') as Element).addEventListener('touchend', () => (this.isHover = false), {
      passive: true,
    });

    window.addEventListener(
      'resize',
      _.throttle(() => {
        if (this.canvas) {
          this.canvas.resize({ width: (global as unknown as GlobalLike).innerWidth, height: this._model.cellHeight });
        }
      }, 500),
      { passive: true }
    );

    void this.emitResolve('dom-ready');
  }
  _parsePointerEvent(event: MouseEvent): { sec: number; x: number } {
    const model = this._model;
    const left = event.offsetX + this._scrollLeft;
    const cellIndex = left / model.cellWidth;
    const sec = (cellIndex * model.cellIntervalMs) / 1000;
    return { sec, x: event.x };
  }
  _onBoardClick(e: MouseEvent): void {
    const dom = domEvent as unknown as DomEventLike;
    const css = cssUtil as unknown as CssUtilLike;
    const { sec } = this._parsePointerEvent(e);
    css.setProps([this._cursorTime, '--trans-x-pp', css.px(-1000)]);

    dom.dispatchCommand(this._view, 'seekTo', sec);
  }
  _onBoardMouseMove(e: MouseEvent): void {
    const text = textUtil as unknown as TextUtilLike;
    const css = cssUtil as unknown as CssUtilLike;
    const { sec, x } = this._parsePointerEvent(e);

    const label = this.cursorTimeLabel as TextLabelLike;
    label.text = text.secToTime(sec);
    css.setProps([this._cursorTime, '--trans-x-pp', css.px(x)]);

    this.isHover = true;
    this.isMouseMoving = true;
  }
  _onBoardMouseMoveEnd(): void {
    this.isMouseMoving = false;
  }
  _onMouseWheel(e: MouseEvent): void {
    // 縦ホイールで左右スクロールできるようにする
    e.stopPropagation();
    const wheel = e as WheelEvent;
    const deltaX = parseInt(String(wheel.deltaX), 10);
    const delta = parseInt(String(wheel.deltaY), 10);
    if (Math.abs(deltaX) > Math.abs(delta)) {
      // 横ホイールがある環境ならなにもしない
      return;
    }
    e.preventDefault();
    this.isHover = true;
    this.isMouseMoving = true;
    // this.setScrollLeft(this.scrollLeft + delta * 5, true);
    this.scrollLeft += delta * 5;
  }
  _onMouseWheelEnd(): void {
    this.isMouseMoving = false;
  }
  _onTouchStart(e: MouseEvent): void {
    this.isHover = true;
    this.isMouseMoving = true;
    e.stopPropagation();
  }
  _onTouchEnd(): void {}
  _onTouchMove(e: MouseEvent): void {
    e.stopPropagation();
    this.isHover = true;
    this.isMouseMoving = true;
    this.isTouchMoving = true;
    this._bouncedOnToucheMoveEnd();
  }
  _onTouchMoveEnd(): void {
    this.isTouchMoving = false;
    this.isMouseMoving = false;
  }
  _onTouchCancel(): void {}
  update(): void {
    this.isHover = false;
    this._scrollLeft = 0;

    this._initializeStoryboard();

    this.close();
    const view = this._view!;
    const classListFactory = ClassList as unknown as ClassListFactory;
    classListFactory(view).remove('is-success', 'is-fail');
    if (this._model.status === 'ok') {
      this._updateSuccess();
    } else {
      this._updateFail();
    }
  }
  get isCanvasAnimating(): boolean {
    return this.isEnable && this.canvas!.isAnimating;
  }
  get scrollLeft(): number {
    return this._scrollLeft;
  }
  set scrollLeft(left: number) {
    left = Math.min(Math.max(0, left), this.totalWidth - (global as unknown as GlobalLike).innerWidth);

    if (this._scrollLeft === left) {
      return;
    }

    this._scrollLeftChanged = true;
    this._scrollLeft = left;
    if (!this.isCanvasAnimating && (this.isOpen || this.state.isDragging)) {
      this.canvas!.scrollLeft = left;
    }
    this.updatePointer();
  }
  get pointerLeft(): number {
    return this._pointerLeft;
  }
  set pointerLeft(left: number) {
    if (this._pointerLeft === left) {
      return;
    }
    this._pointerLeftChanged = true;
    this._pointerLeft = left;
    this.updatePointer();
  }
  updatePointer(): void {
    const css = cssUtil as unknown as CssUtilLike;
    if (
      !this._pointer ||
      !this.isOpen ||
      this._pointerUpdating ||
      (this.isCanvasAnimating && !this.isHover) ||
      (!this._pointerLeftChanged && !this._scrollLeftChanged)
    ) {
      return;
    }
    this._pointerUpdating = true;
    this._pointerLeftChanged = false;
    this._scrollLeftChanged = false;
    css.setProps([
      this._pointer,
      '--trans-x-pp',
      css.px(this._pointerLeft - this._scrollLeft - this._model.cellWidth / 2),
    ]);
    this._pointerUpdating = false;
  }
  _updateSuccess(): void {
    const view = this._view!;
    const classListFactory = ClassList as unknown as ClassListFactory;
    const cl = classListFactory(view);
    cl.add('is-success');

    window.console.time('createStoryboardDOM');
    this._updateSuccessDom();
    window.console.timeEnd('createStoryboardDOM');

    if (!this.isEnable) {
      return;
    }
    cl.add('opening', 'is-open');
    this.scrollLeft = 0;
    this.open();
    window.setTimeout(() => cl.remove('opening'), 1000);
  }
  _updateSuccessDom(): void {
    const worker = StoryboardWorker as unknown as StoryboardWorkerLike;
    const mediaTimeline = MediaTimeline as unknown as MediaTimelineLike;
    const globalLike = global as unknown as GlobalLike;
    const model = this._model;
    const infoRawData = model.rawData;
    if (!this.canvas) {
      this.canvas = worker.createBoard({
        container: this._view!.querySelector('.storyboardCanvasContainer'),
        canvas: this._view!.querySelector('.storyboardCanvas'),
        info: infoRawData,
        name: 'StoryboardCanvasView',
      });
      this.canvas.resize({ width: globalLike.innerWidth, height: model.cellHeight });
      if (mediaTimeline.isSharable) {
        const mt = mediaTimeline.get('main');
        this.canvas.currentTime = mt.currentTime;
        this.canvas.sharedMemory({ buffer: mt.buffer, MAP: mediaTimeline.MAP });
      }
    } else {
      this.canvas.setInfo(infoRawData);
      this.canvas.resize({ width: globalLike.innerWidth, height: model.cellHeight });
    }

    this.totalWidth = Math.ceil((model.duration * 1000) / model.cellIntervalMs) * model.cellWidth;
    const css = cssUtil as unknown as CssUtilLike;
    css.setProps(
      [this._pointer, '--width-pp', css.px(model.cellWidth)],
      [this._pointer, '--height-pp', css.px(model.cellHeight)],
      [this._inner, '--height-pp', css.px(model.cellHeight + 8)]
    );
  }
  _updateFail(): void {
    const classListFactory = ClassList as unknown as ClassListFactory;
    classListFactory(this._view!).remove('is-uccess').add('is-fail');
  }
  setCurrentTime(sec: number, forceUpdate?: unknown): void {
    const globalLike = global as unknown as GlobalLike;
    const model = this._model;
    if (!this._view || !model.isAvailable) {
      return;
    }
    if (this._currentTime === sec) {
      return;
    }

    this._currentTime = sec;
    const duration = Math.max(1, model.duration);
    const per = sec / duration;
    const intervalMs = model.cellIntervalMs;
    const totalWidth = this.totalWidth;
    const innerWidth = globalLike.innerWidth;

    const cellWidth = model.cellWidth;
    const cellIndex = (sec * 1000) / intervalMs;
    const scrollLeft = Math.min(Math.max(cellWidth * cellIndex - innerWidth * per, 0), totalWidth - innerWidth);

    if (forceUpdate || !this.isHover) {
      this.scrollLeft = scrollLeft;
    }
    this.pointerLeft = cellWidth * cellIndex;
  }
  get currentTime(): number | undefined {
    return this._currentTime;
  }
  set currentTime(sec: number) {
    void this.setCurrentTime(sec);
  }
  _onStoryboardUpdate(): void {
    this.update();
  }
  _onStoryboardReset(): void {
    if (!this._view) {
      return;
    }
    this.close();
    const classListFactory = ClassList as unknown as ClassListFactory;
    classListFactory(this._view).remove('is-open', 'is-fail');
  }
}

StoryboardView.__tpl__ = `
  <div id="storyboardContainer" class="storyboardContainer">
    <div class="cursorTime"></div>
    <div class="storyboardCanvasContainer"><canvas class="storyboardCanvas is-loading" height="90"></canvas></div>
    <div class="storyboardPointer"></div>
    <div class="storyboardInner"></div>
  </div>
  `.trim();

StoryboardView.__css__ = `
  .storyboardContainer {
    position: absolute;
    top: 0;
    opacity: 0;
    visibility: hidden;
    left: 0;
    right: 0;
    width: 100vw;
    box-sizing: border-box;
    z-index: 9005;
    overflow: hidden;
    pointer-events: none;
    will-change: tranform;
    display: none;
    contain: layout paint style;
    user-select: none;
    transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out, visibility 0.2s;
  }

  .storyboardContainer.opening {
    pointer-events: none !important;
  }

  .storyboardContainer.is-success {
    display: block;
    opacity: 0;
  }

  .storyboardContainer * {
    box-sizing: border-box;
  }

  .is-wheelSeeking .storyboardContainer.is-success,
  .is-dragging .storyboardContainer.is-success,
  .storyboardContainer.is-success.is-open {
    z-index: 50;
    opacity: 1;
    transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
    visibility: visible;
    pointer-events: auto;
    transform: translate3d(0, -100%, 0) translateY(10px);
  }

  .is-wheelSeeking .storyboardContainer,
  .is-dragging     .storyboardContainer {
    pointer-events: none;
  }

  .is-fullscreen .is-wheelSeeking .storyboardContainer,
  .is-fullscreen .is-dragging     .storyboardContainer,
  .is-fullscreen                  .storyboardContainer.is-open {
    position: fixed;
    top: calc(100% - 10px);
  }

  .storyboardCanvasContainer {
    position: absolute;
    pointer-events: none;
    width: 100vw;
    z-index: 90;
    contain: layout size style;
  }
  .storyboardCanvas {
    width: 100%;
    height: 100%;
    opacity: 1;
    transition: opacity 0.5s ease 0.5s;
  }
  .storyboardCanvas.is-loading {
    opacity: 0;
    transition: none;
  }

  .storyboardContainer .storyboardInner {
    --height-pp: 98px;
    height: var(--height-pp);
    display: none;
    overflow: hidden;
    margin: 0;
    contain: strict;
    width: 100vw;
    overscroll-behavior: none;
  }
  .storyboardContainer.is-success .storyboardInner {
    display: block;
  }

  .storyboardContainer .cursorTime {
    display: none;
    position: absolute;
    top: 12px;
    left: 0;
    width: 54px; height: 29px;
    z-index: 9010;
    background: #ffc;
    pointer-events: none;
    contain: strict;
    transform: translate(var(--trans-x-pp), 30px) translate(-50%, -100%);
  }
  .storyboardContainer:hover .cursorTime {
    transition: --trans-x-pp 0.1s ease-out;
    display: block;
  }

  .storyboardContainer:active  .cursorTime,
  .storyboardContainer.opening .cursorTime {
    display: none;
  }

  .storyboardPointer {
    visibility: hidden;
    position: absolute;
    top: 0;
    z-index: 100;
    pointer-events: none;
    --width-pp: 160px;
    --height-pp: 90px;
    --trans-x-pp: -100%;
    width: var(--width-pp);
    height: var(--height-pp);
    will-change: transform;
    transform: translate(var(--trans-x-pp), 0);
    background: #ff9;
    opacity: 0.5;
  }

  .storyboardContainer:hover .storyboardPointer {
    visibility: visible;
    transition: --trans-x-pp 0.4s ease-out;
  }

`.trim();

//===END===
export { StoryboardView };
