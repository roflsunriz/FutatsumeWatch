import './control-bar-style';
import _ from 'lodash';
import { global } from '../app/futatsume-watch-index';
import { CONSTANT } from '../shared/constant';
import { Storyboard } from '../storyboard/storyboard';
import { util } from '../shared/util';
import { Emitter } from '../shared/baselib';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import { WatchInfoCacheDb } from '../../packages/lib/src/nico/watch-info-cache-db';
import { TextLabel } from '../../packages/lib/src/ui/text-label';
import { cssUtil } from '../../packages/lib/src/css/css';
import { RequestAnimationFrame } from '../../packages/lib/src/infra/request-animation-frame';
import { ClassList } from '../../packages/lib/src/dom/class-list-wrapper';
import { VideoControlState } from '../player-shell/state';
import type { ConfigStore } from '../config/index';
import type { PlayerState } from '../player-shell/state';
import type { NicoVideoPlayer } from '../nico-video-player/index';
import { initializeHeatMap } from './heat-map-worker';
import { VIDEO_CONTROL_BAR_TEMPLATE } from './control-bar-template';
import { CommentPreview } from './comment-preview';
import { SeekBarToolTip, SmoothSeekBarPointer, WheelSeeker } from './seek-controls';
import type {
  VcbChatList,
  VcbControlState,
  VcbHeatMap,
  VcbPlayerParams,
  VcbQuery,
  VcbRaf,
  VcbStoryboard,
  VcbTextLabel,
  VcbUtil,
  VcbVideoInfo,
} from './types';
export class VideoControlBar extends Emitter {
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

    initializeHeatMap(this._seekBar, (heatMap) => (this.heatMap = heatMap));
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
    const width = (this._seekBar as HTMLElement).getBoundingClientRect().width;
    return this._duration * (Math.min(width, Math.max(0, pos)) / Math.max(width, 1));
  }
  _timeToPos(time: number): number {
    const seekBar = (this._seekBar as HTMLElement).getBoundingClientRect();
    const player = (this._$playerContainer[0] as Element).getBoundingClientRect();
    return seekBar.left - player.left + seekBar.width * (time / Math.max(this._duration, 1));
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
    const left = this._timeToPos(sec);
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
    const pos = e.offsetX;
    const sec = this._posToTime(pos);
    const left = this._timeToPos(sec);
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
    const left = this._timeToPos(sec);
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
VideoControlBar.__tpl__ = VIDEO_CONTROL_BAR_TEMPLATE;
