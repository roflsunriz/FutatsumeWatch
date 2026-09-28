import * as _ from 'lodash';
import type { DialogPlayerConfig, MylistLoadOptions, VideoWatchOptionBag } from './types';
class VideoWatchOptions {
  declare private _watchId: string;
  declare private _options: VideoWatchOptionBag;
  declare private _config: DialogPlayerConfig;
  constructor(watchId: string, options: VideoWatchOptionBag | undefined, config: DialogPlayerConfig) {
    this._watchId = watchId;
    this._options = options || {};
    this._config = config;
  }
  get rawData() {
    return this._options;
  }
  get eventType() {
    return this._options.eventType || '';
  }
  get query() {
    return this._options.query || {};
  }
  get videoLoadOptions(): { economy: boolean } {
    const options = {
      economy: this.isEconomySelected,
    };
    return options;
  }
  get mylistLoadOptions(): MylistLoadOptions {
    const options: MylistLoadOptions = { shuffle: false, watchId: '' };
    const query = this.query;
    options.shuffle = parseInt(query.shuffle as string, 10) === 1;
    options.watchId = this._watchId;
    return options;
  }
  get isPlaylistStartRequest(): boolean {
    const eventType = this.eventType;
    const query = this.query;
    if (eventType !== 'click' || query.continuous !== '1') {
      return false;
    }
    if (query.playlist!.type) {
      return true;
    }
    return false;
  }
  hasKey(key: string): boolean {
    return _.has(this._options, key);
  }
  get isOpenNow() {
    return this._options.openNow === true;
  }
  get isEconomySelected() {
    return _.isBoolean(this._options.economy)
      ? this._options.economy
      : this._config.getValue('smileVideoQuality') === 'eco';
  }
  get isAutoCloseFullScreen() {
    return !!this._options.autoCloseFullScreen;
  }
  get isReload(): boolean {
    return (this._options.reloadCount as number) > 0;
  }
  get reloadCount() {
    return this._options.reloadCount;
  }
  get currentTime(): number {
    if (_.isNumber(this._options.currentTime)) {
      return parseFloat(this._options.currentTime as unknown as string);
    }

    return !isNaN(this.query.from as unknown as number) ? parseFloat(this.query.from as string) : 0;
  }
  set currentTime(value: number) {
    if (Number.isFinite(value)) this._options.currentTime = Math.max(0, value);
  }
  createForVideoChange(options: VideoWatchOptionBag | undefined): VideoWatchOptionBag {
    options = options || {};
    delete this._options.economy;
    _.defaults(options, this._options);
    options.openNow = true;
    options.currentTime = 0;
    options.reloadCount = 0;
    options.query = {};
    return options;
  }
  createForReload(options: VideoWatchOptionBag | undefined): VideoWatchOptionBag {
    options = options || {};
    delete this._options.economy;
    _.defaults(options, this._options);
    options.openNow = true;
    options.reloadCount = options.reloadCount ? options.reloadCount + 1 : 1;
    options.query = {};
    return options;
  }
  createForSession(options?: VideoWatchOptionBag): VideoWatchOptionBag {
    options = options || {};
    _.defaults(options, this._options);
    options.query = {};
    return options;
  }
}
export { VideoWatchOptions };
