import * as _ from 'lodash';
import { global } from '../futatsume-watch-index';

import { PlaybackPosition } from '../../packages/lib/src/nico/loader';
import { Fullscreen, util } from '../util';
import { NicoVideoPlayer } from '../nico-video-player';

import { normalizeCommentCommands } from '../comment-post-session';

import { nicoUtil } from '../../packages/lib/src/nico/nico-util';
import { NicoChat } from '../../packages/futatsume/src/commentLayer/nico-chat';
import { CommentPanel } from '../comment-panel';

import { PlayList, PlayListSession } from '../../packages/futatsume/src/Playlist/playlist';
import type { PlaylistDescriptor } from '../../packages/futatsume/src/Playlist/playlist';

import { ThreadLoader } from '../../packages/lib/src/nico/thread-loader';

import { MylistApiLoader } from '../../packages/lib/src/nico/mylist-api-loader';
import { ThumbInfoLoader } from '../../packages/lib/src/nico/thumb-info-loader';
import { WatchInfoCacheDb } from '../../packages/lib/src/nico/watch-info-cache-db';

import { MediaSessionApi } from '../../packages/lib/src/infra/media-session-api';
import { LikeApi } from '../../packages/lib/src/nico/like-api.js';
import type { EmitterCallback } from '../../packages/lib/src/emitter';

import type { DialogUtilView, DialogVideoError, VideoWatchOptionBag, VideoSessionWorkerSession } from './types';

import type { NicoVideoPlayerDialog } from './dialog-controller';

export async function run_initializeNicoVideoPlayer(this: NicoVideoPlayerDialog): Promise<NicoVideoPlayer> {
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

export function run_onPlayerConfigUpdate(this: NicoVideoPlayerDialog, key: string, value: unknown): void {
  if (!this._nicoVideoPlayer) {
    return;
  }
  const np = this._nicoVideoPlayer,
    filter = np.filter;
  switch (key) {
    case 'enableFilter':
      filter.isEnable = value;
      break;
    case 'userIdFilter':
      filter.userIdFilterList = value;
      break;
    case 'commandFilter':
      filter.commandFilterList = value;
      break;
    case 'wordRegFilter':
      (filter.setWordRegFilter as (source: string[]) => void)(this._playerConfig.props.wordRegFilter);
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

export function run_onPlaylistAppend(this: NicoVideoPlayerDialog, watchId: string): void {
  void this._playlist.append(watchId);
}

export function run_onPlaylistInsert(this: NicoVideoPlayerDialog, watchId: string): void {
  void this._playlist.insert(watchId);
}

export function run_onPlaylistLoadFail(this: NicoVideoPlayerDialog, error: unknown, fallback: string): void {
  if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') return;
  const message =
    typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : fallback;
  this.execCommand('alert', message);
}

export function run_onPlaylistSetMylist(this: NicoVideoPlayerDialog, id: string): void {
  const option: {
    watchId: string;
    insert?: boolean;
  } = { watchId: this._watchId };
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

export function run_onPlaylistSetUploadedVideo(this: NicoVideoPlayerDialog, id: string): void {
  const option: {
    watchId: string;
    insert?: boolean;
  } = { watchId: this._watchId };
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

export function run_onPlaylistSetSearchVideo(
  this: NicoVideoPlayerDialog,
  params: {
    option?: Record<string, unknown>;
    word?: string;
  }
): void {
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

export function run_onPlaylistSetSeriesVideo(this: NicoVideoPlayerDialog, id: string): void {
  const option: {
    watchId: string;
    insert?: boolean;
  } = { watchId: this._watchId };
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

export function run_onPlaylistStatusUpdate(this: NicoVideoPlayerDialog): void {
  const playlist = this._playlist;
  this._playerConfig.setValue('playlistLoop', playlist.isLoop);
  this._state.isPlaylistEnable = playlist.isEnable;
  if (playlist.isEnable) {
    this._playerConfig.setValue('loop', false);
  }
  this._view.blinkTab('playlist');
}

export function run_onCommentPanelStatusUpdate(this: NicoVideoPlayerDialog): void {
  const commentPanel = this._commentPanel;
  this._playerConfig.setValue('enableCommentPanelAutoScroll', commentPanel.isAutoScroll);
}

export function run_onDeflistAdd(this: NicoVideoPlayerDialog, watchId: string): void {
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
    .addDeflistItem(watchId, '')
    .then((result) =>
      this.execCommand(
        'notify',
        (
          result as {
            message?: unknown;
          }
        ).message
      )
    )
    .catch((err: unknown) =>
      this.execCommand(
        'alert',
        (
          err as {
            message?: unknown;
          }
        ).message || 'とりあえずマイリストに登録失敗'
      )
    )
    .then(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(unlock, 2000);
    });
}

export function run_onDeflistRemove(this: NicoVideoPlayerDialog, watchId: string): void {
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
    .then((result) =>
      this.execCommand(
        'notify',
        (
          result as {
            message?: unknown;
          }
        ).message
      )
    )
    .catch((err: unknown) =>
      this.execCommand(
        'alert',
        (
          err as {
            message?: unknown;
          }
        ).message
      )
    )
    .then(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(unlock, 2000);
    });
}

export function run_onToggleLike(this: NicoVideoPlayerDialog): void {
  if (!(util as unknown as DialogUtilView).isLogin()) {
    return;
  }
  const videoId = this._videoInfo.videoId;
  const isLiked = this._videoInfo.isLiked;
  (isLiked ? LikeApi.unlike(videoId) : LikeApi.like(videoId))
    .then((result) => {
      const data = (
        result as {
          data?: {
            thanksMessage?: unknown;
          };
        }
      ).data;
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

export function run_onMylistAdd(this: NicoVideoPlayerDialog, groupId: string, mylistName: string): void {
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
    .addMylistItem(watchId, groupId, '')
    .then((result) =>
      this.execCommand(
        'notify',
        `${
          (
            result as {
              message?: unknown;
            }
          ).message as string
        }: ${mylistName}`
      )
    )
    .catch((err: unknown) =>
      this.execCommand(
        'alert',
        `${
          (
            err as {
              message?: unknown;
            }
          ).message as string
        }: ${mylistName}`
      )
    )
    .then(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(unlock, 2000);
    });
}

export function run_onMylistRemove(this: NicoVideoPlayerDialog, groupId: string, mylistName: string): void {
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
      this.execCommand(
        'notify',
        `${
          (
            result as {
              message?: unknown;
            }
          ).message as string
        }: ${mylistName}`
      )
    )
    .catch((err: unknown) =>
      this.execCommand(
        'alert',
        `${
          (
            err as {
              message?: unknown;
            }
          ).message as string
        }: ${mylistName}`
      )
    )
    .then(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(unlock, 2000);
    });
}

export function run_onCommentParsed(this: NicoVideoPlayerDialog): void {
  this.emit('commentParsed');
  global.emitter.emit('commentParsed');
}

export function run_onCommentChange(this: NicoVideoPlayerDialog): void {
  this.emit('commentChange');
  global.emitter.emit('commentChange');
}

export function run_onCommentFilterChange(
  this: NicoVideoPlayerDialog,
  filter: {
    isEnable: unknown;
    wordRegFilterList: unknown;
    userIdFilterList: unknown;
    commandFilterList: unknown;
  }
): void {
  // This notification is debounced. Writing every model field back here can
  // overwrite newer form edits before their config update reaches the model.
  // Settings are persisted at their explicit UI/command entry points instead.
  this.emit('commentFilterChange', filter);
}

export function run_onVideoPlayerTypeChange(this: NicoVideoPlayerDialog, type = ''): void {
  switch (type.toLowerCase()) {
    case 'youtube':
      this._state.setState({ isYouTube: true });
      break;
    default:
      this._state.setState({ isYouTube: false });
  }
}

export function run_onNicosSeek(this: NicoVideoPlayerDialog, time: number): void {
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

export function run_onLoadedMetaData(this: NicoVideoPlayerDialog): void {
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

export async function run_onVideoCanPlay(this: NicoVideoPlayerDialog): Promise<void> {
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
}

export function run_onVideoPlay(this: NicoVideoPlayerDialog): void {
  this._state.setPlaying();
  MediaSessionApi.updatePositionStateByMedia(this as unknown as HTMLMediaElement);
  this.emit('play');
}

export function run_onVideoPlaying(this: NicoVideoPlayerDialog): void {
  this._state.setPlaying();
  this.emit('playing');
}

export function run_onVideoSeeking(this: NicoVideoPlayerDialog): void {
  this._state.isSeeking = true;
  this.emit('seeking');
}

export function run_onVideoSeeked(this: NicoVideoPlayerDialog): void {
  this._state.isSeeking = false;
  MediaSessionApi.updatePositionStateByMedia(this as unknown as HTMLMediaElement);
  this.emit('seeked');
}

export function run_onVideoPause(this: NicoVideoPlayerDialog): void {
  this._state.setPausing();
  this._savePlaybackPosition(this._videoInfo.contextWatchId, this.currentTime);
  this.emit('pause');
}

export function run_onVideoStalled(this: NicoVideoPlayerDialog): void {
  this._state.isStalled = true;
  this.emit('stalled');
}

export function run_onVideoTimeUpdate(this: NicoVideoPlayerDialog): void {
  this._state.isStalled = false;
}

export function run_onVideoProgress(this: NicoVideoPlayerDialog, range: unknown, currentTime: unknown): void {
  this.emit('progress', range, currentTime);
}

export async function run_onVideoError(this: NicoVideoPlayerDialog, e: DialogVideoError): Promise<void> {
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

export function run_onYouTubeVideoError(this: NicoVideoPlayerDialog, e: DialogVideoError): void {
  if (!this.isOpen) return;
  window.console.error('onYouTubeVideoError!', e);
  this._setErrorMessage(e.description);
  this.emit('error', e);
  if (e.fallback) {
    this.videoRecovery.schedule(() => {
      if (this.isOpen) this.reload();
    });
  }
}

export function run_onVideoAbort(this: NicoVideoPlayerDialog) {
  this.emit('abort');
}

export function run_onVideoAspectRatioFix(this: NicoVideoPlayerDialog, ratio: number): void {
  this.emit('aspectRatioFix', ratio);
}

export function run_onVideoEnded(this: NicoVideoPlayerDialog) {
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

export function run_onVolumeChange(this: NicoVideoPlayerDialog, vol: unknown, mute: unknown): void {
  this.emit('volumeChange', vol, mute);
}

export function run_onVolumeChangeEnd(this: NicoVideoPlayerDialog, vol: unknown, mute: unknown): void {
  this.emit('volumeChangeEnd', vol, mute);
}

export function run_savePlaybackPosition(this: NicoVideoPlayerDialog, contextWatchId: string, ct: number): void {
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

export function runClose(this: NicoVideoPlayerDialog): void {
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

export function run_refresh(this: NicoVideoPlayerDialog): void {
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

export // eslint-disable-next-line @typescript-eslint/require-await -- Promise.all へ渡すため Promise を返す契約を維持する
async function run_initializePlaylist(this: NicoVideoPlayerDialog): Promise<void> {
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

export function run_initializeCommentPanel(this: NicoVideoPlayerDialog): void {
  if (this._commentPanel) {
    return;
  }
  const $container = this._view.appendTab('comment', 'コメント');
  this._commentPanel = new CommentPanel({
    player: this as unknown as NicoVideoPlayer,
    $container: $container,
    autoScroll: this._playerConfig.props.enableCommentPanelAutoScroll,
  });
  this._commentPanel.on('command', this._onCommand.bind(this) as EmitterCallback);
  this._commentPanel.on('deleteChat', ((
    e: {
      resolve(): void;
      reject(error: Error): void;
    },
    chat: unknown
  ) => {
    void this.removeChat(chat).then(
      () => e.resolve(),
      (error: unknown) => e.reject(error instanceof Error ? error : new Error('コメントを削除できませんでした。'))
    );
  }) as EmitterCallback);
  this._commentPanel.on('nicoruChat', ((
    e: {
      resolve(result: { count?: number }): void;
      reject(error: Error): void;
    },
    chat: unknown
  ) => {
    void this.threadLoader
      .nicoru(
        this._videoInfo.msgInfo,
        chat as {
          no: number;
          fork?: number;
          text?: string;
          [key: string]: unknown;
        }
      )
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

export function runPlayNextVideo(this: NicoVideoPlayerDialog, options?: VideoWatchOptionBag): void {
  if (!this._playlist || !this.isOpen) {
    return;
  }
  const opt = this._videoWatchOptions.createForVideoChange(options);
  const nextId = this._playlist.selectNext();
  if (nextId) {
    void this.open(nextId, opt);
  }
}

export function runPlayPreviousVideo(this: NicoVideoPlayerDialog, options?: VideoWatchOptionBag): void {
  if (!this._playlist || !this.isOpen) {
    return;
  }
  const opt = this._videoWatchOptions.createForVideoChange(options);
  const prevId = this._playlist.selectPrevious();
  if (prevId) {
    void this.open(prevId, opt);
  }
}

export function runPlay(this: NicoVideoPlayerDialog): void {
  if (!this._state.isError && this._nicoVideoPlayer) {
    const requestId = this._requestId;
    this._nicoVideoPlayer.play().catch((e) => {
      if (this._requestId === requestId && this.isOpen) this._onVideoPlayStartFail(e);
    });
  }
}

export function runPause(this: NicoVideoPlayerDialog): void {
  if (!this._state.isError && this._nicoVideoPlayer) {
    void this._nicoVideoPlayer.pause();
    this._state.setPausing();
  }
}

export function runTogglePlay(this: NicoVideoPlayerDialog): void {
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

export async function runAddChat(
  this: NicoVideoPlayerDialog,
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
  if (typeof text !== 'string' || !text.trim() || text.length > 75 || (cmd !== undefined && typeof cmd !== 'string')) {
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

export function runRemoveChat(this: NicoVideoPlayerDialog, chat: unknown): Promise<void> {
  if (!this._nicoVideoPlayer || !this.threadLoader || !this._state.isCommentReady) {
    return Promise.reject(new Error('コメントの準備ができていません。再読み込みしてから試してください。'));
  }
  if (!(util as unknown as DialogUtilView).isLogin()) {
    return Promise.reject(new Error('ログインしてから再試行してください。'));
  }
  const msgInfo = this._videoInfo.msgInfo;
  return this.threadLoader
    .deleteChat(
      msgInfo,
      chat as {
        no: number;
        fork?: number;
        text?: string;
        [key: string]: unknown;
      }
    )
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

export function runGetId(this: NicoVideoPlayerDialog): string {
  return this.id;
}

export function runGetDuration(this: NicoVideoPlayerDialog): number {
  return this.duration;
}

export function runGetBufferedRange(this: NicoVideoPlayerDialog): unknown {
  return this.bufferedRange;
}

export function runGetNonFilteredChatList(this: NicoVideoPlayerDialog): unknown {
  return this.nonFilteredChatList;
}

export function runGetChatList(this: NicoVideoPlayerDialog): unknown {
  return this.chatList;
}

export function runGetPlayingStatus(this: NicoVideoPlayerDialog): Record<string, unknown> {
  return this.playingStatus;
}

export function runGetMymemory(this: NicoVideoPlayerDialog): unknown {
  return this._nicoVideoPlayer.getMymemory();
}
