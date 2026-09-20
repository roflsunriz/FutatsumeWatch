import _ from 'lodash';
// import * as _ from 'lodash';
import { global } from '../../../../src/FutatsumeWatchIndex';
import { Emitter } from '../../../lib/src/Emitter';
import { textUtil } from '../../../lib/src/text/textUtil';

interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  loadVideoById(options: { videoId: unknown; startSeconds: unknown }): void;
  loadPlaylist(options: { list: unknown }): void;
  seekTo(seconds: number): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(volume: number): void;
  setPlaybackRate(rate: number): void;
  setLoop(loop: boolean): void;
  getAvailableQualityLevels(): string[];
  setPlaybackQuality(quality: string): void;
  getPlaybackQuality(): string;
}

interface YouTubeNamespace {
  Player: new (parent: Element, options: YouTubePlayerOptions) => YouTubePlayer;
  PlayerState: Record<string, number>;
}

interface YouTubePlayerEvents {
  onReady: () => void;
  onStateChange: (e: YTStateEvent) => void;
  onPlaybackQualityChange: (e: YTStateEvent) => void;
  onError: (e: YTStateEvent) => void;
}

interface YouTubePlayerOptions {
  videoId: string | undefined;
  events: YouTubePlayerEvents;
  playerVars: Record<string, string | number>;
}

interface YTStateEvent {
  data: number;
}

interface WindowWithYouTube extends Window {
  YT?: YouTubeNamespace;
  onYouTubeIframeAPIReady?: () => void;
  onYouTubeIframeAPIReady_?: () => void;
}

interface TextUtilLike {
  parseUrl(url: string): { hostname: string; pathname: string; search: string };
  parseQuery(search: string): Record<string, string>;
}

interface GlobalDebugLike {
  debug: Record<string, unknown>;
}

interface YouTubeWrapperParams {
  parentNode: Element;
  autoplay?: boolean;
  volume?: number;
  playbackRate?: number;
  loop?: boolean;
}

export type { YouTubePlayer, YouTubeNamespace, YouTubeWrapperParams };
//===BEGIN===

const { YouTubeWrapper } = (() => {
  const STATE_PLAYING = 1;

  class YouTubeWrapper extends Emitter {
    declare _isInitialized: boolean;
    declare _parentNode: Element;
    declare _autoplay: boolean;
    declare _volume: number;
    declare _playbackRate: number;
    declare _loop: boolean;
    declare _startDiff: number;
    declare _isSeeking: boolean;
    declare _seekTime: number;
    declare _src: string;
    declare _videoId: string | undefined;
    declare _canPlay: boolean;
    declare _player: YouTubePlayer;
    declare _muted: boolean;
    declare _lastTime: number;
    declare _lastCurrentTime: number;
    declare playerState: number;
    declare autoplay: boolean | undefined;
    constructor({ parentNode, autoplay = true, volume = 0.3, playbackRate = 1, loop = false }: YouTubeWrapperParams) {
      super();
      this._isInitialized = false;
      this._parentNode = parentNode;
      this._autoplay = autoplay;
      this._volume = volume;
      this._playbackRate = playbackRate;
      this._loop = loop;
      this._startDiff = 0;

      this._isSeeking = false;
      this._seekTime = 0;

      this._onSeekEnd = _.debounce(this._onSeekEnd.bind(this), 500);
    }

    async setSrc(url: string, startSeconds = 0): Promise<void> {
      this._src = url;
      this._videoId = this._parseVideoId(url);
      this._canPlay = false;
      this._isSeeking = false;
      this._seekTime = 0;
      const player = this._player;
      const isFirst = !player;
      const urlParams = this._parseUrlParams(url);
      const tParam = urlParams.t ?? '';
      this._startDiff = /[0-9]+s/.test(tParam) ? parseInt(tParam) : 0;
      startSeconds += this._startDiff;
      if (isFirst && !url) {
        return Promise.resolve();
      }
      if (isFirst) {
        await this._initPlayer(this._videoId, startSeconds); //.then(({player}) => {
        // YouTube APIにはプレイリストのループしか存在しないため、
        // プレイリストにも同じ動画を入れる
        // player.loadPlaylist({list: [this._videoId]});
        // });
        return;
      }

      if (!url) {
        player.stopVideo();
        return;
      }

      player.loadVideoById({
        videoId: this._videoId,
        startSeconds: startSeconds,
      });
      player.loadPlaylist({ list: [this._videoId] });
    }

    set src(v: string) {
      void this.setSrc(v);
    }

    get src(): string {
      return this._src;
    }

    _parseVideoId(url: string): string | undefined {
      const text = textUtil as unknown as TextUtilLike;
      const videoId = (() => {
        const a = text.parseUrl(url);
        if (a.hostname === 'youtu.be') {
          return a.pathname.substring(1);
        } else {
          return text.parseQuery(a.search).v;
        }
      })();
      if (!videoId) {
        return videoId;
      }

      // 自動リンクでURLの前後につきそうな文字列を除去
      // たぶんYouTubeのVideoIdには使われない奴
      return videoId.replace(/[?[\]()"'@]/g, '').replace(/<[a-z0-9]*>/, '');
    }

    _parseUrlParams(url: string): Record<string, string> {
      const text = textUtil as unknown as TextUtilLike;
      const a = text.parseUrl(url);
      return a.search.startsWith('?') ? text.parseQuery(a.search) : {};
    }

    async _initPlayer(videoId: string | undefined, startSeconds = 0): Promise<{ player: YouTubePlayer } | undefined> {
      if (this._player) {
        return { player: this._player };
      }

      const YT = await this._initYT();
      await new Promise<void>((resolve) => {
        this._player = new YT.Player(this._parentNode, {
          videoId,
          events: {
            onReady: () => resolve(),
            onStateChange: this._onPlayerStateChange.bind(this),
            onPlaybackQualityChange: (e: YTStateEvent) => window.console.info('video quality: ', e.data),
            onError: (e: YTStateEvent) => this.emit('error', e),
          },
          playerVars: {
            autoplay: this.autoplay ? 0 : 1,
            volume: this._volume * 100,
            start: startSeconds,
            fs: 0,
            loop: 0,
            controls: 1,
            disablekb: 1,
            modestbranding: 0,
            playsinline: 1,
            rel: 0,
            showInfo: 1,
          },
        });
      });
      this._onPlayerReady();
    }

    async _initYT(): Promise<YouTubeNamespace> {
      const win = window as unknown as WindowWithYouTube;
      if (win.YT) {
        return win.YT;
      }

      return new Promise((resolve) => {
        if (win.onYouTubeIframeAPIReady) {
          win.onYouTubeIframeAPIReady_ = win.onYouTubeIframeAPIReady;
        }
        win.onYouTubeIframeAPIReady = () => {
          if (win.onYouTubeIframeAPIReady_) {
            win.onYouTubeIframeAPIReady = win.onYouTubeIframeAPIReady_;
          }
          resolve(win.YT as YouTubeNamespace);
        };
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        // tag.onload = () => resolve(window.YT);
        document.head.append(tag);
      });
    }

    _onPlayerReady(): void {
      this.emitAsync('loadedMetaData');
      // this.emitAsync('canplay');
    }

    _onPlayerStateChange(e: YTStateEvent): void {
      const state = e.data;
      this.playerState = state;
      const YT = (window as unknown as WindowWithYouTube).YT as YouTubeNamespace;
      switch (state) {
        case YT.PlayerState.ENDED:
          if (this._loop) {
            this.currentTime = 0;
            void this.play();
          } else {
            this.emit('ended');
          }
          break;
        case YT.PlayerState.PLAYING:
          if (!this._canPlay) {
            this._canPlay = true;
            this.muted = this._muted;
            this.emit('loadedmetadata');
            this.emit('canplay');
          }
          this.emit('play');
          this.emit('playing');
          if (this._isSeeking) {
            this.emit('seeked');
          }
          break;
        case YT.PlayerState.PAUSED:
          this.emit('pause');
          break;
        case YT.PlayerState.BUFFERING:
          //this.emit('stalled');
          break;
        case YT.PlayerState.CUED:
          break;
      }
    }

    play(): Promise<void> {
      this._player.playVideo();
      return Promise.resolve(); // 互換のため
    }

    pause(): void {
      this._player.pauseVideo();
    }

    get paused(): boolean {
      const YT = (window as unknown as WindowWithYouTube).YT;
      return YT ? this.playerState !== YT.PlayerState.PLAYING : true;
    }

    selectBestQuality(): void {
      const levels = this._player.getAvailableQualityLevels();
      const best = levels[0] as string;
      this._player.pauseVideo();
      this._player.setPlaybackQuality(best);
      this._player.playVideo();
      window.console.info('bestQuality', { levels, best, current: this._player.getPlaybackQuality() });
    }

    _onSeekEnd(): void {
      this._isSeeking = false;
      this._player.seekTo(this._seekTime + this._startDiff);
    }

    set currentTime(v: number) {
      this._isSeeking = true;
      this._seekTime = Math.max(0, Math.min(v, this.duration));
      this._onSeekEnd();
      this.emit('seeking');
    }

    get currentTime(): number {
      const now = performance.now();
      if (this._isSeeking) {
        this._lastTime = now;
        return this._seekTime;
      }
      const state = this._player.getPlayerState();
      const currentTime = this._player.getCurrentTime() + this._startDiff;

      if (state !== STATE_PLAYING || this._lastCurrentTime !== currentTime) {
        this._lastCurrentTime = currentTime;
        this._lastTime = now;
        return currentTime;
      }

      // 本家watchページ上ではなぜかgetCurrentTimeの精度が落ちるため、
      // status===PLAYINGにもかかわらずcurrentTimeが進んでいない時は、wrapper側で補完する。
      // 精度が落ちると断続的なstalled判定になりコメントがカクカクする
      const timeDiff = ((now - this._lastTime) * this.playbackRate) / 1000000;
      this._lastCurrentTime = Math.min(currentTime, this.duration);
      return currentTime + timeDiff;
    }

    get duration(): number {
      return this._player.getDuration() - this._startDiff;
    }

    set muted(v: boolean) {
      if (v) {
        this._player.mute();
      } else {
        this._player.unMute();
      }
      this._muted = !!v;
    }

    get muted(): boolean {
      return this._player.isMuted();
    }

    set volume(v: number) {
      if (this._volume !== v) {
        this._volume = v;
        this._player.setVolume(v * 100);
        this.emit('volumeChange', v);
      }
    }

    get volume(): number {
      return this._volume;
    }

    set playbackRate(v: number) {
      if (this._playbackRate !== v) {
        this._playbackRate = v;
        this._player.setPlaybackRate(v);
        //this.emit('changePlaybackRate');
      }
    }

    get playbackRate(): number {
      return this._playbackRate;
    }

    set loop(v: boolean) {
      if (this._loop !== v) {
        this._loop = v;
        this._player.setLoop(v);
      }
    }

    get loop(): boolean {
      return this._loop;
    }

    get _state(): number {
      return this._player.getPlayerState();
    }

    get playing(): boolean {
      return this._state === 1;
    }

    // 互換のためのダミー実装
    get videoWidth(): number {
      return 1280;
    }

    get videoHeight(): number {
      return 720;
    }

    getAttribute(k: string): unknown {
      return (this as unknown as Record<string, unknown>)[k];
    }

    removeAttribute(): void {}
  }

  return { YouTubeWrapper };
})();

(global as unknown as GlobalDebugLike).debug.YouTubeWrapper = YouTubeWrapper;

//===END===

export { YouTubeWrapper };
