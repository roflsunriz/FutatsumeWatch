import { global } from '../app/futatsume-watch-index';

import { VideoInfoLoader } from '../../packages/lib/src/nico/loader';
import { util } from '../shared/util';

import { nicoUtil } from '../../packages/lib/src/nico/nico-util';

import { WatchInfoCacheDb } from '../../packages/lib/src/nico/watch-info-cache-db';

import type { DialogUtilView, VideoWatchOptionBag } from './types';
import { VideoWatchOptions } from './video-watch-options';

import type { NicoVideoPlayerDialog } from './dialog-controller';

export async function runOpen(
  this: NicoVideoPlayerDialog,
  watchId: string,
  options?: VideoWatchOptionBag,
  reload = false
): Promise<void> {
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

export function runReload(this: NicoVideoPlayerDialog, options?: VideoWatchOptionBag): void {
  const reloadOptions = this._videoWatchOptions.createForReload(options);
  this.reloadPlayback =
    this._state.isLoading && this.reloadPlayback !== undefined ? this.reloadPlayback : !this._nicoVideoPlayer.paused;
  this._nicoVideoPlayer.setNextAutoPlay(this.reloadPlayback);
  if (this._lastCurrentTime > 0) {
    reloadOptions.currentTime = this._lastCurrentTime;
  }
  void this.open(this._watchId, reloadOptions, true);
}

export function runRefreshLastPlayerId(this: NicoVideoPlayerDialog) {
  if (this.isLastOpenedPlayer) {
    return;
  }
  this._playerConfig.props.lastPlayerId = '';
  this._playerConfig.props.lastPlayerId = this.id;
}
