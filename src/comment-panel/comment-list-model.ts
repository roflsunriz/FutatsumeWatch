import _ from 'lodash';
import { Emitter } from '../baselib';
import { CommentListItem } from './comment-list-item';
import type { ChatListData, NicoChatItem } from './types';

interface CommentListModelParams {
  uniq?: boolean;
  maxItems?: number;
}
export class CommentListModel extends Emitter {
  declare private _isUniq: boolean | undefined;
  declare private _items: CommentListItem[];
  declare private _positions: number[];
  declare private _maxItems: number;
  declare private _currentSortKey: string;
  declare private _isDesc: boolean | undefined;
  declare private _currentTime: number;
  declare private _currentIndex: number;
  constructor(params: CommentListModelParams) {
    super();
    this._isUniq = params.uniq;
    this._items = [];
    this._positions = [];
    this._maxItems = params.maxItems || 100;
    this._currentSortKey = 'vpos';
    this._isDesc = false;
    this._currentTime = 0;
    this._currentIndex = -1;
  }
  setItem(itemList: CommentListItem | CommentListItem[]): void {
    this._items = Array.isArray(itemList) ? itemList : [itemList];
  }
  clear(): this | undefined {
    this._items = [];
    this._positions = [];
    this._currentTime = 0;
    this._currentIndex = -1;
    this.emit('update', [], true);
    return undefined;
  }
  setChatList(chatList: ChatListData): void {
    const list = chatList.top.concat(chatList.naka, chatList.bottom);
    const items: CommentListItem[] = [];
    const positions: number[] = [];
    for (let i = 0, len = list.length; i < len; i++) {
      items.push(new CommentListItem(list[i] as NicoChatItem));
      positions.push(parseFloat((list[i] as NicoChatItem).vpos) / 100);
    }
    this._items = items;
    this._positions = positions.sort((a, b) => a - b);
    this._currentTime = 0;
    this._currentIndex = -1;

    this.sort();
    this.emit('update', this._items, true);
  }
  removeItemByIndex(index: number): void {
    const target = this._getItemByIndex(index);
    if (!target) {
      return;
    }
    this._items = this._items.filter((item) => item !== target);
  }
  get length(): number {
    return this._items.length;
  }
  _getItemByIndex(index: number): CommentListItem | undefined {
    return this._items[index];
  }
  indexOf(item: CommentListItem): number {
    return (this._items || []).indexOf(item);
  }
  getItemByIndex(index: number): CommentListItem | null {
    const item = this._getItemByIndex(index);
    if (!item) {
      return null;
    }
    return item;
  }
  findByItemId(itemId: string): CommentListItem | undefined {
    const id = parseInt(itemId, 10);
    return this._items.find((item) => item.itemId === id);
  }
  removeItem(item: CommentListItem): void {
    const beforeLen = this._items.length;
    this._items = this._items.filter((i) => i !== item); //_.pull(this._items, item);
    const afterLen = this._items.length;
    if (beforeLen !== afterLen) {
      this.emit('update', this._items);
    }
  }
  _onItemUpdate(item: CommentListItem, key: string, value: unknown): void {
    this.emit('itemUpdate', item, key, value);
  }
  sortBy(key: string, isDesc?: boolean): void {
    const table = {
      vpos: 'vpos',
      date: 'date',
      text: 'text',
      user: 'userId',
      nicoru: 'nicoru',
    };
    const func = table[key as keyof typeof table];
    if (!func) {
      return;
    }
    this._items = _.sortBy(this._items, (item) => item[func as keyof CommentListItem]);
    if (isDesc) {
      this._items.reverse();
    }
    this._currentSortKey = key;
    this._isDesc = isDesc;
    this.onUpdate(true);
  }
  sort(): void {
    this.sortBy(this._currentSortKey, this._isDesc);
  }
  get currentSortKey(): string {
    return this._currentSortKey;
  }
  onUpdate(replaceAll = false): void {
    this.emitAsync('update', this._items, replaceAll);
  }
  getInViewIndex(sec: number): number {
    return Math.max(0, _.sortedLastIndex(this._positions, sec + 1) - 1);
  }
  set currentTime(sec: number) {
    if (this._currentTime !== sec && typeof sec === 'number') {
      this._currentTime = sec;
      const inviewIndex = this.getInViewIndex(sec);
      if (this._currentSortKey === 'vpos' && this._currentIndex !== inviewIndex) {
        this.emit('currentTimeUpdate', sec, inviewIndex);
      }
      this._currentIndex = inviewIndex;
    }
  }
  get currentTime() {
    return this._currentTime;
  }
}

/**
 * DOM的に隔離したiframeの中に生成する。
 * かなり実験要素が多いのでまだまだ変わる。
 */
