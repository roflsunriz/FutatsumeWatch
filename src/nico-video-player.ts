import _ from 'lodash';
import { global } from './futatsume-watch-index';
import { NicoCommentPlayer } from './comment-player';
import type { CommentPlayerOptions, CommentPlayerChatFilter, CommentPlayerParams } from './comment-player';
import { util, Config, Fullscreen, VideoCaptureUtil, BaseViewComponent } from './util';
import { YouTubeWrapper } from '../packages/futatsume/src/videoPlayer/you-tube-wrapper';
import { CONSTANT } from './constant';
import { Emitter } from './baselib';
import type { EmitterCallback } from '../packages/lib/src/emitter';
import { cssUtil } from '../packages/lib/src/css/css';
import { MediaTimeline } from '../packages/lib/src/dom/media-timeline';
import { ClassList } from '../packages/lib/src/dom/class-list-wrapper';

// 型宣言のみを置く（BEGIN 外のため生成物には含まれない）。
// ランタイムコードへの変更は、型注釈・as キャスト・declare フィールドに留める。
type NvpConfigValue = boolean | number | string;
interface NvpPlayerConfig {
  props: Record<string, NvpConfigValue>;
}
interface NvpPlayerState {
  onkey(event: string, handler: (info: unknown) => void): void;
  on<A extends Array<unknown>>(event: string, handler: (...args: A) => void): void;
  playbackRate: NvpConfigValue;
  videoInfo: { initialPlaybackTime: number };
}
interface NvpPlayerParams {
  playerConfig: NvpPlayerConfig;
  playerState: NvpPlayerState;
  fullscreenNode?: Element | null;
  node?: unknown;
}
interface NvpVideoInfo {
  title: string;
  watchId: string;
}
interface NvpQuery {
  find(selector: string): NvpQuery;
  forEach<E extends Element = Element>(callback: (elm: E) => void): void;
  css(props: Record<string, string>): NvpQuery;
  css(name: string, value: string): NvpQuery;
  addClass(className: string): NvpQuery;
  removeClass(className: string): NvpQuery;
  attr(attrs: Record<string, unknown>): NvpQuery;
  on<E extends Event>(event: string, handler: (e: E) => void, options?: AddEventListenerOptions): NvpQuery;
  [index: number]: Element;
  readonly length: number;
}
interface NvpUtil {
  $(target: unknown): NvpQuery;
  addStyle(css: string, id?: string): unknown;
  createVideoElement(): HTMLVideoElement;
  secToTime(sec: number): string;
}
interface NvpVideoPlayerParams {
  autoPlay?: NvpConfigValue;
  loop?: NvpConfigValue;
  mute?: NvpConfigValue;
  volume?: NvpConfigValue;
  playbackRate?: NvpConfigValue;
  debug?: NvpConfigValue;
}
interface NvpBoundHandlers extends Record<string, (e: Event) => void> {
  onBodyClick: EventListener;
}
interface NvpTouchPoint {
  x: number;
  y: number;
}
interface NvpTouchDiff {
  count: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  moveX: number;
  moveY: number;
  x: number;
  y: number;
  perX: number;
  perY: number;
  perStartX: number;
  perStartY: number;
  movePerX: number;
  movePerY: number;
}
interface NvpTouchConfig {
  props: Record<string, string>;
}
interface NvpYouTubePlayer {
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  src: string;
  currentTime: number;
  paused: boolean;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  setSrc(url: string, startSeconds?: number): Promise<unknown>;
  selectBestQuality(): void;
  play(): unknown;
  pause(): void;
  on(event: string, handler: EmitterCallback): unknown;
}
interface NvpBaseViewParams {
  parentNode?: Element | null;
  name?: string;
  template?: string;
  shadow?: string;
  css?: string;
}

//===BEGIN===

/**
 * VideoPlayer + CommentPlayer = NicoVideoPlayer
 *
 * とはいえmasterはVideoPlayerでCommentPlayerは表示位置を受け取るのみ。
 *
 */
class NicoVideoPlayer extends Emitter {
  declare _playerConfig: NvpPlayerConfig;
  declare _fullscreenNode: Element | null | undefined;
  declare _state: NvpPlayerState;
  declare _videoPlayer: VideoPlayer;
  declare _commentPlayer: NicoCommentPlayer;
  declare _contextMenu: ContextMenu;
  declare _videoWatchTimer: number | null;
  declare _isPlaying: boolean;
  declare _isEnded: boolean;
  declare _isSeeking: boolean;
  declare _parentNode: Element | null;
  declare _videoInfo: NvpVideoInfo;
  private nextAutoPlay: boolean | undefined;
  constructor(params: NvpPlayerParams) {
    super();
    this.initialize(params);
  }
  initialize(params: NvpPlayerParams) {
    const conf = (this._playerConfig = params.playerConfig);

    this._fullscreenNode = params.fullscreenNode;
    this._state = params.playerState;

    this._state.onkey('videoInfo', this.setVideoInfo.bind(this));

    const playbackRate = conf.props.playbackRate;

    const onCommand = (command: unknown, param: unknown): void => {
      this.emit('command', command, param);
    };
    this._videoPlayer = new VideoPlayer({
      volume: conf.props.volume,
      loop: conf.props.loop,
      mute: conf.props.mute,
      autoPlay: conf.props.autoPlay,
      playbackRate,
      debug: conf.props.debug,
    });
    this._videoPlayer.on('command', onCommand);

    this._commentPlayer = new NicoCommentPlayer({
      media: this._videoPlayer,
      // offScreenLayer: params.offScreenLayer,
      filter: {
        enableFilter: conf.props.enableFilter,
        wordFilter: conf.props.wordFilter,
        wordRegFilter: conf.props.wordRegFilter,
        wordRegFilterFlags: conf.props.wordRegFilterFlags,
        userIdFilter: conf.props.userIdFilter,
        commandFilter: conf.props.commandFilter,
        removeNgMatchedUser: conf.props.removeNgMatchedUser,
        fork0: conf.props['filter.fork0'],
        fork1: conf.props['filter.fork1'],
        fork2: conf.props['filter.fork2'],
        fork3: conf.props['filter.fork3'],
        defaultThread: conf.props['filter.defaultThread'],
        ownerThread: conf.props['filter.ownerThread'],
        communityThread: conf.props['filter.communityThread'],
        nicosThread: conf.props['filter.nicosThread'],
        easyThread: conf.props['filter.easyThread'],
        aiThread: conf.props['filter.aiThread'],
        extraDefaultThread: conf.props['filter.extraDefaultThread'],
        extraOwnerThread: conf.props['filter.extraOwnerThread'],
        extraCommunityThread: conf.props['filter.extraCommunityThread'],
        extraNicosThread: conf.props['filter.extraNicosThread'],
        extraEasyThread: conf.props['filter.extraEasyThread'],
        sharedNgLevel: conf.props.sharedNgLevel,
      },
      showComment: conf.props.showComment as boolean,
      debug: conf.props.debug,
      playbackRate: playbackRate as number,
    } as CommentPlayerParams & { filter: Record<string, unknown>; debug: unknown });
    this._commentPlayer.on('command', onCommand);

    this._contextMenu = new ContextMenu({
      parentNode: (params.node as { length: number; [index: number]: Element }).length
        ? (params.node as { [index: number]: Element })[0]
        : (params.node as Element | null),
      playerState: this._state,
    });
    this._contextMenu.on('command', onCommand);

    if (params.node) {
      this.appendTo(params.node);
    }

    this._initializeEvents();

    this._onTimer = this._onTimer.bind(this);
    this._beginTimer();

    global.debug.nicoVideoPlayer = this;
  }
  _beginTimer(): void {
    this._stopTimer();
    this._videoWatchTimer =
      // eslint-disable-next-line @typescript-eslint/unbound-method -- initialize で bind 済みの実体を参照する
      self.setInterval(this._onTimer, 100);
  }
  _stopTimer(): void {
    if (!this._videoWatchTimer) {
      return;
    }
    self.clearInterval(this._videoWatchTimer);
    this._videoWatchTimer = null;
  }
  _initializeEvents(): void {
    for (const [source, target] of [
      ['play', 'play'],
      ['playing', 'playing'],
      ['pause', 'pause'],
      ['ended', 'pause'],
      ['seeking', 'seeking'],
      ['seeked', 'seeked'],
      ['waiting', 'waiting'],
      ['canPlay', 'canplay'],
      ['loadedMetaData', 'loadedmetadata'],
      ['durationChange', 'durationchange'],
    ])
      this._videoPlayer.on(source!, () => this._commentPlayer.mediaEvent(target!));
    const eventBridge = function (this: NicoVideoPlayer, name: string, ...args: Array<unknown>): void {
      this.emit(name, ...args);
    };
    this._videoPlayer.on('volumeChange', this._onVolumeChange.bind(this) as EmitterCallback);
    this._videoPlayer.on('dblclick', this._onDblClick.bind(this));
    this._videoPlayer.on('aspectRatioFix', this._onAspectRatioFix.bind(this) as EmitterCallback);
    this._videoPlayer.on('play', this._onPlay.bind(this));
    this._videoPlayer.on('playing', this._onPlaying.bind(this));
    this._videoPlayer.on('seeking', this._onSeeking.bind(this));
    this._videoPlayer.on('seeked', this._onSeeked.bind(this));
    this._videoPlayer.on('stalled', eventBridge.bind(this, 'stalled'));
    this._videoPlayer.on('timeupdate', eventBridge.bind(this, 'timeupdate'));
    this._videoPlayer.on('waiting', eventBridge.bind(this, 'waiting'));
    this._videoPlayer.on('progress', eventBridge.bind(this, 'progress'));
    this._videoPlayer.on('pause', this._onPause.bind(this));
    this._videoPlayer.on('ended', this._onEnded.bind(this));
    this._videoPlayer.on('loadedMetaData', this._onLoadedMetaData.bind(this));
    this._videoPlayer.on('canPlay', this._onVideoCanPlay.bind(this));
    this._videoPlayer.on('durationChange', eventBridge.bind(this, 'durationChange'));
    this._videoPlayer.on('playerTypeChange', eventBridge.bind(this, 'videoPlayerTypeChange'));
    this._videoPlayer.on('buffercomplete', eventBridge.bind(this, 'buffercomplete'));

    // マウスホイールとトラックパッドで感度が違うのでthrottoleをかますと丁度良くなる(?)
    this._videoPlayer.on('mouseWheel', _.throttle(this._onMouseWheel.bind(this), 50) as EmitterCallback);

    this._videoPlayer.on('abort', eventBridge.bind(this, 'abort'));
    this._videoPlayer.on('error', eventBridge.bind(this, 'error'));

    this._videoPlayer.on('click', this._onClick.bind(this));
    this._videoPlayer.on('contextMenu', this._onContextMenu.bind(this) as EmitterCallback);
    this._commentPlayer.on('parsed', eventBridge.bind(this, 'commentParsed'));
    this._commentPlayer.on('change', eventBridge.bind(this, 'commentChange'));
    this._commentPlayer.on('filterChange', eventBridge.bind(this, 'commentFilterChange'));
    this._state.on('update', this._onPlayerStateUpdate.bind(this));
  }
  _onVolumeChange(vol: number, mute: boolean): void {
    this._playerConfig.props.volume = vol;
    this._playerConfig.props.mute = mute;
    this.emit('volumeChange', vol, mute);
  }
  _onPlayerStateUpdate(key: string, value: unknown): void {
    switch (key) {
      case 'isLoop':
        this._videoPlayer.isLoop = value as boolean;
        break;
      case 'playbackRate':
        this._videoPlayer.playbackRate = value as number;
        this._commentPlayer.playbackRate = value as number;
        this._commentPlayer.mediaEvent('ratechange');
        break;
      case 'isAutoPlay':
        this._videoPlayer.isAutoPlay = value as boolean;
        break;
      case 'isShowComment':
        if (value) {
          this._commentPlayer.show();
        } else {
          this._commentPlayer.hide();
        }
        break;
      case 'isMute':
        this._videoPlayer.muted = value as boolean;
        break;
      case 'sharedNgLevel':
        this.filter.sharedNgLevel = value;
        break;
      case 'currentSrc':
        void this.setVideo(value as string);
        break;
    }
  }
  _onMouseWheel(e: Event, delta: number): void {
    if (delta > 0) {
      // up
      return this.volumeUp();
    }
    if (delta < 0) {
      // down
      return this.volumeDown();
    }
  }
  volumeUp(): void {
    const v = Math.max(0.01, this._videoPlayer.volume);
    const r = v < 0.05 ? 1.3 : 1.1;
    this._videoPlayer.volume = Math.max(0, v * r);
  }
  volumeDown(): void {
    const v = this._videoPlayer.volume;
    const r = 1 / 1.2;
    this._videoPlayer.volume = v * r;
  }
  _onTimer(): void {
    this._commentPlayer.currentTime = this._videoPlayer.currentTime;
  }
  _onAspectRatioFix(ratio: number): void {
    this._commentPlayer.setAspectRatio(ratio);
    this.emit('aspectRatioFix', ratio);
  }
  _onLoadedMetaData(): void {
    this.emit('loadedMetaData');
  }
  _onVideoCanPlay(): void {
    this.emit('canPlay');
    if (this.isAutoPlay && this.paused) {
      this._videoPlayer.play().catch((error: unknown) => {
        this.emit('autoplay-rejected', error);
      });
    }
  }
  _onPlay(): void {
    this._isPlaying = true;
    this.emit('play');
  }
  _onPlaying(): void {
    this._isPlaying = true;
    this.emit('playing');
  }
  _onSeeking(): void {
    this._isSeeking = true;
    this.emit('seeking');
  }
  _onSeeked(): void {
    this._isSeeking = false;
    this.emit('seeked');
  }
  _onPause(): void {
    this._isPlaying = false;
    this.emit('pause');
  }
  _onEnded(): void {
    this._isPlaying = false;
    this._isEnded = true;
    this.emit('ended');
  }
  _onClick(): void {
    this._contextMenu.hide();
  }
  _onDblClick(): void {
    if (this._playerConfig.props.enableFullScreenOnDoubleClick) {
      this.toggleFullScreen();
    }
  }
  _onContextMenu(e: Event): void {
    if (!this._contextMenu.isOpen) {
      e.stopPropagation();
      e.preventDefault();
      this._contextMenu.show((e as MouseEvent).clientX, (e as MouseEvent).clientY);
    }
  }
  setVideo(url: string) {
    const setSource = (source: string): void => {
      if (source !== CONSTANT.BLANK_VIDEO_URL) {
        this.isAutoPlay = this.nextAutoPlay ?? Boolean(this._playerConfig.props.autoPlay);
        this.nextAutoPlay = undefined;
      }
      this._videoPlayer.setSrc(source);
      this._isEnded = false;
      this._isSeeking = false;
    };
    const e: { src: string; url: string | null; promise: Promise<string> | null } = {
      src: url,
      url: null,
      promise: null,
    };
    // デバッグ用
    global.emitter.emit('beforeSetVideo', e);
    if (e.url) {
      url = e.url;
    }
    if (e.promise) {
      return e.promise.then(setSource);
    }
    setSource(url);
  }
  /** A quality reload can preserve pause without changing the saved preference. */
  setNextAutoPlay(value: boolean | undefined): void {
    this.nextAutoPlay = value;
  }
  get isAutoPlay(): boolean {
    return this._videoPlayer.isAutoPlay;
  }
  set isAutoPlay(value: boolean) {
    this._videoPlayer.isAutoPlay = value;
  }
  setThumbnail(url: string): void {
    this._videoPlayer.thumbnail = url;
  }
  play(): Promise<unknown> {
    return this._videoPlayer.play();
  }
  pause(): Promise<unknown> {
    void this._videoPlayer.pause();
    return Promise.resolve();
  }
  togglePlay(): Promise<unknown> {
    return this._videoPlayer.togglePlay();
  }
  setPlaybackRate(playbackRate: number): void {
    playbackRate = Math.max(0, Math.min(playbackRate, 10));
    this._videoPlayer.playbackRate = playbackRate;
    this._commentPlayer.playbackRate = playbackRate;
    this._commentPlayer.mediaEvent('ratechange');
  }
  fastSeek(t: number): void {
    this._videoPlayer.fastSeek(Math.max(0, t));
  }
  set currentTime(t: number) {
    this._videoPlayer.currentTime = Math.max(0, t);
  }
  get currentTime(): number {
    return this._videoPlayer.currentTime;
  }
  get vpos(): number {
    return this.currentTime * 100;
  }
  get duration(): number {
    return this._videoPlayer.duration;
  }
  get chatList(): unknown {
    return this._commentPlayer.chatList;
  }
  get nonFilteredChatList(): unknown {
    return (this._commentPlayer as unknown as { nonFilteredChatList: unknown }).nonFilteredChatList;
  }
  appendTo(node: unknown): void {
    node = (util as unknown as NvpUtil).$(node)[0];
    this._parentNode = node as Element;
    this._videoPlayer.appendTo(node as Element);
    this._commentPlayer.appendTo(node as Element);
  }
  close(): void {
    this._videoPlayer.close();
    this._commentPlayer.close();
  }
  closeCommentPlayer(): void {
    this._commentPlayer.close();
  }
  toggleFullScreen(): void {
    if (Fullscreen.now()) {
      Fullscreen.cancel();
    } else {
      this.requestFullScreen();
    }
  }
  requestFullScreen(): void {
    Fullscreen.request((this._fullscreenNode || this._parentNode) as Element);
  }
  canPlay(): boolean {
    return this._videoPlayer.canPlay();
  }
  get isPlaying(): boolean {
    return !!this._isPlaying;
  }
  get paused(): boolean {
    return this._videoPlayer.paused;
  }
  get isSeeking(): boolean {
    return !!this._isSeeking;
  }
  get bufferedRange(): unknown {
    return this._videoPlayer.bufferedRange;
  }
  addChat(text: string, cmd: string, vpos: number, options?: Record<string, unknown>): unknown {
    if (!this._commentPlayer) {
      return;
    }
    const nicoChat = this._commentPlayer.addChat(text, cmd, vpos, options);
    return nicoChat;
  }
  removeChat(nicoChat: unknown): void {
    if (!this._commentPlayer) {
      return;
    }
    this._commentPlayer.removeChat(nicoChat);
  }
  /**
   * @returns {NicoChatFilter}
   */
  get filter(): CommentPlayerChatFilter {
    return this._commentPlayer.filter;
  }
  /**
   * @returns {VideoInfoModel}
   */
  get videoInfo(): NvpVideoInfo {
    return this._videoInfo;
  }
  set videoInfo(info: NvpVideoInfo) {
    this._videoInfo = info;
  }
  getMymemory(): unknown {
    return this._commentPlayer.getMymemory();
  }
  getScreenShot(): Promise<unknown> {
    const fileName = this._getSaveFileName();
    const video = this._videoPlayer.videoElement;

    return VideoCaptureUtil.videoToCanvas(video).then(({ canvas }: { canvas: HTMLCanvasElement }) => {
      VideoCaptureUtil.saveToFile(canvas, fileName);
    });
  }
  getScreenShotWithComment(): Promise<unknown> {
    const fileName = this._getSaveFileName({ suffix: 'C' });
    const video = this._videoPlayer.videoElement;
    const overlay = this._commentPlayer.canvas;
    return VideoCaptureUtil.videoToCanvas(video).then(({ canvas }: { canvas: HTMLCanvasElement }) => {
      if (overlay) canvas.getContext('2d')?.drawImage(overlay, 0, 0, canvas.width, canvas.height);
      VideoCaptureUtil.saveToFile(canvas, fileName);
    });
  }
  _getSaveFileName({ suffix = '' }: { suffix?: string } = {}): string {
    const title = this._videoInfo.title;
    const watchId = this._videoInfo.watchId;
    const currentTime = this._videoPlayer.currentTime;
    const time = (util as unknown as NvpUtil).secToTime(currentTime).replace(':', '_');
    const prefix = Config.props['screenshot.prefix'] || '';

    return `${prefix}${title} - ${watchId}@${time}${suffix}.png`;
  }
  get isCorsReady(): boolean {
    return !!this._videoPlayer && !!this._videoPlayer.isCorsReady;
  }
  get volume(): number {
    return this._videoPlayer.volume;
  }
  set volume(v: number) {
    this._videoPlayer.volume = v;
  }
  getDuration(): number {
    return this._videoPlayer.duration;
  }
  getChatList(): unknown {
    return this._commentPlayer.chatList;
  }
  getVpos(): number {
    return Math.floor(this._videoPlayer.currentTime * 100);
  }
  setComment(xmlText: unknown, options: CommentPlayerOptions): void {
    this._commentPlayer.setComment(xmlText, options);
  }
  getNonFilteredChatList(): unknown {
    return (this._commentPlayer as unknown as { nonFilteredChatList: unknown }).nonFilteredChatList;
  }
  getBufferedRange(): unknown {
    return this._videoPlayer.bufferedRange;
  }
  setVideoInfo(v: unknown): void {
    this.videoInfo = v as NvpVideoInfo;
  }
  getVideoInfo(): NvpVideoInfo {
    return this.videoInfo;
  }
}

class ContextMenu extends BaseViewComponent {
  declare static __tpl__: string;
  declare static __css__: string;
  declare _playerState: NvpPlayerState;
  declare _state: { isOpen: boolean };
  declare _bound: NvpBoundHandlers;
  declare _view: HTMLElement;
  declare _isFirstShow: boolean;
  declare _repeatEvent: MouseEvent | null;
  declare _repeatTimer: number | null;
  declare _isRepeating: boolean;
  constructor({ parentNode, playerState }: { parentNode?: Element | null; playerState: NvpPlayerState }) {
    super({
      parentNode,
      name: 'VideoContextMenu',
      template: ContextMenu.__tpl__,
      css: ContextMenu.__css__,
    });
    this._playerState = playerState;
    this._state = {
      isOpen: false,
    };

    this._bound.onBodyClick = this.hide.bind(this);
  }

  _initDom(...args: [NvpBaseViewParams]) {
    super._initDom(...args);
    global.debug.contextMenu = this;
    const onMouseDown = (this._bound.onMouseDown = this._onMouseDown.bind(this) as EventListener);
    this._bound.onBodyMouseUp = this._onBodyMouseUp.bind(this);
    this._bound.onRepeat = this._onRepeat.bind(this);
    this._view.classList.toggle('is-pictureInPictureEnabled', document.pictureInPictureEnabled);
    this._view.addEventListener('mousedown', onMouseDown);
    this._isFirstShow = true;
    this._view.addEventListener('contextmenu', (e: MouseEvent) => {
      setTimeout(() => {
        this.hide();
      }, 100);
      e.preventDefault();
      e.stopPropagation();
    });
  }

  _onClick(e: MouseEvent): void {
    if (e && e.button !== 0) {
      return;
    }

    if (e.type !== 'mousedown') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    super._onClick(e);
  }

  _onMouseDown(e: MouseEvent): void {
    if (e.target && (e.target as Element).getAttribute('data-is-no-close') === 'true') {
      e.stopPropagation();
      this._onClick(e);
    } else if (e.target && (e.target as Element).getAttribute('data-repeat') === 'on') {
      e.stopPropagation();
      this._onClick(e);
      this._beginRepeat(e);
    } else {
      e.stopPropagation();
      this._onClick(e);
      setTimeout(() => {
        this.hide();
      }, 100);
    }
  }

  _onBodyMouseUp(): void {
    this._endRepeat();
  }

  _beginRepeat(e: MouseEvent): void {
    this._repeatEvent = e;
    document.body.addEventListener('mouseup', this._bound.onBodyMouseUp as EventListener);

    this._repeatTimer = window.setInterval(this._bound.onRepeat as () => void, 200);
    this._isRepeating = true;
  }

  _endRepeat(): void {
    this._repeatEvent = null;
    // this._isRepeating = false;
    if (this._repeatTimer) {
      window.clearInterval(this._repeatTimer);
      this._repeatTimer = null;
    }
    document.body.removeEventListener('mouseup', this._bound.onBodyMouseUp as EventListener);
  }

  _onRepeat(): void {
    if (!this._isRepeating) {
      this._endRepeat();
      return;
    }
    if (this._repeatEvent) {
      this._onClick(this._repeatEvent);
    }
  }

  show(x: number, y: number): void {
    document.body.addEventListener('click', this._bound.onBodyClick);
    const view = this._view;

    this._onBeforeShow();

    view.style.left = cssUtil.px(Math.max(0, Math.min(x, global.innerWidth - view.offsetWidth))) as string;
    view.style.top = cssUtil.px(Math.max(0, Math.min(y + 20, global.innerHeight - view.offsetHeight))) as string;
    this.setState({ isOpen: true });
    void global.emitter.emitAsync('showMenu');
  }

  hide(): void {
    document.body.removeEventListener('click', this._bound.onBodyClick);
    (util as unknown as NvpUtil).$(this._view).css({ left: '', top: '' });
    this._endRepeat();
    this.setState({ isOpen: false });
    void global.emitter.emitAsync('hideMenu');
  }

  get isOpen(): boolean {
    return this._state.isOpen;
  }

  _onBeforeShow(): void {
    // チェックボックスなどを反映させるならココ
    const pr = parseFloat(String(this._playerState.playbackRate));
    const view = (util as unknown as NvpUtil).$(this._view);
    view.find('.selected').removeClass('selected');
    view.find('.playbackRate').forEach((elm: HTMLElement) => {
      const p = parseFloat(elm.dataset.param as string);
      if (Math.abs(p - pr) < 0.01) {
        elm.classList.add('selected');
      }
    });
    view.find('[data-config]').forEach((menu: HTMLElement) => {
      const name = menu.dataset.config;
      menu.classList.toggle('selected', !!(global.config.props as Record<string, NvpConfigValue>)[name as string]);
    });
    view.find('.seekToResumePoint').css('display', this._playerState.videoInfo.initialPlaybackTime > 0 ? '' : 'none');
    if (this._isFirstShow) {
      this._isFirstShow = false;
      const handler = (command: unknown, param: unknown): void => {
        this.emit('command', command, param);
      };
      void global.emitter.emitAsync('videoContextMenu.addonMenuReady', view.find('.empty-area-top'), handler);
      void global.emitter.emitAsync('videoContextMenu.addonMenuReady.list', view.find('.listInner ul'), handler);
      global.emitter.emitResolve('videoContextMenu.addonMenuReady', {
        container: view.find('.empty-area-top'),
        handler,
      });
      global.emitter.emitResolve('videoContextMenu.addonMenuReady.list', {
        container: view.find('.listInner ul'),
        handler,
      });
    }
  }
}

ContextMenu.__css__ = `
  .futatsumePlayerContextMenu {
    position: fixed;
    background: rgba(255, 255, 255, 0.8);
    overflow: visible;
    padding: 8px;
    border: 1px outset #333;
    box-shadow: 2px 2px 4px #000;
    transition: opacity 0.3s ease;
    min-width: 200px;
    z-index: 150000;
    user-select: none;
    color: #000;
  }
  .futatsumePlayerContextMenu.is-Open {
    display: block;
    opacity: 0.5;
  }
  .futatsumePlayerContextMenu.is-Open:hover {
    opacity: 1;
  }
  .is-fullscreen .futatsumePlayerContextMenu {
    position: absolute;
  }

  .futatsumePlayerContextMenu:not(.is-Open) {
    display: none;
    /*left: -9999px;
    top: -9999px;
    opacity: 0;*/
  }

  .futatsumePlayerContextMenu ul {
    padding: 0;
    margin: 0;
  }

  .futatsumePlayerContextMenu ul li {
    position: relative;
    line-height: 120%;
    margin: 2px;
    overflow-y: visible;
    white-space: nowrap;
    cursor: pointer;
    padding: 2px 14px;
    list-style-type: none;
    float: inherit;
  }
  .is-playlistEnable .futatsumePlayerContextMenu li.togglePlaylist:before,
  .is-flipV          .futatsumePlayerContextMenu li.toggle-flipV:before,
  .is-flipH          .futatsumePlayerContextMenu li.toggle-flipH:before,
  .futatsumePlayerContextMenu ul                 li.selected:before {
    content: '✔';
    left: -10px;
    color: #000 !important;
    position: absolute;
  }
  .futatsumePlayerContextMenu ul li:hover {
    background: #336;
    color: #fff;
  }
  .futatsumePlayerContextMenu ul li.separator {
    border: 1px outset;
    height: 2px;
    width: 90%;
  }
  .futatsumePlayerContextMenu.show {
    opacity: 0.8;
  }
  .futatsumePlayerContextMenu .listInner {
  }

  .futatsumePlayerContextMenu .controlButtonContainer {
    position: absolute;
    bottom: 100%;
    left: 50%;
    width: 110%;
    transform: translate(-50%, 0);
    white-space: nowrap;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex {
    display: flex;
  }

  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton {
    flex: 1;
    height: 48px;
    font-size: 24px;
    line-height: 46px;
    border: 1px solid;
    border-radius: 4px;
    color: #333;
    background: rgba(192, 192, 192, 0.95);
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s;
    box-shadow: 0 0 0;
    opacity: 1;
    margin: auto;
  }

  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.screenShot {
    flex: 1;
    font-size: 24px;
  }

  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.playbackRate {
    flex: 2;
    font-size: 14px;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.rate010,
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.rate100,
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.rate200 {
    flex: 3;
    font-size: 24px;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.seek5s {
    flex: 2;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.seek15s {
    flex: 3;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton:hover {
    transform: translate(0px, -4px);
    box-shadow: 0px 4px 2px #666;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton:active {
    transform: none;
    box-shadow: 0 0 0;
    border: 1px inset;
  }

  [data-command="picture-in-picture"] {
    display: none;
  }
  .is-pictureInPictureEnabled [data-command="picture-in-picture"] {
    display: block;
  }

  `.trim();

ContextMenu.__tpl__ = `
  <div class="futatsumePlayerContextMenu">
    <div class="controlButtonContainer">
      <div class="controlButtonContainerFlex">
        <div class="controlButton command screenShot" data-command="screenShot"
          data-param="0.1" data-type="number" data-is-no-close="true">
          &#128247;<div class="tooltip">スクリーンショット</div>
        </div>
        <div class="empty-area-top" style="flex:4;" data-is-no-close="true"></div>
      </div>
      <div class="controlButtonContainerFlex">
        <div class="controlButton command rate010 playbackRate" data-command="playbackRate"
          data-param="0.1" data-type="number" data-repeat="on">
          &#128034;<div class="tooltip">コマ送り(0.1倍)</div>
        </div>
        <div class="controlButton command rate050 playbackRate" data-command="playbackRate"
          data-param="0.5" data-type="number" data-repeat="on">
          <div class="tooltip">0.5倍速</div>
        </div>
        <div class="controlButton command rate075 playbackRate" data-command="playbackRate"
          data-param="0.75" data-type="number" data-repeat="on">
          <div class="tooltip">0.75倍速</div>
        </div>

        <div class="controlButton command rate100 playbackRate" data-command="playbackRate"
          data-param="1.0" data-type="number" data-repeat="on">
          &#9655;<div class="tooltip">標準速</div>
        </div>

        <div class="controlButton command rate125 playbackRate" data-command="playbackRate"
          data-param="1.25" data-type="number" data-repeat="on">
          <div class="tooltip">1.25倍速</div>
        </div>
        <div class="controlButton command rate150 playbackRate" data-command="playbackRate"
          data-param="1.5" data-type="number" data-repeat="on">
          <div class="tooltip">1.5倍速</div>
        </div>
        <div class="controlButton command rate200 playbackRate" data-command="playbackRate"
          data-param="2.0" data-type="number" data-repeat="on">
          &#128007;<div class="tooltip">2倍速</div>
        </div>
      </div>
      <div class="controlButtonContainerFlex seekToResumePoint">
        <div class="controlButton command"
        data-command="seekToResumePoint"
        >▼ここまで見た
          <div class="tooltip">レジューム位置にジャンプ</div>
        </div>
      </div>
      <div class="controlButtonContainerFlex">
        <div class="controlButton command seek5s"
          data-command="seekBy" data-param="-5" data-type="number" data-repeat="on"
          >⇦
            <div class="tooltip">5秒戻る</div>
        </div>
        <div class="controlButton command seek15s"
          data-command="seekBy" data-param="-15" data-type="number" data-repeat="on"
          >⇦
            <div class="tooltip">15秒戻る</div>
        </div>
        <div class="controlButton command seek15s"
          data-command="seekBy" data-param="15" data-type="number" data-repeat="on"
          >⇨
            <div class="tooltip">15秒進む</div>
        </div>
        <div class="controlButton command seek5s"
          data-command="seekBy" data-param="5" data-type="number" data-repeat="on"
          >⇨
            <div class="tooltip">5秒進む</div>
        </div>
      </div>
    </div>
    <div class="listInner">
      <ul>
        <li class="command" data-command="togglePlay">停止/再開</li>
        <li class="command" data-command="seekTo" data-param="0">先頭に戻る</li>
        <hr class="separator">
        <li class="command toggleLoop"        data-config="loop" data-command="toggle-loop">リピート</li>
        <li class="command togglePlaylist"    data-command="togglePlaylist">連続再生</li>
        <li class="command toggleShowComment" data-config="showComment" data-command="toggle-showComment">コメントを表示</li>
        <li class="command" data-command="picture-in-picture">P in P</li>
        <hr class="separator">

        <li class="command forPremium toggle-flipH" data-command="toggle-flipH">左右反転</li>
        <li class="command toggle-flipV"            data-command="toggle-flipV">上下反転</li>

        <hr class="separator">

        <li class="command"
          data-command="reload">動画のリロード</li>
        <li class="command"
          data-command="copy-video-watch-url">動画URLをコピー</li>
        <li class="command debug" data-config="debug"
          data-command="toggle-debug">デバッグ</li>
        <li class="command mymemory"
          data-command="saveMymemory">コメントの保存</li>
      </ul>
    </div>
  </div>
`.trim();

/**
 *  Video要素をラップした物
 *
 */
class VideoPlayer extends Emitter {
  declare static __css__: string;
  declare _id: string;
  declare _videoElement: HTMLVideoElement;
  declare _currentVideo: HTMLVideoElement | NvpYouTubePlayer;
  declare _body: HTMLDivElement;
  declare classList: DOMTokenList;
  declare _touchWrapper: TouchWrapper;
  declare _isPlaying: boolean;
  declare _canPlay: boolean;
  declare _playbackRate: number;
  declare _isAspectRatioFixed: boolean;
  declare _videoYouTube: NvpYouTubePlayer;
  declare _volume: number;
  declare _thumbnail: string;
  declare _src: string;
  constructor(params: NvpVideoPlayerParams) {
    super();
    this._initialize(params);
    global.debug.timeline = (MediaTimeline as unknown as { register(name: string, media: unknown): unknown }).register(
      'main',
      this
    );
  }

  _initialize(params: NvpVideoPlayerParams): void {
    this._id = 'video' + Math.floor(Math.random() * 100000);
    this._resetVideo(params);

    (util as unknown as NvpUtil).addStyle(VideoPlayer.__css__);
  }

  _reset(): void {
    this.removeClass('is-play is-pause is-abort is-error');
    this._isPlaying = false;
    this._canPlay = false;
  }

  addClass(className: string): void {
    this.classList.add(...className.split(/\s/));
  }

  removeClass(className: string): void {
    this.classList.remove(...className.split(/\s/));
  }

  toggleClass(className: string, v?: boolean): void {
    const classList = this.classList;
    className.split(/[ ]+/).forEach((name: string) => {
      classList.toggle(name, v);
    });
  }

  _resetVideo(params?: NvpVideoPlayerParams | null): void {
    params = params || {};
    if (this._videoElement) {
      params.autoPlay = this._videoElement.autoplay;
      params.loop = this._videoElement.loop;
      params.mute = this._videoElement.muted;
      params.volume = this._videoElement.volume;
      params.playbackRate = this._videoElement.playbackRate;
      this._videoElement.remove();
    }

    const options = {
      autobuffer: true,
      preload: 'auto',
      mute: !!params.mute,
      playsinline: true,
      'webkit-playsinline': true,
    };

    const volume = Object.prototype.hasOwnProperty.call(params, 'volume') ? parseFloat(params.volume as string) : 0.5;
    const playbackRate = (this._playbackRate = Object.prototype.hasOwnProperty.call(params, 'playbackRate')
      ? parseFloat(params.playbackRate as string)
      : 1.0);

    const video = (util as unknown as NvpUtil).createVideoElement();
    const body = document.createElement('div');
    (util as unknown as NvpUtil).$(body).addClass(`videoPlayer nico ${this._id}`);
    (util as unknown as NvpUtil).$(video).addClass('videoPlayer-video').attr(options);
    body.id = 'FutatsumeWatchVideoPlayerContainer';
    this._body = body;
    this.classList = ClassList(body);
    body.append(video);
    video.pause();

    this._video = video;
    this._video.className = 'futatsumeWatchVideoElement';
    (video as unknown as { controlslist: string }).controlslist = 'nodownload';
    video.controls = false;
    video.autoplay = !!params.autoPlay;
    video.loop = !!params.loop;
    this._videoElement = video;

    this._isPlaying = false;
    this._canPlay = false;

    this.volume = volume;
    this.muted = params.mute as boolean;
    this.playbackRate = playbackRate;

    this._touchWrapper = new TouchWrapper({
      parentElement: body,
    });
    this._touchWrapper.on('command', (command: unknown, param: unknown) => {
      if (command === 'contextMenu') {
        (this as unknown as { _emit(event: string, ...args: Array<unknown>): void })._emit('contextMenu', param);
        return;
      }
      this.emit('command', command, param);
    });

    this._initializeEvents();

    global.debug.video = this._video;
    Object.assign(global.external, { getVideoElement: () => this._video });
  }

  _initializeEvents(): void {
    const eventBridge = function (this: VideoPlayer, name: string, ...args: Array<unknown>): void {
      this.emit(name, ...args);
    };

    (util as unknown as NvpUtil)
      .$(this._video)
      .on('canplay', this._onCanPlay.bind(this))
      .on('canplaythrough', eventBridge.bind(this, 'canplaythrough'))
      .on('loadstart', eventBridge.bind(this, 'loadstart'))
      .on('loadeddata', eventBridge.bind(this, 'loadeddata'))
      .on('loadedmetadata', eventBridge.bind(this, 'loadedmetadata'))
      .on('ended', eventBridge.bind(this, 'ended'))
      .on('emptied', eventBridge.bind(this, 'emptied'))
      // .on('stalled', this._onStalled.bind(this))
      .on('suspend', eventBridge.bind(this, 'suspend'))
      .on('waiting', eventBridge.bind(this, 'waiting'))
      .on('progress', this._onProgress.bind(this))
      .on('durationchange', this._onDurationChange.bind(this))
      .on('abort', this._onAbort.bind(this))
      .on('error', this._onError.bind(this))
      .on('buffercomplete', eventBridge.bind(this, 'buffercomplete'))

      .on('pause', this._onPause.bind(this))
      .on('play', this._onPlay.bind(this))
      .on('playing', this._onPlaying.bind(this))
      .on('seeking', this._onSeeking.bind(this))
      .on('seeked', this._onSeeked.bind(this))
      .on('volumechange', this._onVolumeChange.bind(this))
      .on('contextmenu', eventBridge.bind(this, 'contextmenu'))
      .on('click', eventBridge.bind(this, 'click'));

    const touch = (util as unknown as NvpUtil).$(this._touchWrapper.body);
    touch
      .on('click', eventBridge.bind(this, 'click'))
      .on('dblclick', this._onDoubleClick.bind(this))
      .on('contextmenu', eventBridge.bind(this, 'contextmenu'))
      .on('wheel', this._onMouseWheel.bind(this), { passive: true });
  }

  _onCanPlay(...args: Array<unknown>): void {
    // eslint-disable-next-line no-self-assign -- setter 再適用のため意図的な自己代入
    this.playbackRate = this.playbackRate;
    // リピート時にも飛んでくるっぽいので初回だけにする
    if (!this._canPlay) {
      this._canPlay = true;
      this.removeClass('is-loading');
      if (Config.props.enableResume && this._video.currentTime == 0) {
        this.emit('command', 'seekToResumePoint');
      }
      this.emit('canPlay', ...args);
      if (this._video.videoHeight < 1) {
        this._isAspectRatioFixed = false;
      } else {
        this._isAspectRatioFixed = true;
        this.emit('aspectRatioFix', this._video.videoHeight / Math.max(1, this._video.videoWidth));
      }
      if (this._isYouTube && Config.props.bestFutatsumeTube) {
        this._videoYouTube.selectBestQuality();
      }
    }
  }

  _onProgress(): void {
    //console.log('%c_onProgress:', 'background: cyan;', arguments);
    this.emit('progress', (this._video as HTMLVideoElement).buffered, this._video.currentTime);
  }

  _onDurationChange(): void {
    this.emit('durationChange', this._video.duration);
  }

  _onAbort(): void {
    if (this._isYouTube) {
      return;
    } // TODO: YouTube側のエラーハンドリング
    // console.warn('%c_onAbort:', 'background: cyan; color: red;');
    this._isPlaying = false;
    this.addClass('is-abort');
    this.emit('abort');
  }

  _onError(e: Event): void {
    if (this._isYouTube) {
      return;
    }
    if (
      this._videoElement.src === CONSTANT.BLANK_VIDEO_URL ||
      !this._videoElement.src ||
      this._videoElement.src.match(/^https?:$/) ||
      this._videoElement.src === '//'
    ) {
      return;
    }
    window.console.error('error src', this._video.src);
    this.addClass('is-error');
    this._canPlay = false;
    const target = e.target as HTMLMediaElement | null;
    this.emit('error', {
      code: (e && target && target.error && target.error.code) || 0,
      target: target || this._video,
      type: 'normal',
    });
  }

  _onYouTubeError(e: unknown): void {
    window.console.error('error src', this._video.src);
    window.console.error('%c_onError:', 'background: cyan; color: red;', e);
    this.addClass('is-error');
    this._canPlay = false;
    let fallback = false;

    const code = (e as { data: number }).data;
    const description = (() => {
      switch (code) {
        case 2:
          return 'YouTube Error: パラメータエラー (2 invalid parameter)';
        case 5:
          return 'YouTube Error: HTML5 関連エラー (5 HTML5 error)';
        case 100:
          fallback = true;
          return 'YouTube Error: 動画が見つからないか、非公開 (100 video not found)';
        case 101:
        case 150:
          fallback = true;
          return `YouTube Error: 外部での再生禁止 (${code} forbidden)`;
        default:
          return `YouTube Error: (code${code})`;
      }
    })();

    this.emit('error', {
      code,
      description,
      fallback,
      target: this._videoElement,
      type: 'youtube',
    });
  }

  _onPause(): void {
    //this.removeClass('is-play');

    this._isPlaying = false;
    this.emit('pause');
  }

  _onPlay(): void {
    this.addClass('is-play');
    this._isPlaying = true;
    this.emit('play');
  }

  _onPlaying(): void {
    this._isPlaying = true;

    if (!this._isAspectRatioFixed) {
      this._isAspectRatioFixed = true;
      this.emit('aspectRatioFix', this._video.videoHeight / Math.max(1, this._video.videoWidth));
    }

    this.emit('playing');
  }

  _onSeeking(): void {
    this.emit('seeking', this._video.currentTime);
  }

  _onSeeked(): void {
    this.emit('seeked', this._video.currentTime);
  }

  _onVolumeChange(): void {
    this.emit('volumeChange', this.volume, this.muted);
  }

  _onDoubleClick(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.emit('dblclick');
  }

  _onMouseWheel(e: WheelEvent): void {
    if (e.buttons || e.shiftKey) {
      return;
    }
    e.stopPropagation();
    const delta = e.deltaY * -1;
    if (Number.isNaN(delta)) {
      return;
    }
    this.emit('mouseWheel', e, delta);
  }

  _onStalled(e: Event): void {
    this.emit('stalled', e);
    (this._video as HTMLVideoElement).addEventListener('timeupdate', () => this.emit('timeupdate'), { once: true });
  }

  canPlay(): boolean {
    return !!this._canPlay;
  }

  async play(): Promise<unknown> {
    if (this._currentVideo.currentTime === this.duration) {
      this.currentTime = 0;
    }
    const p = await this._video.play();
    this._isPlaying = true;
    return p;
  }

  pause(): Promise<unknown> {
    this._video.pause();
    this._isPlaying = false;
    return Promise.resolve();
  }

  get isPlaying(): boolean {
    return !!this._isPlaying && !!this._canPlay;
  }
  get paused(): boolean {
    return this._video.paused;
  }
  set thumbnail(url: string) {
    this._thumbnail = url;
    (this._video as HTMLVideoElement).poster = url;
    //this.emit('setThumbnail', url);
  }
  get thumbnail(): string {
    return this._thumbnail;
  }

  set src(url: string) {
    this._reset();

    this._src = url;
    this._isPlaying = false;
    this._canPlay = false;
    this._isAspectRatioFixed = false;
    this.addClass('is-loading');

    if (/(youtube\.com|youtu\.be)/.test(url)) {
      const currentTime = this._currentVideo.currentTime;
      void this._initYouTube()
        .then(() => {
          // 通常使用では(video|YouTube) -> YouTubeへの遷移しか存在しないので
          // 逆方向の想定は色々端折っている
          return this._videoYouTube.setSrc(url, currentTime);
        })
        .then(() => {
          this._changePlayer('YouTube');
        });
      return;
    }

    this._changePlayer('normal');
    if ((this._video as HTMLVideoElement).crossOrigin) {
      (this._video as HTMLVideoElement).crossOrigin = null;
    }

    this._video.src = url;
  }
  get src(): string {
    return this._src;
  }

  get _isYouTube(): boolean {
    return !!this._videoYouTube && this._currentVideo === this._videoYouTube;
  }

  _initYouTube(): Promise<NvpYouTubePlayer> {
    if (this._videoYouTube) {
      return Promise.resolve(this._videoYouTube);
    }
    const yt = (this._videoYouTube = new YouTubeWrapper({
      parentNode: this._body.appendChild(document.createElement('div')),
      volume: this._volume,
      autoplay: this._videoElement.autoplay,
    }) as unknown as NvpYouTubePlayer);
    const eventBridge = function (this: VideoPlayer, name: string, ...args: Array<unknown>): void {
      this.emit(name, ...args);
    };

    yt.on('canplay', this._onCanPlay.bind(this));
    yt.on('loadedmetadata', eventBridge.bind(this, 'loadedmetadata'));
    yt.on('ended', eventBridge.bind(this, 'ended'));
    yt.on('stalled', eventBridge.bind(this, 'stalled'));
    yt.on('pause', this._onPause.bind(this));
    yt.on('play', this._onPlay.bind(this));
    yt.on('playing', this._onPlaying.bind(this));

    yt.on('seeking', this._onSeeking.bind(this));
    yt.on('seeked', this._onSeeked.bind(this));
    yt.on('volumechange', this._onVolumeChange.bind(this));
    yt.on('error', this._onYouTubeError.bind(this));

    global.debug.youtube = yt;
    return Promise.resolve(this._videoYouTube);
  }

  _changePlayer(type: string): void {
    switch (type.toLowerCase()) {
      case 'youtube':
        if (this._currentVideo !== this._videoYouTube) {
          const yt = this._videoYouTube;
          this.addClass('is-youtube');
          yt.autoplay = this._currentVideo.autoplay;
          yt.loop = this._currentVideo.loop;
          yt.muted = this._currentVideo.muted;
          yt.volume = this._currentVideo.volume;
          yt.playbackRate = this._currentVideo.playbackRate;
          this._currentVideo = yt;
          this._videoElement.src = CONSTANT.BLANK_VIDEO_URL;
          this.emit('playerTypeChange', 'youtube');
        }
        break;
      default:
        if (this._currentVideo === this._videoYouTube) {
          this.removeClass('is-youtube');
          this._videoElement.loop = this._currentVideo.loop;
          this._videoElement.muted = this._currentVideo.muted;
          this._videoElement.volume = this._currentVideo.volume;
          this._videoElement.playbackRate = this._currentVideo.playbackRate;
          this._currentVideo = this._videoElement;
          this._videoYouTube.src = '';
          this.emit('playerTypeChange', 'normal');
        }
        break;
    }
  }

  set volume(vol: number) {
    vol = Math.max(Math.min(1, vol), 0);
    this._video.volume = vol;
  }
  get volume(): number {
    return Math.max(0, this._video.volume);
  }
  set muted(v: boolean) {
    v = !!v;
    if (this._video.muted !== v) {
      this._video.muted = v;
    }
  }
  get muted(): boolean {
    return !!this._video.muted;
  }

  get currentTime(): number {
    if (!this._canPlay) {
      return 0;
    }
    return this._video.currentTime;
  }

  set currentTime(sec: number) {
    const cur = this._video.currentTime;
    if (cur !== sec) {
      this._video.currentTime = sec;
      this.emit('seek', this._video.currentTime);
    }
  }

  /**
   * fastSeekが使えたら使う。 現状Firefoxのみ？
   * - currentTimeによるシーク 位置は正確だが遅い
   * - fastSeekによるシーク キーフレームにしか飛べないが速い(FLashに近い)
   * なので、smile動画のループはこっちを使ったほうが再現度が高くなりそう
   */
  fastSeek(sec: number) {
    if (typeof (this._video as unknown as { fastSeek?: unknown }).fastSeek !== 'function' || this._isYouTube) {
      return (this.currentTime = sec);
    }
    (this._video as unknown as { fastSeek(sec: number): void }).fastSeek(sec);
    this.emit('seek', this._video.currentTime);
  }

  get duration(): number {
    return this._video.duration;
  }

  togglePlay(): Promise<unknown> {
    if (this.isPlaying) {
      return this.pause();
    } else {
      return this.play();
    }
  }

  get vpos(): number {
    return this._video.currentTime * 100;
  }
  set vpos(vpos: number) {
    this._video.currentTime = vpos / 100;
  }
  get isLoop(): boolean {
    return !!this._video.loop;
  }
  set isLoop(v: boolean) {
    this._video.loop = !!v;
  }
  set playbackRate(v: number) {
    //if (!FutatsumeWatch.util.isPremium()) { v = Math.min(1, v); }
    // たまにリセットされたり反映されなかったりする？
    this._playbackRate = v;
    const video = this._video;
    video.playbackRate = 1;
    window.setTimeout(() => (video.playbackRate = parseFloat(String(v))), 100);
  }
  get playbackRate(): number {
    return this._playbackRate;
  }
  get bufferedRange(): TimeRanges {
    return (this._video as HTMLVideoElement).buffered;
  }
  set isAutoPlay(v: boolean) {
    this._videoElement.autoplay = v;
    this._video.autoplay = v;
  }
  get isAutoPlay(): boolean {
    return this._video.autoplay;
  }
  setSrc(url: string): void {
    this.src = url;
  }
  setVolume(v: number): void {
    this.volume = v;
  }
  getVolume(): number {
    return this.volume;
  }
  setMute(v: boolean): void {
    this.muted = v;
  }
  isMuted(): boolean {
    return this.muted;
  }
  getDuration(): number {
    return this.duration;
  }
  getVpos(): number {
    return this.vpos;
  }
  setVpos(v: number): void {
    this.vpos = v;
  }
  getIsLoop(): boolean {
    return this.isLoop;
  }
  setIsLoop(v: boolean): void {
    this.isLoop = !!v;
  }
  setPlaybackRate(v: number): void {
    this.playbackRate = v;
  }
  getPlaybackRate(): number {
    return this.playbackRate;
  }
  getBufferedRange(): TimeRanges {
    return this.bufferedRange;
  }
  setIsAutoPlay(v: boolean): void {
    this.isAutoPlay = v;
  }
  getIsAutoPlay(): boolean {
    return this.isAutoPlay;
  }

  appendTo(node: Element): void {
    node.append(this._body);
  }

  close(): void {
    (this._video as HTMLVideoElement).pause();

    (this._video as HTMLVideoElement).removeAttribute('src');
    (this._video as HTMLVideoElement).removeAttribute('poster');

    // removeAttribute('src')では動画がクリアされず、
    // 空文字を指定しても base hrefと連結されて
    // http://www.nicovideo.jpへのアクセスが発生する. どないしろと.
    this._videoElement.src = CONSTANT.BLANK_VIDEO_URL;
    //window.console.info('src', this._video.src, this._video.getAttribute('src'));
    if (this._videoYouTube) {
      this._videoYouTube.src = '';
    }
  }

  /**
   * 画面キャプチャを取る。
   * CORSの制限があるので保存できない。
   */
  getScreenShot(): HTMLCanvasElement | null {
    if (!this.isCorsReady) {
      return null;
    }
    const video = this._video;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    context.drawImage(
      ((video as unknown as { drawableElement?: HTMLVideoElement }).drawableElement || video) as HTMLVideoElement,
      0,
      0
    );
    return canvas;
  }

  get isCorsReady(): boolean {
    return (this._video as HTMLVideoElement).crossOrigin === 'use-credentials';
  }

  get videoElement(): HTMLVideoElement {
    return this._videoElement;
  }

  get _video(): HTMLVideoElement | NvpYouTubePlayer {
    return this._currentVideo;
  }

  set _video(v: HTMLVideoElement | NvpYouTubePlayer) {
    this._currentVideo = v;
  }
}

VideoPlayer.__css__ = `
    .videoPlayer iframe,
    .videoPlayer .futatsumeWatchVideoElement {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      z-index: 5;
    }
    .futatsumeWatchVideoElement {
      display: block;
      transition: transform 0.4s ease;
    }

    .is-flipH .futatsumeWatchVideoElement {
      transform: perspective(400px) rotateY(180deg);
    }
    .is-flipV .futatsumeWatchVideoElement {
      transform: perspective(400px) rotateX(180deg);
    }
    .is-flipV.is-flipH .futatsumeWatchVideoElement {
      transform: perspective(400px) rotateX(180deg) rotateY(180deg);
    }

    /* iOSだとvideo上でマウスイベントが発生しないのでカバーを掛ける */
    .touchWrapper {
      display: block;
      position: absolute;
      opacity: 0;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 10;
      touch-action: none;
    }
    /* YouTubeのプレイヤーを触れる用にするための隙間 */
    .is-youtube .touchWrapper {
      width:  calc(100% - 100px);
      height: calc(100% - 150px);
    }

    .is-loading .touchWrapper,
    .is-error .touchWrapper {
      display: none !important;
    }

    .videoPlayer.is-youtube .futatsumeWatchVideoElement {
      display: none;
    }

    .videoPlayer iframe {
      display: none;
    }

    .videoPlayer.is-youtube iframe {
      display: block;
    }


  `.trim();

class TouchWrapper extends Emitter {
  declare _parentElement: Element | null | undefined;
  declare _config: NvpTouchConfig;
  declare _isTouching: boolean;
  declare _maxCount: number;
  declare _currentPointers: Array<Touch>;
  declare _debouncedOnSwipe2Y: (diff: NvpTouchDiff) => void;
  declare _debouncedOnSwipe3X: (diff: NvpTouchDiff) => void;
  declare _body: HTMLDivElement;
  declare _lastTap: number;
  declare _startCenter: NvpTouchPoint;
  declare _lastCenter: NvpTouchPoint;
  declare _isMoved: boolean;
  constructor({ parentElement }: { parentElement?: Element | null }) {
    super();
    this._parentElement = parentElement;

    this._config = global.config.namespace('touch') as unknown as NvpTouchConfig;
    this._isTouching = false;
    this._maxCount = 0;
    this._currentPointers = [];

    this._debouncedOnSwipe2Y = _.debounce(this._onSwipe2Y.bind(this), 400);
    this._debouncedOnSwipe3X = _.debounce(this._onSwipe3X.bind(this), 400);
    this.initializeDom();
  }

  initializeDom(): void {
    const body = (this._body = document.createElement('div'));
    body.className = 'touchWrapper';

    body.addEventListener('click', this._onClick.bind(this));

    body.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: true });
    body.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: true });
    body.addEventListener('touchend', this._onTouchEnd.bind(this), { passive: true });
    body.addEventListener('touchcancel', this._onTouchCancel.bind(this), { passive: true });

    this._onTouchMoveThrottled = _.throttle(this._onTouchMoveThrottled.bind(this), 200);

    if (this._parentElement) {
      this._parentElement.appendChild(body);
    }
    global.debug.touchWrapper = this;
  }

  get body(): HTMLDivElement {
    return this._body;
  }

  _onClick(): void {
    this._lastTap = 0;
  }

  _onTouchStart(e: TouchEvent): void {
    const identifiers = this._currentPointers.map((touch) => {
      return touch.identifier;
    });
    if (e.changedTouches.length > 1) {
      e.preventDefault();
    }

    [...e.changedTouches].forEach((touch) => {
      if (identifiers.includes(touch.identifier)) {
        return;
      }
      this._currentPointers.push(touch);
    });

    this._maxCount = Math.max(this._maxCount, this.touchCount);
    this._startCenter = this._getCenter(e);
    this._lastCenter = this._getCenter(e);
    this._isMoved = false;
  }

  _onTouchMove(e: TouchEvent): void {
    if (e.targetTouches.length > 1) {
      e.preventDefault();
    }
    this._onTouchMoveThrottled(e);
  }

  _onTouchMoveThrottled(e: TouchEvent): NvpTouchDiff | undefined {
    if (!e.targetTouches) {
      return;
    }
    if (e.targetTouches.length > 1) {
      e.preventDefault();
    }
    const startPoint = this._startCenter;
    const lastPoint = this._lastCenter;
    const currentPoint = this._getCenter(e);

    if (!startPoint || !currentPoint) {
      return;
    }
    const width = this._body.offsetWidth;
    const height = this._body.offsetHeight;
    const diff = {
      count: this.touchCount,
      startX: startPoint.x,
      startY: startPoint.y,
      currentX: currentPoint.x,
      currentY: currentPoint.y,
      moveX: currentPoint.x - lastPoint.x,
      moveY: currentPoint.y - lastPoint.y,
      x: currentPoint.x - startPoint.x,
      y: currentPoint.y - startPoint.y,
    } as NvpTouchDiff;

    diff.perX = (diff.x / width) * 100;
    diff.perY = (diff.y / height) * 100;
    diff.perStartX = (diff.startX / width) * 100;
    diff.perStartY = (diff.startY / height) * 100;
    diff.movePerX = (diff.moveX / width) * 100;
    diff.movePerY = (diff.moveY / height) * 100;

    if (Math.abs(diff.perX) > 2 || Math.abs(diff.perY) > 1) {
      this._isMoved = true;
    }

    if (diff.count === 2) {
      if (Math.abs(diff.movePerX) >= 0.5) {
        this._execCommand('seekRelativePercent', diff);
      }
      if (Math.abs(diff.perY) >= 20) {
        this._debouncedOnSwipe2Y(diff);
      }
    }

    if (diff.count === 3) {
      if (Math.abs(diff.perX) >= 20) {
        this._debouncedOnSwipe3X(diff);
      }
    }

    this._lastCenter = currentPoint;
    return diff;
  }

  _onSwipe2Y(diff: NvpTouchDiff): void {
    this._execCommand(diff.perY < 0 ? 'shiftUp' : 'shiftDown');
    this._startCenter = this._lastCenter;
  }

  _onSwipe3X(diff: NvpTouchDiff): void {
    this._execCommand(diff.perX < 0 ? 'playNextVideo' : 'playPreviousVideo');
    this._startCenter = this._lastCenter;
  }

  _execCommand(command: string | undefined, param?: unknown): void {
    if (!this._config.props.enable) {
      return;
    }
    if (!command) {
      return;
    }
    this.emit('command', command, param);
  }

  _onTouchEnd(e: TouchEvent): void {
    if (!e.changedTouches) {
      return;
    }
    const identifiers = Array.from(e.changedTouches).map((touch) => {
      return touch.identifier;
    });
    const currentTouches: Array<Touch> = this._currentPointers.filter((touch) => {
      return !identifiers.includes(touch.identifier);
    });

    this._currentPointers = currentTouches;

    //touchstartは複数タッチでも一回にまとまって飛んでくるが、
    //touchendは指の数だけ飛んでくるっぽい？
    //window.console.log('onTouchEnd', this._isMoved, e.changedTouches.length, this._maxCount, this.touchCount);
    if (!this._isMoved && this.touchCount === 0) {
      const config = this._config;
      this._lastTap = this._maxCount;
      switch (this._maxCount) {
        case 2:
          this._execCommand(config.props.tap2command);
          break;
        case 3:
          this._execCommand(config.props.tap3command);
          break;
        case 4:
          this._execCommand(config.props.tap4command);
          break;
        case 5:
          this._execCommand(config.props.tap5command);
          break;
      }
      this._maxCount = 0;
      this._isMoved = false;
    }
  }

  _onTouchCancel(e: TouchEvent): void {
    if (!e.changedTouches) {
      return;
    }
    const identifiers = Array.from(e.changedTouches).map((touch) => {
      return touch.identifier;
    });
    const currentTouches: Array<Touch> = this._currentPointers.filter((touch) => {
      return !identifiers.includes(touch.identifier);
    });

    this._currentPointers = currentTouches;
  }

  get touchCount(): number {
    return this._currentPointers.length;
  }

  _getCenter(e: TouchEvent): NvpTouchPoint {
    let x = 0,
      y = 0;
    Array.from(e.touches).forEach((t) => {
      x += t.pageX;
      y += t.pageY;
    });
    return { x: x / e.touches.length, y: y / e.touches.length };
  }
}

//===END===

export { NicoVideoPlayer, ContextMenu, VideoPlayer };
