import { Emitter } from '../../../lib/src/emitter';
import { VideoListModel } from './video-list-model';
import type { VideoListModelParams } from './video-list-model';
import { VideoListView } from './video-list-view';
import type { VideoListItem } from './video-list-item';
import { bounce } from '../../../lib/src/infra/bounce';
import { ThumbInfoLoader } from '../../../lib/src/nico/thumb-info-loader';

interface VideoListParams {
  loader?: unknown;
  container?: unknown;
}

interface VideoListViewParams {
  container?: unknown;
  model: VideoListModel;
  enablePocketWatch: boolean;
}

export interface VideoListViewLike {
  on(name: string, handler: (...args: unknown[]) => void): void;
  scrollTop(position: number): void;
}

interface BounceLike {
  time<TFunc extends (...args: never[]) => void>(func: TFunc, interval: number): TFunc;
}

//===BEGIN===
class VideoList extends Emitter {
  declare _thumbInfoLoader: unknown;
  declare _container: unknown;
  declare model: VideoListModel;
  declare view: VideoListViewLike | undefined;
  declare _watchId: unknown;
  constructor(...args: [VideoListParams]) {
    super();
    this.initialize(...args);
  }
  initialize(params: VideoListParams): void {
    this._thumbInfoLoader = params.loader || ThumbInfoLoader;
    this._container = params.container;

    this.model = new VideoListModel({ uniq: true, maxItem: 100 } as VideoListModelParams);

    this._initializeView();
  }
  _initializeView(): void {
    if (this.view) {
      return;
    }
    const ViewClass = VideoListView as unknown as new (params: VideoListViewParams) => VideoListViewLike;
    this.view = new ViewClass({
      container: this._container,
      model: this.model,
      enablePocketWatch: true,
    });

    const bounceUtil = bounce as unknown as BounceLike;
    this.view.on('command', this._onCommand.bind(this));
    this.view.on('playlistAppend', bounceUtil.time(this._onPlaylistAppend.bind(this), 300));
  }
  update(listData: unknown, watchId: unknown): void {
    if (!this.view) {
      this._initializeView();
    }
    this._watchId = watchId;
    this.model.setItemData(listData);
  }
  _onCommand(command: unknown, param: unknown): void {
    if (command !== 'select') {
      this.emit('command', command, param);
      return;
    }
    const item = this.model.findByItemId(param as string | number) as VideoListItem;
    const watchId = item.watchId;
    this.emit('command', 'open', watchId);
  }
  _onPlaylistAppend(watchId: unknown, itemId: unknown): void {
    this.emit('command', 'playlistAppend', watchId);
    const item = (this.model.findByItemId(itemId as string | number) ||
      this.model.findByWatchId(watchId as string | number)) as VideoListItem;
    item.isUpdating = true;
    window.setTimeout(() => (item.isUpdating = false), 1000);
  }
}

//===END===

export { VideoList };
