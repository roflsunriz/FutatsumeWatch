import { util } from '../util';
import type { DialogPlayerConfig } from './types';
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
          if (['autoPlay', 'screenMode'].includes(key)) {
            return `${key}:${mode}`;
          }
          break;
      }
      return key;
    };
    return config;
  }
}
export { PlayerConfig };
