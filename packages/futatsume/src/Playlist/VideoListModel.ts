import _ from 'lodash';
import { Emitter } from '../../../lib/src/Emitter';
import { throttle } from '../../../lib/src/infra/bounce';
import { VideoListItem } from './VideoListItem';
import type { VideoRawData } from './VideoListItem';

export interface VideoListModelParams {
  uniq?: unknown;
  maxItems?: unknown;
}

interface ThrottleLike {
  raf<TFunc extends () => void>(func: TFunc): TFunc;
}
//===BEGIN===
class VideoListModel extends Emitter {
  declare watchIds: Map<string, VideoListItem>;
  declare itemIds: Map<number, VideoListItem>;
  declare uset: Set<unknown>;
  declare isUniq: boolean;
  declare items: VideoListItem[];
  declare maxItems: number;
  constructor(params: VideoListModelParams) {
    super();
    this.watchIds = new Map();
    this.itemIds = new Map();
    this.uset = new Set();
    this.initialize(params);
    this.onUpdate = (throttle as unknown as ThrottleLike).raf(this.onUpdate.bind(this));
  }

  initialize(params: VideoListModelParams): void {
    this.isUniq = params.uniq as boolean;
    this.items = [];
    this.maxItems = (params.maxItems as number) || 100;
  }

  setItemData(itemData: unknown): void {
    const list: unknown[] = Array.isArray(itemData) ? itemData : [itemData];
    const items = list
      .filter((data: unknown) => (data as { has_data?: unknown }).has_data)
      .map((data: unknown) => new VideoListItem(data as VideoRawData));
    this.setItem(items);
  }

  setItem(items: VideoListItem | VideoListItem[] = []): void {
    let list: VideoListItem[] = Array.isArray(items) ? items : [items];
    if (this.isUniq) {
      const uset = new Set(),
        iset = new Set();
      list = list.filter((item) => {
        const has = uset.has(item.uniqId) || iset.has(item.itemId);
        uset.add(item.uniqId);
        iset.add(item.itemId);
        return !has;
      });
    }

    this.items = list;
    this._refreshMaps();
    this.onUpdate();
  }

  _refreshMaps(): void {
    this.uset.clear();
    this.watchIds.clear();
    this.itemIds.clear();
    this.items.forEach((item) => {
      this.watchIds.set(item.watchId, item);
      this.itemIds.set(item.itemId, item);
      this.uset.add(item.uniqId);
      item.groupList = this;
    });
  }

  includes(item: VideoListItem): boolean {
    return this.uset.has(item.uniqId) || this.watchIds.has(item.watchId) || this.itemIds.has(item.itemId);
  }

  clear(): this | undefined {
    this.setItem([]);
    return this;
  }

  insertItem(items: VideoListItem | VideoListItem[], index?: unknown): number | undefined {
    //window.console.log('insertItem', itemList, index);
    let list: VideoListItem[] = Array.isArray(items) ? items : [items];
    if (this.isUniq) {
      list = list.filter((item) => !this.includes(item));
    }
    if (!list.length) {
      return;
    }

    const at = Math.min(this.items.length, _.isNumber(index) ? index : 0);

    this.items.splice(at, 0, ...list);

    this.items.splice(this.maxItems);
    this._refreshMaps();
    this.onUpdate();

    return this.indexOf(list[0]);
  }

  appendItem(items: VideoListItem | VideoListItem[]): number | undefined {
    let list: VideoListItem[] = Array.isArray(items) ? items : [items];
    if (this.isUniq) {
      list = list.filter((item) => !this.includes(item));
    }
    if (!list.length) {
      return;
    }

    this.items = this.items.concat(list);

    while (this.items.length > this.maxItems) {
      this.items.shift();
    }

    this._refreshMaps();
    this.onUpdate();

    return this.items.length - 1;
  }

  moveItemTo(fromItem: VideoListItem, toItem: VideoListItem): void {
    fromItem.isUpdating = true;
    toItem.isUpdating = true;
    // console.nicoru('before moveItemTo',
    //   {fromItem, index:this.indexOf(fromItem)},
    //   {toItem, index: this.indexOf(toItem)}
    // );
    const destIndex = this.indexOf(toItem);
    this.items = this.items.filter((item) => item !== fromItem);
    this._refreshMaps();
    this.insertItem(fromItem, destIndex);
    // console.nicoru('after moveItemTo',
    //   {fromItem, index:this.indexOf(fromItem)},
    //   {toItem, index: this.indexOf(toItem)}
    // );
    this.resetUiFlags([fromItem, toItem]);
  }

  resetUiFlags(items?: VideoListItem | VideoListItem[]): void {
    const source = items ?? this.items;
    const list: VideoListItem[] = Array.isArray(source) ? source : [source];
    for (const item of list) {
      item.isDragging = false;
      item.isDragover = false;
      item.isDropped = false;
      item.isUpdating = false;
    }
  }

  removeByFilter(filterFunc: (item: VideoListItem) => unknown): boolean {
    const befores = [...this.items];
    const afters = this.items.filter(filterFunc);
    if (befores.length === afters.length) {
      return false;
    }
    for (const item of befores) {
      if (!afters.includes(item)) {
        item.groupList = null;
      }
    }
    this.items = afters;
    this._refreshMaps();
    this.onUpdate();
    return true;
  }

  removePlayedItem(): void {
    this.removeByFilter((item) => item.isActive || !item.isPlayed);
  }

  removeNonActiveItem(): void {
    this.removeByFilter((item) => item.isActive);
  }

  resetPlayedItemFlag(): void {
    this.items.forEach((item) => (item.isPlayed = false));
    this.onUpdate();
  }

  shuffle(): void {
    this.items = _.shuffle(this.items);
    this.onUpdate();
  }

  indexOf(item: VideoListItem | null | undefined): number {
    if (!item || !item.itemId) {
      return -1;
    }
    return this.items.findIndex((i) => i.itemId === item.itemId);
  }

  getItemByIndex(index: number): VideoListItem | null {
    return this.items[index] || null;
  }

  findByItemId(itemId: string | number): VideoListItem | undefined {
    const id = parseInt(String(itemId), 10);
    return this.itemIds.get(id);
  }

  findByWatchId(watchId: string | number): VideoListItem | undefined {
    const id = watchId.toString();
    return this.watchIds.get(id);
  }

  removeItem(...items: VideoListItem[]): void {
    this.removeByFilter((item) => !items.includes(item));
  }

  onItemUpdate(): void {
    // this.emit('item-update', item);
    this.onUpdate();
  }

  serialize(): Array<Record<string, unknown>> {
    return this.items.map((item) => item.serialize() as Record<string, unknown>);
  }

  unserialize(itemDataList: VideoRawData[]): void {
    const items = itemDataList.map((itemData) => new VideoListItem(itemData));
    this.setItem(items);
  }

  sortBy(key: string, isDesc?: boolean): void {
    type VideoListSortProp =
      'watchId' | 'duration' | 'sortTitle' | 'commentCount' | 'mylistCount' | 'viewCount' | 'postedAt';
    const table: Record<string, VideoListSortProp> = {
      watchId: 'watchId',
      duration: 'duration',
      title: 'sortTitle',
      comment: 'commentCount',
      mylist: 'mylistCount',
      view: 'viewCount',
      postedAt: 'postedAt',
    };
    const prop = table[key];
    if (!prop) {
      return;
    }
    this.items = _.sortBy(this.items, (item) => item[prop]);
    if (isDesc) {
      this.items.reverse();
    }
    this.onUpdate();
  }

  reverse(): void {
    this.items.reverse();
    this.onUpdate();
  }

  onUpdate(): void {
    this.emitAsync('update', this.items);
  }

  get length(): number {
    return this.items.length;
  }

  get activeIndex(): number {
    return this.items.findIndex((i) => i.isActive);
  }
}

//===END===

export { VideoListModel };
