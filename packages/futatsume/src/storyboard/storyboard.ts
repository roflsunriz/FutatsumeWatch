import { Emitter } from '../../../lib/src/emitter';
import { StoryboardInfoLoader } from '../../../lib/src/nico/storyboard-info-loader';
import { StoryboardView } from './storyboard-view';
import { StoryboardInfoModel } from './storyboard-info-model';
import { SeekBarThumbnail } from './seek-bar-thumbnail';
import { StoryboardWorker } from './storyboard-worker';
import { global } from '../../../../src/futatsume-watch-index';
import { nicoUtil } from '../../../lib/src/nico/nico-util';
import type { StoryboardRawData } from './storyboard-info-model';

interface PlayerConfigLike {
  props: Record<string, unknown>;
}

interface StoryboardParams {
  playerConfig: PlayerConfigLike;
  container?: Element | null;
  state: StoryboardState;
  loader?: unknown;
}

interface StoryboardState {
  isStoryboardAvailable: boolean;
}

interface StoryboardViewParams {
  model: StoryboardInfoModel;
  container?: Element | null;
  enable: unknown;
  state: StoryboardState;
}

interface StoryboardViewLike {
  setCurrentTime(sec: number, forceUpdate?: unknown): void;
  toggle(): void;
  readonly isEnable: boolean;
}

type StoryboardInfoLoadVideoInfo = Parameters<typeof StoryboardInfoLoader.load>[1];

interface NicoUtilLike {
  isPremium(): boolean;
}

interface GlobalDebugLike {
  debug: Record<string, unknown>;
}

interface StoryboardVideoInfo {
  hasStoryboard: boolean;
}

//===BEGIN===
//@require storyboard-info-model
//@require storyboard-view
//@require seek-bar-thumbnail
//@require storyboard-worker

class Storyboard extends Emitter {
  declare config: PlayerConfigLike;
  declare container: Element | null | undefined;
  declare state: StoryboardState;
  declare loader: unknown;
  declare model: StoryboardInfoModel;
  declare view: StoryboardViewLike | undefined;
  declare _watchId: string | undefined;
  declare _requestId: number | undefined;
  constructor(...args: [StoryboardParams]) {
    super();
    this.initialize(...args);
  }
  initialize(params: StoryboardParams): void {
    this.config = params.playerConfig;
    this.container = params.container;
    this.state = params.state;
    this.loader = params.loader || StoryboardInfoLoader;
    /** @type {StoryboardInfoModel} */
    this.model = new StoryboardInfoModel({});
    (global as unknown as GlobalDebugLike).debug.storyboard = this;
  }
  _initializeStoryboard(): void {
    if (this.view) {
      return;
    }
    const ViewClass = StoryboardView as unknown as new (params: StoryboardViewParams) => StoryboardViewLike;
    this.view = new ViewClass({
      model: this.model,
      container: this.container,
      enable: this.config.props.enableStoryboardBar,
      state: this.state,
    });
    void this.emitResolve('dom-ready');
  }
  reset(): void {
    this._requestId = undefined;
    if (!this.model) {
      return;
    }
    this.state.isStoryboardAvailable = false;
    this.model.reset();
    this.emit('reset', this.model);
  }
  onVideoCanPlay(watchId: string, videoInfo: StoryboardVideoInfo): void {
    this.reset();
    this._watchId = watchId;
    const nicoUtilLike = nicoUtil as unknown as NicoUtilLike;
    if (!this.config.props.enableStoryboard || !videoInfo.hasStoryboard || !nicoUtilLike.isPremium()) {
      return;
    }

    const resuestId = (this._requestId = Math.random());

    StoryboardInfoLoader.load(
      this.config.props.videoServerType as string,
      videoInfo as unknown as StoryboardInfoLoadVideoInfo
    )
      .then(async (info: unknown) => {
        await this.promise('dom-ready');
        return info;
      })
      .then(this._onStoryboardInfoLoad.bind(this, resuestId))
      .catch(this._onStoryboardInfoLoadFail.bind(this, resuestId));

    this._initializeStoryboard();
  }
  _onStoryboardInfoLoad(resuestId: unknown, rawData: unknown): void {
    if (resuestId !== this._requestId || !this.config.props.enableStoryboard || !nicoUtil.isPremium()) {
      return;
    } // video changed
    this.model.update(rawData as StoryboardRawData);
    this.emit('update', this.model);

    this.state.isStoryboardAvailable = this.model.isAvailable;
  }
  _onStoryboardInfoLoadFail(resuestId: unknown, err: unknown): void {
    if (resuestId !== this._requestId) {
      return;
    } // video changed
    console.warn('onStoryboardInfoFail', this._watchId, err);
    this.model.update(null);
    this.emit('update', this.model);
    this.state.isStoryboardAvailable = false;
  }
  setCurrentTime(sec: number, forceUpdate?: unknown): void {
    if (this.view && this.model.isAvailable) {
      this.view.setCurrentTime(sec, forceUpdate);
    }
  }
  set currentTime(sec: number) {
    this.setCurrentTime(sec);
  }
  toggle(): void {
    if (!this.view) {
      return;
    }
    this.view.toggle();
    this.config.props.enableStoryboardBar = this.view.isEnable;
  }
}

//===END===
export { Storyboard, SeekBarThumbnail, StoryboardWorker };
