import * as _ from 'lodash';
import { Emitter } from '../../packages/lib/src/emitter';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import { VideoControlBar } from '../video-control-bar/index';
import { css, cssUtil } from '../../packages/lib/src/css/css';
import type { DialogPlayerConfig, VariablesMapperState } from './types';
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

export { VariablesMapper };
