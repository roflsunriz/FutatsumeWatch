import _ from 'lodash';
import { Emitter } from './baselib';
import { global } from './futatsume-watch-index';
import { CONSTANT } from './constant';
import type { ConfigProps } from './config';
import { nicoUtil } from '../packages/lib/src/nico/nico-util';

interface StateEmitter {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener?: (...args: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
}

interface StateEmitterCtor {
  new (): StateEmitter;
}

export interface PlayerVideoInfo {
  update(info: PlayerVideoInfo): void;
  count: unknown;
  betterThumbnail: string;
  watchUrl: string;
}

interface PlayerConfigLike {
  props: ConfigProps;
}
//===BEGIN===

class BaseState extends (Emitter as unknown as StateEmitterCtor) {
  static instance: BaseState | undefined;
  declare public name: string;
  protected _name!: string;
  protected _state!: Record<string, unknown>;
  protected _changed!: Map<string, unknown>;
  protected _timestamp!: number;
  protected _boundOnChange!: () => void;
  static getInstance(...args: unknown[]): BaseState | undefined {
    // サブクラスの初期化引数を受け付ける共通ファクトリー。
    void args;

    if (!this.instance) {
      this.instance = new (this.constructor as unknown as new () => BaseState)();
    }
    return this.instance;
  }

  static defineProps(self: BaseState, props: Record<string, unknown> = {}): void {
    const def: PropertyDescriptorMap & ThisType<unknown> = {};
    Object.keys(props)
      .sort()
      .forEach((key) => {
        def[key] = {
          enumerable: !key.startsWith('_'),
          get() {
            return self._state[key];
          },
          set(val) {
            self.setState(key, val);
          },
        };
      });
    Object.defineProperties(self, def);
  }

  constructor(state: Record<string, unknown>) {
    super();

    this._name = '';
    this._state = state;
    this._changed = new Map<string, unknown>();
    this._timestamp = performance.now();
    this._boundOnChange = _.debounce(this._onChange.bind(this), 0);
    (this.constructor as unknown as typeof BaseState).defineProps(this, state);
  }
  _updateTimestamp() {
    return (this._timestamp = performance.now());
  }

  onkey(key: string, func: (...args: unknown[]) => void): unknown {
    return this.on(`update-${key}`, func);
  }
  offkey(key: string, func: (...args: unknown[]) => void): unknown {
    return this.off(`update-${key}`, func);
  }

  _onChange() {
    const changed = new Map(this._changed);
    if (!changed.size) {
      return;
    }
    this._changed.clear();
    this.emit('change', changed, changed.size);
    for (const [key, val] of changed) {
      if (!Object.is(this._state[key], val)) continue;
      this.emit('update', key, val);
      if (Object.is(this._state[key], val)) this.emit(`update-${key}`, val);
    }
  }

  setState(key: string | Record<string, unknown> | Map<string, unknown>, val?: unknown): void {
    if (typeof key === 'string') {
      return this._setState(key, val);
    }
    for (const [k, v] of key instanceof Map ? key : Object.entries(key)) {
      this._setState(k, v);
    }
  }

  _setState(key: string, val: unknown): void {
    if (!Object.prototype.hasOwnProperty.call(this._state, key)) {
      console.warn('%cUnknown property %s = %s', 'background: yellow;', key, val);
    }
    if (this._state[key] === val) {
      return;
    }
    this._state[key] = val;
    this._changed.set(key, val);
    this._boundOnChange();
  }
}

class PlayerState extends BaseState {
  static instance: PlayerState | undefined;
  declare public isAbort: boolean;
  declare public isChanging: boolean;
  declare public isCanPlay: boolean;
  declare public isChannel: boolean;
  declare public isShowComment: boolean;
  declare public isCommentReady: boolean;
  declare public isCommentPosting: boolean;
  declare public isCommunity: boolean;
  declare public isWaybackMode: boolean;
  declare public isDebug: boolean;
  declare public isError: boolean;
  declare public isEnded: boolean;
  declare public isLoading: boolean;
  declare public isLoop: boolean;
  declare public isAutoPlay: boolean;
  declare public isMute: boolean;
  declare public isMymemory: boolean;
  declare public isLiked: boolean;
  declare public isOpen: boolean;
  declare public isPausing: boolean;
  declare public isPlaylistEnable: boolean;
  declare public isPlaying: boolean;
  declare public isSeeking: boolean;
  declare public isRegularUser: boolean;
  declare public isStalled: boolean;
  declare public isUpdatingDeflist: boolean;
  declare public isUpdatingMylist: boolean;
  declare public isNotPlayed: boolean;
  declare public isYouTube: boolean;
  declare public isEnableFilter: boolean;
  declare public sharedNgLevel: string;
  declare public currentSrc: string;
  declare public currentTab: string;
  declare public errorMessage: string;
  declare public screenMode: string;
  declare public playbackRate: number;
  declare public thumbnail: string;
  declare public videoCount: unknown;
  declare public videoSession: unknown;
  private _videoInfo!: PlayerVideoInfo;
  private _chatList!: unknown;
  static getInstance(config: PlayerConfigLike): PlayerState {
    if (!PlayerState.instance) {
      PlayerState.instance = new PlayerState(config);
    }
    return PlayerState.instance;
  }
  constructor(config: PlayerConfigLike) {
    super({
      isAbort: false,
      isChanging: false,
      isCanPlay: false,
      isChannel: false,
      isShowComment: config.props.showComment,
      isCommentReady: false,
      isCommentPosting: false,
      isCommunity: false,
      isWaybackMode: false,
      isDebug: config.props.debug,
      isError: false,
      isEnded: false,
      isLoading: false,
      isLoop: config.props.loop,
      isAutoPlay: config.props.autoPlay,
      isMute: config.props.mute,
      isMymemory: false,
      isLiked: false,
      isOpen: false,
      isPausing: true,
      isPlaylistEnable: false,
      isPlaying: false,
      isSeeking: false,
      isRegularUser: !nicoUtil.isPremium(),
      isStalled: false,
      isUpdatingDeflist: false,
      isUpdatingMylist: false,
      isNotPlayed: true,
      isYouTube: false,

      isEnableFilter: config.props.enableFilter,
      sharedNgLevel: config.props.sharedNgLevel,

      currentSrc: '',
      currentTab: config.props.videoInfoPanelTab,
      // aspectRatio: 9/16,

      errorMessage: '',
      screenMode: config.props.screenMode,
      playbackRate: config.props.playbackRate,
      thumbnail: '',
      videoCount: {},
      videoSession: {},
    });
    this.name = 'Player';
  }

  set videoInfo(videoInfo: PlayerVideoInfo) {
    if (this._videoInfo) {
      this._videoInfo.update(videoInfo);
    } else {
      this._videoInfo = videoInfo;
    }
    global.debug.videoInfo = videoInfo;
    this.videoCount = videoInfo.count;
    this.thumbnail = videoInfo.betterThumbnail;
    this.emit('update-videoInfo', videoInfo);
  }

  get videoInfo() {
    return this._videoInfo;
  }

  set chatList(chatList: unknown) {
    this._chatList = chatList;
    this.emit('update-chatList', this._chatList);
  }

  get chatList() {
    return this._chatList;
  }

  resetVideoLoadingStatus() {
    this.setState({
      isLoading: true,
      isPlaying: false,
      isPausing: true,
      isCanPlay: false,
      isSeeking: false,
      isStalled: false,
      isError: false,
      isAbort: false,
      isMymemory: false,
      isCommunity: false,
      isChannel: false,
      isEnded: false,
      currentSrc: CONSTANT.BLANK_VIDEO_URL,
    });
  }

  setVideoCanPlay() {
    this.setState({
      isStalled: false,
      isLoading: false,
      isPausing: true,
      isNotPlayed: true,
      isError: false,
      isSeeking: false,
      isCanPlay: true,
      isEnded: false,
    });
  }

  setPlaying() {
    this.setState({
      isPlaying: true,
      isPausing: false,
      isCanPlay: false,
      isLoading: false,
      isNotPlayed: false,
      isError: false,
      isStalled: false,
      isEnded: false,
    });
  }

  setPausing() {
    this.setState({ isPlaying: false, isPausing: true });
  }

  setVideoEnded() {
    this.setState({ isPlaying: false, isPausing: true, isSeeking: false, isEnded: true });
  }

  setVideoErrorOccurred() {
    this.setState({ isError: true, isPlaying: false, isPausing: true, isLoading: false, isSeeking: false });
  }
}

class VideoControlState extends BaseState {
  constructor(state = {}) {
    super(
      Object.assign(
        {
          isSeeking: false,
          isDragging: false,
          isWheelSeeking: false,
          isStoryboardAvailable: false,
        },
        state
      )
    );
    this.name = 'VideoControl';
  }
}
//===END===

export { BaseState, PlayerState, VideoControlState };
