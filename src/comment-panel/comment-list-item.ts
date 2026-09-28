import { textUtil } from '../../packages/lib/src/text/text-util';
import type { NicoChatItem } from './types';
export class CommentListItem {
  declare nicoChat: NicoChatItem;
  declare private _itemId: number;
  declare private _vpos: number;
  declare private _text: string;
  declare private _escapedText: string;
  declare private _userId: string;
  declare private _date: number;
  declare private _fork: number;
  declare private _no: number;
  declare private _color: string;
  declare private _fontCommand: string;
  declare private _isSubThread: boolean;
  declare private _formattedDate: string;
  declare private _timePos: string;
  declare static _itemId: number;
  constructor(nicoChat: NicoChatItem) {
    this.nicoChat = nicoChat;
    this._itemId = CommentListItem._itemId++;
    this._vpos = nicoChat.vpos as unknown as number;
    this._text = nicoChat.text;
    this._escapedText = textUtil.escapeHtml(this._text);
    this._userId = nicoChat.userId;
    this._date = nicoChat.date;
    this._fork = nicoChat.fork;
    this._no = nicoChat.no;
    this._color = nicoChat.color;
    this._fontCommand = nicoChat.fontCommand;
    this._isSubThread = nicoChat.isSubThread;

    this._formattedDate = textUtil.dateToString(this._date * 1000);
    this._timePos = textUtil.secToTime(this._vpos / 100);
  }
  get itemId(): number {
    return this._itemId;
  }
  get vpos(): number {
    return this._vpos;
  }
  get timePos(): string {
    return this._timePos;
  }
  get cmd(): string {
    return this.nicoChat.cmd;
  }
  get text() {
    return this._text;
  }
  get escapedText() {
    return this._escapedText;
  }
  get userId() {
    return this._userId;
  }
  get color() {
    return this._color;
  }
  get date() {
    return this._date;
  }
  get time() {
    return this._date * 1000;
  }
  get formattedDate() {
    return this._formattedDate;
  }
  get fork() {
    return this._fork;
  }
  get no() {
    return this._no;
  }
  get uniqNo() {
    return this.nicoChat.uniqNo;
  }
  get fontCommand() {
    return this._fontCommand;
  }
  get isSubThread() {
    return this._isSubThread;
  }
  get threadId() {
    return this.nicoChat.threadId;
  }
  get time3d() {
    return this.nicoChat.time3d;
  }
  get time3dp() {
    return this.nicoChat.time3dp;
  }
  get nicoru(): number {
    return this.nicoChat.nicoru;
  }
  set nicoru(v: number) {
    this.nicoChat.nicoru = v;
  }
  get duration() {
    return this.nicoChat.duration;
  }
  get valhalla() {
    return this.nicoChat.valhalla;
  }
  get nicotta(): boolean {
    return this.nicoChat.nicotta;
  }
  set nicotta(v: boolean) {
    this.nicoChat.nicotta = v;
  }
  get isMine() {
    return this.nicoChat.isMine;
  }
}
CommentListItem._itemId = 0;
