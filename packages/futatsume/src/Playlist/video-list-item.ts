import { throttle } from '../../../lib/src/infra/bounce';
import { textUtil } from '../../../lib/src/text/text-util';

interface VideoRawData {
  [key: string]: unknown;
  id?: unknown;
  uniqId?: unknown;
  uniq_id?: unknown;
  title?: unknown;
  length_seconds?: unknown;
  num_res?: unknown;
  mylist_counter?: unknown;
  view_counter?: unknown;
  thumbnail_url?: unknown;
  first_retrieve?: unknown;
  last_activated?: unknown;
  played?: unknown;
  _format?: unknown;
}

export type { VideoRawData, MylistItemLike, VideoInfoModelLike, ThumbInfoLike };

interface ThumbInfoLike {
  id: unknown;
  title: unknown;
  duration: unknown;
  commentCount: unknown;
  mylistCount: unknown;
  viewCount: unknown;
  thumbnail: unknown;
  postedAt: unknown;
  tagList: unknown;
  movieType: unknown;
  owner: unknown;
  lastResBody: unknown;
}

interface MylistCountLike {
  comment: unknown;
  mylist: unknown;
  view: unknown;
  like: unknown;
}

interface MylistContentLike {
  id: unknown;
  title: unknown;
  duration: unknown;
  count: MylistCountLike;
  thumbnail: { url: unknown };
  registeredAt: unknown;
  latestCommentSummary: unknown;
}

interface MylistItemDataLike {
  watch_id: unknown;
  title: unknown;
  length_seconds: unknown;
  num_res: unknown;
  mylist_counter: unknown;
  view_counter: unknown;
  thumbnail_url: unknown;
  first_retrieve: unknown;
  video_id: unknown;
  last_res_body: unknown;
}

interface MylistItemLike {
  [key: string]: unknown;
  content?: MylistContentLike | null;
  item_data?: MylistItemDataLike | null;
  item_id?: unknown;
  item_type?: unknown;
}

interface VideoCountLike {
  comment: unknown;
  mylist: unknown;
  view: unknown;
  like?: number;
}

interface VideoInfoModelLike {
  watchId: unknown;
  contextWatchId: unknown;
  title: unknown;
  duration: unknown;
  count: VideoCountLike;
  thumbnail: unknown;
  postedAt: unknown;
  owner: unknown;
}

interface VideoItemGroup {
  onItemUpdate(item: VideoListItem): void;
  removeItem(...items: VideoListItem[]): void;
}

interface VideoItemState {
  isActive: boolean;
  lastActivated: number;
  isUpdating: boolean;
  isPlayed: boolean;
  isLazy: boolean;
  isDragging: boolean;
  isFavorited: boolean;
  isDragover: boolean;
  isDropped: boolean;
  isPocketResolved: boolean;
  timestamp: number;
}

interface TextUtilLike {
  dateToString(value: unknown): string;
  convertKansuEi(value: string): string;
  escapeRegs(value: string): string;
}

interface ThrottleLike {
  raf<TFunc extends () => void>(func: TFunc): TFunc;
}
//===BEGIN===
class VideoListItem {
  declare static _itemId: number;
  declare _rawData: VideoRawData;
  declare _itemId: number;
  declare _watchId: string;
  declare _groupList: VideoItemGroup | null;
  declare state: VideoItemState;
  declare _uniq_id: unknown;
  declare _sortTitle: string;
  static createByThumbInfo(info: ThumbInfoLike): VideoListItem {
    return new this({
      _format: 'thumbInfo',
      id: info.id,
      title: info.title,
      length_seconds: info.duration,
      num_res: info.commentCount,
      mylist_counter: info.mylistCount,
      view_counter: info.viewCount,
      thumbnail_url: info.thumbnail,
      first_retrieve: info.postedAt,

      tags: info.tagList,
      movieType: info.movieType,
      owner: info.owner,
      lastResBody: info.lastResBody,
    });
  }

  static createBlankInfo(id: unknown): VideoListItem {
    let postedAt = '0000/00/00 00:00:00';
    if (!isNaN(id as number)) {
      postedAt = (textUtil as unknown as TextUtilLike).dateToString(new Date((id as number) * 1000));
    }
    return new this({
      _format: 'blank',
      id: id,
      title: (id as string | number) + '(動画情報不明)',
      length_seconds: 0,
      num_res: 0,
      mylist_counter: 0,
      view_counter: 0,
      thumbnail_url:
        'https://nicovideo.cdn.nimg.jp/web/images/bundle/nicovideo/components/Thumbnail/Thumbnail-placeholder.jpg',
      first_retrieve: postedAt,
    });
  }

  static createByMylistItem(item: MylistItemLike): VideoListItem {
    if (item.content) {
      const content = item.content || {};
      return new VideoListItem({
        _format: 'mylistItemRiapi',
        id: content.id,
        uniq_id: content.id,
        title: content.title,
        length_seconds: content.duration,
        num_res: content.count.comment,
        mylist_counter: content.count.mylist,
        view_counter: content.count.view,
        like: content.count.like,
        thumbnail_url: content.thumbnail.url,
        first_retrieve: content.registeredAt,
        lastResBody: content.latestCommentSummary,
      });
    }

    if (item.content === null && typeof item.watchId === 'string') return VideoListItem.createBlankInfo(item.watchId);

    if (item.item_data) {
      const item_data = item.item_data || {};
      return new VideoListItem({
        _format: 'mylistItemOldApi',
        id: item_data.watch_id,
        uniq_id: item_data.watch_id,
        title: item_data.title,
        length_seconds: item_data.length_seconds,
        num_res: item_data.num_res,
        mylist_counter: item_data.mylist_counter,
        view_counter: item_data.view_counter,
        thumbnail_url: item_data.thumbnail_url,
        first_retrieve: (textUtil as unknown as TextUtilLike).dateToString(
          new Date((item_data.first_retrieve as number) * 1000)
        ),

        videoId: item_data.video_id,
        lastResBody: item_data.last_res_body,
        mylistItemId: item.item_id,
        item_type: item.item_type,
      });
    }

    // APIレスポンスの統一されてなさよ・・・
    if (!item.length_seconds && typeof item.length === 'string') {
      const [min, sec] = item.length.split(':');
      item.length_seconds = Number(min) * 60 + Number(sec) * 1;
    }
    return new VideoListItem({
      _format: 'mylistItemRiapi',
      id: item.id,
      uniq_id: item.id,
      title: item.title,
      length_seconds: item.length_seconds,
      num_res: item.num_res,
      mylist_counter: item.mylist_counter,
      view_counter: item.view_counter,
      thumbnail_url: item.thumbnail_url,
      first_retrieve: item.first_retrieve,
      lastResBody: item.last_res_body,
    });
  }

  static createByVideoInfoModel(info: VideoInfoModelLike): VideoListItem {
    const count = info.count;
    return new VideoListItem({
      _format: 'videoInfo',
      like: count.like,
      id: info.watchId,
      uniq_id: info.contextWatchId,
      title: info.title,
      length_seconds: info.duration,
      num_res: count.comment,
      mylist_counter: count.mylist,
      view_counter: count.view,
      thumbnail_url: info.thumbnail,
      first_retrieve: info.postedAt,
      owner: info.owner,
    });
  }

  constructor(rawData: VideoRawData) {
    this._rawData = rawData;
    this._itemId = VideoListItem._itemId++;
    this._watchId = String(this._getData('id', '') || '');
    this._groupList = null;
    this.state = {
      isActive: false,
      lastActivated: (rawData.last_activated || 0) as number,
      isUpdating: false,
      isPlayed: !!rawData.played,
      isLazy: true,
      isDragging: false,
      isFavorited: false,
      isDragover: false,
      isDropped: false,
      isPocketResolved: false,
      timestamp: performance.now(),
    };
    this._uniq_id = rawData.uniqId || rawData.uniq_id || this.watchId;
    rawData.first_retrieve = (textUtil as unknown as TextUtilLike).dateToString(rawData.first_retrieve);

    this.notifyUpdate = (throttle as unknown as ThrottleLike).raf(this.notifyUpdate.bind(this));
    this._sortTitle = (textUtil as unknown as TextUtilLike)
      .convertKansuEi(this.title)
      .replace(/([0-9]{1,9})/g, (m) => m.padStart(10, '0'))
      .replace(/([０-９]{1,9})/g, (m) => m.padStart(10, '０'));
  }

  equals(item: VideoListItem): boolean {
    return this.uniqId === item.uniqId;
  }

  _getData(key: string, defValue: string): string {
    // eslint-disable-next-line no-prototype-builtins -- 連結資産の実行時挙動を保つため元の呼び方を維持する
    return (this._rawData.hasOwnProperty(key) ? this._rawData[key] : defValue) as string;
  }

  get groupList(): VideoItemGroup | null {
    return this._groupList;
  }
  set groupList(v: VideoItemGroup | null) {
    this._groupList = v;
  }

  notifyUpdate(): void {
    this.updateTimestamp();
    if (this._groupList) {
      this._groupList.onItemUpdate(this);
    }
  }

  get uniqId(): unknown {
    return this._uniq_id;
  }

  get itemId(): number {
    return this._itemId;
  }

  get watchId(): string {
    return this._watchId;
  }
  set watchId(v: string) {
    if (v === this._watchId) {
      return;
    }
    this._watchId = v;
    this.notifyUpdate();
  }

  get title(): string {
    return this._getData('title', '');
  }

  get sortTitle(): string {
    return this._sortTitle;
  }

  get duration(): number {
    return parseInt(this._getData('length_seconds', '0'), 10);
  }

  get count(): { comment: number; mylist: number; view: number; like?: number } {
    return {
      comment: parseInt(String(this._rawData.num_res), 10),
      mylist: parseInt(String(this._rawData.mylist_counter), 10),
      view: parseInt(String(this._rawData.view_counter), 10),
      like: typeof this._rawData.like === 'number' ? this._rawData.like : undefined,
    };
  }

  get thumbnail(): unknown {
    return this._rawData.thumbnail_url;
  }

  get postedAt(): unknown {
    return this._rawData.first_retrieve;
  }

  get commentCount() {
    return this.count.comment;
  }
  get mylistCount() {
    return this.count.mylist;
  }
  get viewCount() {
    return this.count.view;
  }
  get isActive(): boolean {
    return this.state.isActive;
  }
  set isActive(v: boolean) {
    if (this.isActive === v) {
      return;
    }
    this.state.isActive = v;
    if (v) {
      this.state.lastActivated = Date.now();
    }
    this.notifyUpdate();
  }
  get isLazy(): boolean {
    return this.state.isLazy;
  }
  set isLazy(v: boolean) {
    if (this.isLazy === v) {
      return;
    }
    this.state.isLazy = v;
    this.notifyUpdate();
  }
  get isDragging(): boolean {
    return this.state.isDragging;
  }
  set isDragging(v: boolean) {
    if (this.isDragging === v) {
      return;
    }
    this.state.isDragging = v;
    this.notifyUpdate();
  }
  get isDragover(): boolean {
    return this.state.isDragover;
  }
  set isDragover(v: boolean) {
    if (this.isDragover === v) {
      return;
    }
    this.state.isDragover = v;
    this.notifyUpdate();
  }
  get isDropped(): boolean {
    return this.state.isDropped;
  }
  set isDropped(v: boolean) {
    if (this.isDropped === v) {
      return;
    }
    this.state.isDropped = v;
    this.notifyUpdate();
  }
  get isUpdating(): boolean {
    return this.state.isUpdating;
  }
  set isUpdating(v: boolean) {
    if (this.isUpdating === v) {
      return;
    }
    this.state.isUpdating = v;
    this.notifyUpdate();
  }
  get isPlayed(): boolean {
    return this.state.isPlayed;
  }
  set isPlayed(v: boolean) {
    if (this.isPlayed === v) {
      return;
    }
    this.state.isPlayed = v;
    this.notifyUpdate();
  }
  get isFavorited(): boolean {
    return this.state.isFavorited;
  }
  set isFavorited(v: boolean) {
    if (this.isFavorited === v) {
      return;
    }
    this.state.isFavorited = v;
    this.notifyUpdate();
  }
  get isPocketResolved(): boolean {
    return this.state.isPocketResolved;
  }
  set isPocketResolved(v: boolean) {
    if (this.isPocketResolved === v) {
      return;
    }
    this.state.isPocketResolved = v;
    this.notifyUpdate();
  }
  get timestamp(): number {
    return this.state.timestamp;
  }
  updateTimestamp(): void {
    this.state.timestamp = performance.now();
  }
  get isBlankData(): boolean {
    return this._rawData._format === 'blank';
  }
  remove(): void {
    if (!this.groupList) {
      return;
    }
    this.groupList.removeItem(this);
    this.groupList = null;
  }
  serialize(): VideoRawData {
    return {
      active: this.isActive,
      last_activated: this.state.lastActivated || 0,
      played: this.isPlayed,
      uniq_id: this._uniq_id,
      id: this._rawData.id,
      title: this._rawData.title,
      length_seconds: this._rawData.length_seconds,
      num_res: this._rawData.num_res,
      mylist_counter: this._rawData.mylist_counter,
      view_counter: this._rawData.view_counter,
      like: this._rawData.like,
      thumbnail_url: this._rawData.thumbnail_url,
      first_retrieve: this._rawData.first_retrieve,
    };
  }
  updateByVideoInfo(videoInfo: VideoInfoModelLike): void {
    const before = JSON.stringify(this.serialize());
    const rawData = this._rawData;
    const count = videoInfo.count;
    rawData.first_retrieve = (textUtil as unknown as TextUtilLike).dateToString(videoInfo.postedAt);

    rawData.num_res = count.comment;
    rawData.mylist_counter = count.mylist;
    rawData.view_counter = count.view;
    rawData.like = count.like;

    rawData.thumbnail_url = videoInfo.thumbnail;

    if (JSON.stringify(this.serialize()) !== before) {
      this.notifyUpdate();
    }
  }
}
VideoListItem._itemId = 1;
//===END===
export { VideoListItem };
