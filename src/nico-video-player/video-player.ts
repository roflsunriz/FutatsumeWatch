import { global } from '../futatsume-watch-index';
import { util, Config } from '../util';
import { YouTubeWrapper } from '../../packages/futatsume/src/videoPlayer/you-tube-wrapper';
import { CONSTANT } from '../constant';
import { Emitter } from '../baselib';
import { MediaTimeline } from '../../packages/lib/src/dom/media-timeline';
import { ClassList } from '../../packages/lib/src/dom/class-list-wrapper';
import type { NvpUtil, NvpVideoPlayerParams, NvpYouTubePlayer } from './types';

class VideoPlayer extends Emitter {
  declare static __css__: string;
  declare _id: string;
  declare _videoElement: HTMLVideoElement;
  declare _currentVideo: HTMLVideoElement | NvpYouTubePlayer;
  declare _body: HTMLDivElement;
  declare classList: DOMTokenList;
  declare _touchWrapper: HTMLDivElement;
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

    this._touchWrapper = document.createElement('div');
    this._touchWrapper.className = 'touchWrapper';
    body.append(this._touchWrapper);

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

    const touch = (util as unknown as NvpUtil).$(this._touchWrapper);
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

//===END===

export { VideoPlayer };
