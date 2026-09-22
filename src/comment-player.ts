import { global } from './futatsume-watch-index';
import { Emitter } from '../packages/lib/src/emitter';
import { NicoComment, type SetChatsOptions } from '../packages/futatsume/src/commentLayer/nico-comment';
import { NicoChat, type NicoChatType } from '../packages/futatsume/src/commentLayer/nico-chat';
import { CommentOverlayView, type CommentMedia } from './comment-overlay-view';

export type CommentPlayerOptions = SetChatsOptions;
// 既存の設定ブリッジはキーを動的に指定する。
export interface CommentPlayerChatFilter {
  [key: string]: unknown;
}
export interface CommentPlayerParams {
  playbackRate?: number;
  showComment?: boolean;
  commentOpacity?: number;
  filter?: ConstructorParameters<typeof NicoComment>[0]['filter'];
  media?: CommentMedia;
}

class NicoCommentPlayer extends Emitter {
  readonly _model: NicoComment;
  readonly _view: CommentOverlayView;
  private generation = 0;

  constructor(params: CommentPlayerParams) {
    super();
    this._model = new NicoComment(params);
    this._view = new CommentOverlayView(this._model, params);
    this._model.on('change', () => {
      this._view.refresh();
      this.emit('change');
    });
    this._model.on('filterChange', (filter) => this.emit('filterChange', filter));
    this._model.on('parsed', () => {
      this._view.refresh();
      this.emit('parsed');
    });
    this._model.on('command', (command, param) => this.emit('command', command, param));
    global.debug.nicoCommentPlayer = this;
    void this.emitResolve('GetReady!');
  }
  setComment(data: unknown, options: CommentPlayerOptions = {}): void {
    const generation = ++this.generation;
    // データ境界は既存パーサーへ集約する。描画側へ未検証オブジェクトを渡さない。
    try {
      this._view.open();
      if (typeof data === 'string') {
        data =
          options.format === 'json' ? (JSON.parse(data) as unknown) : new DOMParser().parseFromString(data, 'text/xml');
      }
      let parsed: Promise<void>;
      if (data instanceof Document || (typeof data === 'object' && data !== null && 'getElementsByTagName' in data)) {
        parsed = this._model.setXml(data as Document, { ...options, format: 'xml' });
      } else if (options.format === 'threads') {
        parsed = this._model.setThreads(data as Parameters<NicoComment['setThreads']>[0], options);
      } else {
        parsed = this._model.setData(data as Parameters<NicoComment['setData']>[0], options);
      }
      void parsed.catch((error: unknown) => {
        if (generation === this.generation) this.reportError(error);
      });
    } catch (error) {
      this.reportError(error);
    }
  }
  private reportError(error: unknown): void {
    console.error('FutatsumeWatch comment-overlay:', error);
    this.emit(
      'command',
      'notify',
      `コメントを読み込めませんでした: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  getMymemory(): string {
    return this._view.export();
  }
  set currentTime(sec: number) {
    this._model.currentTime = sec;
  }
  get currentTime(): number {
    return this._model.currentTime;
  }
  set vpos(value: number) {
    this.currentTime = value / 100;
  }
  get vpos(): number {
    return this.currentTime * 100;
  }
  setVisibility(visible: boolean): void {
    this._view.setVisibility(visible);
  }
  addChat(text: string, cmd: string, vpos = this.vpos, options: Record<string, unknown> = {}): NicoChatType {
    const chat = NicoChat.create({ text, cmd, vpos, ...options });
    this._model.addChat(chat);
    this._view.refresh();
    return chat;
  }
  removeChat(chat: unknown): void {
    if (!(chat instanceof NicoChat)) return;
    this._model.removeChat(chat);
    this._view.refresh();
  }
  set playbackRate(value: number) {
    this._view.playbackRate = value;
  }
  get playbackRate(): number {
    return this._view.playbackRate;
  }
  mediaEvent(name: string): void {
    this._view.mediaEvent(name);
  }
  setAspectRatio(ratio: number): void {
    this._view.setAspectRatio(ratio);
  }
  resize(): void {
    this._view.resize();
  }
  appendTo(node: Node): void {
    if (!(node instanceof HTMLElement)) throw new TypeError('コメント描画先がHTMLElementではありません');
    this._view.appendTo(node);
  }
  show(): void {
    this.setVisibility(true);
  }
  hide(): void {
    this.setVisibility(false);
  }
  close(): void {
    this.generation++;
    this._model.clear();
    this._view.close();
  }
  get filter(): CommentPlayerChatFilter {
    return this._model.filter as unknown as CommentPlayerChatFilter;
  }
  get chatList(): NicoComment['chatList'] {
    return this._model.chatList;
  }
  get nonFilteredChatList(): NicoComment['nonFilteredChatList'] {
    return this._model.nonFilteredChatList;
  }
  get nonfilteredChatList(): NicoComment['nonFilteredChatList'] {
    return this.nonFilteredChatList;
  }
  export(): string {
    return this._view.exportXml();
  }
  getCurrentScreenHtml(): string {
    return this._view.getCurrentScreenHtml();
  }
  get canvas(): HTMLCanvasElement | null {
    return this._view.renderer?.canvas ?? null;
  }
}

Object.assign(global.debug, { NicoChat });

export { NicoCommentPlayer, NicoComment, NicoChat };
