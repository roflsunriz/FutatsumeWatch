import _ from 'lodash';
import { Emitter } from '../../../lib/src/Emitter';
import { SlotLayoutWorker } from './SlotLayoutWorker';
import { NicoChatGroupViewModel } from './NicoChatGroupViewModel';
import { NicoChat } from './NicoChat';
import { Config } from '../../../../src/Config';
import { NicoComment } from './NicoComment';
import type { NicoChatGroup } from './NicoChatGroup';

interface NicoCommentLike {
  getGroup(type: string): NicoChatGroup;
  on(name: string, handler: (...args: unknown[]) => void): void;
}

interface NicoCommentStaticLike {
  offscreenLayer: { get(): Promise<unknown> };
}

interface ConfigNamespaceLike {
  props: Record<string, unknown>;
}

interface ConfigLike {
  namespace(name: string): ConfigNamespaceLike;
}

interface SlotLayoutWorkerLike {
  post(message: unknown): Promise<unknown>;
}

interface SlotLayoutResult {
  lastUpdate: unknown;
  top: Array<{ slot: unknown }>;
  naka: Array<{ slot: unknown }>;
  bottom: Array<{ slot: unknown }>;
}

interface CommentBulkLayoutData {
  top: unknown[];
  naka: unknown[];
  bottom: unknown[];
}
//===BEGIN===

class NicoCommentViewModel extends Emitter {
  declare _offScreen: unknown;
  declare _currentTime: number;
  declare _lastUpdate: number;
  declare _topGroup: NicoChatGroupViewModel;
  declare _nakaGroup: NicoChatGroupViewModel;
  declare _bottomGroup: NicoChatGroupViewModel;
  declare _slotLayoutWorker: SlotLayoutWorkerLike | null | undefined;
  constructor(...args: [NicoCommentLike]) {
    super();
    void this.initialize(...args);
  }
  async initialize(nicoComment: NicoCommentLike): Promise<void> {
    const offScreen = (this._offScreen = await (NicoComment as unknown as NicoCommentStaticLike).offscreenLayer.get());

    this._currentTime = 0;
    this._lastUpdate = 0;

    this._topGroup = new NicoChatGroupViewModel(nicoComment.getGroup(NicoChat.TYPE.TOP), offScreen);
    this._nakaGroup = new NicoChatGroupViewModel(nicoComment.getGroup(NicoChat.TYPE.NAKA), offScreen);
    this._bottomGroup = new NicoChatGroupViewModel(nicoComment.getGroup(NicoChat.TYPE.BOTTOM), offScreen);

    const config = (Config as unknown as ConfigLike).namespace('commentLayer');
    if (config.props.enableSlotLayoutEmulation) {
      this._slotLayoutWorker = SlotLayoutWorker.create();
      this._updateSlotLayout = _.debounce(this._updateSlotLayout.bind(this), 100) as () => Promise<void>;
    }

    nicoComment.on('setData', this._onSetData.bind(this));
    nicoComment.on('clear', this._onClear.bind(this));
    nicoComment.on('change', this._onChange.bind(this));
    nicoComment.on('parsed', this._onCommentParsed.bind(this));
    nicoComment.on('currentTime', (sec: unknown) => this._onCurrentTime(sec as number));
  }
  _onSetData(): void {
    this.emit('setData');
  }
  _onClear(): void {
    this._topGroup.reset();
    this._nakaGroup.reset();
    this._bottomGroup.reset();

    this._lastUpdate = Date.now();
    this.emit('clear');
  }
  _onCurrentTime(sec: number): void {
    this._currentTime = sec;
    this.emit('currentTime', this._currentTime);
  }
  _onChange(e: unknown): void {
    this._lastUpdate = Date.now();
    void this._updateSlotLayout();
    console.log('NicoCommentViewModel.onChange: ', e);
  }
  _onCommentParsed(): void {
    this._lastUpdate = Date.now();
    void this._updateSlotLayout();
  }
  async _updateSlotLayout(): Promise<void> {
    if (!this._slotLayoutWorker) {
      return;
    }

    window.console.time('SlotLayoutWorker call');
    const result = (await this._slotLayoutWorker.post({
      command: 'layout',
      params: {
        lastUpdate: this._lastUpdate,
        top: this._topGroup.bulkSlotData,
        naka: this._nakaGroup.bulkSlotData,
        bottom: this._bottomGroup.bulkSlotData,
      },
    })) as SlotLayoutResult;
    if (result.lastUpdate !== this._lastUpdate) {
      console.warn('slotLayoutWorker changed', this._lastUpdate, result.lastUpdate);
      return;
    }
    this._topGroup.bulkSlotData = result.top;
    this._nakaGroup.bulkSlotData = result.naka;
    this._bottomGroup.bulkSlotData = result.bottom;
    window.console.timeEnd('SlotLayoutWorker call');
  }
  get currentTime(): number {
    return this._currentTime;
  }
  export(): string {
    const result: string[] = [];

    result.push(['<comment ', '>'].join(''));

    result.push(this._nakaGroup.export());
    result.push(this._topGroup.export());
    result.push(this._bottomGroup.export());

    result.push('</comment>');
    return result.join('\n');
  }
  getGroup(type: string): NicoChatGroupViewModel {
    switch (type) {
      case NicoChat.TYPE.TOP:
        return this._topGroup;
      case NicoChat.TYPE.BOTTOM:
        return this._bottomGroup;
      default:
        return this._nakaGroup;
    }
  }
  get bulkLayoutData(): CommentBulkLayoutData {
    return {
      top: this._topGroup.bulkLayoutData,
      naka: this._nakaGroup.bulkLayoutData,
      bottom: this._bottomGroup.bulkLayoutData,
    };
  }
  set bulkLayoutData(data: CommentBulkLayoutData) {
    this._topGroup.bulkLayoutData = data.top;
    this._nakaGroup.bulkLayoutData = data.naka;
    this._bottomGroup.bulkLayoutData = data.bottom;
  }
}
//===END===

export { NicoCommentViewModel };
