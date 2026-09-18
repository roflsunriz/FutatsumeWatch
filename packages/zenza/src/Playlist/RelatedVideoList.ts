import { VideoList } from './VideoList';
import { VideoListItem } from './VideoListItem';
import type { VideoRawData } from './VideoListItem';
import type { VideoListViewLike } from './VideoList';
import { RecommendAPILoader } from '../../../lib/src/nico/RecommendAPILoader';

interface RecommendVideoInfo {
  watchId: unknown;
  contextWatchId: unknown;
  title: unknown;
  duration: unknown;
  count: { comment: unknown; mylist: unknown; view: unknown };
  thumbnail: unknown;
  postedAt: unknown;
  owner: unknown;
}

interface RecommendContent {
  title: unknown;
  duration: unknown;
  count: { comment: unknown; mylist: unknown; view: unknown };
  thumbnail: { url: unknown };
  registeredAt: unknown;
}

interface RecommendItem {
  id?: unknown;
  contentType?: unknown;
  content?: RecommendContent | null;
}

interface RecommendAPILoaderLike {
  load(params: { videoId: string }): Promise<{ items?: RecommendItem[] }>;
}
//===BEGIN===

class RelatedVideoList extends VideoList {
  update(listData: unknown[], watchId: unknown): void {
    if (!this.view) {
      this._initializeView();
    }
    this._watchId = watchId;
    const items = listData
      .filter((itemData: unknown) => (itemData as { id?: unknown }).id)
      .map((itemData) => new VideoListItem(itemData as VideoRawData));
    if (!items.length) {
      return;
    }
    this.model.insertItem(items);
    (this.view as VideoListViewLike).scrollTop(0);
  }
  async fetchRecommend(
    videoId: string,
    watchId: string | null = null,
    videoInfo: RecommendVideoInfo | null = null
  ): Promise<void> {
    const relatedVideo: VideoRawData[] = [];
    if (videoInfo) {
      relatedVideo.push(VideoListItem.createByVideoInfoModel(videoInfo).serialize());
    }
    const loader = RecommendAPILoader as unknown as RecommendAPILoaderLike;
    const data = await loader.load({ videoId }).catch((): { items?: RecommendItem[] } => ({}));
    const items = data.items || [];
    for (const item of items) {
      if (item.contentType && item.contentType !== 'video') {
        continue;
      }
      const content = item.content as RecommendContent;
      relatedVideo.push({
        _format: 'recommendApi',
        _data: item,
        id: item.id,
        title: content.title,
        length_seconds: content.duration,
        num_res: content.count.comment,
        mylist_counter: content.count.mylist,
        view_counter: content.count.view,
        thumbnail_url: content.thumbnail.url,
        first_retrieve: content.registeredAt,
        has_data: true,
        is_translated: false,
      });
    }
    this.update(relatedVideo, videoId);
  }
}

//===END===

export { RelatedVideoList };
