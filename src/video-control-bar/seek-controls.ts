import _ from 'lodash';
import { global } from '../futatsume-watch-index';
import { SeekBarThumbnail } from '../storyboard';
import { util, BaseViewComponent } from '../util';
import { throttle } from '../../packages/lib/src/infra/bounce';
import { TextLabel } from '../../packages/lib/src/ui/text-label';
import { cssUtil } from '../../packages/lib/src/css/css';
import { WindowResizeObserver } from '../../packages/lib/src/infra/observable';
import type { PlayerState } from '../state';
import type { VcbBaseViewParams, VcbQuery, VcbSeekBarThumbnail, VcbStoryboard, VcbTextLabel, VcbUtil } from './types';
export class SeekBarToolTip {
  declare static __css__: string;
  declare static __tpl__: string;
  declare _$container: VcbQuery;
  declare _storyboard: VcbStoryboard;
  declare _$view: VcbQuery;
  declare _currentTime: HTMLElement;
  declare currentTimeLabel: VcbTextLabel;
  declare _seekBarThumbnail: VcbSeekBarThumbnail;
  declare _repeatCommand: string | undefined;
  declare _repeatParam: unknown;
  declare _repeatTimer: number | null;
  declare _isRepeating: boolean;
  declare _boundOnRepeat: () => void;
  declare _boundOnMouseUp: (e: Event) => void;
  declare _timeText: string | undefined;
  declare offsetWidth: number | undefined;
  declare _innerWidth: number | undefined;
  constructor(params: { $container: VcbQuery; storyboard: VcbStoryboard }) {
    this._$container = params.$container;
    this._storyboard = params.storyboard;
    this._initializeDom(params.$container);

    this._boundOnRepeat = this._onRepeat.bind(this);
    this._boundOnMouseUp = this._onMouseUp.bind(this);
  }
  _initializeDom($container: VcbQuery): void {
    (util as unknown as VcbUtil).addStyle(SeekBarToolTip.__css__);
    const $view = (this._$view = (util as unknown as VcbUtil).$.html(SeekBarToolTip.__tpl__));

    this._currentTime = $view.find('.currentTime')[0] as HTMLElement;
    this.currentTimeLabel = TextLabel.create({
      container: this._currentTime,
      canvas: undefined,
      ratio: undefined,
      name: 'currentTimeLabel',
      text: '00:00',
      style: {
        widthPx: 50,
        heightPx: 16,
        fontFamily: 'monospace',
        fontWeight: '',
        fontSizePx: 12,
        color: '#ccc',
      },
    });

    $view.on('mousedown', this._onMouseDown.bind(this)).on('click', (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    });

    this._seekBarThumbnail = new SeekBarThumbnail({
      storyboard: this._storyboard,
      container: $view.find('.seekBarThumbnailContainer')[0],
    });

    $container.append($view);
  }
  _onMouseDown(e: Event): void {
    e.stopPropagation();
    const target: HTMLElement | null = (e.target as Element).closest('[data-command]');
    if (!target) {
      return;
    }
    const { command, param, repeat } = target.dataset;
    if (!command) {
      return;
    }

    (util as unknown as VcbUtil).dispatchCommand(e.target, command, param);
    if (repeat === 'on') {
      this._beginRepeat(command, param);
    }
  }
  _onMouseUp(e: Event): void {
    e.preventDefault();
    this._endRepeat();
  }
  _beginRepeat(command: string | undefined, param: unknown): void {
    this._repeatCommand = command;
    this._repeatParam = param;

    (util as unknown as VcbUtil).$('body').on('mouseup.futatsumeSeekbarToolTip', this._boundOnMouseUp);
    this._$view.on('mouseleave', this._boundOnMouseUp).on('mouseup', this._boundOnMouseUp);
    if (this._repeatTimer) {
      window.clearInterval(this._repeatTimer);
    }
    this._repeatTimer = window.setInterval(this._boundOnRepeat, 200);
    this._isRepeating = true;
  }
  _endRepeat(): void {
    this._isRepeating = false;
    if (this._repeatTimer) {
      window.clearInterval(this._repeatTimer);
      this._repeatTimer = null;
    }
    (util as unknown as VcbUtil).$('body').off('mouseup.futatsumeSeekbarToolTip');
    this._$view.off('mouseleave').off('mouseup');
  }
  _onRepeat(): void {
    if (!this._isRepeating) {
      this._endRepeat();
      return;
    }
    (util as unknown as VcbUtil).dispatchCommand(this._$view[0], this._repeatCommand as string, this._repeatParam);
  }
  update(sec: number, left: number): void {
    const timeText = (util as unknown as VcbUtil).secToTime(sec);
    if (this._timeText === timeText) {
      return;
    }
    this._timeText = timeText;
    if (this.currentTimeLabel) {
      this.currentTimeLabel.text = timeText;
    }
    const w = (this.offsetWidth = this.offsetWidth || (this._$view[0] as HTMLElement).offsetWidth);
    const vw = (this._innerWidth = this._innerWidth || window.innerWidth);
    left = Math.max(0, Math.min(left - w / 2, vw - w));
    void cssUtil.setProps([this._$view[0] as Element, '--trans-x-pp', cssUtil.px(left)]);
    this._seekBarThumbnail.currentTime = sec;
  }
}

SeekBarToolTip.__css__ = `
    .seekBarToolTip {
      position: absolute;
      display: inline-block;
      visibility: hidden;
      z-index: 300;
      position: absolute;
      box-sizing: border-box;
      bottom: 24px;
      left: 0;
      width: 180px;
      white-space: nowrap;
      font-size: 10px;
      background: rgba(0, 0, 0, 0.3);
      z-index: 150;
      opacity: 0;
      border: 1px solid #666;
      border-radius: 8px;
      padding: 8px 4px 0;
      will-change: transform;
      transform: translate(var(--trans-x-pp), 0);
      pointer-events: none;
    }

    .is-wheelSeeking .seekBarToolTip,
    .is-dragging .seekBarToolTip,
    .seekBarContainer:hover  .seekBarToolTip {
      opacity: 1;
      visibility: visible;
    }

    .seekBarToolTipInner {
      padding-bottom: 10px;
      pointer-events: auto;
      display: flex;
      text-align: center;
      vertical-aligm: middle;
      width: 100%;
    }
    .is-wheelSeeking .seekBarToolTipInner,
    .is-dragging .seekBarToolTipInner {
      pointer-events: none;
    }

    .seekBarToolTipInner>* {
      flex: 1;
    }

    .seekBarToolTip .currentTime {
      display: inline-block;
      height: 16px;
      margin: 4px 0;
    }

    .seekBarToolTip .controlButton {
      display: inline-block;
      width: 40px;
      height: 28px;
      line-height: 22px;
      font-size: 20px;
      border-radius: 50%;
      margin: 0;
      cursor: pointer;
    }

    .seekBarToolTip .controlButton * {
      cursor: pointer;
    }

    .seekBarToolTip .controlButton:hover {
      text-shadow: 0 0 8px #fe9;
      box-shdow: 0 0 8px #fe9;
    }

    .seekBarToolTip .controlButton:active {
      font-size: 16px;
    }

    .seekBarToolTip .controlButton.toggleCommentPreview {
      opacity: 0.5;
    }

    .enableCommentPreview .seekBarToolTip .controlButton.toggleCommentPreview {
      opacity: 1;
      background: rgba(0,0,0,0.01);
    }

    .is-fullscreen .seekBarToolTip {
      bottom: 10px;
    }
  `.trim();

SeekBarToolTip.__tpl__ = `
    <div class="seekBarToolTip">
      <div class="seekBarThumbnailContainer"></div>
      <div class="seekBarToolTipInner">
        <div class="seekBarToolTipButtonContainer">
          <div class="controlButton backwardSeek" data-command="seekBy" data-param="-5" title="5秒戻る" data-repeat="on">
            <div class="controlButtonInner">⇦</div>
          </div>

          <div class="currentTime"></div>

          <div class="controlButton toggleCommentPreview" data-command="toggleConfig" data-param="enableCommentPreview" title="コメントのプレビュー表示">
            <div class="menuButtonInner">💬</div>
          </div>


          <div class="controlButton forwardSeek" data-command="seekBy" data-param="5" title="5秒進む" data-repeat="on">
            <div class="controlButtonInner">⇨</div>
          </div>
        </div>
      </div>
    </div>
  `.trim();

export class SmoothSeekBarPointer {
  declare _pointer: HTMLElement;
  declare _currentTime: number;
  declare _duration: number;
  declare _playbackRate: number;
  declare _isSmoothMode: boolean;
  declare _isPausing: boolean;
  declare _isSeeking: boolean;
  declare _isStalled: boolean;
  declare _animation: Animation | undefined;
  declare transformLeft: number;
  declare applyTransform: () => void;
  constructor(params: { pointer: Element; playerState: PlayerState }) {
    this._pointer = params.pointer as HTMLElement;
    this._currentTime = 0;
    this._duration = 1;
    this._playbackRate = 1;
    // this._isSmoothMode = (!!this._pointer.animate && 'registerProperty' in CSS);
    this._isSmoothMode = false;
    this._isPausing = true;
    this._isSeeking = false;
    this._isStalled = false;
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- void 関数の throttle 化であり戻り値は使わない
    this.refresh = throttle.raf(this.refresh.bind(this));
    this.transformLeft = 0;
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- void 関数の throttle 化であり戻り値は使わない
    this.applyTransform = throttle.raf(() => {
      const per = Math.min(100, this._timeToPer(this._currentTime));
      this._pointer.style.transform = `translateX(${(global.innerWidth * per) / 100 - 6}px)`;
    });
    this._pointer.classList.toggle('is-notSmooth', !this._isSmoothMode);
    params.playerState.onkey('isPausing', (v: unknown) => (this.isPausing = v as boolean));
    params.playerState.onkey('isSeeking', (v: unknown) => (this.isSeeking = v as boolean));
    params.playerState.onkey('isStalled', (v: unknown) => (this.isStalled = v as boolean));
    if (this._isSmoothMode) {
      WindowResizeObserver.subscribe(() => this.refresh());
    }
  }
  get currentTime(): number {
    return this._currentTime;
  }
  set currentTime(v: number) {
    if (!this._isSmoothMode) {
      this._currentTime = v;
      this.applyTransform();
      return;
    }
    if (document.hidden) {
      return;
    }
    if (this._currentTime === v) {
      if (this.isPlaying) {
        (this._animation as Animation).currentTime = v;
        this.isStalled = true;
        return;
      }
    } else {
      if (this.isStalled) {
        this.isStalled = false;
      }
    }
    this._currentTime = v;

    // 誤差が一定以上になったときのみ補正する
    // videoのcurrentTimeは秒. Animation APIのcurrentTimeはミリ秒
    if (this._animation && Math.abs(v * 1000 - (this._animation.currentTime as number)) > 300) {
      this._animation.currentTime = v * 1000;
    }
  }
  _timeToPer(time: number): number {
    return (time / Math.max(this._duration, 1)) * 100;
  }
  set duration(v: number) {
    if (this._duration === v) {
      return;
    }
    this._duration = v;
    this.refresh();
  }
  set playbackRate(v: number) {
    if (this._playbackRate === v) {
      return;
    }
    this._playbackRate = v;
    if (!this._animation) {
      return;
    }
    this._animation.playbackRate = v;
  }
  get isPausing(): boolean {
    return this._isPausing;
  }
  set isPausing(v: boolean) {
    if (this._isPausing === v) {
      return;
    }
    this._isPausing = v;
    this._updatePlaying();
  }
  get isSeeking(): boolean {
    return this._isSeeking;
  }
  set isSeeking(v: boolean) {
    if (this._isSeeking === v) {
      return;
    }
    this._isSeeking = v;
    this._updatePlaying();
  }
  get isStalled(): boolean {
    return this._isStalled;
  }
  set isStalled(v: boolean) {
    if (this._isStalled === v) {
      return;
    }
    this._isStalled = v;
    this._updatePlaying();
  }
  get isPlaying(): boolean {
    return !this.isPausing && !this.isStalled && !this.isSeeking;
  }
  _updatePlaying(): void {
    if (!this._animation) {
      return;
    }
    if (this.isPlaying) {
      this._animation.play();
    } else {
      this._animation.pause();
    }
  }
  refresh(): void {
    if (!this._isSmoothMode) {
      return;
    }
    if (this._animation) {
      this._animation.finish();
    }
    this._animation = this._pointer.animate(
      [{ transform: 'translateX(-6px)' }, { transform: `translateX(${global.innerWidth - 6}px)` }],
      { duration: this._duration * 1000, fill: 'backwards' }
    );
    this._animation.currentTime = this._currentTime * 1000;
    this._animation.playbackRate = this._playbackRate;
    if (this.isPlaying) {
      this._animation.play();
    } else {
      this._animation.pause();
    }
  }
}

export class WheelSeeker extends BaseViewComponent {
  static get template(): string {
    return `
        <div class="root" style="display: none;">
        </div>
      `;
  }

  constructor(params: { parentNode?: Element | null; watchElement: Element | null }) {
    super({
      parentNode: params.parentNode,
      name: 'WheelSeeker',
      template: '<div class="WheelSeeker"></div>',
      shadow: WheelSeeker.template,
    });
    Object.assign(this._props, {
      watchElement: params.watchElement,
      isActive: false,
      pos: 0,
      ax: 0,
      lastWheelTime: 0,
      duration: 1,
    });
    this._bound.onWheel = _.throttle(this.onWheel.bind(this), 50) as unknown as (e: Event) => void;
    this._bound.onMouseUp = this.onMouseUp.bind(this) as (e: Event) => void;
    this._bound.dispatchSeek = this.dispatchSeek.bind(this);

    (this._props.watchElement as Element).addEventListener('wheel', this._bound.onWheel, { passive: false });
  }

  _initDom(...args: [VcbBaseViewParams]): void {
    super._initDom(...args);

    this._elm = Object.assign({}, this._elm, {
      root: this._shadow || this._view,
      // pointer: (this._shadow || this._view).querySelector('.pointer')
    });
    (this._shadow as Element).addEventListener('contextmenu', (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    });
  }

  enable(): void {
    document.addEventListener('mouseup', this._bound.onMouseUp!, { capture: true, once: true });
    this.refresh();
    (this.dispatchCommand as (...args: Array<unknown>) => void)('wheelSeek-start');
    (this._elm.root as HTMLElement).style.display = '';
    this._props.isActive = true;
    this._props.ax = 0;
    this._props.lastWheelTime = performance.now();
  }

  disable(): void {
    document.removeEventListener('mouseup', this._bound.onMouseUp!);
    (this.dispatchCommand as (...args: Array<unknown>) => void)('wheelSeek-end');
    (this.dispatchCommand as (...args: Array<unknown>) => void)('seek', this.currentTime);
    this._props.isActive = false;
    setTimeout(() => {
      (this._elm.root as HTMLElement).style.display = 'none';
    }, 300);
  }

  onWheel(e: WheelEvent): void {
    const { buttons } = e;
    let { deltaY } = e;

    if (!deltaY) {
      return;
    }
    deltaY = Math.abs(deltaY) >= 100 ? deltaY / 50 : deltaY;
    if (this.isActive) {
      e.preventDefault();
      e.stopPropagation();
      if (!buttons && !e.shiftKey) {
        return this.disable();
      }
      let pos = this._props.pos as number;
      let ax = this._props.ax as number;
      const deltaReversed = ax * deltaY < 0; //lastDelta * deltaY < 0;
      const now = performance.now();
      const seconds = (now - (this._props.lastWheelTime as number)) / 1000;
      this._props.lastWheelTime = now;
      if (deltaReversed) {
        ax = deltaY > 0 ? 0.5 : -0.5;
      } else {
        ax =
          ax *
          Math.pow(1.15, Math.abs(deltaY)) * // speedup
          Math.pow(0.8, Math.floor(seconds / 0.1)); // speeddown
        ax = Math.min(20, Math.abs(ax)) * (ax > 0 ? 1 : -1);
        pos += ax; // / 100;
      }
      pos = Math.min(100, Math.max(0, pos));

      this._props.ax = ax;
      this.pos = pos;
      this.dispatchSeek();
    } else if (buttons || e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      this.enable();
      this._props.ax = deltaY > 0 ? 0.5 : -0.5;
    }
  }

  onMouseUp(e: MouseEvent): void {
    if (!this.isActive) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.disable();
  }

  dispatchSeek(): void {
    (this.dispatchCommand as (...args: Array<unknown>) => void)('wheelSeek', this.currentTime);
  }

  refresh(): void {
    // this._elm.pointer.style.transform = `translateX(${this._props.pos}%)`;
  }

  get isActive(): boolean {
    return this._props.isActive as boolean;
  }
  get duration(): number {
    return this._props.duration as number;
  }
  set duration(v: number) {
    this._props.duration = v;
  }
  get pos(): number {
    return this._props.pos as number;
  }
  set pos(v: number) {
    this._props.pos = v;
    if (this.isActive) {
      this.refresh();
    }
  }
  get currentTime(): number {
    return (this.duration * this.pos) / 100;
  }
  set currentTime(v: number) {
    this.pos = (v / this.duration) * 100;
  }
}
