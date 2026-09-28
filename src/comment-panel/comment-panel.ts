import _ from 'lodash';
import { global } from '../app/futatsume-watch-index';
import { Emitter } from '../shared/baselib';
import { Clipboard } from '../../packages/lib/src/dom/clipboard';
import type { NicoVideoPlayer } from '../nico-video-player/index';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import { CommentListModel } from './comment-list-model';
import type { CommentListItem } from './comment-list-item';
import { CommentListItemView } from './comment-list-item-view';
import { CommentPanelView } from './comment-panel-view';
import type { Uq, ChatListData, ThreadInfo } from './types';

interface CommentPanelParams {
  loader?: unknown;
  $container: Uq;
  player: NicoVideoPlayer;
  autoScroll?: boolean;
}
export class CommentPanel extends Emitter {
  private generation = 0;
  private readonly pendingChanges = new Set<string>();
  declare private _thumbInfoLoader: unknown;
  declare private _$container: Uq;
  declare private _player: NicoVideoPlayer;
  declare private _autoScroll: boolean;
  declare private _model: CommentListModel;
  declare private _view: CommentPanelView | undefined;
  declare private _timer: number | null | undefined;
  declare private _threadInfo: ThreadInfo | undefined;
  constructor(params: CommentPanelParams) {
    super();
    this._thumbInfoLoader = params.loader || global.api.ThumbInfoLoader;
    this._$container = params.$container;
    const player = (this._player = params.player);

    this._autoScroll = _.isBoolean(params.autoScroll) ? params.autoScroll : true;

    this._model = new CommentListModel({});

    player.on('commentParsed', _.debounce(this._onCommentParsed.bind(this), 500));
    player.on('commentChange', _.debounce(this._onCommentChange.bind(this), 500));
    player.on('commentReady', _.debounce(this._onCommentReady.bind(this), 500) as unknown as EmitterCallback);
    player.on('open', this._onPlayerOpen.bind(this));
    player.on('close', this._onPlayerClose.bind(this));

    global.debug.commentPanel = this;
  }
  _initializeView(): void {
    if (this._view) {
      return;
    }
    this._view = new CommentPanelView({
      $container: this._$container,
      model: this._model,
      commentPanel: this,
      builder: CommentListItemView,
      itemCss: (CommentListItemView as unknown as { __css__: unknown }).__css__,
    });
    this._view.on('command', this._onCommand.bind(this) as unknown as EmitterCallback);
  }
  startTimer() {
    this.stopTimer();
    this._timer = window.setInterval(this._onTimer.bind(this), 200);
  }
  stopTimer() {
    if (this._timer) {
      window.clearInterval(this._timer);
      this._timer = null;
    }
  }
  _onTimer(): void {
    if (this._autoScroll) {
      this.currentTime = (this._player as unknown as { currentTime: number }).currentTime;
    }
  }
  _onCommand(command: string, param: string | Record<string, unknown> | null, itemId?: string): void {
    let item: CommentListItem | undefined;
    if (itemId) {
      item = this._model.findByItemId(itemId);
    }
    switch (command) {
      case 'toggleScroll':
        this.toggleScroll();
        break;
      case 'sortBy': {
        const tmp = (param as string).split(':');
        this.sortBy(tmp[0] as string, tmp[1] === 'desc');
        break;
      }
      case 'select': {
        const vpos = item!.vpos;
        this.emit('command', 'seek', vpos / 100);
        // TODO: コメント強調
        break;
      }
      case 'clipBoard':
        void Clipboard.copyText(item!.text);
        this.emit('command', 'notify', 'クリップボードにコピーしました');
        break;
      case 'removeComment':
        if (item) this._changeComment('deleteChat', item);
        break;
      case 'addUserIdFilter':
        this._model.removeItem(item!);
        this.emit('command', command, item!.userId);
        break;
      case 'addWordFilter':
        this._model.removeItem(item!);
        this.emit('command', command, item!.text);
        break;
      case 'reloadComment':
        if (item) {
          param = { when: 0 };
          const dt = new Date(item.time);
          this.emit('command', 'notify', item.formattedDate + '頃のログ');
          param.when = Math.floor(dt.getTime() / 1000);
        }
        this.emit('command', command, param);

        break;
      case 'itemDetailRequest':
        if (item) {
          this.emit('itemDetailResp', item);
        }
        break;
      case 'nicoru':
        if (item && !item.nicotta) this._changeComment('nicoruChat', item);
        break;
      default:
        this.emit('command', command, param);
    }
  }
  _onCommentParsed(): void {
    void this._initializeView();
    this.setChatList((this._player as unknown as { chatList: ChatListData }).chatList);
    this.startTimer();
  }
  _onCommentChange(): void {
    void this._initializeView();
    this.setChatList((this._player as unknown as { chatList: ChatListData }).chatList);
  }
  _onCommentReady(result: unknown, threadInfo: ThreadInfo): void {
    this._threadInfo = threadInfo;
    this.emit('threadInfo', threadInfo);
  }
  _onPlayerOpen() {
    this.generation++;
    this.pendingChanges.clear();
    this._model.clear();
  }
  _onPlayerClose() {
    this.generation++;
    this.pendingChanges.clear();
    this._model.clear();
    this.stopTimer();
  }
  private _changeComment(operation: 'deleteChat' | 'nicoruChat', item: CommentListItem): void {
    const key = `${operation}:${item.itemId}`;
    if (this.pendingChanges.has(key)) return;
    this.pendingChanges.add(key);
    const generation = this.generation;
    void new Promise<{ count?: number } | void>((resolve, reject) =>
      this.emit(operation, { resolve, reject }, item.nicoChat)
    )
      .then((result) => {
        if (generation !== this.generation) return;
        if (operation === 'deleteChat') this._model.removeItem(item);
        else {
          item.nicotta = true;
          item.nicoru = result?.count ?? item.nicoru + 1;
          this._model.onUpdate(true);
        }
      })
      .catch((error: unknown) => {
        if (generation === this.generation)
          this.emit(
            'command',
            'alert',
            error instanceof Error ? error.message : 'コメントの変更に失敗しました。再試行してください。'
          );
      })
      .finally(() => this.pendingChanges.delete(key));
  }
  setChatList(chatList: ChatListData): void {
    if (!this._model) {
      return;
    }
    this.generation++;
    this.pendingChanges.clear();
    this._model.setChatList(chatList);
  }
  get isAutoScroll(): boolean {
    return this._autoScroll;
  }
  getThreadInfo(): ThreadInfo | undefined {
    return this._threadInfo;
  }
  toggleScroll(v?: boolean): void {
    if (!_.isBoolean(v)) {
      this._autoScroll = !this._autoScroll;
      if (this._autoScroll) {
        this._model.sortBy('vpos');
      }
      this.emit('update');
      return;
    }

    if (this._autoScroll !== v) {
      this._autoScroll = v;
      if (this._autoScroll) {
        this._model.sortBy('vpos');
      }
      this.emit('update');
    }
  }
  sortBy(key: string, isDesc?: boolean): void {
    this._model.sortBy(key, isDesc);
    if (key !== 'vpos') {
      this.toggleScroll(false);
    }
  }
  set currentTime(sec: number) {
    if (!this._view || (this._player as unknown as { currentTab: string }).currentTab !== 'comment') {
      return;
    }
    this._model.currentTime = sec;
  }
  get currentTime() {
    return this._model.currentTime;
  }
}
