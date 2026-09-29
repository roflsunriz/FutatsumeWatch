import * as _ from 'lodash';
import { Emitter } from '../../packages/lib/src/emitter';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import { CONSTANT } from '../shared/constant';
import { Fullscreen, util } from '../shared/util';
import { PlayerShell } from '../player-shell/player-shell';
import type { NicoVideoPlayer } from '../nico-video-player/index';
import type { VideoInfoModel } from '../video-info-panel/video-info';
import { sleep } from '../../packages/lib/src/infra/sleep';
import { nicoUtil } from '../../packages/lib/src/nico/nico-util';
import { objUtil } from '../../packages/lib/src/infra/obj-util';
import { ClassList } from '../../packages/lib/src/dom/class-list-wrapper';
import { global } from '../app/futatsume-watch-index';
import type { PlayerState } from '../player-shell/state';
import { CommentInputPanel } from '../comments/comment-input-panel';
import { VideoControlBar } from '../video-control-bar/index';
import { VideoInfoPanel } from '../video-info-panel/index';
import { closeSettingsDialog } from '../../packages/components/src/settings-dialog';
import type { Uq } from '../comment-panel/index';
import type {
  DialogPlayerConfig,
  NicoVideoPlayerDialogViewParams,
  DialogUtilView,
  FutatsumeSettingPanelElement,
} from './types';
import type { NicoVideoPlayerDialog } from './dialog-controller';
import { VideoHoverMenu } from './video-hover-menu';
import { VariablesMapper } from './variables-mapper';
import { NICO_VIDEO_PLAYER_DIALOG_VIEW_CSS, NICO_VIDEO_PLAYER_DIALOG_VIEW_TEMPLATE } from './dialog-view-template';
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
      () => this.toggleSettingPanel(),
      () => this._dialog.resizeCommentLayer(),
      (tags) => this.videoInfoPanel.updateTags(tags)
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

NicoVideoPlayerDialogView.__css__ = NICO_VIDEO_PLAYER_DIALOG_VIEW_CSS;
NicoVideoPlayerDialogView.__tpl__ = NICO_VIDEO_PLAYER_DIALOG_VIEW_TEMPLATE;
export { NicoVideoPlayerDialogView };
