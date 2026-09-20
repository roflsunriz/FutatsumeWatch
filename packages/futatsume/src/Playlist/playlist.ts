import _ from 'lodash';
import { VideoListItem } from './video-list-item';
import type { VideoRawData, MylistItemLike, VideoInfoModelLike, ThumbInfoLike } from './video-list-item';
import { VideoListModel } from './video-list-model';
import { VideoListItemView } from './video-list-item-view';
import { PlayListModel } from './playlist-model';
import { VideoList } from './video-list';
import { RelatedVideoList } from './related-video-list';
import { NicoSearchApiV2Loader } from '../../../lib/src/nico/video-search';
import { PlayListSession } from './playlist-session';
import { VideoListView } from './video-list-view';
import { PlayListView } from './playlist-view';
import { textUtil } from '../../../lib/src/text/text-util';
import { global } from '../../../../src/futatsume-watch-index';
import type { SearchQueryParams } from '../../../lib/src/nico/video-search';

// lib波が packages/lib/src/nico/playlist-api-loader.ts に export を追加するまでの暫定措置。
// ビルドは import 行を除去して連結スコープで解決するため、実行時の解決先は変わらない。
import { PlaylistApiLoader } from '../../../lib/src/nico/playlist-api-loader';

interface PlayListParams {
  loader?: unknown;
  container?: Element;
  loop?: unknown;
}

interface TextUtilLike {
  dateToString(value: unknown): string;
  escapeToZenkaku(value: string): string;
  isValidJson(value: unknown): boolean;
}

interface GlobalLike {
  api: { ThumbInfoLoader: unknown };
  debug: Record<string, unknown>;
  emitter: { on(name: string, handler: (...args: unknown[]) => void): void };
}

interface ThumbInfoLoaderLike {
  load(watchId: string): Promise<ThumbInfoLike & { isChannel?: unknown }>;
}

interface PlaylistApiLoaderLike {
  load(playlist: unknown, msgInfo: unknown): Promise<unknown[]>;
}

interface SerializedPlayList {
  items?: unknown;
  enable?: unknown;
  loop?: unknown;
  index?: unknown;
}

interface PlaylistOptions {
  watchId?: unknown;
  shuffle?: unknown;
  insert?: unknown;
  append?: unknown;
  playlistSort?: unknown;
}

type SearchPlaylistOptions = SearchQueryParams & PlaylistOptions;

interface PlaylistDescriptor {
  type: string;
  id?: unknown;
  options?: { tag?: unknown; keyword?: unknown } | null;
}

export type { PlayListParams, SerializedPlayList, PlaylistOptions, PlaylistDescriptor };
//===BEGIN===
//@require video-list-item
//@require video-list-model
//@require video-list-item-view
//@require playlist-model
//@require video-list
//@require related-video-list
//@require playlist-session
//@require video-list-view
//@require playlist-view

class PlayList extends VideoList {
  declare _index: number;
  declare _isEnable: boolean;
  declare _isLoop: boolean;
  declare model: PlayListModel;
  declare view: PlayListView | undefined;
  declare _activeItem: VideoListItem | null | undefined;
  declare _playlistApiLoader: PlaylistApiLoaderLike | undefined;
  declare _nicoSearchApiLoader: typeof NicoSearchApiV2Loader | undefined;
  initialize(params: PlayListParams): void {
    const globalLike = global as unknown as GlobalLike;
    this._thumbInfoLoader = params.loader || globalLike.api.ThumbInfoLoader;
    this._container = params.container;

    this._index = -1;
    this._isEnable = false;
    this._isLoop = params.loop as boolean;

    this.model = new PlayListModel({});

    globalLike.debug.playlist = this;
    this.on(
      'update',
      _.debounce(() => PlayListSession.save(this.serialize()), 3000)
    );
    globalLike.emitter.on('tabChange', (tab: unknown) => {
      if (tab === 'playlist') {
        this.scrollToActiveItem();
      }
    });
  }
  serialize(): { items: Array<Record<string, unknown>>; index: number; enable: boolean; loop: boolean } {
    return {
      items: this.model.serialize(),
      index: this._index,
      enable: this._isEnable,
      loop: this._isLoop,
    };
  }
  unserialize(data: unknown): void {
    const list = data as SerializedPlayList | null;
    if (!list) {
      return;
    }
    this._initializeView();
    console.log('unserialize: ', list);
    this.model.unserialize(list.items as VideoRawData[]);
    this._isEnable = list.enable as boolean;
    this._isLoop = list.loop as boolean;
    this.emit('update');
    this.setIndex(list.index);
  }
  restoreFromSession(): void {
    this.unserialize(PlayListSession.restore());
  }
  _initializeView(): void {
    if (this.view) {
      return;
    }
    this.view = new PlayListView({
      container: this._container as Element,
      model: this.model,
      playlist: this,
    });
    this.view.on('command', this._onCommand.bind(this));
    this.view.on('deflistAdd', this._onDeflistAdd.bind(this));
    this.view.on('moveItem', this._onMoveItem.bind(this));
  }
  _onCommand(command: unknown, param: unknown, itemId?: unknown): void {
    let item: VideoListItem | undefined;
    switch (command) {
      case 'toggleEnable':
        this.toggleEnable();
        break;
      case 'toggleLoop':
        this.toggleLoop();
        break;
      case 'shuffle':
        this.shuffle();
        break;
      case 'reverse':
        this.model.reverse();
        break;
      case 'sortBy': {
        const [key, order] = (param as string).split(':');
        this.sortBy(key as string, order === 'desc');
        break;
      }
      case 'clear':
        this._setItemData([]);
        break;
      case 'select':
        item = this.model.findByItemId(itemId as string | number);
        this.setIndex(this.model.indexOf(item));
        this.emit('command', 'openNow', (item as VideoListItem).watchId);
        break;
      case 'playlistRemove':
        item = this.model.findByItemId(itemId as string | number);
        this.model.removeItem(item as VideoListItem);
        this._refreshIndex();
        this.emit('update');
        break;
      case 'removePlayedItem':
        this.removePlayedItem();
        break;
      case 'resetPlayedItemFlag':
        this.model.resetPlayedItemFlag();
        break;
      case 'removeNonActiveItem':
        this.removeNonActiveItem();
        break;
      case 'exportFile':
        this._onExportFileCommand();
        break;
      case 'importFile':
        this._onImportFileCommand(param);
        break;
      case 'scrollToActiveItem':
        this.scrollToActiveItem(true);
        break;
      default:
        this.emit('command', command, param);
    }
  }
  _onExportFileCommand(): void {
    const text = textUtil as unknown as TextUtilLike;
    const dt = new Date();
    const title = prompt(
      'プレイリストを保存\nプレイヤーにドロップすると復元されます',
      text.dateToString(dt) + 'のプレイリスト'
    );
    if (!title) {
      return;
    }

    const data = JSON.stringify(this.serialize(), null, 2);

    const blob = new Blob([data], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    Object.assign(a, {
      download: title + '.playlist.json',
      rel: 'noopener',
      href: url,
    });
    document.body.append(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
  }
  _onImportFileCommand(fileData: unknown): void {
    const text = textUtil as unknown as TextUtilLike;
    if (!text.isValidJson(fileData)) {
      return;
    }

    this.emit('command', 'pause');
    this.emit('command', 'notify', 'プレイリストを復元');
    this.unserialize(JSON.parse(fileData as string));

    window.setTimeout(() => {
      const index = Math.max(0, ((fileData as { index?: unknown }).index || 0) as number);
      const item = this.model.getItemByIndex(index);
      if (item) {
        this.setIndex(index, true);
        this.emit('command', 'openNow', item.watchId);
      }
    }, 2000);
  }
  _onMoveItem(fromItemId: unknown, toItemId: unknown): void {
    const fromItem = this.model.findByItemId(fromItemId as string | number);
    const toItem = this.model.findByItemId(toItemId as string | number);
    if (!fromItem || !toItem) {
      return;
    }
    // const destIndex = this._model.indexOf(destItem);
    // this._model.removeItem(srcItem);
    // this._model.insertItem(srcItem, destIndex);
    this.model.moveItemTo(fromItem, toItem);
    this._refreshIndex();
  }
  _setItemData(listData: VideoRawData[]): void {
    const items = listData.map((itemData) => new VideoListItem(itemData));
    this.model.setItem(items);
    this.setIndex(items.length > 0 ? 0 : -1);
  }
  _replaceAll(videoListItems: VideoListItem[], options?: PlaylistOptions): void {
    const opts = options || {};
    this.model.setItem(videoListItems);
    const item = this.model.findByWatchId(opts.watchId as string);
    if (item) {
      item.isActive = true;
      item.isPlayed = true;
      this._activeItem = item;
      setTimeout(() => this.view!.scrollToItem(item), 1000);
    }
    this.setIndex(this.model.indexOf(item));
  }
  _appendAll(videoListItems: VideoListItem[], options?: PlaylistOptions): void {
    const opts = options || {};
    this.model.appendItem(videoListItems);
    const item = this.model.findByWatchId(opts.watchId as string);
    if (item) {
      item.isActive = true;
      item.isPlayed = true;
      this._refreshIndex(false);
    }
    setTimeout(() => this.view!.scrollToItem(videoListItems[0] as VideoListItem), 1000);
  }
  _insertAll(videoListItems: VideoListItem[], options?: PlaylistOptions): void {
    const opts = options || {};

    this.model.insertItem(videoListItems, this.getIndex() + 1);
    const item = this.model.findByWatchId(opts.watchId as string);
    if (item) {
      item.isActive = true;
      item.isPlayed = true;
      this._refreshIndex(false);
    }
    setTimeout(() => this.view!.scrollToItem(videoListItems[0] as VideoListItem), 1000);
  }
  replaceItems(videoListItemsRawData: VideoRawData[], options?: PlaylistOptions): void {
    const items = videoListItemsRawData.map((raw) => new VideoListItem(raw));
    this._replaceAll(items, options);
  }
  appendItems(videoListItemsRawData: VideoRawData[], options?: PlaylistOptions): void {
    const items = videoListItemsRawData.map((raw) => new VideoListItem(raw));
    this._appendAll(items, options);
  }
  insertItems(videoListItemsRawData: VideoRawData[], options?: PlaylistOptions): void {
    const items = videoListItemsRawData.map((raw) => new VideoListItem(raw));
    this._insertAll(items, options);
  }
  load(
    playlist: PlaylistDescriptor,
    options: PlaylistOptions,
    msgInfo: unknown
  ): Promise<{ status: string; message: string }> {
    this._initializeView();

    if (!this._playlistApiLoader) {
      this._playlistApiLoader = PlaylistApiLoader as unknown as PlaylistApiLoaderLike;
    }
    const loader = this._playlistApiLoader;
    const listOptions = playlist.options as { tag?: unknown; keyword?: unknown };
    const targetLabel = (playlist.id || listOptions.tag || listOptions.keyword) as string;
    const timeKey = `loadPlaylist: ${playlist.type} ${targetLabel}`;
    window.console.time(timeKey);

    return loader.load(playlist, msgInfo).then((items) => {
      window.console.timeEnd(timeKey);
      const list = items as MylistItemLike[];
      let videoListItems = list.map((item) => VideoListItem.createByMylistItem(item));

      if (videoListItems.length < 1) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 既存プロトコル（{status, message} での拒否）を維持するため
        return Promise.reject({
          status: 'fail',
          message: 'プレイリストの取得に失敗しました',
        });
      }

      if (options.shuffle) {
        videoListItems = _.shuffle(videoListItems);
      } else if (playlist.type === 'user-uploaded' && playlist.options == null) {
        videoListItems.reverse();
      }

      if (options.insert) {
        this._insertAll(videoListItems, options);
      } else if (options.append) {
        this._appendAll(videoListItems, options);
      } else {
        this._replaceAll(videoListItems, options);
      }

      this.emit('update');
      return Promise.resolve({
        status: 'ok',
        message: options.append ? 'プレイリストに追加しました' : 'プレイリストに読み込みしました',
      });
    });
  }
  loadSearchVideo(
    word: string,
    options: SearchPlaylistOptions,
    limit = 300
  ): Promise<{ status: string; message: string }> {
    this._initializeView();

    if (!this._nicoSearchApiLoader) {
      this._nicoSearchApiLoader = NicoSearchApiV2Loader;
    }
    const loader = this._nicoSearchApiLoader;

    window.console.time('loadSearchVideos' + word);
    const opts = options || {};

    return loader.searchMore(word, opts, limit).then((result) => {
      window.console.timeEnd('loadSearchVideos' + word);
      const items = result.list || [];
      let videoListItems = items
        .filter((item) => {
          const data = item as { item_data?: { deleted?: unknown }; thumbnail_url?: unknown };
          return (
            (data.item_data && parseInt(data.item_data.deleted as string, 10) === 0) ||
            ((data.thumbnail_url as string) || '').indexOf('video_deleted') < 0
          );
        })
        .map((item) => VideoListItem.createByMylistItem(item as MylistItemLike));

      if (videoListItems.length < 1) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 既存プロトコル（空オブジェクトでの拒否）を維持するため
        return Promise.reject({});
      }

      if (opts.playlistSort) {
        // 連続再生のために結果を古い順に並べる
        // 検索対象のソート順とは別
        videoListItems = _.sortBy(videoListItems, (item) => (item.postedAt as string) + item.sortTitle);
      }

      if (opts.shuffle) {
        videoListItems = _.shuffle(videoListItems);
      }

      if (opts.insert) {
        this._insertAll(videoListItems, opts);
      } else if (opts.append) {
        this._appendAll(videoListItems, opts);
      } else {
        this._replaceAll(videoListItems, opts);
      }

      this.emit('update');
      return Promise.resolve({
        status: 'ok',
        message: opts.append ? '検索結果をプレイリストに追加しました' : '検索結果をプレイリストに読み込みしました',
      });
    });
  }
  insert(watchId: string): Promise<void> {
    this._initializeView();
    if (this._activeItem && this._activeItem.watchId === watchId) {
      return Promise.resolve();
    }

    const model = this.model;
    const index = this._index;
    const text = textUtil as unknown as TextUtilLike;
    const loader = this._thumbInfoLoader as ThumbInfoLoaderLike;
    return loader
      .load(watchId)
      .then((info) => {
        // APIにwatchIdを指定してもvideoIdが返るので上書きする. バッドノウハウ
        // チャンネル動画はsoXXXXに統一したいのでvideoIdを使う. バッドノウハウ
        info.id = info.isChannel ? info.id : watchId;
        const item = VideoListItem.createByThumbInfo(info);
        model.insertItem(item, index + 1);
        this._refreshIndex(true);

        this.emit('update');

        this.emit(
          'command',
          'notifyHtml',
          `次に再生: <img src="${item.thumbnail as string}" style="width: 96px;">${text.escapeToZenkaku(item.title)}`
        );
      })
      .catch((result: unknown) => {
        const item = VideoListItem.createBlankInfo(watchId);
        model.insertItem(item, index + 1);
        this._refreshIndex(true);

        this.emit('update');

        window.console.error(result);
        this.emit('command', 'alert', `動画情報の取得に失敗: ${watchId}`);
      });
  }
  insertCurrentVideo(videoInfo: VideoInfoModelLike): void {
    this._initializeView();

    if (this._activeItem && !this._activeItem.isBlankData && this._activeItem.watchId === videoInfo.watchId) {
      this._activeItem.updateByVideoInfo(videoInfo);
      this._activeItem.isPlayed = true;
      this.scrollToActiveItem();
      return;
    }

    const currentItem = this.model.findByWatchId(videoInfo.watchId as string);
    if (currentItem && !currentItem.isBlankData) {
      currentItem.updateByVideoInfo(videoInfo);
      currentItem.isPlayed = true;
      this.setIndex(this.model.indexOf(currentItem));
      this.scrollToActiveItem();
      return;
    }

    const item = VideoListItem.createByVideoInfoModel(videoInfo);
    item.isPlayed = true;
    if (this._activeItem) {
      this._activeItem.isActive = false;
    }
    this.model.insertItem(item, this._index + 1);
    this._activeItem = this.model.findByItemId(item.itemId);
    this._refreshIndex(true);
  }
  removeItemByWatchId(watchId: string): void {
    const item = this.model.findByWatchId(watchId);
    if (!item || item.isActive) {
      return;
    }
    this.model.removeItem(item);
    this._refreshIndex(true);
  }
  append(watchId: string): Promise<void> {
    this._initializeView();
    if (this._activeItem && this._activeItem.watchId === watchId) {
      return Promise.resolve();
    }

    const model = this.model;
    const text = textUtil as unknown as TextUtilLike;
    const loader = this._thumbInfoLoader as ThumbInfoLoaderLike;
    return loader
      .load(watchId)
      .then((info) => {
        // APIにwatchIdを指定してもvideoIdが返るので上書きする. バッドノウハウ
        info.id = watchId;
        const item = VideoListItem.createByThumbInfo(info);
        //window.console.info(item, info);
        model.appendItem(item);
        this._refreshIndex();
        this.emit('update');
        this.emit(
          'command',
          'notifyHtml',
          `リストの末尾に追加: <img src="${item.thumbnail as string}" style="width: 96px;">${text.escapeToZenkaku(item.title)}`
        );
      })
      .catch((result: unknown) => {
        const item = VideoListItem.createBlankInfo(watchId);
        model.appendItem(item);
        this._refreshIndex(true);
        this._refreshIndex();

        window.console.error(result);
        this.emit('command', 'alert', '動画情報の取得に失敗: ' + watchId);
      });
  }
  getIndex(): number {
    return this._activeItem ? this._index : -1;
  }
  setIndex(v: unknown, force?: unknown): void {
    const index = parseInt(v as string, 10);
    if (this._index !== index || force) {
      this._index = index;
      if (this._activeItem) {
        this._activeItem.isActive = false;
      }
      this._activeItem = this.model.getItemByIndex(index);
      if (this._activeItem) {
        this._activeItem.isActive = true;
      }
      this.emit('update');
    }
  }
  _refreshIndex(scrollToActive?: unknown): void {
    this.setIndex(this.model.indexOf(this._activeItem), true);
    if (scrollToActive) {
      setTimeout(() => this.scrollToActiveItem(true), 1000);
    }
  }
  _setIndexByItemId(itemId: string | number): void {
    const item = this.model.findByItemId(itemId);
    if (item) {
      this._setIndexByItem(item);
    }
  }
  _setIndexByItem(item: VideoListItem): void {
    const index = this.model.indexOf(item);
    if (index >= 0) {
      this.setIndex(index);
    }
  }
  toggleEnable(v?: unknown): void {
    if (!_.isBoolean(v)) {
      this._isEnable = !this._isEnable;
      this.emit('update');
      return;
    }

    if (this._isEnable !== v) {
      this._isEnable = v;
      this.emit('update');
    }
  }
  toggleLoop(): void {
    this._isLoop = !this._isLoop;
    this.emit('update');
  }
  shuffle(): void {
    this.model.shuffle();
    if (this._activeItem) {
      this.model.removeItem(this._activeItem);
      this.model.insertItem(this._activeItem, 0);
      this.setIndex(0);
    } else {
      this.setIndex(-1);
    }
    this.view!.scrollTop(0);
  }
  sortBy(key: string, isDesc?: boolean): void {
    this.model.sortBy(key, isDesc);
    this._refreshIndex(true);
    setTimeout(() => {
      this.view!.scrollToItem(this._activeItem!);
    }, 1000);
  }
  removePlayedItem(): void {
    this.model.removePlayedItem();
    this._refreshIndex(true);
    setTimeout(() => this.view!.scrollToItem(this._activeItem!), 1000);
  }
  removeNonActiveItem(): void {
    this.model.removeNonActiveItem();
    this._refreshIndex(true);
    this.toggleEnable(false);
  }
  selectNext(): string | null {
    if (!this.hasNext) {
      return null;
    }
    const index = this.getIndex();
    const len = this.length;
    if (len < 1) {
      return null;
    }

    if (index < -1) {
      this.setIndex(0);
    } else if (index + 1 < len) {
      this.setIndex(index + 1);
    } else if (this.isLoop) {
      this.setIndex((index + 1) % len);
    }
    return this._activeItem ? this._activeItem.watchId : null;
  }
  selectPrevious(): string | null {
    const index = this.getIndex();
    const len = this.length;
    if (len < 1) {
      return null;
    }

    if (index < -1) {
      this.setIndex(0);
    } else if (index > 0) {
      this.setIndex(index - 1);
    } else if (this.isLoop) {
      this.setIndex((index + len - 1) % len);
    } else {
      return null;
    }

    return this._activeItem ? this._activeItem.watchId : null;
  }
  scrollToActiveItem(force?: unknown): void {
    if (this._activeItem && (force || !this.view!.hasFocus)) {
      this.view!.scrollToItem(this._activeItem, force);
    }
  }
  scrollToWatchId(watchId: string): void {
    const item = this.model.findByWatchId(watchId);
    if (item) {
      this.view!.scrollToItem(item);
    }
  }
  findByWatchId(watchId: string): VideoListItem | undefined {
    return this.model.findByWatchId(watchId);
  }

  get isEnable(): boolean {
    return this._isEnable;
  }
  get isLoop(): boolean {
    return this._isLoop;
  }

  get length(): number {
    return this.model.length;
  }

  get hasNext(): boolean {
    const len = this.length;
    return len > 0 && (this.isLoop || this._index < len - 1);
  }
}
//===END===

export {
  PlayList,
  PlayListSession,
  VideoListItem,
  VideoListModel,
  VideoListItemView,
  VideoListView,
  PlayListView,
  PlayListModel,
  VideoList,
  RelatedVideoList,
};
