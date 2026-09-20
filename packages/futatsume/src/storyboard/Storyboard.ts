import { Emitter } from '../../../lib/src/Emitter';
import { StoryboardInfoLoader } from '../../../lib/src/nico/StoryboardInfoLoader';
import { StoryboardView } from './StoryboardView';
import { StoryboardInfoModel } from './StoryboardInfoModel';
import { SeekBarThumbnail } from './SeekBarThumbnail';
import { StoryboardWorker } from './StoryboardWorker';
import { global } from '../../../../src/FutatsumeWatchIndex';
import { nicoUtil } from '../../../lib/src/nico/nicoUtil';
import type { StoryboardRawData } from './StoryboardInfoModel';

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
//@require StoryboardInfoModel
//@require StoryboardView
//@require SeekBarThumbnail
//@require StoryboardWorker

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
    if (!this.model) {
      return;
    }
    this.state.isStoryboardAvailable = false;
    this.model.reset();
    this.emit('reset', this.model);
  }
  onVideoCanPlay(watchId: string, videoInfo: StoryboardVideoInfo): void {
    const nicoUtilLike = nicoUtil as unknown as NicoUtilLike;
    if (!this.config.props.enableStoryboard || !videoInfo.hasStoryboard || !nicoUtilLike.isPremium()) {
      return;
    }

    this._watchId = watchId;
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
    if (resuestId !== this._requestId) {
      return;
    } // video changed
    this.model.update(rawData as StoryboardRawData);
    this.emit('update', this.model);

    this.state.isStoryboardAvailable = true;
  }
  _onStoryboardInfoLoadFail(resuestId: unknown, err: unknown): void {
    console.warn('onStoryboardInfoFail', this._watchId, err);
    if (resuestId !== this._requestId) {
      return;
    } // video changed
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
