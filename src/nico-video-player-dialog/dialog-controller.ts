import * as _ from 'lodash';
import { global } from '../futatsume-watch-index';

import { Fullscreen, ShortcutKeyEmitter, util } from '../util';
import type { NicoVideoPlayer } from '../nico-video-player';
import { VideoInfoModel } from '../video-info';
import type { RawVideoInfoData, ResumeCacheEntry } from '../video-info';

import { CommentPostSession } from '../comment-post-session';
import { VideoRecoveryTasks } from '../video-recovery-tasks';
import { nicoUtil } from '../../packages/lib/src/nico/nico-util';

import type { CommentPanel } from '../comment-panel';

import type { PlayList } from '../../packages/futatsume/src/Playlist/playlist';

import { Emitter } from '../baselib';
import type { ThreadLoader } from '../../packages/lib/src/nico/thread-loader';

import { VideoSessionWorker } from '../../packages/lib/src/nico/video-session-worker';
import type { PlayerState } from '../state';

import type { MylistApiLoader } from '../../packages/lib/src/nico/mylist-api-loader';

import { WatchInfoCacheDb } from '../../packages/lib/src/nico/watch-info-cache-db';

import { textUtil } from '../../packages/lib/src/text/text-util';
import { MediaSessionApi } from '../../packages/lib/src/infra/media-session-api';

import type { EmitterCallback } from '../../packages/lib/src/emitter';

import type { Uq } from '../comment-panel';
import type { CommentPlayerOptions } from '../comment-player';
import type {
  DialogPlayerConfig,
  VideoWatchOptionBag,
  DialogKeyEmitter,
  NicoVideoPlayerDialogParams,
  VideoSessionWorkerSession,
  DialogThreadMsgInfo,
  DialogCommentLoadResult,
  DialogLoadError,
  DialogVideoError,
  DialogVideoInfo,
  DialogUtilView,
} from './types';
import {
  run_initializeNicoVideoPlayer,
  run_onPlayerConfigUpdate,
  run_onPlaylistAppend,
  run_onPlaylistInsert,
  run_onPlaylistLoadFail,
  run_onPlaylistSetMylist,
  run_onPlaylistSetUploadedVideo,
  run_onPlaylistSetSearchVideo,
  run_onPlaylistSetSeriesVideo,
  run_onPlaylistStatusUpdate,
  run_onCommentPanelStatusUpdate,
  run_onDeflistAdd,
  run_onDeflistRemove,
  run_onToggleLike,
  run_onMylistAdd,
  run_onMylistRemove,
  run_onCommentParsed,
  run_onCommentChange,
  run_onCommentFilterChange,
  run_onVideoPlayerTypeChange,
  run_onNicosSeek,
  run_onLoadedMetaData,
  run_onVideoCanPlay,
  run_onVideoPlay,
  run_onVideoPlaying,
  run_onVideoSeeking,
  run_onVideoSeeked,
  run_onVideoPause,
  run_onVideoStalled,
  run_onVideoTimeUpdate,
  run_onVideoProgress,
  run_onVideoError,
  run_onYouTubeVideoError,
  run_onVideoAbort,
  run_onVideoAspectRatioFix,
  run_onVideoEnded,
  run_onVolumeChange,
  run_onVolumeChangeEnd,
  run_savePlaybackPosition,
  runClose,
  run_refresh,
  run_initializePlaylist,
  run_initializeCommentPanel,
  runPlayNextVideo,
  runPlayPreviousVideo,
  runPlay,
  runPause,
  runTogglePlay,
  runAddChat,
  runRemoveChat,
  runGetId,
  runGetDuration,
  runGetBufferedRange,
  runGetNonFilteredChatList,
  runGetChatList,
  runGetPlayingStatus,
  runGetMymemory,
} from './dialog-operations';
import { runOpen, runReload, runRefreshLastPlayerId } from './dialog-open';

import type { VideoWatchOptions } from './video-watch-options';
import { NicoVideoPlayerDialogView } from './dialog-view';

class NicoVideoPlayerDialog extends Emitter {
  readonly commentPosts = new CommentPostSession();
  readonly videoRecovery = new VideoRecoveryTasks();
  declare _playerConfig: DialogPlayerConfig;
  declare _state: PlayerState;
  declare _keyEmitter: DialogKeyEmitter;
  declare _id: string;
  declare _escBlockExpiredAt: number;
  declare _view: NicoVideoPlayerDialogView;
  declare _$playerContainer: Uq;
  declare _nicoVideoPlayer: NicoVideoPlayer;
  declare threadLoader: typeof ThreadLoader;
  declare _videoInfo: DialogVideoInfo;
  declare _videoSession: VideoSessionWorkerSession | undefined;
  declare _playlist: PlayList;
  declare _commentPanel: CommentPanel;
  declare _mylistApiLoader: typeof MylistApiLoader | undefined;
  declare _watchId: string;
  declare _videoWatchOptions: VideoWatchOptions;
  declare _requestId: string;
  declare _lastCurrentTime: number;
  declare _lastOpenAt: number;
  reloadPlayback: boolean | undefined;
  commentRequestSequence = 0;
  declare _threadInfo: unknown;
  constructor(params: NicoVideoPlayerDialogParams) {
    super();
    this.initialize(params);
  }
  resizeCommentLayer(): void {
    this._nicoVideoPlayer?.resizeCommentLayer();
  }
  initialize(params: NicoVideoPlayerDialogParams): void {
    // this._offScreenLayer = params.offScreenLayer;
    this._playerConfig = params.config;
    this._state = params.state;

    this._keyEmitter = (params.keyHandler ||
      ShortcutKeyEmitter.create(
        params.config as unknown as { props: Record<string, string> },
        document.body,
        global.emitter as unknown as {
          promise(name: string): Promise<unknown>;
          on(name: string, handler: (e: KeyboardEvent) => void): void;
        }
      )) as unknown as DialogKeyEmitter;

    void this._initializeDom();

    this._keyEmitter.on('keyDown', this._onKeyDown.bind(this) as EmitterCallback);
    this._keyEmitter.on('keyUp', this._onKeyUp.bind(this) as EmitterCallback);

    this._id = 'FutatsumeWatchDialog_' + Date.now() + '_' + Math.random();
    this._playerConfig.on('update', this._onPlayerConfigUpdate.bind(this) as EmitterCallback);

    this._escBlockExpiredAt = -1;

    this._savePlaybackPosition = _.throttle(this._savePlaybackPosition.bind(this), 1000, { trailing: false });

    this._onToggleLike = _.debounce(this._onToggleLike.bind(this), 1000);
  }
  async _initializeDom() {
    this._view = new NicoVideoPlayerDialogView({
      dialog: this,
      playerConfig: this._playerConfig,
      nicoVideoPlayer: this._nicoVideoPlayer,
      playerState: this._state,
      currentTimeGetter: () => this.currentTime,
    });
    await this._view.promise('dom-ready');

    this._initializeCommentPanel();

    this._$playerContainer = this._view.get$Container();
    this._view.on('command', this._onCommand.bind(this) as EmitterCallback);
    this._view.on('postChat', ((e: { resolve(): void; reject(error: unknown): void }, chat: unknown, cmd: unknown) => {
      this.addChat(chat, cmd)
        .then(() => e.resolve())
        .catch((error: unknown) => e.reject(error));
    }) as EmitterCallback);
    MediaSessionApi.onCommand(this._onCommand.bind(this) as EmitterCallback);
  }
  async _initializeNicoVideoPlayer(): Promise<NicoVideoPlayer> {
    return run_initializeNicoVideoPlayer.call(this);
  }
  execCommand(command: string, param?: unknown): unknown {
    return this._onCommand(command, param);
  }
  _onCommand(command: string, param?: unknown): unknown {
    let v: number;
    switch (command) {
      case 'volume':
        this.volume = param as number;
        break;
      case 'volumeBy':
        this.volume = (this._nicoVideoPlayer as unknown as { volume: number }).volume * (param as number);
        break;
      case 'volumeUp':
        this._nicoVideoPlayer.volumeUp();
        break;
      case 'volumeDown':
        this._nicoVideoPlayer.volumeDown();
        break;
      case 'togglePlay':
        this.togglePlay();
        break;
      case 'pause':
        this.pause();
        break;
      case 'play':
        this.play();
        break;
      case 'fullscreen':
      case 'toggle-fullscreen':
        this._nicoVideoPlayer.toggleFullScreen();
        break;
      case 'deflistAdd':
        return this._onDeflistAdd(param as string);
      case 'deflistRemove':
        return this._onDeflistRemove(param as string);
      case 'playlistAdd':
      case 'playlistAppend':
        this._onPlaylistAppend(param as string);
        break;
      case 'playlistInsert':
        this._onPlaylistInsert(param as string);
        break;
      case 'playlistSetMylist':
        this._onPlaylistSetMylist(param as string);
        break;
      case 'playlistSetUploadedVideo':
        this._onPlaylistSetUploadedVideo(param as string);
        break;
      case 'playlistSetSearchVideo':
        this._onPlaylistSetSearchVideo(param as { option?: Record<string, unknown>; word?: string });
        break;
      case 'playlistSetSeries':
        this._onPlaylistSetSeriesVideo(param as string);
        break;
      case 'playNextVideo':
        this.playNextVideo();
        break;
      case 'playPreviousVideo':
        this.playPreviousVideo();
        break;
      case 'shufflePlaylist':
        this._playlist.shuffle();
        break;
      case 'togglePlaylist':
        this._playlist.toggleEnable();
        break;
      case 'toggle-like':
        return this._onToggleLike();
      case 'mylistAdd':
        return this._onMylistAdd(
          (param as { mylistId: string; mylistName: string }).mylistId,
          (param as { mylistId: string; mylistName: string }).mylistName
        );
      case 'mylistRemove':
        return this._onMylistRemove(
          (param as { mylistId: string; mylistName: string }).mylistId,
          (param as { mylistId: string; mylistName: string }).mylistName
        );
      case 'mylistWindow':
        (util as unknown as DialogUtilView).openMylistWindow(this._videoInfo.watchId);
        break;
      case 'seek':
      case 'seekTo':
        this.currentTime = (param as number) * 1;
        break;
      case 'seekBy':
        this.currentTime = this.currentTime + (param as number) * 1;
        break;
      case 'seekPrevFrame':
      case 'seekNextFrame':
        this.execCommand('pause');
        this.execCommand('seekBy', command === 'seekNextFrame' ? 1 / 60 : -1 / 60);
        break;
      case 'seekRelativePercent': {
        const dur = this._videoInfo.duration;
        const movePerX = (param as { movePerX: number }).movePerX;
        const mv = Math.abs(movePerX) > 10 ? movePerX / 2 : movePerX / 8;
        const pos = this.currentTime + (mv * dur) / 100;
        this.currentTime = Math.min(Math.max(0, pos), dur);
        break;
      }
      case 'seekToResumePoint':
        this.currentTime = this._videoInfo.initialPlaybackTime;
        break;
      case 'addWordFilter':
        this._nicoVideoPlayer.filter.wordRegFilterList = this._playerConfig.props.wordRegFilter;
        (this._nicoVideoPlayer.filter.addWordRegFilter as (word: string) => void)(
          typeof param === 'string' ? param : ''
        );
        this._playerConfig.setValue('wordRegFilter', this._nicoVideoPlayer.filter.wordRegFilterList);
        break;
      case 'addUserIdFilter':
        this._nicoVideoPlayer.filter.userIdFilterList = this._playerConfig.props.userIdFilter;
        (this._nicoVideoPlayer.filter.addUserIdFilter as (userId: unknown) => void)(param);
        this._playerConfig.setValue('userIdFilter', this._nicoVideoPlayer.filter.userIdFilterList);
        break;
      case 'addCommandFilter':
        this._nicoVideoPlayer.filter.commandFilterList = this._playerConfig.props.commandFilter;
        (this._nicoVideoPlayer.filter.addCommandFilter as (command: unknown) => void)(param);
        this._playerConfig.setValue('commandFilter', this._nicoVideoPlayer.filter.commandFilterList);
        break;
      case 'setUserIdFilterList':
        this._playerConfig.setValue('userIdFilter', param);
        break;
      case 'setCommandFilterList':
        this._playerConfig.setValue('commandFilter', param);
        break;
      case 'openNow':
        void this.open(param as string, { openNow: true });
        break;
      case 'open':
        void this.open(param as string);
        break;
      case 'close':
        this.close();
        break;
      case 'reload':
        this.reload({ currentTime: this.currentTime });
        break;
      case 'openGinza':
        window.open('//www.nicovideo.jp/watch/' + this._watchId, 'watchGinza');
        break;
      case 'reloadComment':
        this.reloadComment(param as { when?: number });
        break;
      case 'playbackRate':
        this._playerConfig.setValue(command, param);
        MediaSessionApi.updatePositionStateByMedia(this as unknown as HTMLMediaElement);
        break;
      case 'shiftUp':
        {
          v = parseFloat(this._playerConfig.getValue('playbackRate') as string);
          if (v < 2) {
            v += 0.25;
          } else {
            v = Math.min(10, v + 0.5);
          }
          this._playerConfig.setValue('playbackRate', v);
        }
        break;
      case 'shiftDown':
        {
          v = parseFloat(this._playerConfig.getValue('playbackRate') as string);
          if (v > 2) {
            v -= 0.5;
          } else {
            v = Math.max(0.1, v - 0.25);
          }
          this._playerConfig.setValue('playbackRate', v);
        }
        break;
      case 'screenShot':
        if (this._state.isYouTube) {
          (util as unknown as DialogUtilView).capTube({
            title: this._videoInfo.title,
            videoId: this._videoInfo.videoId,
            author: this._videoInfo.owner.name,
          });
          return;
        }
        void this._nicoVideoPlayer.getScreenShot().catch((error: unknown) => {
          this.execCommand('alert', error instanceof Error ? error.message : '画像の保存に失敗しました');
        });
        break;
      case 'screenShotWithComment':
        if (this._state.isYouTube) {
          return;
        }
        void this._nicoVideoPlayer.getScreenShotWithComment().catch((error: unknown) => {
          this.execCommand('alert', error instanceof Error ? error.message : 'コメント付き画像の保存に失敗しました');
        });
        break;
      case 'nicosSeek':
        this._onNicosSeek(param as number);
        break;
      case 'fastSeek':
        (this._nicoVideoPlayer as unknown as { fastSeek(time: number): void }).fastSeek(param as number);
        break;
      case 'setVideo':
        this.setVideo(param as string);
        break;
      case 'selectTab':
        this._state.currentTab = param as string;
        break;
      case 'nicoru':
        (this.threadLoader as unknown as { nicoru(msgInfo: unknown, chat: unknown): Promise<unknown> })
          .nicoru(this._videoInfo.msgInfo, param)
          .catch((e: unknown) => {
            this.execCommand('alert', (e as { message?: unknown }).message || 'ニコれなかった＞＜');
          });
        break;
      case 'update-domandVideoQuality':
        this._playerConfig.props.domandVideoQuality = param as string;
        this.reload();
        break;
      case 'saveMymemory':
        (util as unknown as DialogUtilView).saveMymemory(this, this._state.videoInfo);
        break;
      default:
        this.emit('command', command, param);
    }
  }
  _onKeyDown(name: string, e: KeyboardEvent, param: unknown): void {
    this._onKeyEvent(name, e, param);
  }
  _onKeyUp(name: string, e: KeyboardEvent, param: unknown): void {
    this._onKeyEvent(name, e, param);
  }
  _onKeyEvent(name: string, e: KeyboardEvent, param: unknown): void {
    if (!this._state.isOpen) {
      const lastWatchId = this._playerConfig.props.lastWatchId;
      if (name === 'RE_OPEN' && lastWatchId) {
        void this.open(lastWatchId);
        e.preventDefault();
      }
      return;
    }
    const TABLE: Record<string, string> = {
      RE_OPEN: 'reload',
      PAUSE: 'pause',
      TOGGLE_PLAY: 'togglePlay',
      SPACE: 'togglePlay',
      FULL: 'toggle-fullscreen',
      TOGGLE_PLAYLIST: 'togglePlaylist',
      DEFLIST: 'deflistAdd',
      DEFLIST_REMOVE: 'deflistRemove',
      VIEW_COMMENT: 'toggle-showComment',
      TOGGLE_LOOP: 'toggle-loop',
      MUTE: 'toggle-mute',
      VOL_UP: 'volumeUp',
      VOL_DOWN: 'volumeDown',
      SEEK_TO: 'seekTo',
      SEEK_BY: 'seekBy',
      SEEK_PREV_FRAME: 'seekPrevFrame',
      SEEK_NEXT_FRAME: 'seekNextFrame',
      NEXT_VIDEO: 'playNextVideo',
      PREV_VIDEO: 'playPreviousVideo',
      PLAYBACK_RATE: 'playbackRate',
      SHIFT_UP: 'shiftUp',
      SHIFT_DOWN: 'shiftDown',
      SCREEN_MODE: 'screenMode',
      SCREEN_SHOT: 'screenShot',
      SCREEN_SHOT_WITH_COMMENT: 'screenShotWithComment',
    };
    switch (name) {
      case 'ESC':
        // ESCキーは連打にならないようブロック期間を設ける
        if (Date.now() < this._escBlockExpiredAt) {
          break;
        }
        this._escBlockExpiredAt = Date.now() + 1000 * 2;
        if (!Fullscreen.now()) {
          this.close();
        }
        break;
      case 'INPUT_COMMENT':
        this._view.focusToCommentInput();
        break;
      default:
        if (!TABLE[name]) {
          return;
        }
        this.execCommand(TABLE[name], param);
    }
    const screenMode = this._playerConfig.props.screenMode;
    if (['small', 'sideView'].includes(screenMode) && ['TOGGLE_PLAY'].includes(name)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }
  _onPlayerConfigUpdate(key: string, value: unknown): void {
    return run_onPlayerConfigUpdate.call(this, key, value);
  }
  _updateScreenMode(mode: string): void {
    this.emit('screenModeChange', mode);
  }
  _onPlaylistAppend(watchId: string): void {
    return run_onPlaylistAppend.call(this, watchId);
  }
  _onPlaylistInsert(watchId: string): void {
    return run_onPlaylistInsert.call(this, watchId);
  }
  _onPlaylistLoadFail(error: unknown, fallback: string): void {
    return run_onPlaylistLoadFail.call(this, error, fallback);
  }
  _onPlaylistSetMylist(id: string): void {
    return run_onPlaylistSetMylist.call(this, id);
  }
  _onPlaylistSetUploadedVideo(id: string): void {
    return run_onPlaylistSetUploadedVideo.call(this, id);
  }
  _onPlaylistSetSearchVideo(params: { option?: Record<string, unknown>; word?: string }): void {
    return run_onPlaylistSetSearchVideo.call(this, params);
  }
  _onPlaylistSetSeriesVideo(id: string): void {
    return run_onPlaylistSetSeriesVideo.call(this, id);
  }
  _onPlaylistStatusUpdate(): void {
    return run_onPlaylistStatusUpdate.call(this);
  }
  _onCommentPanelStatusUpdate(): void {
    return run_onCommentPanelStatusUpdate.call(this);
  }
  _onDeflistAdd(watchId: string): void {
    return run_onDeflistAdd.call(this, watchId);
  }
  _onDeflistRemove(watchId: string): void {
    return run_onDeflistRemove.call(this, watchId);
  }
  _onToggleLike(): void {
    return run_onToggleLike.call(this);
  }
  _onMylistAdd(groupId: string, mylistName: string): void {
    return run_onMylistAdd.call(this, groupId, mylistName);
  }
  _onMylistRemove(groupId: string, mylistName: string): void {
    return run_onMylistRemove.call(this, groupId, mylistName);
  }
  _onCommentParsed(): void {
    return run_onCommentParsed.call(this);
  }
  _onCommentChange(): void {
    return run_onCommentChange.call(this);
  }
  _onCommentFilterChange(filter: {
    isEnable: unknown;
    wordRegFilterList: unknown;
    userIdFilterList: unknown;
    commandFilterList: unknown;
  }): void {
    return run_onCommentFilterChange.call(this, filter);
  }
  _onVideoPlayerTypeChange(type = ''): void {
    return run_onVideoPlayerTypeChange.call(this, type);
  }
  _onNicosSeek(time: number): void {
    return run_onNicosSeek.call(this, time);
  }
  show(): void {
    this._state.isOpen = true;
  }
  hide(): void {
    this._state.isOpen = false;
  }
  async open(watchId: string, options?: VideoWatchOptionBag, reload = false): Promise<void> {
    return runOpen.call(this, watchId, options, reload);
  }
  get isOpen(): boolean {
    return this._state.isOpen;
  }
  reload(options?: VideoWatchOptionBag): void {
    return runReload.call(this, options);
  }
  get currentTime(): number {
    if (!this._nicoVideoPlayer) {
      return 0;
    }
    const ct = (this._nicoVideoPlayer as unknown as { currentTime: number }).currentTime * 1;
    if (!this._state.isError && ct > 0) {
      this._lastCurrentTime = ct;
    }
    return this._lastCurrentTime;
  }
  set currentTime(sec: number) {
    if (!this._nicoVideoPlayer || !Number.isFinite(sec)) {
      return;
    }
    sec = Math.max(0, sec);
    // HLS切替では旧canplayが先に到着し、isLoading=falseの後にもmetadataが届く。
    // 明示シーク位置は常に更新し、遅いmetadataで以前の再開位置へ戻さない。
    if (this._videoWatchOptions) this._videoWatchOptions.currentTime = sec;
    this._nicoVideoPlayer.currentTime = sec;
    this._lastCurrentTime = sec;
    MediaSessionApi.updatePositionStateByMedia(this as unknown as HTMLMediaElement);
  }
  get id() {
    return this._id;
  }
  get isLastOpenedPlayer() {
    return this.id === this._playerConfig.props.lastPlayerId;
  }
  refreshLastPlayerId() {
    return runRefreshLastPlayerId.call(this);
  }
  async _onVideoInfoLoaderLoad(
    requestId: string,
    [videoInfoData, localCacheData]: [unknown, unknown, unknown]
  ): Promise<void> {
    if (this._requestId !== requestId) {
      return;
    }
    const videoInfo: DialogVideoInfo = (this._videoInfo = new VideoInfoModel(
      videoInfoData as RawVideoInfoData,
      localCacheData as { resume?: ResumeCacheEntry[] }
    ) as unknown as DialogVideoInfo);
    nicoUtil.updateWatchViewer(requestId, videoInfo.viewerInfo);
    this._view.updateViewer();
    this._watchId = videoInfo.watchId;
    void WatchInfoCacheDb.put(this._watchId, { videoInfo });
    this._state.setState({
      isCommunity: videoInfo.isCommunityVideo,
      isMymemory: videoInfo.isMymemory,
      isChannel: videoInfo.isChannel,
      isLiked: videoInfo.isLiked,
    });
    MediaSessionApi.updateByVideoInfo(this._videoInfo);

    const isHLSSupported =
      !!global.debug.isHLSSupported ||
      document.createElement('video').canPlayType('application/vnd.apple.mpegURL') !== '' ||
      document.createElement('video').canPlayType('application/x-mpegURL') !== '';
    const videoSession = (await VideoSessionWorker.create({
      videoInfo,
      videoQuality: this._playerConfig.props.domandVideoQuality,
      useHLS: isHLSSupported,
    })) as unknown as VideoSessionWorkerSession;
    if (this._requestId !== requestId) {
      videoSession.close();
      return;
    }
    this._videoSession = videoSession;

    try {
      const sessionInfo = await videoSession.connect();
      if (this._requestId !== requestId) {
        videoSession.close();
        return;
      }
      this.setVideo(sessionInfo.url);
      videoInfo.setCurrentVideo(sessionInfo.url);
      this.emit('videoQuality', sessionInfo, videoInfo);
    } catch (e) {
      if (this._requestId !== requestId) return;
      this._onVideoSessionFail(e);
    }
    (this._state as unknown as { videoInfo: unknown }).videoInfo = videoInfo;

    this.loadComment(videoInfo.msgInfo);

    this.emit('loadVideoInfo', videoInfo);
    void this.emitResolve('firstVideoInitialized', this._watchId);

    if (Fullscreen.now() || this._playerConfig.props.screenMode === 'wide') {
      this.execCommand(
        'notifyHtml',
        `<img src="${textUtil.escapeHtml(videoInfo.thumbnail)}" style="width: 96px;">` +
          (util as unknown as DialogUtilView).escapeToZenkaku(videoInfo.title)
      );
    }
  }
  setVideo(url: string): void {
    this._state.setState({
      isYouTube: url.indexOf('youtube') >= 0,
      currentSrc: url,
    });
  }
  loadComment(msgInfo: DialogThreadMsgInfo): void {
    const requestId = this._requestId;
    const commentRequest = ++this.commentRequestSequence;
    this.threadLoader.load(msgInfo).then(
      (result) => {
        if (commentRequest === this.commentRequestSequence) this._onCommentLoadSuccess(requestId, result);
      },
      (error: unknown) => {
        if (commentRequest !== this.commentRequestSequence) return;
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
              ? error.message
              : 'コメントの取得に失敗しました';
        this._onCommentLoadFail(requestId, { message });
      }
    );
  }
  reloadComment(param: { when?: number } = {}): void {
    const msgInfo = Object.assign({}, this._videoInfo.msgInfo);
    if (typeof param.when === 'number') {
      msgInfo.when = param.when;
    }
    this.loadComment(msgInfo);
  }
  _onVideoInfoLoaderFail(requestId: string, e: DialogLoadError): void {
    const watchId = e.watchId;
    window.console.error('_onVideoInfoLoaderFail', watchId, e);
    if (this._requestId !== requestId) {
      return;
    }
    this._setErrorMessage(e.message || '通信エラー');
    this._state.isError = true;
    if (e.info) {
      this._videoInfo = new VideoInfoModel(e.info as unknown as RawVideoInfoData) as unknown as DialogVideoInfo;
      (this._state as unknown as { videoInfo: unknown }).videoInfo = this._videoInfo;
      this.emit('loadVideoInfoFail', this._videoInfo);
    } else {
      this.emit('loadVideoInfoFail');
    }
    void global.emitter.emitAsync('loadVideoInfoFail', e);

    if (!this.isPlaylistEnable) {
      return;
    }
    if (e.reason === 'forbidden' || e.info?.isPlayable === false) {
      this.videoRecovery.schedule(() => {
        if (this.isOpen) this.playNextVideo();
      });
    }
  }
  _onVideoSessionFail(result: unknown): void {
    window.console.error('domand fail', result);
    this._setErrorMessage(
      `動画の読み込みに失敗しました(domand) ${((result as { message?: unknown })?.message || '') as string}`
    );
    this._state.setState({ isError: true, isLoading: false });
    if (this.isPlaylistEnable) {
      this.videoRecovery.schedule(() => {
        if (this.isOpen) this.playNextVideo();
      });
    }
  }
  _onVideoPlayStartFail(err: unknown): void {
    window.console.error('動画再生開始に失敗', err);
    if (!(err instanceof DOMException)) {
      //
      return;
    }

    console.warn('play() request was rejected code: %s. message: %s', err.code, err.message);
    const message = err.message;
    switch (message) {
      case 'SessionClosedError':
        // if (this._videoSession.isDeleted && !this._videoSession.isAbnormallyClosed) {
        //   window.console.info('%cリロードしたら直るかも', 'background: yellow');
        //
        // }
        if (this._state.isError) {
          break;
        }
        this._setErrorMessage('動画の再生開始に失敗しました');
        this._state.setVideoErrorOccurred();
        break;

      case 'AbortError': // 再生開始を待っている間に動画変更などで中断された等
      case 'NotAllowedError': // 自動再生のブロック
      default:
        break;
    }

    this.emit('loadVideoPlayStartFail');
    void global.emitter.emitAsync('loadVideoPlayStartFail');
  }
  _setErrorMessage(msg: string): void {
    this._state.errorMessage = msg;
  }
  _onCommentLoadSuccess(requestId: string, result: DialogCommentLoadResult): void {
    if (requestId !== this._requestId) {
      return;
    }
    const options = {
      replacement: this._videoInfo.replacementWords,
      duration: this._videoInfo.duration,
      mainThreadId: result.threadInfo.threadId,
      format: result.format,
    } as CommentPlayerOptions;
    this._nicoVideoPlayer.closeCommentPlayer();
    this._threadInfo = result.threadInfo;
    this._nicoVideoPlayer.setComment(result.body, options);

    void WatchInfoCacheDb.put(this._watchId, { threadInfo: result.threadInfo });
    this._state.isCommentReady = true;
    this._state.isWaybackMode = result.threadInfo.isWaybackMode;
    this.emit('commentReady', result, this._threadInfo);
    if (result.threadInfo.totalResCount !== this._videoInfo.count.comment) {
      const stateView = this._state as unknown as { count?: { comment?: number } };
      stateView.count = {
        ...stateView.count,
        comment: result.threadInfo.totalResCount,
      };
      this.emit('videoCount', { comment: result.threadInfo.totalResCount });
    }
  }
  _onCommentLoadFail(requestId: string, e: DialogLoadError): void {
    if (requestId !== this._requestId) {
      return;
    }
    this.execCommand('alert', e.message);
  }
  _onLoadedMetaData(): void {
    return run_onLoadedMetaData.call(this);
  }
  async _onVideoCanPlay(): Promise<void> {
    return run_onVideoCanPlay.call(this);
  }
  _onVideoPlay(): void {
    return run_onVideoPlay.call(this);
  }
  _onVideoPlaying(): void {
    return run_onVideoPlaying.call(this);
  }
  _onVideoSeeking(): void {
    return run_onVideoSeeking.call(this);
  }
  _onVideoSeeked(): void {
    return run_onVideoSeeked.call(this);
  }
  _onVideoPause(): void {
    return run_onVideoPause.call(this);
  }
  _onVideoStalled(): void {
    return run_onVideoStalled.call(this);
  }
  _onVideoTimeUpdate(): void {
    return run_onVideoTimeUpdate.call(this);
  }
  _onVideoProgress(range: unknown, currentTime: unknown): void {
    return run_onVideoProgress.call(this, range, currentTime);
  }
  async _onVideoError(e: DialogVideoError): Promise<void> {
    return run_onVideoError.call(this, e);
  }
  _onYouTubeVideoError(e: DialogVideoError): void {
    return run_onYouTubeVideoError.call(this, e);
  }
  _onVideoAbort() {
    return run_onVideoAbort.call(this);
  }
  _onVideoAspectRatioFix(ratio: number): void {
    return run_onVideoAspectRatioFix.call(this, ratio);
  }
  _onVideoEnded() {
    return run_onVideoEnded.call(this);
  }
  _onVolumeChange(vol: unknown, mute: unknown): void {
    return run_onVolumeChange.call(this, vol, mute);
  }
  _onVolumeChangeEnd(vol: unknown, mute: unknown): void {
    return run_onVolumeChangeEnd.call(this, vol, mute);
  }
  _savePlaybackPosition(contextWatchId: string, ct: number): void {
    return run_savePlaybackPosition.call(this, contextWatchId, ct);
  }
  close(): void {
    return runClose.call(this);
  }
  _refresh(): void {
    return run_refresh.call(this);
  }

  async _initializePlaylist(): Promise<void> {
    return run_initializePlaylist.call(this);
  }
  _initializeCommentPanel(): void {
    return run_initializeCommentPanel.call(this);
  }
  get isPlaylistEnable(): boolean {
    return !!this._playlist && this._playlist.isEnable;
  }
  playNextVideo(options?: VideoWatchOptionBag): void {
    return runPlayNextVideo.call(this, options);
  }
  playPreviousVideo(options?: VideoWatchOptionBag): void {
    return runPlayPreviousVideo.call(this, options);
  }
  play(): void {
    return runPlay.call(this);
  }
  pause(): void {
    return runPause.call(this);
  }
  get isPlaying(): boolean {
    return this._state.isPlaying;
  }
  get paused(): boolean {
    return this._nicoVideoPlayer ? this._nicoVideoPlayer.paused : true;
  }
  togglePlay(): void {
    return runTogglePlay.call(this);
  }
  set volume(v: number) {
    if (this._nicoVideoPlayer) {
      this._nicoVideoPlayer.volume = v;
    }
  }
  get volume(): number {
    return this._playerConfig.props.volume;
  }
  async addChat(
    text: unknown,
    cmd: unknown,
    vpos: unknown = null,
    options: Record<string, unknown> = {}
  ): Promise<unknown> {
    return runAddChat.call(this, text, cmd, vpos, options);
  }
  removeChat(chat: unknown): Promise<void> {
    return runRemoveChat.call(this, chat);
  }
  get duration(): number {
    if (!this._videoInfo) {
      return 0;
    }
    return this._videoInfo.duration;
  }
  get bufferedRange() {
    return this._nicoVideoPlayer.bufferedRange;
  }
  get nonFilteredChatList() {
    return this._nicoVideoPlayer.nonFilteredChatList;
  }
  get chatList() {
    return this._nicoVideoPlayer.chatList;
  }
  get playingStatus(): Record<string, unknown> {
    if (!this._nicoVideoPlayer || !this._nicoVideoPlayer.isPlaying) {
      return {};
    }

    const session: Record<string, unknown> = {
      playing: true,
      watchId: this._watchId,
      url: location.href,
      currentTime: (this._nicoVideoPlayer as unknown as { currentTime: number }).currentTime,
    };

    const options = this._videoWatchOptions.createForSession();
    Object.keys(options).forEach((key) => {
      session[key] = Object.prototype.hasOwnProperty.call(session, key) ? session[key] : options[key];
    });

    return session;
  }
  get watchId(): string {
    return this._watchId;
  }
  get currentTab(): string {
    return this._state.currentTab;
  }
  getId(): string {
    return runGetId.call(this);
  }
  getDuration(): number {
    return runGetDuration.call(this);
  }
  getBufferedRange(): unknown {
    return runGetBufferedRange.call(this);
  }
  getNonFilteredChatList(): unknown {
    return runGetNonFilteredChatList.call(this);
  }
  getChatList(): unknown {
    return runGetChatList.call(this);
  }
  getPlayingStatus(): Record<string, unknown> {
    return runGetPlayingStatus.call(this);
  }
  getMymemory(): unknown {
    return runGetMymemory.call(this);
  }
}
export { NicoVideoPlayerDialog };
