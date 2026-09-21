import * as _ from 'lodash';
import { global } from './futatsume-watch-index';
import { CONSTANT } from './constant';
import { PlaybackPosition, VideoInfoLoader } from '../packages/lib/src/nico/loader';
import { Fullscreen, ShortcutKeyEmitter, util } from './util';
import { NicoVideoPlayer } from './nico-video-player';
import { VideoFilter, VideoInfoModel } from './video-info';
import type { RawVideoInfoData, ResumeCacheEntry } from './video-info';
import { CommentInputPanel } from './comment-input-panel';
import { CommentPostSession, normalizeCommentCommands } from './comment-post-session';
import { VideoRecoveryTasks } from './video-recovery-tasks';
import { nicoUtil } from '../packages/lib/src/nico/nico-util';
import { NicoChat } from '../packages/futatsume/src/commentLayer/nico-chat';
import { CommentPanel } from './comment-panel';
import { VideoControlBar } from './video-control-bar';
import { VideoInfoPanel } from './video-info-panel';
import { PlayerShell } from './player-shell';
import { closeSettingsDialog } from '../packages/components/src/settings-dialog';
import { PlayList, PlayListSession } from '../packages/futatsume/src/Playlist/playlist';
import type { PlaylistDescriptor } from '../packages/futatsume/src/Playlist/playlist';
import { Emitter } from './baselib';
import { ThreadLoader } from '../packages/lib/src/nico/thread-loader';
import { sleep } from '../packages/lib/src/infra/sleep';
import { VideoSessionWorker } from '../packages/lib/src/nico/video-session-worker';
import { PlayerState } from './state';
import { ClassList } from '../packages/lib/src/dom/class-list-wrapper';
import { objUtil } from '../packages/lib/src/infra/obj-util';
import { MylistApiLoader } from '../packages/lib/src/nico/mylist-api-loader';
import { openMylistPicker, closeMylistPicker } from './mylist-picker';
import { ThumbInfoLoader } from '../packages/lib/src/nico/thumb-info-loader';
import { WatchInfoCacheDb } from '../packages/lib/src/nico/watch-info-cache-db';
import { css, cssUtil } from '../packages/lib/src/css/css';
import { textUtil } from '../packages/lib/src/text/text-util';
import { MediaSessionApi } from '../packages/lib/src/infra/media-session-api';
import { LikeApi } from '../packages/lib/src/nico/like-api.js';
import type { EmitterCallback } from '../packages/lib/src/emitter';
import type { ConfigStore } from './config';
import type { Uq, UqFactory } from './comment-panel';
import type { ThumbInfoOk } from '../packages/lib/src/nico/parse-thumb-info';
import type { CommentPlayerOptions } from './comment-player';

interface DialogPlayerConfig extends ConfigStore {
  getNativeKey?(key: string): string;
  setValue(key: string, value: unknown): void;
}

interface VideoWatchQuery {
  shuffle?: string;
  continuous?: string;
  playlist?: { type: string };
  from?: string;
  [key: string]: unknown;
}

interface VideoWatchOptionBag {
  eventType?: string;
  query?: VideoWatchQuery;
  economy?: boolean;
  openNow?: boolean;
  autoCloseFullScreen?: boolean;
  reloadCount?: number;
  isAutoFutatsumeTubeDisabled?: boolean;
  currentTime?: string | number;
  [key: string]: unknown;
}

interface MylistLoadOptions {
  shuffle: boolean;
  watchId: string;
  append?: boolean;
  limit?: unknown;
}

interface NicoVideoPlayerDialogViewParams {
  dialog: NicoVideoPlayerDialog;
  playerConfig: DialogPlayerConfig;
  nicoVideoPlayer: NicoVideoPlayer | undefined;
  playerState: PlayerState;
  currentTimeGetter: () => number;
}

interface VideoHoverMenuParams {
  playerContainer: Element;
  playerState: PlayerState;
}

interface VariablesMapperState {
  commentLayerOpacity: number;
  fullscreenControlBarMode: string;
  [key: string]: unknown;
}

interface FutatsumeSettingPanelElement extends HTMLElement {
  config: unknown;
  toggle(): void;
  close(): void;
}

interface DialogKeyEmitter {
  on(name: string, callback: EmitterCallback): unknown;
}

interface NicoVideoPlayerDialogParams {
  config: DialogPlayerConfig;
  state: PlayerState;
  keyHandler?: DialogKeyEmitter;
}

interface VideoSessionInfo {
  url: string;
  type: string;
  [key: string]: unknown;
}

interface VideoSessionWorkerSession {
  connect(): Promise<VideoSessionInfo>;
  close(): void;
  getState(): Promise<VideoSessionState>;
}

interface VideoSessionState {
  isDeleted: boolean;
  isAbnormallyClosed: boolean;
}

interface VideoInfoOwner {
  id: string;
  name: string;
  linkId?: string;
  [key: string]: unknown;
}

interface DialogThreadMsgInfo {
  videoId: string;
  userId?: unknown;
  threadId?: string;
  language?: string;
  when?: number;
  frontendId: string | number;
  frontendVersion: string | number;
  threads?: Array<{ id: string | number; forkLabel?: string; fork?: string }>;
  defaultThread?: { is184Forced?: boolean; isThreadkeyRequired?: boolean };
  threadInfo?: DialogThreadInfoData;
  nvComment: {
    params: { language?: string; [key: string]: unknown };
    server: string;
    threadKey?: string;
  };
  [key: string]: unknown;
}

interface DialogThreadInfoData {
  userId?: unknown;
  videoId: string;
  threadId?: string;
  is184Forced?: boolean;
  totalResCount: number;
  language?: string;
  when?: number;
  isWaybackMode: boolean;
}

interface DialogCommentLoadResult {
  threadInfo: DialogThreadInfoData;
  body: unknown;
  format: string;
}

interface DialogLoadError {
  reason?: string;
  message?: string;
  info?: { isPlayable: boolean; [key: string]: unknown };
  watchId?: string;
}

interface DialogVideoError {
  type?: string;
  target?: { error?: { code?: number } | null } | null;
  description: string;
  fallback?: unknown;
}

interface DialogVideoInfo {
  viewerInfo: unknown;
  watchId: string;
  videoId: string;
  title: string;
  thumbnail: string;
  duration: number;
  owner: VideoInfoOwner;
  tagList: { name?: string }[];
  msgInfo: DialogThreadMsgInfo;
  initialPlaybackTime: number;
  isChannel: boolean;
  isLiked: boolean;
  isCommunityVideo: boolean;
  isMymemory: boolean;
  setCurrentVideo(url: string): void;
  toJSON(): unknown;
  originalVideoId: string;
  contextWatchId: string;
  count: { comment: unknown; mylist: unknown; view: unknown };
  postedAt: string | number;
  csrfToken?: string;
  replacementWords: unknown;
  [key: string]: unknown;
}

interface DialogUtilView {
  $: UqFactory;
  addStyle(css: string, options?: { className?: string; disabled?: boolean }): void;
  isLogin(): boolean;
  isGinzaWatchUrl(): boolean;
  fullscreen: { now(): boolean };
  StyleSwitcher: { update(options: { on?: string; off?: string }): void };
  openMylistWindow(watchId: string): void;
  capTube(options: { title: unknown; videoId: unknown; author: unknown }): void;
  saveMymemory(dialog: unknown, videoInfo: unknown): void;
  dispatchCommand(...args: unknown[]): void;
  escapeToZenkaku(text: string): string;
}

//===BEGIN===
//@require media-session-api
//@require like-api

class PlayerConfig {
  declare static instance: DialogPlayerConfig;
  static getInstance(config: DialogPlayerConfig): DialogPlayerConfig {
    if (!PlayerConfig.instance) {
      PlayerConfig.instance = this.wrapKey(config);
    }
    return PlayerConfig.instance;
  }
  static wrapKey(config: DialogPlayerConfig, mode = ''): DialogPlayerConfig {
    if (!mode && util.isGinzaWatchUrl()) {
      mode = 'ginza';
    } else if (location && location.host.indexOf('.nicovideo.jp') < 0) {
      mode = 'others';
    }
    if (!mode) {
      return config;
    }
    config.getNativeKey = (key: string) => {
      switch (mode) {
        case 'ginza':
          if (['autoPlay', 'screenMode'].includes(key)) {
            return `${key}:${mode}`;
          }
          break;
        case 'others':
          if (['autoPlay', 'screenMode', 'overrideWatchLink'].includes(key)) {
            return `${key}:${mode}`;
          }
          break;
      }
      return key;
    };
    return config;
  }
}

class VideoWatchOptions {
  declare private _watchId: string;
  declare private _options: VideoWatchOptionBag;
  declare private _config: DialogPlayerConfig;
  constructor(watchId: string, options: VideoWatchOptionBag | undefined, config: DialogPlayerConfig) {
    this._watchId = watchId;
    this._options = options || {};
    this._config = config;
  }
  get rawData() {
    return this._options;
  }
  get eventType() {
    return this._options.eventType || '';
  }
  get query() {
    return this._options.query || {};
  }
  get videoLoadOptions(): { economy: boolean } {
    const options = {
      economy: this.isEconomySelected,
    };
    return options;
  }
  get mylistLoadOptions(): MylistLoadOptions {
    const options: MylistLoadOptions = { shuffle: false, watchId: '' };
    const query = this.query;
    options.shuffle = parseInt(query.shuffle as string, 10) === 1;
    options.watchId = this._watchId;
    return options;
  }
  get isPlaylistStartRequest(): boolean {
    const eventType = this.eventType;
    const query = this.query;
    if (eventType !== 'click' || query.continuous !== '1') {
      return false;
    }
    if (query.playlist!.type) {
      return true;
    }
    return false;
  }
  hasKey(key: string): boolean {
    return _.has(this._options, key);
  }
  get isOpenNow() {
    return this._options.openNow === true;
  }
  get isEconomySelected() {
    return _.isBoolean(this._options.economy)
      ? this._options.economy
      : this._config.getValue('smileVideoQuality') === 'eco';
  }
  get isAutoCloseFullScreen() {
    return !!this._options.autoCloseFullScreen;
  }
  get isReload(): boolean {
    return (this._options.reloadCount as number) > 0;
  }
  get isAutoFutatsumeTubeDisabled() {
    return !!this._options.isAutoFutatsumeTubeDisabled;
  }
  get reloadCount() {
    return this._options.reloadCount;
  }
  get currentTime(): number {
    if (_.isNumber(this._options.currentTime)) {
      return parseFloat(this._options.currentTime as unknown as string);
    }

    return !isNaN(this.query.from as unknown as number) ? parseFloat(this.query.from as string) : 0;
  }
  set currentTime(value: number) {
    if (Number.isFinite(value)) this._options.currentTime = Math.max(0, value);
  }
  createForVideoChange(options: VideoWatchOptionBag | undefined): VideoWatchOptionBag {
    options = options || {};
    delete this._options.economy;
    _.defaults(options, this._options);
    options.openNow = true;
    options.isAutoFutatsumeTubeDisabled = false;
    options.currentTime = 0;
    options.reloadCount = 0;
    options.query = {};
    return options;
  }
  createForReload(options: VideoWatchOptionBag | undefined): VideoWatchOptionBag {
    options = options || {};
    delete this._options.economy;
    options.isAutoFutatsumeTubeDisabled =
      typeof options.isAutoFutatsumeTubeDisabled === 'boolean' ? options.isAutoFutatsumeTubeDisabled : true;
    _.defaults(options, this._options);
    options.openNow = true;
    options.reloadCount = options.reloadCount ? options.reloadCount + 1 : 1;
    options.query = {};
    return options;
  }
  createForSession(options?: VideoWatchOptionBag): VideoWatchOptionBag {
    options = options || {};
    _.defaults(options, this._options);
    options.query = {};
    return options;
  }
}

class NicoVideoPlayerDialogView extends Emitter {
  private shell?: PlayerShell;
  declare private _dialog: NicoVideoPlayerDialog;
  declare private _playerConfig: DialogPlayerConfig;
  declare private _nicoVideoPlayer: NicoVideoPlayer | undefined;
  declare private _state: PlayerState;
  declare private _currentTimeGetter: () => number;
  declare private _aspectRatio: number;
  declare private _$dialog: Uq;
  declare private _$body: Uq;
  declare private _$playerContainer: Uq;
  declare classList: DOMTokenList;
  declare hoverMenu: VideoHoverMenu;
  declare commentInput: CommentInputPanel;
  declare private _escBlockExpiredAt: number;
  declare videoControlBar: VideoControlBar;
  declare private _$errorMessageContainer: Uq;
  declare videoInfoPanel: VideoInfoPanel;
  declare private _isMouseMoving: boolean | undefined;
  declare private _classNameTable: Map<string, string> | undefined;
  declare private _lastScreenMode: string;
  declare settingPanel: FutatsumeSettingPanelElement | undefined;
  declare varMapper: VariablesMapper;
  declare static __css__: string;
  declare static __tpl__: string;
  constructor(params: NicoVideoPlayerDialogViewParams) {
    super();
    this.initialize(params);
  }
  initialize(params: NicoVideoPlayerDialogViewParams): void {
    const dialog = (this._dialog = params.dialog);
    this._playerConfig = params.playerConfig;
    this._nicoVideoPlayer = params.nicoVideoPlayer;
    this._state = params.playerState;
    this._currentTimeGetter = params.currentTimeGetter;

    this._aspectRatio = 9 / 16;

    dialog.on('canPlay', this._onVideoCanPlay.bind(this) as EmitterCallback);
    dialog.on('videoCount', this._onVideoCount.bind(this) as EmitterCallback);
    dialog.on('error', this._onVideoError.bind(this));
    dialog.on('play', this._onVideoPlay.bind(this));
    dialog.on('playing', this._onVideoPlaying.bind(this));
    dialog.on('pause', this._onVideoPause.bind(this));
    dialog.on('stalled', this._onVideoStalled.bind(this));
    dialog.on('abort', this._onVideoAbort.bind(this));
    dialog.on('aspectRatioFix', this._onVideoAspectRatioFix.bind(this) as EmitterCallback);
    dialog.on('volumeChange', this._onVolumeChange.bind(this));
    dialog.on('volumeChangeEnd', this._onVolumeChangeEnd.bind(this));
    dialog.on('beforeVideoOpen', this._onBeforeVideoOpen.bind(this));
    dialog.on('loadVideoInfoFail', this._onVideoInfoFail.bind(this));
    dialog.on('videoQuality', this._onVideoQuality.bind(this));

    void this._initializeDom();
    this._state.on('update', this._onPlayerStateUpdate.bind(this) as EmitterCallback);
    this._state.onkey('videoInfo', this._onVideoInfoLoad.bind(this));
  }
  async _initializeDom(): Promise<void> {
    (util as unknown as DialogUtilView).addStyle(NicoVideoPlayerDialogView.__css__);
    const $dialog = (this._$dialog = (util as unknown as DialogUtilView).$.html(
      NicoVideoPlayerDialogView.__tpl__.trim()
    ));
    const onCommand = this._onCommand.bind(this);
    const config = this._playerConfig;
    const state = this._state;
    this._$body = (util as unknown as DialogUtilView).$('body, html');

    const $container = (this._$playerContainer = $dialog.find('.futatsumePlayerContainer'));
    const container = $container[0] as Element;
    const classList = (this.classList = ClassList(container));

    container.addEventListener('click', (e) => {
      void global.emitter.emitAsync('hideHover');
      if (
        (e.target as Element).classList.contains('touchWrapper') &&
        config.props.enableTogglePlayOnClick &&
        !classList.contains('menuOpen')
      ) {
        onCommand('togglePlay');
      }
      e.preventDefault();
      e.stopPropagation();
      classList.remove('menuOpen');
    });
    container.addEventListener('command', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const detail = (e as CustomEvent<{ command: string; param: unknown }>).detail;
      this._onCommand(detail.command, detail.param);
    });
    container.addEventListener('focusin', (e: Event & { path?: EventTarget[] }) => {
      const target = (e.path && e.path.length ? e.path[0] : e.target) as HTMLElement;
      if (target.dataset.hasSubmenu) {
        classList.add('menuOpen');
      }
    });

    this._applyState();

    // マウスを動かしてないのにmousemoveが飛んできたらスルー
    let lastX = 0,
      lastY = 0;
    const onMouseMove = this._onMouseMove.bind(this);
    const onMouseMoveEnd = _.debounce(this._onMouseMoveEnd.bind(this), 400);
    container.addEventListener(
      'mousemove',
      _.throttle((e: Event) => {
        const me = e as MouseEvent;
        if (me.buttons === 0 && lastX === me.screenX && lastY === me.screenY) {
          return;
        }
        lastX = me.screenX;
        lastY = me.screenY;
        onMouseMove();
        onMouseMoveEnd();
      }, 100)
    );

    $dialog.on('dblclick', (e: Event) => {
      if (!e.target || (e.target as Element).id !== 'futatsumeVideoPlayerDialog') {
        return;
      }
      if (config.props.enableDblclickClose) {
        this.emit('command', 'close');
      }
    });

    this.hoverMenu = new VideoHoverMenu({
      playerContainer: container,
      playerState: state,
    });

    this.commentInput = new CommentInputPanel({
      playerContainer: container as HTMLElement,
      playerConfig: config,
      playerState: state,
      isLoggedIn: (util as unknown as DialogUtilView).isLogin(),
    });
    this.updateViewer();

    this.commentInput.on('post', (e: unknown, chat: unknown, cmd: unknown) => this.emit('postChat', e, chat, cmd));

    let hasPlaying = false;
    this.commentInput.on('focus', (isAutoPause: unknown) => {
      hasPlaying = state.isPlaying;
      if (isAutoPause) {
        this.emit('command', 'pause');
      }
    });
    this.commentInput.on('blur', (isAutoPause: unknown) => {
      if (isAutoPause && hasPlaying && state.isOpen) {
        this.emit('command', 'play');
      }
    });
    this.commentInput.on('esc', () => (this._escBlockExpiredAt = Date.now() + 1000 * 2));

    // this.settingPanel = new SettingPanel({
    //   $parent: $container,
    //   playerConfig: config,
    //   player: this._dialog
    // });
    // this.settingPanel.on('command', onCommand);

    await sleep.idle();
    this.videoControlBar = new VideoControlBar({
      $playerContainer: $container,
      playerConfig: config,
      player: this._dialog as unknown as NicoVideoPlayer,
      playerState: this._state,
      currentTimeGetter: this._currentTimeGetter,
    });
    this.videoControlBar.on('command', onCommand as EmitterCallback);

    this._$errorMessageContainer = $container.find('.errorMessageContainer');

    await sleep.idle();
    this._initializeVideoInfoPanel();
    this.shell = new PlayerShell(
      container as HTMLElement,
      config,
      state,
      this._dialog,
      (name, param) => this._onCommand(name, param),
      () => this.toggleSettingPanel()
    );
    this._initializeResponsive();

    this.selectTab(this._state.currentTab);

    document.documentElement.addEventListener('paste', (e: ClipboardEvent) => {
      void this._onPaste(e);
    });

    global.emitter.on('showMenu', () => this.addClass('menuOpen'));
    global.emitter.on('hideMenu', () => this.removeClass('menuOpen'));
    global.emitter.on('fullscreenStatusChange', () => this._applyScreenMode(true));
    document.body.append($dialog[0] as Element);
    void this.emitResolve('dom-ready');
  }
  _initializeVideoInfoPanel(): VideoInfoPanel {
    if (this.videoInfoPanel) {
      return this.videoInfoPanel;
    }
    this.videoInfoPanel = new VideoInfoPanel({
      dialog: this,
      node: this._$playerContainer[0],
    });
    this.videoInfoPanel.on('command', this._onCommand.bind(this) as EmitterCallback);
    return this.videoInfoPanel;
  }
  _onCommand(command: string, param?: unknown): void {
    switch (command) {
      case 'settingPanel':
        this.toggleSettingPanel();
        break;
      case 'toggle-flipH':
        this.toggleClass('is-flipH');
        break;
      case 'toggle-flipV':
        this.toggleClass('is-flipV');
        break;
      default:
        this.emit('command', command, param);
    }
  }
  async _onPaste(e: ClipboardEvent): Promise<void> {
    const isFutatsume = !!(e.target as unknown as Element).closest('.futatsumeVideoPlayerDialog');
    const target = ((e as Event & { path?: EventTarget[] }).path?.[0] ?? e.target) as HTMLElement;
    if (!isFutatsume && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
      return;
    }
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch (err) {
      window.console.warn(err, navigator.clipboard);
      text = (e.clipboardData as DataTransfer).getData('text/plain');
    }
    if (!text) {
      return;
    }

    text = text.trim();
    const isOpen = this._state.isOpen;
    const watchIdReg = /((nm|sm|so)\d+)/.exec(text);
    if (watchIdReg) {
      return this._onCommand('open', watchIdReg[1]);
    }
    if (!isOpen) {
      return;
    }
    const youtubeReg = /^https?:\/\/((www\.|)youtube\.com\/watch|youtu\.be)/.exec(text);
    if (youtubeReg) {
      return this._onCommand('setVideo', text);
    }
    const seekReg = /^(\d+):(\d+)$/.exec(text);
    if (seekReg) {
      return this._onCommand('seek', (seekReg[1] as unknown as number) * 60 + (seekReg[2] as unknown as number) * 1);
    }
    const mylistReg = /mylist(\/#\/|\/)(\d+)/.exec(text);
    if (mylistReg) {
      return this._onCommand('playlistSetMylist', mylistReg[2]);
    }
    const seriesReg = /series\/(\d+)/.exec(text);
    if (seriesReg) {
      return this._onCommand('playlistSetSeries', seriesReg[1]);
    }
    const ownerReg = /user\/(\d+)/.exec(text);
    if (ownerReg) {
      return this._onCommand('playlistSetUploadedVideo', ownerReg[1]);
    }
  }
  _initializeResponsive() {
    window.addEventListener('resize', _.debounce(this._updateResponsive.bind(this), 500));
    this.varMapper = new VariablesMapper({ config: this._playerConfig });
    this.varMapper.on('update', () => this._updateResponsive());
  }
  _updateResponsive() {
    if (!this._state.isOpen) {
      return;
    }
    const $container = this._$playerContainer;
    const header = $container.find('.futatsumeWatchVideoHeaderPanel')[0] as HTMLElement;
    const config = this._playerConfig;

    // 画面の縦幅にシークバー分の余裕がある時は常時表示
    const update = () => {
      const w = global.innerWidth,
        h = global.innerHeight;
      const vMargin = h - w * this._aspectRatio;

      const controlBarMode = config.props.fullscreenControlBarMode;
      if (controlBarMode === 'always-hide') {
        this.toggleClass('showVideoControlBar', false);
        return;
      }
      const videoControlBarHeight = this.varMapper.videoControlBarHeight;
      const showVideoHeaderPanel = vMargin >= videoControlBarHeight + header.offsetHeight * 2;
      let showVideoControlBar;
      switch (controlBarMode) {
        case 'always-show':
          showVideoControlBar = true;
          break;
        case 'auto':
        default:
          showVideoControlBar = vMargin >= videoControlBarHeight;
      }
      this.toggleClass('showVideoControlBar', showVideoControlBar);
      this.toggleClass('showVideoHeaderPanel', showVideoHeaderPanel);
    };

    update();
  }
  _onMouseMove(): void {
    if (this._isMouseMoving) {
      return;
    }
    this.addClass('is-mouseMoving');
    this._isMouseMoving = true;
  }
  _onMouseMoveEnd(): void {
    if (!this._isMouseMoving) {
      return;
    }
    this.removeClass('is-mouseMoving');
    this._isMouseMoving = false;
  }
  _onVideoCanPlay(watchId: string, videoInfo: unknown, options: unknown): void {
    this.emit('canPlay', watchId, videoInfo, options);
  }
  _onVideoCount({ comment, view, mylist }: { comment?: unknown; view?: unknown; mylist?: unknown } = {}): void {
    this.emit('videoCount', { comment, view, mylist });
  }
  _onVideoError(e: unknown): void {
    this.emit('error', e);
  }
  _onBeforeVideoOpen(): void {
    this.commentInput.reset();
    this.shell?.reset();
    this._setThumbnail();
  }
  _onVideoInfoLoad(videoInfo: unknown): void {
    this.videoInfoPanel.update(videoInfo as Parameters<VideoInfoPanel['update']>[0]);
    this.shell?.updateVideo(videoInfo as VideoInfoModel);
  }
  updateViewer(): void {
    const isLoggedIn = nicoUtil.isLogin(),
      isPremium = nicoUtil.isPremium();
    this._state.isRegularUser = !isPremium;
    if (!this.commentInput) return;
    this._$dialog.toggleClass('is-guest', !isLoggedIn);
    this.commentInput.updateViewer({ isLoggedIn, isPremium });
  }
  _onVideoInfoFail(videoInfo: unknown): void {
    if (videoInfo) {
      this.videoInfoPanel.update(videoInfo as Parameters<VideoInfoPanel['update']>[0]);
    }
  }
  _onVideoQuality(sessionInfo: unknown): void {
    this.emit('videoQuality', sessionInfo);
  }
  _onVideoPlay() {}
  repeatOnEnded(): boolean {
    return this.shell?.repeatOnEnded() ?? false;
  }
  _onVideoPlaying() {}
  _onVideoPause() {}
  _onVideoStalled() {}
  _onVideoAbort() {}
  _onVideoAspectRatioFix(ratio: number): void {
    this._aspectRatio = ratio;
    this._updateResponsive();
  }
  _onVolumeChange(/*vol, mute*/) {
    this.addClass('volumeChanging');
  }
  _onVolumeChangeEnd(/*vol, mute*/) {
    this.removeClass('volumeChanging');
  }
  _onScreenModeChange() {
    this._applyScreenMode();
  }
  _getStateClassNameTable(): Map<string, string> {
    // TODO: テーブルなくても対応できるようにcss名を整理
    return (this._classNameTable =
      this._classNameTable ||
      (objUtil.toMap({
        isAbort: 'is-abort',
        isShowComment: 'is-showComment',
        isDebug: 'is-debug',
        isError: 'is-error',
        isLoading: 'is-loading',
        isMute: 'is-mute',
        isLoop: 'is-loop',
        isOpen: 'is-open',
        isPlaying: 'is-playing',
        isSeeking: 'is-seeking',
        isPausing: 'is-pausing',
        //      isStalled: 'is-stalled',
        isLiked: 'is-liked',
        isChanging: 'is-changing',
        isUpdatingDeflist: 'is-updatingDeflist',
        isUpdatingMylist: 'is-updatingMylist',
        isPlaylistEnable: 'is-playlistEnable',
        isCommentPosting: 'is-commentPosting',
        isRegularUser: 'is-regularUser',
        isWaybackMode: 'is-waybackMode',
        isNotPlayed: 'is-notPlayed',
        isYouTube: 'is-youTube',
      }) as Map<string, string>));
  }
  _onPlayerStateChange(changedState: Map<string, unknown>): void {
    for (const key of changedState.keys()) {
      this._onPlayerStateUpdate(key, changedState.get(key));
    }
  }
  _onPlayerStateUpdate(key: string, value: unknown) {
    switch (key) {
      case 'thumbnail':
        return this._setThumbnail(value as string);
      case 'screenMode':
      case 'isOpen':
        if (this._state.isOpen) {
          this.show();
          this._onScreenModeChange();
        } else {
          this.hide();
        }
        return;
      case 'errorMessage':
        return (this._$errorMessageContainer[0]!.textContent = value as string);
      case 'currentTab':
        return this.selectTab(value as string);
    }
    const table = this._getStateClassNameTable();
    const className = table.get(key);
    if (className) {
      this.toggleClass(className, !!value);
    }
  }
  _applyState(): void {
    const table = this._getStateClassNameTable();
    const state = this._state;
    for (const [key, className] of table) {
      this.classList.toggle(className, (state as unknown as Record<string, boolean>)[key]);
    }

    if (this._state.isOpen) {
      this._applyScreenMode();
    }
  }
  _getScreenModeClassNameTable() {
    return [
      'futatsumeScreenMode_3D',
      'futatsumeScreenMode_small',
      'futatsumeScreenMode_sideView',
      'futatsumeScreenMode_normal',
      'futatsumeScreenMode_big',
      'futatsumeScreenMode_wide',
    ];
  }
  _applyScreenMode(force = false): void {
    const screenMode = this._state.isOpen ? `futatsumeScreenMode_${this._state.screenMode}` : '';
    if (!force && this._lastScreenMode === screenMode) {
      return;
    }
    this._lastScreenMode = '';
    const modes = this._getScreenModeClassNameTable();
    const isFull = (util as unknown as DialogUtilView).fullscreen.now();
    Object.assign(document.body.dataset, {
      screenMode: this._state.screenMode,
      fullscreen: isFull ? 'yes' : 'no',
    });
    modes.forEach((m) => this._$body.raf.toggleClass(m, m === screenMode && !isFull));
    this._updateScreenModeStyle();
  }
  _updateScreenModeStyle(): void {
    if (!this._state.isOpen) {
      (util as unknown as DialogUtilView).StyleSwitcher.update({ off: 'style.screenMode' });
      return;
    }
    if (Fullscreen.now()) {
      (util as unknown as DialogUtilView).StyleSwitcher.update({
        on: 'style.screenMode.for-full, style.screenMode.for-screen-full',
        off: 'style.screenMode:not(.for-full):not(.for-screen-full), link[href*="watch.css"]',
      });
      return;
    }
    let on: string, off: string;
    switch (this._state.screenMode) {
      case '3D':
      case 'wide':
        on = 'style.screenMode.for-full, style.screenMode.for-window-full';
        off = 'style.screenMode:not(.for-full):not(.for-window-full), link[href*="watch.css"]';
        break;
      default:
      case 'normal':
      case 'big':
        on =
          'style.screenMode.for-dialog, style.screenMode.for-big, style.screenMode.for-normal, link[href*="watch.css"]';
        off = 'style.screenMode:not(.for-dialog):not(.for-big):not(.for-normal)';
        break;
      case 'small':
      case 'sideView':
        on =
          'style.screenMode.for-popup, style.screenMode.for-sideView, .style.screenMode.for-small, link[href*="watch.css"]';
        off = 'style.screenMode:not(.for-popup):not(.for-sideView):not(.for-small)';
        break;
    }
    (util as unknown as DialogUtilView).StyleSwitcher.update({ on, off });
  }
  show(): void {
    ClassList(this._$dialog[0] as Element).add('is-open');
    if (!Fullscreen.now()) {
      ClassList(document.body).remove('fullscreen');
    }
    this._$body.raf.addClass('showNicoVideoPlayerDialog');
    (util as unknown as DialogUtilView).StyleSwitcher.update({ on: 'style.futatsume-open' });
    this._updateScreenModeStyle();
  }
  hide(): void {
    closeSettingsDialog();
    this.videoInfoPanel?.cancelPending();
    this.commentInput.reset();
    this.shell?.close();
    ClassList(this._$dialog[0] as Element).remove('is-open');
    if (this.settingPanel) {
      this.settingPanel.close();
    }
    this._$body.raf.removeClass('showNicoVideoPlayerDialog');
    (util as unknown as DialogUtilView).StyleSwitcher.update({
      off: 'style.futatsume-open, style.screenMode',
      on: 'link[href*="watch.css"]',
    });
    this._clearClass();
  }
  _clearClass(): void {
    const modes = this._getScreenModeClassNameTable().join(' ');
    this._lastScreenMode = '';
    this._$body.raf.removeClass(modes);
  }
  _setThumbnail(thumbnail?: string): void {
    if (thumbnail) {
      this.css('background-image', `url(${thumbnail})`);
    } else {
      // base hrefのせいで変なurlを参照してしまうので適当な黒画像にする
      this.css('background-image', `url(${CONSTANT.BLANK_PNG})`);
    }
  }
  focusToCommentInput(): void {
    // 即フォーカスだと入力欄に"C"が入ってしまうのを雑に対処
    window.setTimeout(() => this.commentInput.focus(), 0);
  }
  toggleSettingPanel(): void {
    if (!this.settingPanel) {
      this.settingPanel = document.createElement('futatsume-setting-panel') as FutatsumeSettingPanelElement;
      this.settingPanel.config = this._playerConfig;
      this._$playerContainer.append(this.settingPanel);
    }
    this.settingPanel.toggle();
  }
  get$Container(): Uq {
    return this._$playerContainer;
  }
  css(key: string, val: string): void {
    this._$playerContainer.raf.css(key, val);
  }
  addClass(name: string): void {
    return this.classList.add(name);
  }
  removeClass(name: string): void {
    return this.classList.remove(name);
  }
  toggleClass(name: string, v?: boolean): void {
    this.classList.toggle(name, v);
  }
  hasClass(name: string): boolean {
    return this.classList.contains(name);
  }
  appendTab(name: string, title: string): Uq {
    return this.videoInfoPanel.appendTab(name, title) as unknown as Uq;
  }
  selectTab(name: string): void {
    this._playerConfig.props.videoInfoPanelTab = name;
    this._state.currentTab = name;
    this.videoInfoPanel.selectTab(name);
    global.emitter.emit('tabChange', name);
  }
  execCommand(command: string, param?: unknown): void {
    this.emit('command', command, param);
  }
  blinkTab(name: string): void {
    this.videoInfoPanel.blinkTab(name);
  }
  clearPanel(): void {
    this.videoInfoPanel.clear();
  }
}

(util as unknown as DialogUtilView).addStyle(
  `
  .is-watch .BaseLayout {
    display: none;
  }
  #futatsumeVideoPlayerDialog {
    touch-action: manipulation; /* for Safari */
    touch-action: none;
  }
  #futatsumeVideoPlayerDialog::before {
    display: none;
  }

  .futatsumePlayerContainer {
    left: 0 !important;
    top:  0 !important;
    width:  100vw !important;
    height: 100vh !important;
    contain: size layout;
  }

  .videoPlayer,
  .commentLayerFrame,
  .resizeObserver {
    top:  0 !important;
    left: 0 !important;
    width:  100vw !important;
    height: 100% !important;
    right:  0 !important;
    border: 0 !important;
    z-index: 100 !important;
    contain: layout style size paint;
    will-change: transform,opacity;
  }
  .resizeObserver {
    z-index: -1;
    opacity: 0;
    pointer-events: none;
  }

  .is-open .videoPlayer>* {
    cursor: none;
  }

  .showVideoControlBar {
    --padding-bottom: ${(VideoControlBar as unknown as { BASE_HEIGHT: number }).BASE_HEIGHT}px;
    --padding-bottom: var(--futatsume-control-bar-height);
  }
  .futatsumeStoryboardOpen .showVideoControlBar {
    --padding-bottom: calc(var(--futatsume-control-bar-height) + 80px);
  }
  .futatsumeStoryboardOpen.is-fullscreen .showVideoControlBar {
    --padding-bottom: calc(var(--futatsume-control-bar-height) + 50px);
  }

  .showVideoControlBar .videoPlayer,
  .showVideoControlBar .commentLayerFrame,
  .showVideoControlBar .resizeObserver {
    height: calc(100% - var(--padding-bottom)) !important;
  }

  .showVideoControlBar .videoPlayer {
    z-index: 100 !important;
  }

  .showVideoControlBar .commentLayerFrame {
    z-index: 101 !important;
  }

  body[data-screen-mode="3D"] .futatsumePlayerContainer .videoPlayer {
    transform: perspective(700px) rotateX(10deg);
    margin-top: -5%;
  }

  .futatsumePlayerContainer {
    left: 0;
    width: 100vw;
    height: 100vh;
    box-shadow: none;
  }

  body[data-screen-mode="3D"] .futatsumePlayerContainer .videoPlayer {
    transform: perspective(600px) rotateX(10deg);
    height: 100%;
  }

  body[data-screen-mode="3D"] .futatsumePlayerContainer .commentLayerFrame {
    transform: translateZ(0) perspective(600px) rotateY(30deg) rotateZ(-15deg) rotateX(15deg);
    opacity: 0.9;
    height: 100%;
    margin-left: 20%;
  }

`,
  { className: 'screenMode for-full', disabled: true }
);

(util as unknown as DialogUtilView).addStyle(
  `
  body #futatsumeVideoPlayerDialog {
    contain: style size;
  }

  #futatsumeVideoPlayerDialog::before {
    display: none;
  }

  body.futatsumeScreenMode_sideView {
    --sideView-left-margin: ${CONSTANT.SIDE_PLAYER_WIDTH + 24}px;
    --sideView-top-margin: 76px;
    margin-left: var(--sideView-left-margin);
    margin-top: var(--sideView-top-margin);

    width: auto;
  }

  body.futatsumeScreenMode_sideView.nofix {
    --sideView-top-margin: 40px;
  }
  body.futatsumeScreenMode_sideView:not(.nofix) #siteHeader {
    width: auto;
  }
  body.futatsumeScreenMode_sideView:not(.nofix) #siteHeader #siteHeaderInner {
    width: auto;
  }

 .futatsumeScreenMode_sideView .futatsumeVideoPlayerDialog.is-open,
 .futatsumeScreenMode_small .futatsumeVideoPlayerDialog.is-open {
    display: block;
    top: 0; left: 0; right: 100%; bottom: 100%;
  }

  .futatsumeScreenMode_sideView .futatsumePlayerContainer,
  .futatsumeScreenMode_small .futatsumePlayerContainer {
    width: ${CONSTANT.SIDE_PLAYER_WIDTH}px;
    height: ${CONSTANT.SIDE_PLAYER_HEIGHT}px;
  }

  .is-open .futatsumeVideoPlayerDialog {
    contain: layout style size;
  }

  .futatsumeVideoPlayerDialogInner {
    top: 0;
    left: 0;
    transform: none;
  }


  @media screen and (min-width: 1432px)
  {
    body.futatsumeScreenMode_sideView {
      --sideView-left-margin: calc(100vw - 1024px);
    }
    body.futatsumeScreenMode_sideView:not(.nofix) #siteHeader {
      width: calc(100vw - (100vw - 1024px));
    }
    .futatsumeScreenMode_sideView .futatsumePlayerContainer {
      width: calc(100vw - 1024px);
      height: calc((100vw - 1024px) * 9 / 16);
    }
  }
`,
  { className: 'screenMode for-popup', disabled: true }
);

(util as unknown as DialogUtilView).addStyle(
  `
body.futatsumeScreenMode_sideView,
body.futatsumeScreenMode_small {
  border-bottom: 40px solid;
  margin-top: 0;
}
`,
  { className: 'domain slack-com', disabled: true }
);

(util as unknown as DialogUtilView).addStyle(
  `

  .futatsumeScreenMode_normal .futatsumePlayerContainer .videoPlayer {
    left: 2.38%;
    width: 95.23%;
  }
  .futatsumeScreenMode_big .futatsumePlayerContainer {
    width: ${CONSTANT.BIG_PLAYER_WIDTH}px;
    height: ${CONSTANT.BIG_PLAYER_HEIGHT}px;
  }


`,
  { className: 'screenMode for-dialog', disabled: true }
);

(util as unknown as DialogUtilView).addStyle(
  `
  .futatsumeScreenMode_3D,
  .futatsumeScreenMode_normal,
  .futatsumeScreenMode_big,
  .futatsumeScreenMode_wide
  {
    overflow-x: hidden !important;
    overflow-y: hidden !important;
    overflow: hidden !important;
  }

  /*
    プレイヤーが動いてる間、裏の余計な物のマウスイベントを無効化
    多少軽量化が期待できる？
  */
  body.futatsumeScreenMode_big >*:not(.futatsume-family) *,
  body.futatsumeScreenMode_normal >*:not(.futatsume-family) *,
  body.futatsumeScreenMode_wide >*:not(.futatsume-family) *,
  body.futatsumeScreenMode_3D >*:not(.futatsume-family) * {
    pointer-events: none;
    user-select: none;
    animation-play-state: paused !important;
    contain: style layout paint;
  }

  body.futatsumeScreenMode_big .FutatsumeButton,
  body.futatsumeScreenMode_normal .FutatsumeButton,
  body.futatsumeScreenMode_wide .FutatsumeButton,
  body.futatsumeScreenMode_3D  .FutatsumeButton {
    display: none;
  }

  .ads, .banner, iframe[name^="ads"] {
    visibility: hidden !important;
    pointer-events: none;
  }

  .VideoThumbnailComment {
    display: none !important;
  }

  /* 大百科の奴 */
  #scrollUp {
    display: none !important;
  }

  .SeriesDetailContainer-backgroundInner {
    background-image: none !important;
    filter: none !important;
  }
  .Hidariue-image {
    visibility: hidden !important;
  }
`,
  { className: 'futatsume-open', disabled: true }
);

NicoVideoPlayerDialogView.__css__ = `

  .futatsumeVideoPlayerDialog {
    display: none;
    position: fixed;
    /*background: rgba(0, 0, 0, 0.8);*/
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: ${CONSTANT.BASE_Z_INDEX};
    font-size: 13px;
    text-align: left;
    box-sizing: border-box;
    contain: size style layout;
  }

  .futatsumeVideoPlayerDialog::before {
    content: ' ';
    background: rgba(0, 0, 0, 0.8);
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    will-change: transform;
  }

  .is-regularUser  .forPremium {
    display: none !important;
  }

  .futatsumeVideoPlayerDialog * {
    box-sizing: border-box;
  }

  .futatsumeVideoPlayerDialog.is-open {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .futatsumeVideoPlayerDialog li {
    text-align: left;
  }

  .futatsumeVideoPlayerDialogInner {
    background: #000;
    box-sizing: border-box;
    z-index: 1;
    box-shadow: 4px 4px 4px #000;
  }

  .futatsumePlayerContainer {
    position: relative;
    background: #000;
    width: 672px;
    height: 384px;
    background-size: cover;
    background-repeat: no-repeat;
    background-position: center center;
  }
  .futatsumePlayerContainer.is-loading {
    cursor: wait;
  }
  .futatsumePlayerContainer:not(.is-loading):not(.is-error) {
    background-image: none !important;
    background: none !important;
  }
  .futatsumePlayerContainer.is-loading .videoPlayer,
  .futatsumePlayerContainer.is-loading .commentLayerFrame,
  .futatsumePlayerContainer.is-error .videoPlayer,
  .futatsumePlayerContainer.is-error .commentLayerFrame {
    display: none;
  }

  .futatsumePlayerContainer .videoPlayer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    right: 0;
    bottom: 0;
    height: 100%;
    border: 0;
    z-index: 100;
    background: #000;
    will-change: transform, opacity;
    user-select: none;
  }

  .is-mouseMoving .videoPlayer>* {
    cursor: auto;
  }

  .is-loading .videoPlayer>* {
    cursor: wait;
  }

  .futatsumePlayerContainer .commentLayerFrame {
    position: absolute;
    border: 0;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    z-index: 101;
    pointer-events: none;
    cursor: none;
    user-select: none;
    opacity: var(--futatsume-comment-layer-opacity);
  }

  .loadingMessageContainer {
    display: none;
    pointer-events: none;
  }
  .futatsumePlayerContainer.is-loading .loadingMessageContainer {
    display: inline-block;
    position: absolute;
    z-index: 10000;
    right: 8px;
    bottom: 8px;
    font-size: 24px;
    color: var(--base-fore-color);
    text-shadow: 0 0 8px #003;
    font-family: serif;
    letter-spacing: 2px;
  }

  @keyframes spin {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(-1800deg); }
  }

  .futatsumePlayerContainer.is-loading .loadingMessageContainer::before,
  .futatsumePlayerContainer.is-loading .loadingMessageContainer::after {
    display: inline-block;
    text-align: center;
    content: '${'\\00272A'}';
    font-size: 18px;
    line-height: 24px;
    animation-name: spin;
    animation-iteration-count: infinite;
    animation-duration: 5s;
    animation-timing-function: linear;
  }
  .futatsumePlayerContainer.is-loading .loadingMessageContainer::after {
    animation-direction: reverse;
  }

  .errorMessageContainer {
    display: none;
    pointer-events: none;
    user-select: none;
  }

  .futatsumePlayerContainer.is-error .errorMessageContainer {
    display: inline-block;
    position: absolute;
    z-index: 10000;
    top: 50%;
    left: 50%;
    padding: 8px 16px;
    transform: translate(-50%, -50%);
    background: rgba(255, 0, 0, 0.9);
    font-size: 24px;
    box-shadow: 8px 8px 4px rgba(128, 0, 0, 0.8);
    white-space: nowrap;
  }
  .errorMessageContainer:empty {
    display: none !important;
  }

  .popupMessageContainer {
    top: 50px;
    left: 50px;
    z-index: 25000;
    position: absolute;
    pointer-events: none;
    transform: translateZ(0);
    user-select: none;
  }


  @media screen {
    /* 右パネル分の幅がある時は右パネルを出す */
    @media (min-width: 992px) {
      .futatsumeScreenMode_normal .futatsumeVideoPlayerDialogInner {
        padding-right: ${CONSTANT.RIGHT_PANEL_WIDTH}px;
        background: none;
      }
    }

    @media (min-width: 1216px) {
      .futatsumeScreenMode_big .futatsumeVideoPlayerDialogInner {
        padding-right: ${CONSTANT.RIGHT_PANEL_WIDTH}px;
        background: none;
      }
    }

    /* 縦長モニター */
    @media
      (max-width: 991px) and (min-height: 700px)
    {
      .futatsumeScreenMode_normal .futatsumeVideoPlayerDialogInner {
        padding-bottom: 240px;
        background: none;
      }
    }

    @media
      (max-width: 1215px) and (min-height: 700px)
    {
      .futatsumeScreenMode_big .futatsumeVideoPlayerDialogInner {
        padding-bottom: 240px;
        background: none;
      }
    }

    /* 960x540 */
    @media
      (min-width: 1328px) and (min-height: 700px)
    {
      .futatsumeScreenMode_big .futatsumePlayerContainer {
        width: calc(960px * 1.05);
        height: 540px;
      }
    }

    /* 1152x648 */
    @media
      (min-width: 1530px) and (min-height: 900px)
    {
      .futatsumeScreenMode_big .futatsumePlayerContainer {
        width: calc(1152px * 1.05);
        height: 648px;
      }
    }

    /* 1280x720 */
    @media
      (min-width: 1664px) and (min-height: 900px)
    {
      .futatsumeScreenMode_big .futatsumePlayerContainer {
        width: calc(1280px * 1.05);
        height: 720px;
      }
    }

    /* 1920x1080 */
    @media
      (min-width: 2336px) and (min-height: 1200px)
    {
      .futatsumeScreenMode_big .futatsumePlayerContainer {
        width: calc(1920px * 1.05);
        height: 1080px;
      }
    }

    /* 2560x1440 */
    @media
      (min-width: 2976px) and (min-height: 1660px)
    {
      .futatsumeScreenMode_big .futatsumePlayerContainer {
        width: calc(2560px * 1.05);
        height: 1440px;
      }
    }
  }

  `.trim();

NicoVideoPlayerDialogView.__tpl__ = `
    <div id="futatsumeVideoPlayerDialog" class="futatsumeVideoPlayerDialog futatsume-family futatsume-root">
      <div class="futatsumeVideoPlayerDialogInner">
        <div class="menuContainer"></div>
        <div class="futatsumePlayerContainer">

          <div class="popupMessageContainer"></div>
          <div class="errorMessageContainer"></div>
          <div class="loadingMessageContainer">動画読込中</div>
        </div>
      </div>
    </div>
  `.trim();
/**
 * TODO: 分割 まにあわなくなっても知らんぞー
 */
class NicoVideoPlayerDialog extends Emitter {
  private readonly commentPosts = new CommentPostSession();
  private readonly videoRecovery = new VideoRecoveryTasks();
  declare private _playerConfig: DialogPlayerConfig;
  declare private _state: PlayerState;
  declare private _keyEmitter: DialogKeyEmitter;
  declare private _id: string;
  declare private _escBlockExpiredAt: number;
  declare private _videoFilter: VideoFilter;
  declare private _view: NicoVideoPlayerDialogView;
  declare private _$playerContainer: Uq;
  declare private _nicoVideoPlayer: NicoVideoPlayer;
  declare threadLoader: typeof ThreadLoader;
  declare private _videoInfo: DialogVideoInfo;
  declare private _videoSession: VideoSessionWorkerSession | undefined;
  declare private _playlist: PlayList;
  declare private _commentPanel: CommentPanel;
  declare private _mylistApiLoader: typeof MylistApiLoader | undefined;
  declare private _watchId: string;
  declare private _videoWatchOptions: VideoWatchOptions;
  declare private _requestId: string;
  declare private _lastCurrentTime: number;
  declare private _lastOpenAt: number;
  private reloadPlayback: boolean | undefined;
  private commentRequestSequence = 0;
  declare private _nextVideo: unknown;
  declare private _threadInfo: unknown;
  constructor(params: NicoVideoPlayerDialogParams) {
    super();
    this.initialize(params);
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

    this._videoFilter = new VideoFilter(
      this._playerConfig.props.videoOwnerFilter,
      this._playerConfig.props.videoTagFilter
    );

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
    if (this._nicoVideoPlayer) {
      return this._nicoVideoPlayer;
    }
    await this._view.promise('dom-ready');
    if (this._nicoVideoPlayer) return this._nicoVideoPlayer;
    const config = this._playerConfig;
    const nicoVideoPlayer = (this._nicoVideoPlayer = new NicoVideoPlayer({
      node: this._$playerContainer,
      playerConfig: config,
      playerState: this._state,
      volume: Math.max(config.props.volume, 0),
      loop: config.props.loop,
    } as unknown as ConstructorParameters<typeof NicoVideoPlayer>[0]));

    this.threadLoader = ThreadLoader;

    nicoVideoPlayer.on('loadedMetaData', this._onLoadedMetaData.bind(this));
    nicoVideoPlayer.on('ended', this._onVideoEnded.bind(this));
    nicoVideoPlayer.on('canPlay', this._onVideoCanPlay.bind(this));
    nicoVideoPlayer.on('play', this._onVideoPlay.bind(this));
    nicoVideoPlayer.on('pause', this._onVideoPause.bind(this));
    nicoVideoPlayer.on('playing', this._onVideoPlaying.bind(this));
    nicoVideoPlayer.on('seeking', this._onVideoSeeking.bind(this));
    nicoVideoPlayer.on('seeked', this._onVideoSeeked.bind(this));
    nicoVideoPlayer.on('stalled', this._onVideoStalled.bind(this));
    nicoVideoPlayer.on('waiting', this._onVideoStalled.bind(this));
    nicoVideoPlayer.on('timeupdate', this._onVideoTimeUpdate.bind(this));
    nicoVideoPlayer.on('progress', this._onVideoProgress.bind(this));
    nicoVideoPlayer.on('aspectRatioFix', this._onVideoAspectRatioFix.bind(this) as EmitterCallback);
    nicoVideoPlayer.on('commentParsed', this._onCommentParsed.bind(this));
    nicoVideoPlayer.on('commentChange', this._onCommentChange.bind(this));
    nicoVideoPlayer.on('commentFilterChange', this._onCommentFilterChange.bind(this) as EmitterCallback);
    nicoVideoPlayer.on('videoPlayerTypeChange', this._onVideoPlayerTypeChange.bind(this) as EmitterCallback);

    nicoVideoPlayer.on('error', this._onVideoError.bind(this) as EmitterCallback);
    nicoVideoPlayer.on('abort', this._onVideoAbort.bind(this));

    nicoVideoPlayer.on('volumeChange', this._onVolumeChange.bind(this));
    nicoVideoPlayer.on('volumeChange', _.debounce(this._onVolumeChangeEnd.bind(this), 1500));
    nicoVideoPlayer.on('command', this._onCommand.bind(this) as EmitterCallback);

    void this.emitResolve('nicovideo-player-ready');
    return nicoVideoPlayer;
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
      case 'mylistSelect':
        void openMylistPicker(param as string);
        break;
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
        this._nicoVideoPlayer.filter.wordFilterList = this._playerConfig.props.wordFilter;
        (this._nicoVideoPlayer.filter.addWordFilter as (word: unknown) => void)(param);
        this._playerConfig.setValue('wordFilter', this._nicoVideoPlayer.filter.wordFilterList);
        break;
      case 'setWordRegFilter':
      case 'setWordRegFilterFlags':
        this._playerConfig.setValue(command === 'setWordRegFilter' ? 'wordRegFilter' : 'wordRegFilterFlags', param);
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
      case 'setWordFilterList':
        this._playerConfig.setValue('wordFilter', param);
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
      case 'nextVideo':
        this._nextVideo = param;
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
      case 'update-commentLanguage':
        if (this._playerConfig.props.commentLanguage === param) {
          break;
        }
        this._playerConfig.props.commentLanguage = param as string;
        this.reloadComment();
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
    if (!this._nicoVideoPlayer) {
      return;
    }
    const np = this._nicoVideoPlayer,
      filter = np.filter;
    switch (key) {
      case 'enableFilter':
        filter.isEnable = value;
        break;
      case 'wordFilter':
        filter.wordFilterList = value;
        break;
      case 'userIdFilter':
        filter.userIdFilterList = value;
        break;
      case 'commandFilter':
        filter.commandFilterList = value;
        break;
      case 'wordRegFilter':
      case 'wordRegFilterFlags':
        (filter.setWordRegFilter as (source: string, flags: string) => void)(
          String(this._playerConfig.props.wordRegFilter || ''),
          String(this._playerConfig.props.wordRegFilterFlags || '')
        );
        break;
      case 'filter.fork0':
      case 'filter.fork1':
      case 'filter.fork2':
      case 'filter.fork3':
      case 'filter.defaultThread':
      case 'filter.ownerThread':
      case 'filter.communityThread':
      case 'filter.nicosThread':
      case 'filter.easyThread':
      case 'filter.aiThread':
      case 'filter.extraDefaultThread':
      case 'filter.extraOwnerThread':
      case 'filter.extraCommunityThread':
      case 'filter.extraNicosThread':
      case 'filter.extraEasyThread':
      case 'removeNgMatchedUser':
        filter[key.replace(/^.*\./, '')] = value;
        break;
    }
  }
  _updateScreenMode(mode: string): void {
    this.emit('screenModeChange', mode);
  }
  _onPlaylistAppend(watchId: string): void {
    void this._playlist.append(watchId);
  }
  _onPlaylistInsert(watchId: string): void {
    void this._playlist.insert(watchId);
  }
  private _onPlaylistLoadFail(error: unknown, fallback: string): void {
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') return;
    const message =
      typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
        ? error.message
        : fallback;
    this.execCommand('alert', message);
  }
  _onPlaylistSetMylist(id: string): void {
    const option: { watchId: string; insert?: boolean } = { watchId: this._watchId };
    // 通常時はプレイリストの置き換え、
    // 連続再生中はプレイリストに追加で読み込む
    option.insert = this._playlist.isEnable;

    this._playlist.load({ type: 'mylist', id }, option, this._videoInfo.msgInfo).then(
      (result: { message?: unknown }) => {
        this.execCommand('notify', result.message);
        this._state.currentTab = 'playlist';
        this._playlist.insertCurrentVideo(this._videoInfo);
      },
      (error: unknown) => this._onPlaylistLoadFail(error, 'マイリストのロード失敗')
    );
  }
  _onPlaylistSetUploadedVideo(id: string): void {
    const option: { watchId: string; insert?: boolean } = { watchId: this._watchId };
    // 通常時はプレイリストの置き換え、
    // 連続再生中はプレイリストに追加で読み込む
    option.insert = this._playlist.isEnable;

    this._playlist.load({ type: 'user-uploaded', id }, option, this._videoInfo.msgInfo).then(
      (result: { message?: unknown }) => {
        this.execCommand('notify', result.message);
        this._state.currentTab = 'playlist';
        this._playlist.insertCurrentVideo(this._videoInfo);
      },
      (error: unknown) => this._onPlaylistLoadFail(error, '投稿動画一覧のロード失敗')
    );
  }
  _onPlaylistSetSearchVideo(params: { option?: Record<string, unknown>; word?: string }): void {
    let option: Record<string, unknown> = Object.assign({ watchId: this._watchId }, params.option || {});
    const word = params.word;
    // 通常時はプレイリストの置き換え、
    // 連続再生中はプレイリストに追加で読み込む
    option.insert = this._playlist.isEnable;

    if (option.owner) {
      const ownerId = parseInt(this._videoInfo.owner.id, 10);
      if (this._videoInfo.isChannel) {
        option.channelId = ownerId;
      } else {
        option.userId = ownerId;
      }
    }
    delete option.owner;

    const query = this._videoWatchOptions.query;
    option = Object.assign(option, query);

    this._state.currentTab = 'playlist';
    this._playlist.loadSearchVideo(word as string, option).then(
      (result) => {
        this.execCommand('notify', result.message);
        this._playlist.insertCurrentVideo(this._videoInfo);
        void global.emitter.emitAsync('searchVideo', { word, option });
        window.setTimeout(() => this._playlist.scrollToActiveItem(), 1000);
      },
      (err: unknown) => {
        this._onPlaylistLoadFail(err, '検索失敗または該当無し: 「' + (word as string) + '」');
      }
    );
  }
  _onPlaylistSetSeriesVideo(id: string): void {
    const option: { watchId: string; insert?: boolean } = { watchId: this._watchId };
    option.insert = this._playlist.isEnable;
    this._state.currentTab = 'playlist';
    this._playlist.load({ type: 'series', id }, option, this._videoInfo.msgInfo).then(
      (result: { message?: unknown }) => {
        this.execCommand('notify', result.message);
        this._playlist.insertCurrentVideo(this._videoInfo);
        window.setTimeout(() => this._playlist.scrollToActiveItem(), 1000);
      },
      (error: unknown) => this._onPlaylistLoadFail(error, `シリーズリストの取得に失敗: series/${id}`)
    );
  }
  _onPlaylistStatusUpdate(): void {
    const playlist = this._playlist;
    this._playerConfig.setValue('playlistLoop', playlist.isLoop);
    this._state.isPlaylistEnable = playlist.isEnable;
    if (playlist.isEnable) {
      this._playerConfig.setValue('loop', false);
    }
    this._view.blinkTab('playlist');
  }
  _onCommentPanelStatusUpdate(): void {
    const commentPanel = this._commentPanel;
    this._playerConfig.setValue('enableCommentPanelAutoScroll', commentPanel.isAutoScroll);
  }
  _onDeflistAdd(watchId: string): void {
    if (this._state.isUpdatingDeflist || !(util as unknown as DialogUtilView).isLogin()) {
      return;
    }
    const unlock = (): void => {
      this._state.isUpdatingDeflist = false;
    };
    this._state.isUpdatingDeflist = true;
    let timer = window.setTimeout(unlock, 10000);

    watchId = watchId || this._videoInfo.watchId;
    let description = '';
    if (!this._mylistApiLoader) {
      this._mylistApiLoader = MylistApiLoader;
    }
    const { enableAutoMylistComment } = this._playerConfig.props;
    void (() => {
      if (watchId === this._watchId || !enableAutoMylistComment) {
        return Promise.resolve(this._videoInfo);
      }
      return ThumbInfoLoader.load(watchId);
    })()
      .then((info) => {
        const thumbInfo = info as DialogVideoInfo | ThumbInfoOk;
        const originalVideoId = thumbInfo.originalVideoId ? `元動画: ${thumbInfo.originalVideoId}` : '';
        description = enableAutoMylistComment
          ? `投稿者: ${thumbInfo.owner!.name} ${thumbInfo.owner!.linkId} ${originalVideoId}`
          : '';
      })
      .then(() => this._mylistApiLoader!.addDeflistItem(watchId, description))
      .then((result) => this.execCommand('notify', (result as { message?: unknown }).message))
      .catch((err: unknown) =>
        this.execCommand('alert', (err as { message?: unknown }).message || 'とりあえずマイリストに登録失敗')
      )
      .then(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(unlock, 2000);
      });
  }
  _onDeflistRemove(watchId: string): void {
    if (this._state.isUpdatingDeflist || !(util as unknown as DialogUtilView).isLogin()) {
      return;
    }
    const unlock = (): void => {
      this._state.isUpdatingDeflist = false;
    };
    this._state.isUpdatingDeflist = true;
    let timer = window.setTimeout(unlock, 10000);

    watchId = watchId || this._videoInfo.watchId;
    if (!this._mylistApiLoader) {
      this._mylistApiLoader = MylistApiLoader;
    }

    void this._mylistApiLoader
      .removeDeflistItem(watchId)
      .then((result) => this.execCommand('notify', (result as { message?: unknown }).message))
      .catch((err: unknown) => this.execCommand('alert', (err as { message?: unknown }).message))
      .then(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(unlock, 2000);
      });
  }
  _onToggleLike(): void {
    if (!(util as unknown as DialogUtilView).isLogin()) {
      return;
    }
    const videoId = this._videoInfo.videoId;
    const isLiked = this._videoInfo.isLiked;
    (isLiked ? LikeApi.unlike(videoId) : LikeApi.like(videoId))
      .then((result) => {
        const data = (result as { data?: { thanksMessage?: unknown } }).data;
        const message = (data ? data.thanksMessage || '' : '') as string;
        if (message) {
          this.execCommand('notify', `${message}`);
        } else {
          this.execCommand('notify', isLiked ? '(･A･)ﾉｼ' : '(･∀･)ｨｨﾈ!!');
        }
        this._state.isLiked = this._videoInfo.isLiked = !isLiked;
      })
      .catch((err) => {
        console.warn(err);
        this.execCommand('alert', 'いいね！できなかった');
      });
  }
  _onMylistAdd(groupId: string, mylistName: string): void {
    if (this._state.isUpdatingMylist || !(util as unknown as DialogUtilView).isLogin()) {
      return;
    }

    const unlock = (): void => {
      this._state.isUpdatingMylist = false;
    };

    this._state.isUpdatingMylist = true;
    let timer = window.setTimeout(unlock, 10000);

    const owner = this._videoInfo.owner;
    const originalVideoId = this._videoInfo.originalVideoId ? `元動画: ${this._videoInfo.originalVideoId}` : '';
    const watchId = this._videoInfo.watchId;
    const description = this._playerConfig.getValue('enableAutoMylistComment')
      ? `投稿者: ${owner.name} ${owner.linkId} ${originalVideoId}`
      : '';
    if (!this._mylistApiLoader) {
      this._mylistApiLoader = MylistApiLoader;
    }

    void this._mylistApiLoader
      .addMylistItem(watchId, groupId, description)
      .then((result) =>
        this.execCommand('notify', `${(result as { message?: unknown }).message as string}: ${mylistName}`)
      )
      .catch((err: unknown) =>
        this.execCommand('alert', `${(err as { message?: unknown }).message as string}: ${mylistName}`)
      )
      .then(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(unlock, 2000);
      });
  }
  _onMylistRemove(groupId: string, mylistName: string): void {
    if (this._state.isUpdatingMylist || !(util as unknown as DialogUtilView).isLogin()) {
      return;
    }

    const unlock = (): void => {
      this._state.isUpdatingMylist = false;
    };

    this._state.isUpdatingMylist = true;
    let timer = window.setTimeout(unlock, 10000);

    const watchId = this._videoInfo.watchId;

    if (!this._mylistApiLoader) {
      this._mylistApiLoader = MylistApiLoader;
    }

    void this._mylistApiLoader
      .removeMylistItem(watchId, groupId)
      .then((result) =>
        this.execCommand('notify', `${(result as { message?: unknown }).message as string}: ${mylistName}`)
      )
      .catch((err: unknown) =>
        this.execCommand('alert', `${(err as { message?: unknown }).message as string}: ${mylistName}`)
      )
      .then(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(unlock, 2000);
      });
  }
  _onCommentParsed(): void {
    const lang = this._playerConfig.getValue('commentLanguage');
    this.emit('commentParsed', lang, this._threadInfo);
    global.emitter.emit('commentParsed');
  }
  _onCommentChange(): void {
    const lang = this._playerConfig.getValue('commentLanguage');
    this.emit('commentChange', lang, this._threadInfo);
    global.emitter.emit('commentChange');
  }
  _onCommentFilterChange(filter: {
    isEnable: unknown;
    wordFilterList: unknown;
    userIdFilterList: unknown;
    commandFilterList: unknown;
  }): void {
    // This notification is debounced. Writing every model field back here can
    // overwrite newer form edits before their config update reaches the model.
    // Settings are persisted at their explicit UI/command entry points instead.
    this.emit('commentFilterChange', filter);
  }
  _onVideoPlayerTypeChange(type = ''): void {
    switch (type.toLowerCase()) {
      case 'youtube':
        this._state.setState({ isYouTube: true });
        break;
      default:
        this._state.setState({ isYouTube: false });
    }
  }
  _onNicosSeek(time: number): void {
    const ct = this.currentTime;
    if (this.isPlaylistEnable) {
      // 連続再生中は後方へのシークのみ有効にする
      if (ct < time) {
        this.execCommand('fastSeek', time);
      }
    } else {
      this.execCommand('fastSeek', time);
    }
  }
  show(): void {
    this._state.isOpen = true;
  }
  hide(): void {
    this._state.isOpen = false;
  }
  async open(watchId: string, options?: VideoWatchOptionBag, reload = false): Promise<void> {
    if (!watchId) {
      return;
    }
    // 連打対策
    if (!reload && this.isOpen && Date.now() - this._lastOpenAt < 1500 && this._watchId === watchId) {
      return;
    }

    this.refreshLastPlayerId();
    if (!reload) this.reloadPlayback = undefined;
    const videoWatchOptions = (this._videoWatchOptions = new VideoWatchOptions(watchId, options, this._playerConfig));

    if (
      !videoWatchOptions.isPlaylistStartRequest &&
      this.isPlaying &&
      this.isPlaylistEnable &&
      !videoWatchOptions.isOpenNow
    ) {
      this._onPlaylistInsert(watchId);
      return;
    }

    const requestId = (this._requestId = 'play-' + Math.random());
    this.videoRecovery.reset();
    this.commentPosts.reset();
    nicoUtil.beginWatchViewer(requestId);
    this._view.updateViewer();

    let nicoVideoPlayer = this._nicoVideoPlayer;
    if (!nicoVideoPlayer) {
      nicoVideoPlayer = await this._initializeNicoVideoPlayer();
      if (this._requestId !== requestId) return;
    } else {
      if (this._videoInfo) {
        this._savePlaybackPosition(this._videoInfo.contextWatchId, this.currentTime);
      }
      nicoVideoPlayer.close();
      this._view.clearPanel();
      this.emit('beforeVideoOpen');
      if (this._videoSession) {
        this._videoSession.close();
      }
    }

    // A cancelled quality reload must not pass its one-shot pause to another video.
    if (!reload) nicoVideoPlayer.setNextAutoPlay(undefined);
    this._state.resetVideoLoadingStatus();

    this._state.isCommentReady = false;
    this._watchId = watchId;
    this._lastCurrentTime = 0;
    this._lastOpenAt = Date.now();
    this._state.isError = false;

    Promise.all([
      VideoInfoLoader.load(watchId, videoWatchOptions.videoLoadOptions),
      WatchInfoCacheDb.get(this._watchId),
      this._initializePlaylist(), //videoinfo取得に300msくらいかかってるぽいから他のことやろうか
    ])
      .then(this._onVideoInfoLoaderLoad.bind(this, requestId))
      .catch(this._onVideoInfoLoaderFail.bind(this, requestId));

    this.show();
    if (this._playerConfig.getValue('autoFullScreen') && !(util as unknown as DialogUtilView).fullscreen.now()) {
      nicoVideoPlayer.requestFullScreen();
    }
    this.emit('open', watchId, options);
    void global.emitter.emitAsync('DialogPlayerOpen', watchId, options);
    void global.emitter.emitResolve('firstPlayerOpen');
  }
  get isOpen(): boolean {
    return this._state.isOpen;
  }
  reload(options?: VideoWatchOptionBag): void {
    const reloadOptions = this._videoWatchOptions.createForReload(options);
    this.reloadPlayback =
      this._state.isLoading && this.reloadPlayback !== undefined ? this.reloadPlayback : !this._nicoVideoPlayer.paused;
    this._nicoVideoPlayer.setNextAutoPlay(this.reloadPlayback);

    if (this._lastCurrentTime > 0) {
      reloadOptions.currentTime = this._lastCurrentTime;
    }
    void this.open(this._watchId, reloadOptions, true);
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
    if (this.isLastOpenedPlayer) {
      return;
    }
    this._playerConfig.props.lastPlayerId = '';
    this._playerConfig.props.lastPlayerId = this.id;
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

    if (this._videoFilter.isNgVideo(videoInfo)) {
      return this._onVideoFilterMatch();
    }

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
    msgInfo.language = this._playerConfig.props.commentLanguage;
    this._playerConfig.props.commentLanguage = msgInfo.language;
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
  _onVideoFilterMatch(): void {
    window.console.error('ng video', this._watchId);
    this._setErrorMessage('再生除外対象の動画または投稿者です');
    this._state.isError = true;
    this.emit('error');
    if (this.isPlaylistEnable) {
      this.videoRecovery.schedule(() => {
        if (this.isOpen) this.playNextVideo();
      });
    }
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
    if (!this.isOpen || !this._requestId) return;
    // YouTubeは動画指定時にパラメータで開始位置を渡すので不要
    if (this._state.isYouTube) {
      return;
    }

    // パラメータで開始秒数が指定されていたらそこにシーク
    const currentTime = this._videoWatchOptions.currentTime;
    if (currentTime > 0) {
      this.currentTime = currentTime;
    }
  }
  async _onVideoCanPlay(): Promise<void> {
    if (!this._state.isLoading) {
      return;
    }
    this._playerConfig.props.lastWatchId = this._watchId;
    void WatchInfoCacheDb.put(this._watchId, { watchCount: 1 });

    await this.promise('playlist-ready');

    if (this._videoWatchOptions.isPlaylistStartRequest) {
      const option = this._videoWatchOptions.mylistLoadOptions;
      const query = this._videoWatchOptions.query;

      // 通常時はプレイリストの置き換え、
      // 連続再生中はプレイリストに追加で読み込む
      option.append = this.isPlaying && this._playlist.isEnable;

      // //www.nicovideo.jp/watch/sm20353707 // プレイリスト開幕用動画

      option.limit = this._playerConfig.props['search.limit'];

      void this._playlist.load(query.playlist as PlaylistDescriptor, option, this._videoInfo.msgInfo);
      this._playlist.toggleEnable(true);
    }
    // チャンネル動画は、1本の動画がwatchId表記とvideoId表記で2本登録されてしまう。
    // そこでwatchId表記のほうを除去する
    this._playlist.insertCurrentVideo(this._videoInfo);
    if (this._videoInfo.watchId !== this._videoInfo.videoId && this._videoInfo.videoId.startsWith('so')) {
      this._playlist.removeItemByWatchId(this._videoInfo.watchId);
    }

    this._state.setVideoCanPlay();
    this.emitAsync('canPlay', this._watchId, this._videoInfo, this._videoWatchOptions);
    void this.emitResolve('firstVideoCanPlay', this._watchId, this._videoInfo, this._videoWatchOptions);

    // プレイリストによって開かれた時は、自動再生設定に関係なく再生する
    if (this._videoWatchOptions.eventType === 'playlist' && this.isOpen) {
      this.play();
    }
    if (this._nextVideo) {
      const nextVideo = this._nextVideo as string;
      this._nextVideo = null;
      if (this._playerConfig.props.enableNicosJumpVideo) {
        const nv = this._playlist.findByWatchId(nextVideo) as unknown as { isPlayed(): boolean } | undefined;
        if (nv && nv.isPlayed()) {
          return;
        } // 既にリストにあって再生済みなら追加しない(無限ループ対策)
        this.execCommand('notify', `@ジャンプ: ${nextVideo}`);
        this.execCommand('playlistInsert', nextVideo);
      }
    }
  }
  _onVideoPlay(): void {
    this._state.setPlaying();
    MediaSessionApi.updatePositionStateByMedia(this as unknown as HTMLMediaElement);
    this.emit('play');
  }
  _onVideoPlaying(): void {
    this._state.setPlaying();
    this.emit('playing');
  }
  _onVideoSeeking(): void {
    this._state.isSeeking = true;
    this.emit('seeking');
  }
  _onVideoSeeked(): void {
    this._state.isSeeking = false;
    MediaSessionApi.updatePositionStateByMedia(this as unknown as HTMLMediaElement);
    this.emit('seeked');
  }
  _onVideoPause(): void {
    this._state.setPausing();
    this._savePlaybackPosition(this._videoInfo.contextWatchId, this.currentTime);
    this.emit('pause');
  }
  _onVideoStalled(): void {
    this._state.isStalled = true;
    this.emit('stalled');
  }
  _onVideoTimeUpdate(): void {
    this._state.isStalled = false;
  }
  _onVideoProgress(range: unknown, currentTime: unknown): void {
    this.emit('progress', range, currentTime);
  }
  async _onVideoError(e: DialogVideoError): Promise<void> {
    if (!this.isOpen) return;
    const requestId = this._requestId;
    this._state.setVideoErrorOccurred();
    if (e.type === 'youtube') {
      return this._onYouTubeVideoError(e);
    }
    if (!this._videoInfo) {
      this._setErrorMessage('動画の再生に失敗しました。');
      return;
    }

    const retry = (params?: VideoWatchOptionBag): void => {
      this.videoRecovery.schedule(() => {
        if (!this.isOpen) {
          return;
        }
        this.reload(params);
      });
    };

    const session = this._videoSession;
    if (!session) {
      this._setErrorMessage('動画の接続状態を取得できませんでした');
      return;
    }
    let sessionState: Awaited<ReturnType<VideoSessionWorkerSession['getState']>> | undefined;
    try {
      sessionState = await this.videoRecovery.read(() => session.getState());
    } catch (error) {
      if (this._requestId !== requestId || !this.isOpen || this._videoSession !== session) return;
      this._setErrorMessage('動画の接続状態を取得できませんでした');
      this.emit('error', error);
      return;
    }
    if (!sessionState || this._requestId !== requestId || !this.isOpen || this._videoSession !== session) return;
    const { isDeleted, isAbnormallyClosed } = sessionState;
    const videoWatchOptions = this._videoWatchOptions;
    const code = (e && e.target && e.target.error && e.target.error.code) || 0;
    window.console.error('VideoError!', code, e, e.target && e.target.error, { isDeleted, isAbnormallyClosed });

    if (Date.now() - this._lastOpenAt > 3 * 60 * 1000 && isDeleted && !isAbnormallyClosed) {
      if ((videoWatchOptions.reloadCount as number) < 5) {
        retry();
      } else {
        this._setErrorMessage('動画のセッションが切断されました。');
      }
    } else {
      this._setErrorMessage('動画の再生に失敗しました。');
    }

    this.emit('error', e, code);
  }
  _onYouTubeVideoError(e: DialogVideoError): void {
    if (!this.isOpen) return;
    window.console.error('onYouTubeVideoError!', e);
    this._setErrorMessage(e.description);
    this.emit('error', e);
    if (e.fallback) {
      this.videoRecovery.schedule(() => {
        if (this.isOpen) this.reload({ isAutoFutatsumeTubeDisabled: true });
      });
    }
  }
  _onVideoAbort() {
    this.emit('abort');
  }
  _onVideoAspectRatioFix(ratio: number): void {
    this.emit('aspectRatioFix', ratio);
  }
  _onVideoEnded() {
    if (this._view.repeatOnEnded()) return;
    // ループ再生中は飛んでこない
    this.emitAsync('ended');
    this._state.setVideoEnded();
    this._savePlaybackPosition(this._videoInfo.contextWatchId, 0);
    if (this.isPlaylistEnable && this._playlist.hasNext) {
      this.playNextVideo({ eventType: 'playlist' });
      return;
    } else if (this._playlist) {
      this._playlist.toggleEnable(false);
    }

    const isAutoCloseFullScreen = this._videoWatchOptions.hasKey('autoCloseFullScreen')
      ? this._videoWatchOptions.isAutoCloseFullScreen
      : this._playerConfig.getValue('autoCloseFullScreen');
    if (Fullscreen.now() && isAutoCloseFullScreen) {
      Fullscreen.cancel();
    }
    void global.emitter.emitAsync('videoEnded');
  }
  _onVolumeChange(vol: unknown, mute: unknown): void {
    this.emit('volumeChange', vol, mute);
  }
  _onVolumeChangeEnd(vol: unknown, mute: unknown): void {
    this.emit('volumeChangeEnd', vol, mute);
  }
  _savePlaybackPosition(contextWatchId: string, ct: number): void {
    if (!(util as unknown as DialogUtilView).isLogin()) {
      return;
    }
    const vi = this._videoInfo;
    if (!vi) {
      return;
    }
    const dr = this.duration;
    if (vi.contextWatchId !== contextWatchId) {
      return;
    }
    if (Math.abs(ct - dr) < 3) {
      return;
    }
    if (dr < 120) {
      return;
    } // 短い動画は記録しない
    PlaybackPosition.record(contextWatchId, ct, vi.msgInfo.frontendId, vi.msgInfo.frontendVersion).catch((e) => {
      window.console.warn('save playback fail', e);
    });
  }
  close(): void {
    closeMylistPicker();
    if (this.isPlaying) {
      this._savePlaybackPosition(this._watchId, this.currentTime);
    }
    void WatchInfoCacheDb.put(this._watchId, { currentTime: this.currentTime });
    if (Fullscreen.now()) {
      Fullscreen.cancel();
    }
    this.pause();
    this.hide();
    this._refresh();
    this.emit('close');
    void global.emitter.emitAsync('DialogPlayerClose');
  }
  _refresh(): void {
    nicoUtil.clearWatchViewer(this._requestId);
    this._view.updateViewer();
    this._requestId = '';
    this.commentRequestSequence++;
    this.videoRecovery.reset();
    this.commentPosts.reset();
    if (this._nicoVideoPlayer) {
      this._nicoVideoPlayer.close();
    }
    if (this._videoSession) {
      this._videoSession.close();
    }
  }
  // eslint-disable-next-line @typescript-eslint/require-await -- Promise.all へ渡すため Promise を返す契約を維持する
  async _initializePlaylist(): Promise<void> {
    if (this._playlist) {
      return;
    }
    const $container = this._view.appendTab('playlist', 'プレイリスト');
    this._playlist = new PlayList({
      loader: ThumbInfoLoader,
      container: $container[0],
      loop: this._playerConfig.props.playlistLoop,
    } as unknown as ConstructorParameters<typeof PlayList>[0]);
    this._playlist.on('command', this._onCommand.bind(this) as EmitterCallback);
    this._playlist.on('update', _.debounce(this._onPlaylistStatusUpdate.bind(this), 100));
    if (PlayListSession.isExist()) {
      this._playlist.restoreFromSession();
    }
    void this.emitResolve('playlist-ready');
  }
  _initializeCommentPanel(): void {
    if (this._commentPanel) {
      return;
    }
    const $container = this._view.appendTab('comment', 'コメント');
    this._commentPanel = new CommentPanel({
      player: this as unknown as NicoVideoPlayer,
      $container: $container,
      autoScroll: this._playerConfig.props.enableCommentPanelAutoScroll,
      language: this._playerConfig.props.commentLanguage,
    });
    this._commentPanel.on('command', this._onCommand.bind(this) as EmitterCallback);
    this._commentPanel.on('deleteChat', ((e: { resolve(): void; reject(error: Error): void }, chat: unknown) => {
      void this.removeChat(chat).then(
        () => e.resolve(),
        (error: unknown) => e.reject(error instanceof Error ? error : new Error('コメントを削除できませんでした。'))
      );
    }) as EmitterCallback);
    this._commentPanel.on('nicoruChat', ((
      e: { resolve(result: { count?: number }): void; reject(error: Error): void },
      chat: unknown
    ) => {
      void this.threadLoader
        .nicoru(this._videoInfo.msgInfo, chat as { no: number; fork?: number; text?: string; [key: string]: unknown })
        .then(
          (result) => e.resolve({ count: result.count }),
          (error: unknown) =>
            e.reject(
              error instanceof Error
                ? error
                : new Error(
                    typeof error === 'object' && error !== null && 'message' in error
                      ? String(error.message)
                      : 'ニコれませんでした。'
                  )
            )
        );
    }) as EmitterCallback);
    this._commentPanel.on('update', _.debounce(this._onCommentPanelStatusUpdate.bind(this), 100));
    void this.emitResolve('commentpanel-ready');
  }
  get isPlaylistEnable(): boolean {
    return !!this._playlist && this._playlist.isEnable;
  }
  playNextVideo(options?: VideoWatchOptionBag): void {
    if (!this._playlist || !this.isOpen) {
      return;
    }
    const opt = this._videoWatchOptions.createForVideoChange(options);

    const nextId = this._playlist.selectNext();
    if (nextId) {
      void this.open(nextId, opt);
    }
  }
  playPreviousVideo(options?: VideoWatchOptionBag): void {
    if (!this._playlist || !this.isOpen) {
      return;
    }
    const opt = this._videoWatchOptions.createForVideoChange(options);

    const prevId = this._playlist.selectPrevious();
    if (prevId) {
      void this.open(prevId, opt);
    }
  }
  play(): void {
    if (!this._state.isError && this._nicoVideoPlayer) {
      const requestId = this._requestId;
      this._nicoVideoPlayer.play().catch((e) => {
        if (this._requestId === requestId && this.isOpen) this._onVideoPlayStartFail(e);
      });
    }
  }
  pause(): void {
    if (!this._state.isError && this._nicoVideoPlayer) {
      void this._nicoVideoPlayer.pause();
      this._state.setPausing();
    }
  }
  get isPlaying(): boolean {
    return this._state.isPlaying;
  }
  get paused(): boolean {
    return this._nicoVideoPlayer ? this._nicoVideoPlayer.paused : true;
  }
  togglePlay(): void {
    if (!this._state.isError && this._nicoVideoPlayer) {
      if (this.isPlaying) {
        this.pause();
        return;
      }

      const requestId = this._requestId;
      this._nicoVideoPlayer.togglePlay().catch((e) => {
        if (this._requestId === requestId && this.isOpen) this._onVideoPlayStartFail(e);
      });
    }
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
    if (
      !this._nicoVideoPlayer ||
      !this.threadLoader ||
      !this._state.isCommentReady ||
      !this._state.isOpen ||
      this._state.isCommentPosting ||
      this._state.isWaybackMode ||
      this._state.isMymemory
    ) {
      throw new Error('現在はコメントを投稿できません');
    }
    if (!(util as unknown as DialogUtilView).isLogin()) throw new Error('コメント投稿にはログインが必要です');
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 75 ||
      (cmd !== undefined && typeof cmd !== 'string')
    ) {
      throw new Error('投稿するコメントとコマンドを確認してください');
    }
    const player = this._nicoVideoPlayer;
    const msgInfo = this._videoInfo.msgInfo;
    const watchId = this._watchId;
    const threadInfo = msgInfo.threadInfo;
    if (!threadInfo?.threadId) throw new Error('コメント投稿先を取得できませんでした');
    const command = normalizeCommentCommands(cmd ?? '', msgInfo.defaultThread?.isThreadkeyRequired === true);
    const position = typeof vpos === 'number' && Number.isFinite(vpos) ? vpos : player.vpos;
    const previewOptions = { ...options, isMine: true, isUpdating: true, thread: Number(threadInfo.threadId) };
    return this.commentPosts.post({
      createPreview: () => {
        const preview = player.addChat(text, command, position, previewOptions);
        if (!(preview instanceof NicoChat)) throw new Error('投稿プレビューを作成できませんでした');
        return preview;
      },
      removePreview: (preview) => player.removeChat(preview),
      send: (signal) => this.threadLoader.postChat(msgInfo, text, command, position, { signal }),
      setPosting: (value) => {
        this._state.isCommentPosting = value;
      },
      success: () => {
        this.execCommand('notify', 'コメント投稿成功');
        void WatchInfoCacheDb.put(watchId, {
          comment: { text, cmd: command, vpos: position, options: previewOptions },
        });
      },
      failure: (error) => {
        this.execCommand('alert', error.message);
      },
    });
  }
  removeChat(chat: unknown): Promise<void> {
    if (!this._nicoVideoPlayer || !this.threadLoader || !this._state.isCommentReady) {
      return Promise.reject(new Error('コメントの準備ができていません。再読み込みしてから試してください。'));
    }
    if (!(util as unknown as DialogUtilView).isLogin()) {
      return Promise.reject(new Error('ログインしてから再試行してください。'));
    }

    const msgInfo = this._videoInfo.msgInfo;
    return this.threadLoader
      .deleteChat(msgInfo, chat as { no: number; fork?: number; text?: string; [key: string]: unknown })
      .then(() => {
        this.execCommand('notify', 'コメント削除成功');
        this._nicoVideoPlayer.removeChat(chat);
      })
      .catch((err: unknown) => {
        err = err || {};
        throw new Error(
          typeof err === 'object' && err !== null && 'message' in err
            ? String(err.message)
            : 'コメントを削除できませんでした。'
        );
      });
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
    return this.id;
  }
  getDuration(): number {
    return this.duration;
  }
  getBufferedRange(): unknown {
    return this.bufferedRange;
  }
  getNonFilteredChatList(): unknown {
    return this.nonFilteredChatList;
  }
  getChatList(): unknown {
    return this.chatList;
  }
  getPlayingStatus(): Record<string, unknown> {
    return this.playingStatus;
  }
  getMymemory(): unknown {
    return this._nicoVideoPlayer.getMymemory();
  }
}

class VideoHoverMenu {
  declare private _container: Element;
  declare private _state: PlayerState;
  declare private _bound: Record<string, _.DebouncedFunc<() => unknown>>;
  declare private _view: Element;
  declare private _mylistApiLoader: typeof MylistApiLoader | undefined;
  declare private _mylistList: Array<Record<string, unknown>> | undefined;
  declare static __tpl__: string;
  constructor(params: VideoHoverMenuParams) {
    this.initialize(params);
  }
  initialize(params: VideoHoverMenuParams): void {
    this._container = params.playerContainer;
    this._state = params.playerState;

    this._bound = {};
    this._bound.emitClose = _.debounce(
      () => (util as unknown as DialogUtilView).dispatchCommand(this._container, 'close'),
      300
    );

    void this._initializeDom();
  }
  async _initializeDom(): Promise<void> {
    const container = this._container;
    (util as unknown as DialogUtilView).$.html(VideoHoverMenu.__tpl__).appendTo(container);
    this._view = container.querySelector('.hoverMenuContainer') as Element;

    const $mc = (util as unknown as DialogUtilView).$(container.querySelectorAll('.menuItemContainer'));
    $mc.on('contextmenu', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    });
    $mc.on('click', this._onClick.bind(this));
    $mc.on('mousedown', this._onMouseDown.bind(this));

    global.emitter.on('hideHover', this._hideMenu.bind(this));
    await this._initializeMylistSelectMenu();
  }
  async _initializeMylistSelectMenu(): Promise<void> {
    if (!(util as unknown as DialogUtilView).isLogin()) {
      return;
    }
    this._mylistApiLoader = MylistApiLoader;
    this._mylistList = await this._mylistApiLoader.getMylistList();
    this._initializeMylistSelectMenuDom();
  }
  _initializeMylistSelectMenuDom(mylistList?: Array<Record<string, unknown>>): void {
    if (!(util as unknown as DialogUtilView).isLogin()) {
      return;
    }
    mylistList = mylistList || this._mylistList;
    const menu = this._container.querySelector('.mylistSelectMenu') as HTMLElement;
    menu.addEventListener('wheel', (e: Event) => e.stopPropagation(), { passive: true });

    const ul = document.createElement('ul');
    mylistList!.forEach((mylist) => {
      const li = document.createElement('li');

      const icon = document.createElement('span');
      icon.className = 'mylistIcon command';
      Object.assign(icon.dataset, {
        mylistId: mylist.id,
        mylistName: mylist.name,
        command: 'mylistOpen',
      });
      icon.title = `${mylist.name as string}を開く`;

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      const folder = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      folder.setAttribute(
        'd',
        'M1 6V5c0-1.1.9-2 2-2h7a2 2 0 011.6.9L13 6h8a2 2 0 012 2v12a2 2 0 01-2 2H3a2 2 0 01-2-2V6z'
      );
      if (mylist.isPublic) {
        folder.setAttribute('fill-rule', 'evenodd');
        svg.append(folder);
      } else {
        const graph = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        graph.setAttribute('fill-rule', 'evenodd');
        const locked = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        locked.setAttribute('fill', '#FFF');
        locked.setAttribute(
          'd',
          'M17 13v-.5a1.5 1.5 0 00-3 0v.5h3zm2 0h1.2c.4 0 .8.4.8.9V19c0 .5-.4.9-.9.9H11a.9.9 0 01-.9-.9V14c0-.5.4-.9.9-.9H12v-.5a3.5 3.5 0 117 0v.5zm-3.5 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3z'
        );
        graph.append(folder, locked);
        svg.append(graph);
      }
      icon.append(svg);

      const link = document.createElement('a');
      link.className = 'mylistLink name command';
      link.textContent = `${mylist.name as string}`;
      link.href = `https://www.nicovideo.jp/my/mylist/#/${mylist.id as string}`;
      Object.assign(link.dataset, {
        mylistId: mylist.id,
        mylistName: mylist.name,
        command: 'mylistAdd',
      });

      li.append(icon, link);
      ul.append(li);
    });

    menu.querySelector('.mylistSelectMenuInner')!.append(ul);
  }
  _onMouseDown(e: MouseEvent): void {
    e.stopPropagation();
    const target = (e.target as unknown as Element).closest<HTMLElement>('[data-command]');
    if (!target) {
      return;
    }
    let command = target.dataset.command;
    switch (command) {
      case 'deflistAdd':
        if (e.shiftKey) {
          command = 'mylistWindow';
        } else {
          command = e.which > 1 ? 'deflistRemove' : 'deflistAdd';
        }
        (util as unknown as DialogUtilView).dispatchCommand(target, command);
        break;
      case 'toggle-like':
        (util as unknown as DialogUtilView).dispatchCommand(target, command);
        break;
      case 'mylistAdd': {
        command = e.shiftKey || e.which > 1 ? 'mylistRemove' : 'mylistAdd';
        const { mylistId, mylistName } = target.dataset;
        this._hideMenu();
        (util as unknown as DialogUtilView).dispatchCommand(target, command, { mylistId, mylistName });
        break;
      }
      case 'mylistOpen': {
        const mylistId = target.dataset.mylistId;
        location.href = `https://www.nicovideo.jp/my/mylist/#/${mylistId}`;
        break;
      }
      case 'close':
        this._bound.emitClose!();
        break;
      default:
        return;
    }
  }
  _onClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const target = (e.target as unknown as Element).closest<HTMLElement>('[data-command]');
    if (!target) {
      return;
    }
    const { command, type } = target.dataset;
    let param: unknown = target.dataset.param;

    switch (type) {
      case 'json':
      case 'bool':
      case 'number':
        param = JSON.parse(param as string);
        break;
    }

    switch (command) {
      case 'deflistAdd':
      case 'mylistAdd':
      case 'mylistOpen':
      case 'close':
        this._hideMenu();
        break;
      case 'mylistMenu':
        if (e.shiftKey) {
          (util as unknown as DialogUtilView).dispatchCommand(target, 'mylistWindow');
        }
        break;
      case 'nop':
        break;
      default:
        this._hideMenu();
        (util as unknown as DialogUtilView).dispatchCommand(target, command, param);
        break;
    }
  }
  _hideMenu() {
    if (!this._view.contains(document.activeElement)) {
      return;
    }
    window.setTimeout(() => document.body.focus(), 0);
  }
}

(util as unknown as DialogUtilView).addStyle(
  `
    .hoverMenuContainer {
      user-select: none;
      contain: style size;
    }

    .menuItemContainer {
      box-sizing: border-box;
      position: absolute;
      z-index: 40000;
      overflow: visible;

      will-change: transform, opacity;
      user-select: none;
    }
      .menuItemContainer .menuButton {
        width: 32px;
        height:32px;
        font-size: 24px;
        background: #888;
        color: #000;
        border: 1px solid #666;
        border-radius: 4px;
        line-height: 30px;
        white-space: nowrap;
        text-align: center;
        cursor: pointer;
        outline: none;
      }
      .menuItemContainer:hover .menuButton {
        pointer-events: auto;
      }

      .menuItemContainer.rightTop {
        width: 240px;
        height: 40px;
        right: 0px;
        top: 0;
        perspective: 150px;
        perspective-origin: center;
      }

      .menuItemContainer.rightTop .scalingUI {
        transform-origin: right top;
      }


      .is-updatingDeflist .menuItemContainer.rightTop,
      .is-updatingMylist  .menuItemContainer.rightTop {
        cursor: wait;
        opacity: 1 !important;
      }
      .is-updatingDeflist .menuItemContainer.rightTop>*,
      .is-updatingMylist  .menuItemContainer.rightTop>* {
        pointer-events: none;
      }

    .menuItemContainer.leftTop {
      width: auto;
      height: auto;
      left: 32px;
      top: 32px;
      display: none;
    }

      .is-debug .menuItemContainer.leftTop {
        display: inline-block !important;
        opacity: 1 !important;
        transition: none !important;
        transform: translateZ(0);
        max-width: 200px;
      }

    .menuItemContainer.leftBottom {
      width: 120px;
      height: 32px;
      left: 8px;
      bottom: 48px;
      transform-origin: left bottom;
    }
    .menuItemContainer.rightBottom {
      width: 120px;
      height: 80px;
      right:  0;
      bottom: 8px;
    }

    .menuItemContainer.onErrorMenu {
      position: absolute;
      left: 50%;
      top: 60%;
      transform: translate(-50%, 0);
      display: none;
      white-space: nowrap;
    }
      .is-error .onErrorMenu {
        display: block !important;
        opacity: 1 !important;
      }

      .is-youTube .onErrorMenu .for-nicovideo,
                  .onErrorMenu .for-FutatsumeTube {
        display: none;
      }
      .is-youTube.is-error .onErrorMenu .for-FutatsumeTube {
        display: inline-block;
      }

      .onErrorMenu .menuButton {
        position: relative;
        display: inline-block !important;
        margin: 0 16px;
        padding: 8px;
        background: #888;
        color: #000;
        opacity: 1;
        cursor: pointer;
        border-radius: 0;
        box-shadow: 4px 4px 0 #333;
        border: 2px outset;
        width: 100px;
        font-size: 14px;
        line-height: 16px;
      }
      .menuItemContainer.onErrorMenu .menuButton:active {
        background: var(--base-fore-color);
        border: 2px inset;
      }
      .menuItemContainer.onErrorMenu .playNextVideo {
        display: none !important;
      }
      .is-playlistEnable .menuItemContainer.onErrorMenu .playNextVideo {
        display: inline-block !important;
      }


    .menuButton {
      position: absolute;
      opacity: 0;
      transition:
        opacity 0.4s ease,
        box-shadow 0.2s ease 1s,
        background 0.4s ease;
      box-sizing: border-box;
      text-align: center;
      text-shadow: none;
      user-select: none;
      will-change: transform, opacity;
      contain: style size layout;
    }
      .menuButton:focus-within,
      .menuButton:hover {
        box-shadow: 0 2px 0 #000;
        cursor: pointer;
        opacity: 1;
        background: #888;
        color: #000;
      }
      .menuButton:active {
        transform: translate(0, 2px);
        box-shadow: 0 0 0 #000;
        transition: none;
      }

      .menuButton .tooltip {
        display: none;
        pointer-events: none;
        position: absolute;
        left: 16px;
        top: -24px;
        font-size: 12px;
        line-height: 16px;
        padding: 2px 4px;
        border: 1px solid #000;
        background: #ffc;
        color: black;
        box-shadow: 2px 2px 2px #fff;
        text-shadow: none;
        white-space: nowrap;
        z-index: 100;
        opacity: 0.8;
      }

      .menuButton:hover .tooltip {
        display: block;
      }
      .menuButton:avtive .tooltip {
        display: none;
      }

      .menuButtonInner {
        will-change: opacity;
      }

      .menuButton:active .futatsumePopupMenu {
        transform: translate(0, -2px);
        transition: none;
      }
      .hoverMenuContainer .menuButton:focus-within {
        pointer-events: none;
      }
      .hoverMenuContainer .menuButton:focus-within .futatsumePopupMenu,
      .hoverMenuContainer .menuButton              .futatsumePopupMenu:hover {
        pointer-events: auto;
        visibility: visible;
        opacity: 0.99;
        pointer-events: auto;
        transition: opacity 0.3s;
      }


      .rightTop .menuButton .tooltip {
        top: auto;
        bottom: -24px;
        right: -16px;
        left: auto;
      }
      .rightBottom .menuButton .tooltip {
        right: 16px;
        left: auto;
      }

      .is-mouseMoving .menuButton {
        opacity: 0.8;
        background: rgba(80, 80, 80, 0.5);
        border: 1px solid #888;
        transition: box-shadow 0.2s ease;
      }
      .is-mouseMoving .menuButton .menuButtonInner {
        opacity: 0.8;
        word-break: normal;
        transition:
          box-shadow 0.2s ease,
          background 0.4s ease;
       }


    .showCommentSwitch {
      left: 0;
      width:  32px;
      height: 32px;
      background:#888;
      color: #000;
      border: 1px solid #666;
      line-height: 30px;
      filter: grayscale(100%);
      border-radius: 4px;
    }
      .is-showComment .showCommentSwitch {
        color: #fff;
        filter: none;
        text-decoration: none;
      }
      .showCommentSwitch .menuButtonInner {
        text-decoration: line-through;
      }
      .is-showComment .showCommentSwitch .menuButtonInner {
        text-decoration: none;
      }


    .menuItemContainer .mylistButton {
      font-size: 21px;
    }

    .mylistButton.mylistAddMenu {
      left: 80px;
      top: 0;
    }
    .mylistButton.deflistAdd {
      left: 120px;
      top: 0;
    }
    .futatsumeTweetButton {
      left: 40px;
    }

    @keyframes spinX {
      0%   { transform: rotateX(0deg); }
      100% { transform: rotateX(1800deg); }
    }
    @keyframes spinY {
      0%   { transform: rotateY(0deg); }
      100% { transform: rotateY(1800deg); }
    }

    .is-updatingDeflist .mylistButton.deflistAdd {
      pointer-events: none;
      opacity: 1 !important;
      border: 1px inset !important;
      box-shadow: none !important;
      background: #888 !important;
      color: #000 !important;
      animation-name: spinX;
      animation-iteration-count: infinite;
      animation-duration: 6s;
      animation-timing-function: linear;
    }
    .is-updatingDeflist .mylistButton.deflistAdd .tooltip {
      display: none;
    }

    .mylistButton.mylistAddMenu:focus-within,
    .is-updatingMylist  .mylistButton.mylistAddMenu {
      pointer-events: none;
      opacity: 1 !important;
      border: 1px inset #000 !important;
      color: #000 !important;
      box-shadow: none !important;
    }
    .mylistButton.mylistAddMenu:focus-within {
      background: #888 !important;
    }
    .is-updatingMylist  .mylistButton.mylistAddMenu {
      background: #888 !important;
      color: #000 !important;
      animation-name: spinX;
      animation-iteration-count: infinite;
      animation-duration: 6s;
      animation-timing-function: linear;
    }

    .mylistSelectMenu {
      top: 36px;
      right: -48px;
      padding: 8px 0;
      font-size: 13px;
      backface-visibility: hidden;
    }
    .is-updatingMylist .mylistSelectMenu {
      display: none;
    }
      .mylistSelectMenu .mylistSelectMenuInner {
        overflow-y: auto;
        overflow-x: hidden;
        max-height: 50vh;
        overscroll-behavior: none;
      }

      .mylistSelectMenu .triangle {
        transform: rotate(135deg);
        top: -8.5px;
        right: 55px;
      }

      .mylistSelectMenu ul li {
        line-height: 120%;
        overflow-y: visible;
        border-bottom: none;
      }

      .mylistSelectMenu .mylistIcon {
        display: inline-block;
        width: 18px;
        height: 14px;
        margin: -4px 4px 0 0;
        margin-right: 15px;
        transform: scale(1.5);
        transform-origin: 0 0 0;
        transition: transform 0.1s ease, box-shadow 0.1s ease;
        cursor: pointer;
      }
      .mylistSelectMenu .mylistIcon:hover {
        background-color: #ff9;
        transform: scale(2);
      }
      .mylistSelectMenu .mylistIcon:hover::after {
        background: #fff;
        z-index: 100;
        opacity: 1;
      }
      .mylistSelectMenu .mylistIcon > svg {
        fill: #666;
        width: 100%;
        height: 100%;
      }


      .mylistSelectMenu .name {
        display: inline-block;
        width: calc(100% - 20px);
        vertical-align: middle;
        font-size: 110%;
        color: #fff;
        text-decoration: none !important;
      }
      .mylistSelectMenu .name:hover {
        color: #fff;
      }
      .mylistSelectMenu .name::after {
        content: ' に登録';
        font-size: 75%;
        color: #333;
      }
      .mylistSelectMenu li:hover .name::after {
        color: #fff;
      }

      .toggleLikeButton {
        transition:
        opacity 0.4s ease,
        box-shadow 0.2s ease 1s,
        transform 0.2s ease 1s;
      }
      .toggleLikeButton:hover {
        text-shadow: 0 0 2px deeppink;
        background: none;
        color: pink;
      }
      .is-liked .toggleLikeButton {
        color: pink;
      }
      .toggleLikeButton .liked-heart {
        display: none;
      }
      .is-liked .toggleLikeButton .liked-heart {
        display: block;
      }
      .is-liked .toggleLikeButton .not-liked-heart {
        display: none;
      }
      .toggleLikeButton .heart-effect {
        position: absolute;
        left: 50%; top: 50%;
        transform: translate(-50%, -50%) scale(5);
        text-shadow: 0 0 3px deeppink;
        color: #fff;
        opacity: 0;
        visibility: hidden;
        transition:
          transform 0.8s ease,
          opacity 0.8s ease,
          visibility 0.8s ease,
          color 0.8s ease;
      }
      .toggleLikeButton:active .heart-effect {
        transition: none;
        transform: translate(-50%, -50%) scale(0.3);
        color: pink;
        opacity: 0.5;
        visibility: visible;
      }

      .futatsumeTweetButton:hover {
        text-shadow: 1px 1px 2px #88c;
        background: #1da1f2;
        color: #fff;
      }

    .menuItemContainer .menuButton.closeButton {
      position: absolute;
      font-size: 20px;
      top: 0;
      right: 0;
      z-index: 60000;
      margin: 0 0 40px 40px;
      color: #ccc;
      border: solid 1px #888;
      border-radius: 0;
      transition:
        opacity 0.4s ease,
        transform 0.2s ease,
        background 0.2s ease,
        box-shadow 0.2s ease
          ;
      pointer-events: auto;
      transform-origin: center center;
    }

    .is-mouseMoving .closeButton,
    .closeButton:hover {
      opacity: 1;
      background: rgba(0, 0, 0, 0.8);
    }
    .closeButton:hover {
      background: rgba(33, 33, 33, 0.9);
      box-shadow: 4px 4px 4px #000;
    }
    .closeButton:active {
      transform: scale(0.5);
    }

    .menuItemContainer .toggleDebugButton {
      position: relative;
      display: inline-block;
      opacity: 1 !important;
      padding: 8px 16px;
      color: #000;
      box-shadow: none;
      font-size: 21px;
      border: 1px solid black;
      background: rgba(192, 192, 192, 0.8);
      width: auto;
      height: auto;
    }

    .togglePlayMenu {
      display: none;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(1.5);
      width: 80px;
      height: 45px;
      font-size: 35px;
      line-height: 45px;
      border-radius: 8px;
      text-align: center;
      color: var(--base-fore-color);
      z-index: 10;
      background: rgba(0, 0, 0, 0.8);
      transition: transform 0.2s ease, box-shadow 0.2s, text-shadow 0.2s, font-size 0.2s;
      box-shadow: 0 0 2px rgba(255, 255, 192, 0.8);
      cursor: pointer;
    }

    .togglePlayMenu:hover {
      transform: translate(-50%, -50%) scale(1.6);
      text-shadow: 0 0 4px #888;
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
    }

    .togglePlayMenu:active {
      transform: translate(-50%, -50%) scale(2.0, 1.2);
      font-size: 30px;
      box-shadow: 0 0 4px inset rgba(0, 0, 0, 0.8);
      text-shadow: none;
      transition: transform 0.1s ease;
    }

    .is-notPlayed .togglePlayMenu {
      display: block;
    }

    .is-playing .togglePlayMenu,
    .is-error   .togglePlayMenu,
    .is-loading .togglePlayMenu {
      display: none;
    }


  `,
  { className: 'videoHoverMenu' }
);
(util as unknown as DialogUtilView).addStyle(
  `
  .menuItemContainer.leftBottom {
    bottom: calc(64px * var(--futatsume-ui-scale,1));
  }
  .menuItemContainer.leftBottom .scalingUI {
    transform-origin: left bottom;
  }
  .menuItemContainer.rightBottom {
    bottom: 64px;
  }
  .ngSettingSelectMenu {
    bottom: 0px;
  }
  `,
  { className: 'videoHoverMenu screenMode for-full' }
);

VideoHoverMenu.__tpl__ = `
    <div class="hoverMenuContainer">
      <div class="menuItemContainer leftTop">
          <div class="menuButton toggleDebugButton" data-command="toggle-debug">
            <div class="menuButtonInner">debug mode</div>
          </div>
      </div>

      <div class="menuItemContainer rightTop">
        <div class="scalingUI">
          <div class="menuButton toggleLikeButton forMember" data-command="toggle-like">
            <div class="tooltip">いいね！</div>
            <div class="menuButtonInner"><div class="not-liked-heart"
              >♡</div><div class="liked-heart"
              >♥</div><div class="heart-effect">♡</div></div>
          </div>
          <div class="menuButton futatsumeTweetButton" data-command="tweet">
            <div class="tooltip">ツイート</div>
            <div class="menuButtonInner">t</div>
          </div>
          <div class="menuButton mylistButton mylistAddMenu forMember"
            data-command="nop" tabindex="-1" data-has-submenu="1">
            <div class="tooltip">マイリスト登録</div>
            <div class="menuButtonInner">My</div>
            <div class="mylistSelectMenu selectMenu futatsumePopupMenu forMember">
              <div class="triangle"></div>
              <div class="mylistSelectMenuInner">
              </div>
            </div>
          </div>


          <div class="menuButton mylistButton deflistAdd forMember" data-command="deflistAdd">
            <div class="tooltip">とりあえずマイリスト(T)</div>
            <div class="menuButtonInner">&#x271A;</div>
          </div>

          <div class="menuButton closeButton" data-command="close">
            <div class="menuButtonInner">&#x2716;</div>
          </div>

        </div>
      </div>

      <div class="menuItemContainer leftBottom">
        <div class="scalingUI">
          <div class="showCommentSwitch menuButton" data-command="toggle-showComment">
            <div class="tooltip">コメント表示ON/OFF(V)</div>
            <div class="menuButtonInner">💬</div>
          </div>
        </div>
      </div>

      <div class="menuItemContainer onErrorMenu">
        <div class="menuButton openGinzaMenu" data-command="openGinza">
          <div class="menuButtonInner">(Re)で視聴</div>
        </div>

        <div class="menuButton reloadMenu for-nicovideo" data-command="reload">
          <div class="menuButtonInner for-nicovideo">リロード</div>
          <div class="menuButtonInner for-FutatsumeTube">FutatsumeTube解除</div>
        </div>

        <div class="menuButton playNextVideo" data-command="playNextVideo">
          <div class="menuButtonInner">次の動画</div>
        </div>
      </div>

      <div class="togglePlayMenu menuItemContainer center" data-command="togglePlay">
        ▶
      </div>

    </div>
  `.trim();

class VariablesMapper {
  declare private config: DialogPlayerConfig;
  declare private state: VariablesMapperState;
  declare private element: Element;
  declare private emitter: InstanceType<typeof Emitter>;
  get nextState(): VariablesMapperState {
    const { commentLayerOpacity, fullscreenControlBarMode } = this.config.props;
    return { commentLayerOpacity, fullscreenControlBarMode };
  }

  get videoControlBarHeight(): number {
    const base = VideoControlBar as unknown as { BASE_HEIGHT: number };
    return base.BASE_HEIGHT;
  }

  constructor({ config, element }: { config: DialogPlayerConfig; element?: Element }) {
    this.config = config;

    this.state = {
      commentLayerOpacity: 0,
      fullscreenControlBarMode: 'auto',
    };

    this.element = element || document.body;
    this.emitter = new Emitter();

    const update = _.debounce(this.update.bind(this), 500);
    Object.keys(this.state).forEach((key) => config.onkey(key, () => update()));
    update();
  }

  on(...args: [string, EmitterCallback]): void {
    this.emitter.on(...args);
  }

  shouldUpdate(state: VariablesMapperState, nextState: VariablesMapperState): boolean {
    return Object.keys(state).some((key) => state[key] !== nextState[key]);
  }

  setVar(key: string, value: unknown): void {
    void cssUtil.setProps([this.element, key, value]);
  }

  update(): void {
    const state = this.state;
    const nextState = this.nextState;

    if (!this.shouldUpdate(state, nextState)) {
      return;
    }

    const { commentLayerOpacity, fullscreenControlBarMode } = nextState;

    this.state = nextState;
    Object.assign((this.element as HTMLElement).dataset, { fullscreenControlBarMode });
    this.setVar('--futatsume-ui-scale', 1);
    this.setVar('--futatsume-control-bar-height', css.px(this.videoControlBarHeight));
    if (state.commentLayerOpacity !== commentLayerOpacity) {
      this.setVar('--futatsume-comment-layer-opacity', commentLayerOpacity);
    }
    this.emitter.emit('update', nextState);
  }
}

//===END===

export {
  PlayerConfig,
  VideoWatchOptions,
  PlayerState,
  NicoVideoPlayerDialog,
  NicoVideoPlayerDialogView,
  VideoHoverMenu,
  VariablesMapper,
};
