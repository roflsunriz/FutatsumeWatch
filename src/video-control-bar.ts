import _ from 'lodash';
// import * as _ from 'lodash';
import { FutatsumeWatch, global } from './futatsume-watch-index';
import { CONSTANT } from './constant';
import { SeekBarThumbnail, Storyboard } from './storyboard';
import { util, BaseViewComponent } from './util';
import { Emitter } from './baselib';
import type { EmitterCallback } from '../packages/lib/src/emitter';
import { throttle } from '../packages/lib/src/infra/bounce';
import { HeatMapWorker } from '../packages/futatsume/src/heatMap/heat-map-worker';
import { WatchInfoCacheDb } from '../packages/lib/src/nico/watch-info-cache-db';
import { TextLabel } from '../packages/lib/src/ui/text-label';
import { cssUtil } from '../packages/lib/src/css/css';
import { RequestAnimationFrame } from '../packages/lib/src/infra/request-animation-frame';
import { ClassList } from '../packages/lib/src/dom/class-list-wrapper';
import { VideoControlState } from './state';
import { WindowResizeObserver } from '../packages/lib/src/infra/observable';
import type { ConfigStore } from './config';
import type { PlayerState } from './state';
import type { NicoVideoPlayer } from './nico-video-player';

// 型宣言のみを置く（BEGIN 外のため生成物には含まれない）。
// ランタイムコードへの変更は、型注釈・as キャスト・declare フィールドに留める。
interface VcbQuery {
  [index: number]: Element;
  readonly length: number;
  [Symbol.iterator](): IterableIterator<Element>;
  find(selector: string): VcbQuery;
  forEach<E extends Element = Element>(callback: (elm: E) => void): void;
  addClass(className: string): VcbQuery;
  removeClass(className: string): VcbQuery;
  on<E extends Event>(event: string, handler: (e: E) => void, options?: AddEventListenerOptions): VcbQuery;
  off(event?: string): VcbQuery;
  append(target: unknown): VcbQuery;
  mapQuery(map: Record<string, string>): { e: Record<string, Element>; $: Record<string, VcbQuery> };
  html(markup: string): VcbQuery;
  raf: {
    toggleClass(name: string, force?: boolean): VcbQuery;
    addClass(name: string): VcbQuery;
    removeClass(name: string): VcbQuery;
    text(value: unknown): VcbQuery;
  };
}
interface VcbDollarStatic {
  (target: unknown): VcbQuery;
  html(markup: string): VcbQuery;
}
interface VcbUtil {
  $: VcbDollarStatic;
  secToTime(sec: number): string;
  toRgba(color: string, alpha: number): string;
  dispatchCommand(target: unknown, command: string, param?: unknown): void;
  addStyle(css: string, options?: { className?: string; disabled?: boolean }): unknown;
  StyleSwitcher: { update(options: { on: string; off: string }): void };
}
interface VcbPlayerParams {
  playerConfig: ConfigStore;
  playerState: PlayerState;
  $playerContainer?: unknown;
  currentTimeGetter?: () => number;
  player: NicoVideoPlayer;
}
interface VcbControlState extends VideoControlState {
  isWheelSeeking: boolean;
  isDragging: boolean;
  isStoryboardAvailable: boolean;
}
interface VcbHeatMap {
  reset(): void;
  duration: number;
  chatList: unknown;
}
interface VcbRaf {
  enable(): void;
  disable(): void;
}
interface VcbStoryboard {
  toggle(): void;
  reset(): void;
  onVideoCanPlay(watchId: unknown, videoInfo: unknown): void;
  setCurrentTime(sec: number, flag: boolean): void;
  currentTime: number;
  on<A extends Array<unknown>>(event: string, handler: (...args: A) => void): void;
}
interface VcbSeekBarThumbnail {
  currentTime: number;
}
interface VcbChat {
  vpos: number;
  uniqNo: unknown;
  no?: string | number;
  date?: number;
  userId?: string;
  text?: string;
  cmd?: string;
  fork?: string | number;
  color?: string;
  duration?: number;
}
interface VcbChatList {
  top: Array<VcbChat>;
  naka: Array<VcbChat>;
  bottom: Array<VcbChat>;
}
interface VcbChatTemplate {
  clone(): DocumentFragment;
  chat: HTMLElement;
  time: HTMLElement;
  text: HTMLElement;
}
interface VcbTemplateInfo {
  env: string;
  version: string;
}
interface VcbBaseViewParams {
  parentNode?: Element | null;
  name?: string;
  template?: string;
  shadow?: string;
  css?: string;
}
interface VcbTextLabel {
  text: string | undefined;
}
interface VcbVideoInfo {
  duration: number;
  resumePoints: Array<{ time: number; now: string }>;
}
//===BEGIN===

class VideoControlBar extends Emitter {
  declare static BASE_HEIGHT: number;
  declare static BASE_SEEKBAR_HEIGHT: number;
  declare static __tpl__: string;
  declare _playerConfig: ConfigStore;
  declare _$playerContainer: VcbQuery;
  declare _playerState: PlayerState;
  declare _currentTimeGetter: (() => number) | undefined;
  declare player: NicoVideoPlayer;
  declare state: VcbControlState;
  declare _$view: VcbQuery;
  declare _view: Element;
  declare classList: DOMTokenList;
  declare _seekBar: Element;
  declare _seekBarPointer: Element;
  declare _seekRange: HTMLInputElement;
  declare _bufferRange: Element;
  declare _$seekBar: VcbQuery;
  declare _$seekBarContainer: VcbQuery;
  declare _$playbackRateSelectMenu: VcbQuery;
  declare _$playbackRateMenu: VcbQuery;
  declare _$videoQualityMenu: VcbQuery;
  declare _$videoQualitySelectMenu: VcbQuery;
  declare $resumePointers: VcbQuery;
  declare _pointer: SmoothSeekBarPointer;
  declare _seekBarToolTip: SeekBarToolTip;
  declare _commentPreview: CommentPreview;
  declare _wheelSeeker: WheelSeeker;
  declare storyboard: VcbStoryboard;
  declare heatMap: VcbHeatMap;
  declare currentTimeLabel: VcbTextLabel;
  declare durationLabel: VcbTextLabel;
  declare _currentTime: number;
  declare _currentTimeText: string | undefined;
  declare _duration: number;
  declare _bufferStart: number;
  declare _bufferEnd: number;
  declare _timerCount: number;
  declare _raf: VcbRaf | undefined;
  declare _seekBarMouseX: number;
  declare _setVolumeBar: (v: unknown) => void;
  constructor(...args: [VcbPlayerParams]) {
    super();
    this.initialize(...args);
  }
  initialize(params: VcbPlayerParams) {
    this._playerConfig = params.playerConfig;
    this._$playerContainer = params.$playerContainer as VcbQuery;
    this._playerState = params.playerState;
    this._currentTimeGetter = params.currentTimeGetter;
    const player = (this.player = params.player);
    this.state = new VideoControlState() as VcbControlState;

    player.on('open', this._onPlayerOpen.bind(this));
    player.on('canPlay', this._onPlayerCanPlay.bind(this));
    player.on('durationChange', this._onPlayerDurationChange.bind(this));
    player.on('close', this._onPlayerClose.bind(this));
    player.on('progress', this._onPlayerProgress.bind(this) as EmitterCallback);
    player.on('loadVideoInfo', this._onLoadVideoInfo.bind(this) as EmitterCallback);
    player.on('commentParsed', _.debounce(this._onCommentParsed.bind(this), 500));
    player.on('commentChange', _.debounce(this._onCommentChange.bind(this), 100));
    void Promise.all([player.promise('firstVideoInitialized'), this.promise('dom-ready')]).then(() =>
      this._onFirstVideoInitialized()
    );

    this._initializeDom();
    this._initializePlaybackRateSelectMenu();
    this._initializeVolumeControl();
    this._initializeVideoQualitySelectMenu();

    global.debug.videoControlBar = this;
  }
  _initializeDom(): void {
    const $view = (this._$view = (util as unknown as VcbUtil).$.html(VideoControlBar.__tpl__));
    const $container = this._$playerContainer;
    const config = this._playerConfig;
    this._view = $view[0] as Element;
    const classList = (this.classList = ClassList(this._view));

    const mq = $view.mapQuery({
      _seekBarContainer: '.seekBarContainer',
      _seekBar: '.seekBar',
      _currentTime: '.currentTime',
      _duration: '.duration',
      _playbackRateMenu: '.playbackRateMenu',
      _playbackRateSelectMenu: '.playbackRateSelectMenu',
      _videoQualityMenu: '.videoQualityMenu',
      _videoQualitySelectMenu: '.videoQualitySelectMenu',
      _resumePointer: 'futatsume-seekbar-label',
      _bufferRange: '.bufferRange',
      _seekRange: '.seekRange',
      _seekBarPointer: '.seekBarPointer',
      resumePointers: 'futatsume-seekbar-label',
    });
    Object.assign(this, mq.e, { _currentTime: 0 });
    Object.assign(this, mq.$);
    (util as unknown as VcbUtil)
      .$(this._seekRange)
      .on('input', this._onSeekRangeInput.bind(this))
      .on('change', (e: Event) => (e.target as HTMLElement).blur());

    this._pointer = new SmoothSeekBarPointer({
      pointer: this._seekBarPointer,
      playerState: this._playerState,
    });
    const timeStyle = {
      widthPx: 44,
      heightPx: 18,
      fontFamily: "'Yu Gothic', 'YuGothic', 'Courier New', Osaka-mono, 'ＭＳ ゴシック', monospace",
      fontWeight: '',
      fontSizePx: 12,
      color: '#fff',
    };
    this.currentTimeLabel = TextLabel.create({
      container: $view.find('.currentTimeLabel')[0] as HTMLElement,
      canvas: undefined,
      ratio: undefined,
      name: 'currentTimeLabel',
      text: '--:--',
      style: timeStyle,
    });
    this.durationLabel = TextLabel.create({
      container: $view.find('.durationLabel')[0] as HTMLElement,
      canvas: undefined,
      ratio: undefined,
      name: 'durationLabel',
      text: '--:--',
      style: timeStyle,
    });

    this._$seekBar
      .on('mousedown', this._onSeekBarMouseDown.bind(this))
      .on('mousemove', this._onSeekBarMouseMove.bind(this));

    $view.on('click', this._onClick.bind(this)).on('command', this._onCommandEvent.bind(this));

    void HeatMapWorker.init({ container: this._seekBar }).then((hm: unknown) => (this.heatMap = hm as VcbHeatMap));
    const updateHeatMapVisibility = (v: unknown): void => {
      this._$seekBarContainer.raf.toggleClass('noHeatMap', !v);
    };
    updateHeatMapVisibility(this._playerConfig.props.enableHeatMap);
    this._playerConfig.onkey('enableHeatMap', updateHeatMapVisibility);
    global.emitter.on('heatMapUpdate', (heatMap: unknown): void => {
      void WatchInfoCacheDb.put((this.player as unknown as { watchId: string }).watchId, { heatMap });
    });

    this.storyboard = new Storyboard({
      playerConfig: config,
      // @ts-expect-error player は上流の呼び出し形を温存するための余剰プロパティ
      player: this.player,
      state: this.state,
      container: $view[0],
    }) as unknown as VcbStoryboard;
    this.state.onkey('isStoryboardAvailable', (v: unknown) => classList.toggle('is-storyboardAvailable', v as boolean));

    this._seekBarToolTip = new SeekBarToolTip({
      $container: this._$seekBarContainer,
      storyboard: this.storyboard,
    });

    this._commentPreview = new CommentPreview({
      $container: this._$seekBarContainer,
    });
    const updateEnableCommentPreview = (v: unknown): void => {
      this._$seekBarContainer.raf.toggleClass('enableCommentPreview', !!v);
      this._commentPreview.mode = v ? 'list' : 'hover';
    };

    updateEnableCommentPreview(config.props.enableCommentPreview);
    config.onkey('enableCommentPreview', updateEnableCommentPreview);

    const watchElement = ($container[0] as Element).closest('#futatsumeVideoPlayerDialog');
    this._wheelSeeker = new WheelSeeker({
      parentNode: $view[0],
      watchElement,
    });

    (watchElement as Element).addEventListener('mousedown', (e: Event) => {
      const me = e as MouseEvent;
      if (['A', 'INPUT', 'TEXTAREA'].includes((e.target as Element).tagName)) {
        return;
      }
      if (me.buttons !== 3 && !(me.button === 0 && me.shiftKey)) {
        return;
      }
      if (me.buttons === 3) {
        (watchElement as Element).addEventListener(
          'contextmenu',
          (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
          },
          { once: true, capture: true }
        );
      }
      this._onSeekBarMouseDown(me);
    });

    global.emitter.on('hideHover', () => {
      this._hideMenu();
      this._commentPreview.hide();
    });

    $container.append($view);
    void this.emitResolve('dom-ready');
  }
  _initializePlaybackRateSelectMenu() {
    const config = this._playerConfig;
    const $menu = this._$playbackRateSelectMenu;
    const $rates = $menu.find('.playbackRate');
    const style = {
      widthPx: 48,
      heightPx: 30,
      fontFamily:
        '"ヒラギノ角ゴ Pro W3", "Hiragino Kaku Gothic Pro", "メイリオ", Meiryo, Osaka, "ＭＳ Ｐゴシック", "MS PGothic", sans-serif',
      fontWeight: '',
      fontSizePx: 18,
      color: '#fff',
    };
    const rateLabel = TextLabel.create({
      container: this._$playbackRateMenu.find('.controlButtonInner')[0] as HTMLElement,
      canvas: undefined,
      ratio: undefined,
      name: 'currentTimeLabel',
      text: '',
      style,
    });

    const updatePlaybackRate = (rate: unknown): void => {
      rateLabel.text = `x${Math.round((rate as number) * 100) / 100}`;
      $menu.find('.selected').removeClass('selected');
      const fr = Math.floor(parseFloat(String(rate)) * 100) / 100;
      $rates.forEach((item: HTMLElement) => {
        const r = parseFloat(item.dataset.param as string);
        if (fr === r) {
          ClassList(item).add('selected');
        }
      });
      this._pointer.playbackRate = rate as number;
    };

    updatePlaybackRate(config.props.playbackRate);
    config.onkey('playbackRate', updatePlaybackRate);
  }
  _initializeVolumeControl(): void {
    const $vol = this._$view.find('futatsume-range-bar input[type="range"]');
    const vol = $vol[0] as HTMLInputElement & { view?: HTMLInputElement };

    const setVolumeBar = (this._setVolumeBar = (v: unknown): void => {
      (vol.view || vol).value = String(v);
    });
    $vol.on('input', (e: Event) =>
      (util as unknown as VcbUtil).dispatchCommand(
        e.target as HTMLInputElement,
        'volume',
        (e.target as HTMLInputElement).value
      )
    );
    setVolumeBar(this._playerConfig.props.volume);
    this._playerConfig.onkey('volume', setVolumeBar);
  }
  _initializeVideoQualitySelectMenu(): void {
    const config = this._playerConfig;
    const $select = this._$videoQualitySelectMenu;

    const updateDomandVideoQuality = (value: unknown): void => {
      const $dq = $select.find('.domandVideoQuality > li');
      $dq.removeClass('selected');
      $select.find('.select-domand-' + (value as string)).addClass('selected');
    };

    const onVideoQuality = (videoSessionInfo: unknown): void => {
      $select.find('.currentVideoQuality').raf.text((videoSessionInfo as { video: { label: string } }).video.label);
    };

    updateDomandVideoQuality(config.props.domandVideoQuality);
    config.onkey('domandVideoQuality', updateDomandVideoQuality);

    this.player.on('videoQuality', onVideoQuality);
  }
  _onCommandEvent(e: Event): void {
    const command = ((e as CustomEvent).detail as { command: string }).command;
    switch (command) {
      case 'toggleStoryboard':
        this.storyboard.toggle();
        break;
      case 'wheelSeek-start':
        this.state.isWheelSeeking = true;
        this._wheelSeeker.currentTime = this.player.currentTime;
        this.classList.add('is-wheelSeeking');
        break;
      case 'wheelSeek-end':
        this.state.isWheelSeeking = false;
        this.classList.remove('is-wheelSeeking');
        break;
      case 'wheelSeek':
        this._onWheelSeek(((e as CustomEvent).detail as { param: number }).param);
        break;
      default:
        return;
    }
    e.stopPropagation();
  }
  _onClick(e: Event): void {
    e.preventDefault();

    const target: HTMLElement | null = (e.target as Element).closest('[data-command]');
    if (!target) {
      return;
    }
    const { command, param: rawParam, type } = target.dataset;
    let param: string | undefined = rawParam;
    if (param && (type === 'bool' || type === 'json')) {
      param = JSON.parse(param) as string;
    }
    switch (command) {
      case 'toggleStoryboard':
        this.storyboard.toggle();
        break;
      default:
        (util as unknown as VcbUtil).dispatchCommand(target, command as string, param);
        break;
    }
    e.stopPropagation();
  }
  _posToTime(pos: number): number {
    const width = global.innerWidth;
    return this._duration * (pos / Math.max(width, 1));
  }
  _timeToPos(time: number): number {
    return global.innerWidth * (time / Math.max(this._duration, 1));
  }
  _timeToPer(time: number): number {
    return (time / Math.max(this._duration, 1)) * 100;
  }
  _onPlayerOpen(): void {
    this._startTimer();
    this.duration = 0;
    this.currentTime = 0;
    if (this.heatMap) {
      this.heatMap.reset();
    }
    this.storyboard.reset();
    this.resetBufferedRange();
  }
  _onPlayerCanPlay(watchId: unknown, videoInfo: unknown): void {
    const duration = this.player.duration;
    this.duration = duration;
    this.storyboard.onVideoCanPlay(watchId, videoInfo);

    if (this.heatMap) {
      this.heatMap.duration = duration;
    }
  }
  _onCommentParsed(): void {
    const chatList = this.player.chatList;
    if (this.heatMap) {
      this.heatMap.chatList = chatList;
    }
    this._commentPreview.chatList = chatList as VcbChatList;
  }
  _onCommentChange(): void {
    const chatList = this.player.chatList;
    if (this.heatMap) {
      this.heatMap.chatList = chatList;
    }
    this._commentPreview.chatList = chatList as VcbChatList;
  }
  _onPlayerDurationChange(): void {
    const duration = (this._playerState.videoInfo as unknown as { duration: number }).duration;
    this._pointer.duration = duration;
    this._wheelSeeker.duration = duration;
    if (this.heatMap) {
      this.heatMap.chatList = this.player.chatList;
    }
  }
  _onPlayerClose(): void {
    this._stopTimer();
  }
  _onPlayerProgress(range: TimeRanges, currentTime: number): void {
    this.setBufferedRange(range, currentTime);
  }
  _startTimer(): void {
    this._timerCount = 0;
    this._raf = this._raf || new RequestAnimationFrame(this._onTimer.bind(this));
    this._raf.enable();
  }
  _stopTimer(): void {
    if (this._raf) {
      this._raf.disable();
    }
  }
  _onSeekRangeInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    const sec = (target.value as unknown as number) * 1;
    const left = (sec / ((target.max as unknown as number) * 1)) * global.innerWidth;
    (util as unknown as VcbUtil).dispatchCommand(target, 'seek', sec);
    this._seekBarToolTip.update(sec, left);
    this.storyboard.setCurrentTime(sec, true);
  }
  _onSeekBarMouseDown(e: MouseEvent): void {
    // e.preventDefault();
    e.stopPropagation();
    this._beginMouseDrag();
  }
  _onSeekBarMouseMove(e: MouseEvent): void {
    if (!this.state.isDragging) {
      e.stopPropagation();
    }
    const left = e.offsetX;
    const sec = this._posToTime(left);
    this._seekBarMouseX = left;

    this._commentPreview.currentTime = sec;
    this._commentPreview.update(left);

    this._seekBarToolTip.update(sec, left);
  }
  _onWheelSeek(sec: number): void {
    if (!this.state.isWheelSeeking) {
      return;
    }
    sec = sec * 1;
    const dur = this._duration;
    const left = (sec / dur) * window.innerWidth;
    this._seekBarMouseX = left;

    this._commentPreview.currentTime = sec;
    this._commentPreview.update(left);

    this._seekBarToolTip.update(sec, left);
    this.storyboard.setCurrentTime(sec, true);
  }
  _beginMouseDrag(): void {
    this._bindDragEvent();
    this.classList.add('is-dragging');
    this.state.isDragging = true;
  }
  _endMouseDrag(): void {
    this._unbindDragEvent();
    this.classList.remove('is-dragging');
    this.state.isDragging = false;
  }
  _onBodyMouseUp(e: MouseEvent): void {
    if (e.button === 0 && e.shiftKey) {
      return;
    }
    this._endMouseDrag();
  }
  _onWindowBlur(): void {
    this._endMouseDrag();
  }
  _bindDragEvent(): void {
    (util as unknown as VcbUtil).$('body').on('mouseup.FutatsumeWatchSeekBar', this._onBodyMouseUp.bind(this));

    (util as unknown as VcbUtil)
      .$(window)
      .on('blur.FutatsumeWatchSeekBar', this._onWindowBlur.bind(this), { once: true });
  }
  _unbindDragEvent(): void {
    (util as unknown as VcbUtil).$('body').off('mouseup.FutatsumeWatchSeekBar');
    (util as unknown as VcbUtil).$(window).off('blur.FutatsumeWatchSeekBar');
  }
  _onTimer(): void {
    this._timerCount++;

    const player = this.player;
    const currentTime = this.state.isWheelSeeking ? this._wheelSeeker.currentTime : player.currentTime;
    if (this._timerCount % 6 === 0) {
      this.currentTime = currentTime;
    }
    this.storyboard.currentTime = currentTime;
  }
  _onLoadVideoInfo(videoInfo: VcbVideoInfo): void {
    this.duration = videoInfo.duration;

    const resumePoints = videoInfo.resumePoints;
    for (let i = 0, len = this.$resumePointers.length; i < len; i++) {
      const pointer = this.$resumePointers[i] as HTMLElement;
      const resume = resumePoints[i];
      if (!resume) {
        pointer.hidden = true;
        continue;
      }
      pointer.setAttribute('duration', String(videoInfo.duration));
      pointer.setAttribute('time', String(resume.time));
      pointer.setAttribute('text', `${resume.now} ここまで見た`);
      if (resume.now !== '前回') {
        void cssUtil.setProps([pointer, '--pointer-color', 'rgba(128, 128, 255, 0.6)'], [pointer, '--color', '#aef']);
      } else {
        void cssUtil.setProps([pointer, '--scale-pp', 1.7]);
      }
    }
  }
  _onFirstVideoInitialized(): void {
    const [view] = this._$view;
    const handler = (command: unknown, param: unknown): void => {
      this.emit('command', command, param);
    };
    const ge = global.emitter; // emitAsync は互換用に残してる
    void (
      ge.emitResolve('videoControBar.addonMenuReady', {
        container: (view as Element).querySelector('.controlItemContainer.left .scalingUI'),
        handler,
      }) as Promise<Record<string, unknown>>
    ).then(({ container, handler }) => ge.emitAsync('videoControBar.addonMenuReady', container, handler));
    void (
      ge.emitResolve('seekBar.addonMenuReady', {
        container: (view as Element).querySelector('.seekBar'),
        handler,
      }) as Promise<Record<string, unknown>>
    ).then(({ container, handle }) => ge.emitAsync('seekBar.addonMenuReady', container, handle));
  }
  get currentTime(): number {
    return this._currentTime;
  }
  setCurrentTime(sec: number): void {
    this.currentTime = sec;
  }
  set currentTime(sec: number) {
    if (this._currentTime === sec) {
      return;
    }
    this._currentTime = sec;

    const currentTimeText = (util as unknown as VcbUtil).secToTime(sec);
    if (this._currentTimeText !== currentTimeText) {
      this._currentTimeText = currentTimeText;
      this.currentTimeLabel.text = currentTimeText;
    }
    this._pointer.currentTime = sec;
  }
  get duration(): number {
    return this._duration;
  }
  set duration(sec: number) {
    if (sec === this._duration) {
      return;
    }
    this._duration = sec;
    this._pointer.currentTime = -1;
    this._pointer.duration = sec;
    this._wheelSeeker.duration = sec;
    this._seekRange.max = String(sec);

    if (sec === 0 || isNaN(sec)) {
      this.durationLabel.text = '--:--';
    } else {
      this.durationLabel.text = (util as unknown as VcbUtil).secToTime(sec);
    }
    this.emit('durationChange');
  }
  setBufferedRange(range: TimeRanges | null | undefined, currentTime: number): void {
    const bufferRange = this._bufferRange;
    if (!range || !range.length || !this._duration) {
      return;
    }
    for (let i = 0, len = range.length; i < len; i++) {
      try {
        const start = range.start(i);
        const end = range.end(i);
        const width = end - start;
        if (start <= currentTime && end >= currentTime) {
          if (this._bufferStart !== start || this._bufferEnd !== end) {
            const perLeft = this._timeToPer(start) - 1;
            const scaleX = (this._timeToPer(width) + 2) / 100;
            void cssUtil.setProps(
              [bufferRange, '--buffer-range-left', cssUtil.percent(perLeft)],
              [bufferRange, '--buffer-range-scale', scaleX]
            );
            this._bufferStart = start;
            this._bufferEnd = end;
          }
          break;
        }
      } catch {
        // 範囲外アクセスは無視する
      }
    }
  }
  resetBufferedRange(): void {
    this._bufferStart = 0;
    this._bufferEnd = 0;
    void cssUtil.setProps([this._bufferRange, '--buffer-range-scale', 0]);
  }
  _hideMenu(): void {
    document.body.focus();
  }
}

VideoControlBar.BASE_HEIGHT = CONSTANT.CONTROL_BAR_HEIGHT;
VideoControlBar.BASE_SEEKBAR_HEIGHT = 10;

(util as unknown as VcbUtil).addStyle(
  `
  .videoControlBar {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100vw;
    height: var(--futatsume-control-bar-height, ${VideoControlBar.BASE_HEIGHT}px);
    z-index: 150000;
    background: #000;
    transition: opacity 0.3s ease, transform 0.3s ease;
    user-select: none;
    contain: layout style size;
    will-change: transform;
  }

  .videoControlBar * {
    box-sizing: border-box;
    user-select: none;
    line-break: auto;
  }

  .videoControlBar.is-wheelSeeking {
    pointer-events: none;
  }


  .controlItemContainer {
    position: absolute;
    top: 10px;
    height: 40px;
    z-index: 200;
  }

  .controlItemContainer:hover,
  .controlItemContainer:focus-within,
  .videoControlBar.is-menuOpen .controlItemContainer {
    z-index: 260;
  }

  .controlItemContainer.left {
    left: 0;
    height: 40px;
    white-space: nowrap;
    overflow: visible;
    transition: transform 0.2s ease, left 0.2s ease;
  }
  .controlItemContainer.left .scalingUI {
    padding: 0 8px 0;
  }
  .controlItemContainer.left .scalingUI:empty {
    display: none;
  }
  .controlItemContainer.left .scalingUI>* {
    background: #222;
    display: inline-block;
  }

  .controlItemContainer.center {
    left: 50%;
    height: 40px;
    transform: translate(-50%, 0);
    white-space: nowrap;
    overflow: visible;
    transition: transform 0.2s ease, left 0.2s ease;
  }

  .controlItemContainer.center .scalingUI {
    transform-origin: top center;
  }
  .controlItemContainer.center .scalingUI > div{
    display: flex;
    align-items: center;
    background:
      linear-gradient(to bottom,
      transparent, transparent 4px, #222 0, #222 30px, transparent 0, transparent);
    height: 32px;
  }

  .controlItemContainer.right {
    right: 0;
  }

  .is-mouseMoving .controlItemContainer.right .controlButton{
    background: #333;
  }
  .controlItemContainer.right .scalingUI {
    transform-origin: top right;
  }

  .controlButton {
    position: relative;
    display: inline-block;
    transition: opacity 0.4s ease;
    font-size: 20px;
    width: 32px;
    height: 32px;
    line-height: 30px;
    box-sizing: border-box;
    text-align: center;
    cursor: pointer;
    color: #fff;
    opacity: 0.8;
    min-width: 32px;
    vertical-align: middle;
    outline: none;
  }
  .controlButton:hover {
    cursor: pointer;
    opacity: 1;
  }
  .controlButton:active .controlButtonInner {
    transform: translate(0, 2px) scale(0.8);
  }

  .is-abort   .playControl,
  .is-error   .playControl,
  .is-loading .playControl {
    opacity: 0.4 !important;
    pointer-events: none;
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
  .is-mouseMoving .controlButton:hover .tooltip {
    display: block;
    opacity: 1;
  }
  .videoControlBar:hover .controlButton {
    opacity: 1;
    pointer-events: auto;
  }

  .videoControlBar .controlButton:focus-within {
    pointer-events: none;
  }
  .videoControlBar .controlButton:focus-within .futatsumePopupMenu,
  .videoControlBar .controlButton              .futatsumePopupMenu:hover {
    pointer-events: auto;
    visibility: visible;
    opacity: 0.99;
    pointer-events: auto;
    transition: opacity 0.3s;
  }
  .videoControlBar .controlButton:focus-within .tooltip {
    display: none;
  }

  .settingPanelSwitch {
    width: 32px;
  }
  .settingPanelSwitch:hover {
    text-shadow: 0 0 8px #ff9;
  }
  .settingPanelSwitch .tooltip {
    left: 0;
  }
  .videoControlBar .futatsumeSubMenu {
    left: 50%;
    transform: translate(-50%, 0);
    bottom: 44px;
    white-space: nowrap;
  }

  .videoControlBar .triangle {
    transform: translate(-50%, 0) rotate(-45deg);
    bottom: -8.5px;
    left: 50%;
  }

  .videoControlBar .futatsumeSubMenu::after {
    content: '';
    position: absolute;
    display: block;
    width: 110%;
    height: 16px;
    left: -5%;
  }

  .controlButtonInner {
    display: inline-block;
  }


  .seekTop {
    left: 0px;
    width: 32px;
    transform: scale(1.1);
  }

  .togglePlay {
    width: 36px;
    transition: transform 0.2s ease;
    transform: scale(1.1);
  }
  .togglePlay:active {
    transform: scale(0.75);
  }

  .togglePlay .play,
  .togglePlay .pause {
    display: inline-block;
    position: absolute;
    top: 50%;
    left: 50%;
    transition: transform 0.1s linear, opacity 0.1s linear;
    user-select: none;
    pointer-events: none;
  }
  .togglePlay .play {
    width: 100%;
    height: 100%;
    transform: scale(1.2) translate(-50%, -50%) translate(10%, 10%);
  }
  .is-playing .togglePlay .play {
    opacity: 0;
  }
  .togglePlay>.pause {
    width: 24px;
    height: 16px;
    background-image: linear-gradient(
      to right,
      transparent 0, transparent 12.5%,
      currentColor 0, currentColor 43.75%,
      transparent 0, transparent 56.25%,
      currentColor 0, currentColor 87.5%,
      transparent 0);
    opacity: 0;
    transform: scaleX(0);
  }
  .is-playing .togglePlay>.pause {
    opacity: 1;
    transform: translate(-50%, -50%);
  }

  .seekBarContainer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    cursor: pointer;
    z-index: 250;
  }
  /* 見えないマウス判定 */
  .seekBarContainer .seekBarShadow {
    position: absolute;
    background: transparent;
    opacity: 0;
    width: 100vw;
    height: 8px;
    top: -8px;
  }
  .is-mouseMoving .seekBarContainer:hover .seekBarShadow {
    height: 48px;
    top: -48px;
  }

  .is-abort   .seekBarContainer,
  .is-loading .seekBarContainer,
  .is-error   .seekBarContainer {
    pointer-events: none;
  }
  .is-abort   .seekBarContainer *,
  .is-error   .seekBarContainer * {
    display: none;
  }

  .seekBar {
    position: relative;
    width: 100%;
    height: 10px;
    margin: 2px 0 2px;
    border-top:    1px solid #333;
    border-bottom: 1px solid #333;
    cursor: pointer;
    transition: height 0.2s ease 1s, margin-top 0.2s ease 1s;
  }

  .seekBar:hover {
    height: 24px;
    /* このmargin-topは見えないマウスオーバー判定を含む */
    margin-top: -14px;
    transition: none;
    background-color: rgba(0, 0, 0, 0.5);
  }

  .seekBarContainer .seekBar * {
    pointer-events: none;
  }

  .bufferRange {
    position: absolute;
    --buffer-range-left: 0;
    --buffer-range-scale: 0;
    width: 100%;
    height: 110%;
    left: 0px;
    top: 0px;
    box-shadow: 0 0 6px #ff9 inset, 0 0 4px #ff9;
    z-index: 190;
    background: #ff9;
    transform-origin: left;
    transform:
      translateX(var(--buffer-range-left))
      scaleX(var(--buffer-range-scale));
    transition: transform 0.2s;
    mix-blend-mode: overlay;
    will-change: transform, opacity;
    opacity: 0.6;
  }

  .is-youTube .bufferRange {
    width: 100% !important;
    height: 110% !important;
    background: #f99;
    transition: transform 0.5s ease 1s;
    transform: translate3d(0, 0, 0) scaleX(1) !important;
  }

  .seekBarPointer {
    /*--width-pp: 12px;
    --trans-x-pp: 0;*/
    position: absolute;
    display: inline-block;
    top: -1px;
    left: 0;
    width: 12px;
    background: rgba(255, 255, 255, 0.7);
    height: calc(100% + 2px);
    z-index: 200;
    box-shadow: 0 0 4px #ffc inset;
    pointer-events: none;
    transform: translateX(-6px);
    /*transform: translate(calc(var(--trans-x-pp) - var(--width-pp) / 2), -50%);*/
    will-change: transform;
    mix-blend-mode: lighten;
  }

  .is-loading .seekBarPointer {
    display: none !important;
  }

  .is-dragging .seekBarPointer.is-notSmooth {
    transition: none;
  }
  .is-dragging .seekBarPointer::after,
  .is-wheelSeeking .seekBarPointer::after {
    content: '';
    position: absolute;
    width: 36px;
    height: 36px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: 100%;
    box-shadow: 0 0 8px #ffc inset, 0 0 8px #ffc;
    pointer-events: none;
  }

  .seekBarContainer .seekBar .seekRange {
    -webkit-appearance: none;
    position: absolute;
    width: 100vw;
    height: 100%;
    cursor: pointer;
    opacity: 0;
    pointer-events: auto;
  }
  .seekRange::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 10px;
    width: 2px;
  }
  .seekRange::-moz-range-thumb {
    height: 10px;
    width: 2px;
  }

  .videoControlBar .videoTime {
    display: inline-flex;
    top: 0;
    padding: 0;
    width: 96px;
    height: 18px;
    line-height: 18px;
    contain: strict;
    color: #fff;
    font-size: 12px;
    white-space: nowrap;
    vertical-align: middle;
    background: rgba(33, 33, 33, 0.5);
    border: 0;
    pointer-events: none;
    user-select: none;
  }

  .videoControlBar .videoTime .currentTimeLabel,
  .videoControlBar .videoTime .currentTime,
  .videoControlBar .videoTime .duration {
    position: relative;
    display: inline-block;
    color: #fff;
    text-align: center;
    background: inherit;
    border: 0;
    width: 44px;
    font-family: 'Yu Gothic', 'YuGothic', 'Courier New', Osaka-mono, 'ＭＳ ゴシック', monospace;
  }
  .videoControlBar.is-loading .videoTime {
    display: none;
  }

  .seekBarContainer .tooltip {
    position: absolute;
    padding: 1px;
    bottom: 12px;
    left: 0;
    transform: translate(-50%, 0);
    white-space: nowrap;
    font-size: 10px;
    opacity: 0;
    border: 1px solid #000;
    background: #fff;
    color: #000;
    z-index: 150;
  }

  .is-dragging .seekBarContainer .tooltip,
  .seekBarContainer:hover .tooltip {
    opacity: 0.8;
  }

  .resumePointer {
    position: absolute;
    mix-blend-mode: color-dodge;
    will-change: transform;
    top: 0;
    z-index: 200;
  }

  .futatsumeHeatMap {
    position: absolute;
    pointer-events: none;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    transform-origin: 0 0 0;
    will-change: transform;
    opacity: 0.5;
    z-index: 110;
  }
  .noHeatMap .futatsumeHeatMap {
    display: none;
  }

  .loopSwitch {
    width:  32px;
    height: 32px;
    line-height: 30px;
    font-size: 20px;
    color: #888;
  }
  .loopSwitch:active {
    font-size: 15px;
  }

  .is-loop .loopSwitch {
    color: var(--enabled-button-color);
  }
  .loopSwitch .controlButtonInner {
    font-family: STIXGeneral;
  }

  .playbackRateMenu {
    bottom: 0;
    width: auto;
    width: 48px;
    height: 32px;
    line-height: 30px;
    font-size: 18px;
    white-space: nowrap;
    margin-right: 0;
  }


  .playbackRateSelectMenu {
    width: 180px;
    text-align: left;
    line-height: 20px;
    font-size: 18px !important;
  }

  .playbackRateSelectMenu ul {
    margin: 2px 8px;
  }

  .playbackRateSelectMenu li {
    padding: 3px 4px;
  }

  .screenModeMenu:focus-within {
    background: #888;
  }
  .screenModeMenu:focus-within .tooltip {
    display: none;
  }

  .screenModeSelectMenu {
    width: 148px;
    padding: 2px 4px;
    font-size: 12px;
    line-height: 15px;
  }

  .screenModeSelectMenu ul {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .screenModeSelectMenu ul li {
    display: inline-block;
    text-align: center;
    border: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .screenModeSelectMenu ul li span {
    border: 1px solid #ccc;
    width: 50px;
    margin: 2px 8px;
    padding: 4px 0;
  }

  body[data-screen-mode="3D"]       .screenModeSelectMenu li.mode3D span,
  body[data-screen-mode="sideView"] .screenModeSelectMenu li.sideView span,
  body[data-screen-mode="small"]    .screenModeSelectMenu li.small span,
  body[data-screen-mode="normal"]   .screenModeSelectMenu li.normal span,
  body[data-screen-mode="big"]      .screenModeSelectMenu li.big span,
  body[data-screen-mode="wide"]     .screenModeSelectMenu li.wide span {
    color: #ff9;
    border-color: #ff0;
  }

  .fullscreenControlBarModeMenu {
    display: none;
    font-size: 16px;
    white-space: nowrap;
  }
  .fullscreenControlBarModeMenu .controlButtonInner {
    filter: grayscale(100%);
  }
  .fullscreenControlBarModeMenu:focus-within .controlButtonInner,
  .fullscreenControlBarModeMenu:hover .controlButtonInner {
    filter: grayscale(50%);
  }


           .is-fullscreen  .fullscreenSwitch .controlButtonInner .toFull,
  body:not(.is-fullscreen) .fullscreenSwitch .controlButtonInner .returnFull {
    display: none;
  }

  .videoControlBar .muteSwitch {
    margin-right: 0;
  }
  .videoControlBar .muteSwitch:active {
    font-size: 15px;
  }

  .futatsumePlayerContainer:not(.is-mute) .muteSwitch .mute-on,
                            .is-mute  .muteSwitch .mute-off {
    display: none;
  }

  .videoControlBar .volumeControl {
    display: inline-block;
  }
  .videoControlBar .volumeRange {
    width: 64px;
    height: 8px;
    position: relative;
    vertical-align: middle;
    --back-color: #333;
    --fore-color: #ccc;
  }
  .is-mute .videoControlBar .volumeRange  {
    --fore-color: var(--back-color);
    pointer-events: none;
  }

  .prevVideo.playControl,
  .nextVideo.playControl {
    display: none;
  }
  .is-playlistEnable .prevVideo.playControl,
  .is-playlistEnable .nextVideo.playControl {
    display: inline-block;
  }

  .prevVideo,
  .nextVideo {
    font-size: 23px;
  }
  .prevVideo .controlButtonInner {
    transform: scaleX(-1);
  }

  .toggleStoryboard {
    visibility: hidden;
    pointer-events: none;
  }
  .is-storyboardAvailable .toggleStoryboard {
    visibility: visible;
    pointer-events: auto;
  }
  .futatsumeStoryboardOpen .is-storyboardAvailable .toggleStoryboard {
    color: var(--enabled-button-color);
  }

  .toggleStoryboard .controlButtonInner {
    position: absolute;
    width: 20px;
    height: 20px;
    top: 50%;
    left: 50%;
    border-radius: 75% 16%;
    border: 1px solid;
    transform: translate(-50%, -50%) rotate(45deg);
    pointer-events: none;
    background:
      radial-gradient(
        currentColor,
        currentColor 6px,
        transparent 0
      );
  }
  .toggleStoryboard:active .controlButtonInner {
    transform: translate(-50%, -50%) scaleY(0.1) rotate(45deg);
  }

  .toggleStoryboard:active {
    transform: scale(0.75);
  }

  .videoQualityMenu {
    min-width: 40px;
    font-size: 16px;
    white-space: nowrap;
  }
  .is-youTube .videoQualityMenu {
    text-shadow:
      0px 0px 8px #fc9, 0px 0px 6px #fc9, 0px 0px 4px #fc9, 0px 0px 2px #fc9 !important;
  }
  .is-youTube .videoQualityMenu:not(.forYouTube),
  .videoQualityMenu.forYouTube {
    display: none;
  }
  .is-youTube .videoQualityMenu.forYouTube {
    display: inline-block;
  }


  .videoQualityMenu:focus-within {
    background: #888;
  }
  .videoQualityMenu:focus-within .tooltip {
    display: none;
  }

  .videoQualitySelectMenu  {
    bottom: 44px;
    left: 50%;
    transform: translate(-50%, 0);
    width: 180px;
    text-align: left;
    line-height: 20px;
    font-size: 16px !important;
    text-shadow: none !important;
    cursor: default;
  }

  .videoQualitySelectMenu > ul {
    margin: 2px 8px;
  }

  .videoQualitySelectMenu > ul > li.selected:hover {
    background: none;
  }

  .videoQualitySelectMenu li:not(.selected) {
    font-weight: initial;
  }

  .videoQualitySelectMenu li.selected > span {
    pointer-events: none;
    text-shadow: 0 0 4px #99f, 0 0 8px #99f !important;
  }

  .videoQualitySelectMenu .domandVideoQuality {
    font-size: 80%;
  }

  .videoQualitySelectMenu .currentVideoQuality {
    color: #ccf;
    font-size: 80%;
    text-align: center;
  }

  .videoQualitySelectMenu .domandVideoQuality > li {
    margin-right: 0;
    margin-left: 0;
    padding-right: 12px;
    padding-left: 12px;
  }

  .videoQualitySelectMenu .domandVideoQuality > li > span {
    margin-left: 12px;
  }

  .videoQualitySelectMenu .domandVideoQuality > li.selected > span::before {
    left: 12px;
  }

  @media screen and (max-width: 768px) {
    .controlItemContainer.center {
      left: 0%;
      transform: translate(0, 0);
    }
  }

  .FutatsumeWatchVer {
    display: none;
  }
  .FutatsumeWatchVer[data-env="DEV"] {
    display: inline-block;
    color: #999;
    position: absolute;
    right: 0;
    background: transparent !important;
    transform: translate(100%, 0);
    font-size: 12px;
    line-height: 32px;
    pointer-events: none;
  }

  .progressWave {
    display: none;
  }
  .is-stalled .progressWave,
  .is-loading .progressWave {
    display: inline-block;
    position: absolute;
    left: 0;
    top: 1px;
    z-index: 400;
    width: 40%;
    height: calc(100% - 2px);
    background: linear-gradient(
      to right,
      rgba(0,0,0,0),
      ${(util as unknown as VcbUtil).toRgba('#ffffcc', 0.3)},
      rgba(0,0,0)
    );
    mix-blend-mode: lighten;
    animation-name: progressWave;
    animation-iteration-count: infinite;
    animation-duration: 4s;
    animation-timing-function: linear;
    animation-delay: -1s;
  }
  @keyframes progressWave {
    0%   { transform: translate3d(-100%, 0, 0) translate3d(-5vw, 0, 0); }
    100% { transform: translate3d(100%, 0, 0) translate3d(150vw, 0, 0); }
  }
  .is-seeking .progressWave {
    display: none;
  }


`,
  { className: 'videoControlBar' }
);
(util as unknown as VcbUtil).addStyle(
  `
  .videoControlBar {
    width: 100% !important; /* 100vwだと縦スクロールバーと被る */
  }
`,
  { className: 'screenMode for-popup videoControlBar', disabled: true }
);
(util as unknown as VcbUtil).addStyle(
  `
  body .videoControlBar {
    position: absolute !important; /* firefoxのバグ対策 */
    opacity: 0;
    background: none;
  }

  .volumeChanging .videoControlBar,
  .is-mouseMoving .videoControlBar {
    opacity: 0.7;
    background: rgba(0, 0, 0, 0.5);
  }
  .showVideoControlBar .videoControlBar {
    opacity: 1 !important;
    background: #000 !important;
  }

  .videoControlBar.is-dragging,
  .videoControlBar:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.9);
  }

  .fullscreenControlBarModeMenu {
    display: inline-block;
  }

  .fullscreenControlBarModeSelectMenu {
    padding: 2px 4px;
    font-size: 12px;
    line-height: 15px;
    font-size: 16px !important;
    text-shadow: none !important;
  }

  .fullscreenControlBarModeSelectMenu ul {
    margin: 2px 8px;
  }

  .fullscreenControlBarModeSelectMenu li {
    padding: 3px 4px;
  }

  .fullscreenControlBarModeMenu li:focus-within,
  body[data-fullscreen-control-bar-mode="auto"] .fullscreenControlBarModeMenu [data-param="auto"],
  body[data-fullscreen-control-bar-mode="always-show"] .fullscreenControlBarModeMenu [data-param="always-show"],
  body[data-fullscreen-control-bar-mode="always-hide"] .fullscreenControlBarModeMenu [data-param="always-hide"] {
    color: #ff9;
    outline: none;
  }

`,
  { className: 'screenMode for-full videoControlBar', disabled: true }
);
(util as unknown as VcbUtil).addStyle(
  `
  .screenModeSelectMenu {
    display: none;
  }

  .controlItemContainer.left {
    top: auto;
    transform-origin: top left;
  }
  .seekBarContainer {
    top: auto;
    bottom: 0;
    z-index: 300;
  }
  .seekBarContainer:hover .seekBarShadow {
    height: 14px;
    top: -12px;
  }
  .seekBar {
    margin-top: 0px;
    margin-bottom: -14px;
    height: 24px;
    transition: none;
  }
  .screenModeMenu {
    display: none;
  }
  .controlItemContainer.center {
    top: auto;
  }
  .futatsumeStoryboardOpen .controlItemContainer.center {
    background: transparent;
  }
  .futatsumeStoryboardOpen .controlItemContainer.center .scalingUI {
    background: rgba(32, 32, 32, 0.5);
  }
  .futatsumeStoryboardOpen .controlItemContainer.center .scalingUI:hover {
    background: rgba(32, 32, 32, 0.8);
  }
  .controlItemContainer.right {
    top: auto;
  }

`,
  { className: 'screenMode for-screen-full videoControlBar', disabled: true }
);

VideoControlBar.__tpl__ = `
    <div class="videoControlBar" data-command="nop">

      <div class="seekBarContainer">
        <div class="seekBarShadow"></div>
        <div class="seekBar">
          <div class="seekBarPointer"></div>
          <div class="bufferRange"></div>
          <div class="progressWave"></div>
          <input type="range" class="seekRange" min="0" step="any">
          <canvas width="200" height="10" class="heatMap futatsumeHeatMap"></canvas>
        </div>
        <futatsume-seekbar-label class="resumePointer" data-command="seekTo" data-text="ここまで見た"></futatsume-seekbar-label>
        <futatsume-seekbar-label class="resumePointer" data-command="seekTo" data-text="ここまで見た"></futatsume-seekbar-label>
        <futatsume-seekbar-label class="resumePointer" data-command="seekTo" data-text="ここまで見た"></futatsume-seekbar-label>
        <futatsume-seekbar-label class="resumePointer" data-command="seekTo" data-text="ここまで見た"></futatsume-seekbar-label>
        <futatsume-seekbar-label class="resumePointer" data-command="seekTo" data-text="ここまで見た"></futatsume-seekbar-label>
      </div>

      <div class="controlItemContainer left">
        <div class="scalingUI">
          <div class="FutatsumeWatchVer" data-env="${(FutatsumeWatch as unknown as VcbTemplateInfo).env}">ver ${(FutatsumeWatch as unknown as VcbTemplateInfo).version}${(FutatsumeWatch as unknown as VcbTemplateInfo).env === 'DEV' ? '(Dev)' : ''}</div>
        </div>
      </div>
      <div class="controlItemContainer center">
        <div class="scalingUI">
          <div class="seekBarContainer-mainControl">
            <div class="prevVideo controlButton playControl" data-command="playPreviousVideo" data-param="0">
              <div class="controlButtonInner">&#x27A0;</div>
              <div class="tooltip">前の動画</div>
            </div>

            <div class="toggleStoryboard controlButton playControl forPremium" data-command="toggleStoryboard">
              <div class="controlButtonInner"></div>
              <div class="tooltip">シーンサーチ</div>
            </div>

            <div class="loopSwitch controlButton playControl" data-command="toggle-loop">
              <div class="controlButtonInner">&#8635;</div>
              <div class="tooltip">リピート</div>
            </div>

            <div class="seekTop controlButton playControl" data-command="seek" data-param="0">
              <div class="controlButtonInner">&#8676;</div>
              <div class="tooltip">先頭</div>
            </div>

            <div class="togglePlay controlButton playControl" data-command="togglePlay">
              <span class="pause"></span>
              <span class="play">▶</span>
            </div>

            <div class="playbackRateMenu controlButton" tabindex="-1" data-has-submenu="1">
              <div class="controlButtonInner"></div>
              <div class="tooltip">再生速度</div>
              <div class="playbackRateSelectMenu futatsumePopupMenu futatsumeSubMenu">
                <div class="triangle"></div>
                <p class="caption">再生速度</p>
                <ul>
                  <li class="playbackRate" data-command="playbackRate" data-param="10"><span>10倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="5"  ><span>5倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="4"  ><span>4倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="3"  ><span>3倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="2"  ><span>2倍</span></li>

                  <li class="playbackRate" data-command="playbackRate" data-param="1.75"><span>1.75倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="1.5"><span>1.5倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="1.25"><span>1.25倍</span></li>

                  <li class="playbackRate" data-command="playbackRate" data-param="1.0"><span>標準速度(x1)</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="0.75"><span>0.75倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="0.5"><span>0.5倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="0.25"><span>0.25倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="0.1"><span>0.1倍</span></li>
                </ul>
              </div>
            </div>

            <div class="videoTime">
              <span class="currentTimeLabel"></span>/<span class="durationLabel"></span>
            </div>

            <div class="muteSwitch controlButton" data-command="toggle-mute">
              <div class="tooltip">ミュート(M)</div>
              <div class="menuButtonInner mute-off">&#x1F50A;</div>
              <div class="menuButtonInner mute-on">&#x1F507;</div>
            </div>

            <div class="volumeControl">
              <futatsume-range-bar><input class="volumeRange" type="range" value="0.5" min="0.01" max="1" step="any"></futatsume-range-bar>
            </div>

            <div class="nextVideo controlButton playControl" data-command="playNextVideo" data-param="0">
              <div class="controlButtonInner">&#x27A0;</div>
              <div class="tooltip">次の動画</div>
            </div>

          </div>
        </div>
      </div>

      <div class="controlItemContainer right">

        <div class="scalingUI">

          <div class="videoQualityMenu controlButton forYouTube" data-command="reload" title="FutatsumeTube解除">
            <div class="controlButtonInner">画</div>
          </div>
          <div class="videoQualityMenu controlButton" tabindex="-1" data-has-submenu="1">
            <div class="controlButtonInner">画</div>

            <div class="tooltip">画質</div>
            <div class="videoQualitySelectMenu futatsumePopupMenu futatsumeSubMenu">
              <div class="triangle"></div>
              <p class="caption">画質</p>
              <ul>
                <li class="selected">
                  <p class="currentVideoQuality"></p>
                  <ul class="domandVideoQuality">
                    <li class="select-domand-auto"  data-command="update-domandVideoQuality" data-param="auto"><span>自動(auto)</span><//li>
                    <li class="select-domand-1080p" data-command="update-domandVideoQuality" data-param="1080p"><span>1080p 優先</span><//li>
                    <li class="select-domand-720p"  data-command="update-domandVideoQuality" data-param="720p"><span>720p</span><//li>
                    <li class="select-domand-480p"  data-command="update-domandVideoQuality" data-param="480p"><span>480p</span><//li>
                    <li class="select-domand-360p"  data-command="update-domandVideoQuality" data-param="360p"><span>360p</span><//li>
                    <li class="select-domand-144p"  data-command="update-domandVideoQuality" data-param="144p"><span>144p</span><//li>
                  </ul>
                </li>
             </ul>
            </div>
          </div>

          <div class="screenModeMenu controlButton" tabindex="-1" data-has-submenu="1">
            <div class="tooltip">画面サイズ・モード変更</div>
            <div class="controlButtonInner">&#9114;</div>
            <div class="screenModeSelectMenu futatsumePopupMenu futatsumeSubMenu">
              <div class="triangle"></div>
              <p class="caption">画面モード</p>
              <ul>
                <li class="screenMode mode3D"   data-command="screenMode" data-param="3D"><span>3D</span></li>
                <li class="screenMode small"    data-command="screenMode" data-param="small"><span>小</span></li>
                <li class="screenMode sideView" data-command="screenMode" data-param="sideView"><span>横</span></li>
                <li class="screenMode normal"   data-command="screenMode" data-param="normal"><span>中</span></li>
                <li class="screenMode wide"     data-command="screenMode" data-param="wide"><span>WIDE</span></li>
                <li class="screenMode big"      data-command="screenMode" data-param="big"><span>大</span></li>
              </ul>
            </div>
          </div>

          <div class="fullscreenControlBarModeMenu controlButton" tabindex="-1" data-has-submenu="1">
            <div class="tooltip">ツールバーの表示</div>
            <div class="controlButtonInner">&#128204;</div>
            <div class="fullscreenControlBarModeSelectMenu futatsumePopupMenu futatsumeSubMenu">
              <div class="triangle"></div>
              <p class="caption">ツールバーの表示</p>
              <ul>
                <li tabindex="-1" data-command="update-fullscreenControlBarMode" data-param="always-show"><span>常に固定</span></li>
                <li tabindex="-1" data-command="update-fullscreenControlBarMode" data-param="always-hide"><span>常に隠す</span></li>
                <li tabindex="-1" data-command="update-fullscreenControlBarMode" data-param="auto"><span>画面サイズ自動</span></li>
              </ul>
            </div>
          </div>

          <div class="fullscreenSwitch controlButton" data-command="fullscreen">
            <div class="tooltip">フルスクリーン(F)</div>
            <div class="controlButtonInner">
              <!-- TODO: YouTubeと同じにする -->
              <span class="toFull">&#8690;</span>
              <span class="returnFull">&#8689;</span>
            </div>
          </div>

          <div class="settingPanelSwitch controlButton" data-command="settingPanel">
            <div class="controlButtonInner">&#x2699;</div>
            <div class="tooltip">設定</div>
          </div>

        </div>
      </div>

    </div>
  `.trim();

//@require heat-map-worker

class CommentPreviewModel extends Emitter {
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

class CommentPreviewView {
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
           data-command="addWordFilter" title="NGワード">NGword</span>
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

class CommentPreview {
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

class SeekBarToolTip {
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

class SmoothSeekBarPointer {
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

class WheelSeeker extends BaseViewComponent {
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

//===END===

export { VideoControlBar, HeatMapWorker, CommentPreviewModel, CommentPreviewView, CommentPreview, SeekBarToolTip };
