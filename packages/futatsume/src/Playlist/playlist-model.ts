import { VideoListModel } from './video-list-model';
import type { VideoListModelParams } from './video-list-model';
import type { VideoListItem } from './video-list-item';
//===BEGIN===
class PlayListModel extends VideoListModel {
  declare maxItems: number;
  declare items: VideoListItem[];
  declare isUniq: boolean;

  initialize(params: VideoListModelParams): void {
    super.initialize(params);
    this.maxItems = 10000;
    this.items = [];
    this.isUniq = true;

    // this._boundOnItemUpdate = this.onItemUpdate.bind(this);
  }
}

//===END===
export { PlayListModel };
