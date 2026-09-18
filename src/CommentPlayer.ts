import * as _ from 'lodash';
import { global } from './ZenzaWatchIndex';
import { Config, PopupMessage, VideoCaptureUtil } from './util';
import { NicoScripter } from '../packages/zenza/src/commentLayer/NicoScripter';
import { SlotLayoutWorker } from '../packages/zenza/src/commentLayer/SlotLayoutWorker';
import { Emitter } from './baselib';
import { bounce } from '../packages/lib/src/infra/bounce';
import { sleep } from '../packages/lib/src/infra/sleep';

import { CommentLayer } from '../packages/zenza/src/commentLayer/CommentLayer';
import { NicoChatFilter } from '../packages/zenza/src/commentLayer/NicoChatFilter';
import { NicoTextParser } from '../packages/zenza/src/commentLayer/NicoTextParser';
import { NicoChat } from '../packages/zenza/src/commentLayer/NicoChat';
import { NicoChatViewModel } from '../packages/zenza/src/commentLayer/NicoChatViewModel';
import { OffscreenLayer } from '../packages/zenza/src/commentLayer/OffscreenLayer';
import { NicoChatCss3View } from '../packages/zenza/src/commentLayer/NicoChatCss3View';
import { NicoChatGroup } from '../packages/zenza/src/commentLayer/NicoChatGroup';
import { NicoChatGroupViewModel } from '../packages/zenza/src/commentLayer/NicoChatGroupViewModel';
import { NicoComment } from '../packages/zenza/src/commentLayer/NicoComment';
import { NicoCommentViewModel } from '../packages/zenza/src/commentLayer/NicoCommentViewModel';
import { NicoCommentCss3PlayerView } from '../packages/zenza/src/commentLayer/NicoCommentCss3PlayerView';
import type { ConfigStore } from './Config';

interface CommentPlayerEmitter {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  emitResolve(...args: unknown[]): unknown;
}

interface CommentPlayerEmitterCtor {
  new (): CommentPlayerEmitter;
}

export interface CommentPlayerOptions {
  format?: string;
}

export interface CommentPlayerParams {
  playbackRate?: number;
  showComment?: boolean;
  commentOpacity?: number;
}

export interface CommentPlayerChatFilter {
  [key: string]: unknown;
}

export interface CommentPlayerModel {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  setData(data: unknown, options: CommentPlayerOptions): void;
  setXml(doc: Document, options: CommentPlayerOptions): void;
  setThreads(data: unknown, options: CommentPlayerOptions): void;
  addChat(chat: unknown): void;
  removeChat(chat: unknown): void;
  clear(): void;
  currentTime: number;
  filter: CommentPlayerChatFilter;
  chatList: unknown;
  nonfilteredChatList: unknown;
}

export interface CommentPlayerViewModel {
  export(): unknown;
}

export interface CommentPlayerView {
  refresh(): void;
  show(): void;
  hide(): void;
  clear(): void;
  export(): unknown;
  getCurrentScreenHtml(): unknown;
  playbackRate: number;
  setAspectRatio(ratio: number): void;
  appendTo(node: Node): void;
}

interface CommentPlayerModelCtor {
  new (params: CommentPlayerParams): CommentPlayerModel;
}

interface CommentPlayerViewModelCtor {
  new (model: CommentPlayerModel): CommentPlayerViewModel;
}

interface CommentPlayerViewCtor {
  new (options: {
    viewModel: CommentPlayerViewModel;
    playbackRate?: number;
    show?: boolean;
    opacity?: number;
  }): CommentPlayerView;
}

interface CommentPlayerChatCtor {
  create(data: Record<string, unknown>): unknown;
}

interface CommentPlayerSpeedRateHolder {
  SPEED_RATE: number;
  emitter: { emit(event: string, ...args: unknown[]): unknown };
}
//===BEGIN===
//@require NicoTextParser
//@require CommentLayer

//@require NicoChat
//@require NicoChatViewModel
//@require NicoChatCss3View
//@require NicoChatFilter

class NicoCommentPlayer extends (Emitter as unknown as CommentPlayerEmitterCtor) {
  private _model!: CommentPlayerModel;
  private _viewModel!: CommentPlayerViewModel;
  private _view!: CommentPlayerView;
  constructor(params: CommentPlayerParams) {
    super();

    this._model = new (NicoComment as unknown as CommentPlayerModelCtor)(params);
    this._viewModel = new (NicoCommentViewModel as unknown as CommentPlayerViewModelCtor)(this._model);
    this._view = new (NicoCommentCss3PlayerView as unknown as CommentPlayerViewCtor)({
      viewModel: this._viewModel,
      playbackRate: params.playbackRate,
      show: params.showComment,
      opacity: _.isNumber(params.commentOpacity) ? params.commentOpacity : 1.0,
    });

    const onCommentChange = _.throttle(this._onCommentChange.bind(this), 1000);
    this._model.on('change', onCommentChange);
    this._model.on('filterChange', this._onFilterChange.bind(this));
    this._model.on('parsed', this._onCommentParsed.bind(this));
    this._model.on('command', this._onCommand.bind(this));
    global.emitter.on('commentLayoutChange', onCommentChange);

    global.debug.nicoCommentPlayer = this;
    this.emitResolve('GetReady!');
  }
  setComment(data: unknown, options: CommentPlayerOptions): void {
    if (typeof data === 'string') {
      if (options.format === 'json') {
        this._model.setData(JSON.parse(data) as unknown, options);
      } else {
        this._model.setXml(new DOMParser().parseFromString(data, 'text/xml'), options);
      }
    } else if (typeof (data as { getElementsByTagName?: unknown }).getElementsByTagName === 'function') {
      this._model.setXml(data as Document, options);
    } else if (options.format === 'threads') {
      this._model.setThreads(data, options);
    } else {
      this._model.setData(data, options);
    }
  }
  _onCommand(command: unknown, param: unknown): void {
    this.emit('command', command, param);
  }
  _onCommentChange(e: unknown): void {
    console.log('onCommentChange', e);
    if (this._view) {
      setTimeout(() => this._view.refresh(), 0);
    }
    this.emit('change');
  }
  _onFilterChange(nicoChatFilter: unknown): void {
    this.emit('filterChange', nicoChatFilter);
  }
  _onCommentParsed(): void {
    this.emit('parsed');
  }
  getMymemory(): unknown {
    if (!this._view) {
      this._view = new (NicoCommentCss3PlayerView as unknown as CommentPlayerViewCtor)({
        viewModel: this._viewModel,
      });
    }
    return this._view.export();
  }
  set currentTime(sec: number) {
    this._model.currentTime = sec;
  }
  get currentTime(): number {
    return this._model.currentTime;
  }
  set vpos(vpos: number) {
    this._model.currentTime = vpos / 100;
  }
  get vpos(): number {
    return this._model.currentTime * 100;
  }

  setVisibility(v: boolean): void {
    if (v) {
      this._view.show();
    } else {
      this._view.hide();
    }
  }
  addChat(text: string, cmd: string, vpos?: number, options?: Record<string, unknown>): unknown {
    if (typeof vpos !== 'number') {
      vpos = this.vpos;
    }
    const nicoChat = (NicoChat.create as unknown as CommentPlayerChatCtor['create'])(
      Object.assign({ text, cmd, vpos }, options)
    );
    this._model.addChat(nicoChat);

    return nicoChat;
  }
  removeChat(nicoChat: unknown): void {
    this._model.removeChat(nicoChat);
  }
  set playbackRate(v: number) {
    if (this._view) {
      this._view.playbackRate = v;
    }
  }
  get playbackRate(): number {
    if (this._view) {
      return this._view.playbackRate;
    }
    return 1;
  }
  setAspectRatio(ratio: number): void {
    this._view.setAspectRatio(ratio);
  }
  appendTo(node: Node): void {
    this._view.appendTo(node);
  }
  show(): void {
    this._view.show();
  }
  hide(): void {
    this._view.hide();
  }
  close(): void {
    this._model.clear();
    if (this._view) {
      this._view.clear();
    }
  }
  get filter(): CommentPlayerChatFilter {
    return this._model.filter;
  }
  // getChatList() {return this._model.getChatList();}
  get chatList(): unknown {
    return this._model.chatList;
  }
  /**
   * NGフィルタなどのかかってない全chatを返す
   */
  get nonfilteredChatList(): unknown {
    return this._model.nonfilteredChatList;
  }
  // getNonfilteredChatList() {return this._model.getNonfilteredChatList();}
  export(): unknown {
    return this._viewModel.export();
  }
  getCurrentScreenHtml(): unknown {
    return this._view.getCurrentScreenHtml();
  }
}

//@require NicoComment
//@require OffscreenLayer
(NicoComment as unknown as { offscreenLayer: unknown }).offscreenLayer = (
  OffscreenLayer as unknown as (config: ConfigStore) => unknown
)(Config);
//@require NicoCommentViewModel
//@require NicoChatGroup
//@require NicoChatGroupViewModel

const updateSpeedRate = (): void => {
  const speedRateHolder = NicoChatViewModel as unknown as CommentPlayerSpeedRateHolder;
  let rate = Config.props.commentSpeedRate * 1;
  if (Config.props.autoCommentSpeedRate) {
    rate = rate / Math.max(Config.props.playbackRate, 1);
  }
  // window.console.info('updateSpeedRate', rate, Config.getValue('commentSpeedRate'), NicoChatViewModel.SPEED_RATE);
  if (rate !== speedRateHolder.SPEED_RATE) {
    speedRateHolder.SPEED_RATE = rate;
    speedRateHolder.emitter.emit('updateCommentSpeedRate', rate);
  }
};
Config.onkey('commentSpeedRate', updateSpeedRate);
Config.onkey('autoCommentSpeedRate', updateSpeedRate);
Config.onkey('playbackRate', updateSpeedRate);
updateSpeedRate();

//@require NicoCommentCss3PlayerView

Object.assign(global.debug, {
  NicoChat,
  NicoChatViewModel,
});
//===END===

export {
  NicoCommentPlayer,
  NicoComment,
  NicoCommentViewModel,
  NicoChatGroup,
  NicoChatGroupViewModel,
  NicoChat,
  NicoChatViewModel,
  NicoCommentCss3PlayerView,
  NicoChatFilter,
};
