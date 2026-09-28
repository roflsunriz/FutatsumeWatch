import _ from 'lodash';
import { NicoCommentPlayer } from '../comment-player';
import type { CommentPlayerOptions, CommentPlayerParams, CommentPlayerChatFilter } from '../comment-player';
import { util, Config, Fullscreen, VideoCaptureUtil } from '../util';
import { CONSTANT } from '../constant';
import { global } from '../futatsume-watch-index';
import { Emitter } from '../baselib';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import { ContextMenu } from './context-menu';
import { VideoPlayer } from './video-player';
import type { NvpPlayerConfig, NvpPlayerParams, NvpPlayerState, NvpUtil, NvpVideoInfo } from './types';

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
        wordRegFilter: conf.props.wordRegFilter,
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
  resizeCommentLayer(): void {
    this._commentPlayer.resize();
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

export { NicoVideoPlayer };
