import type { ThumbInfoOk } from '../../packages/lib/src/nico/parse-thumb-info';
import type { PocketVideoInfo } from './types';
import { textUtil } from '../../packages/lib/src/text/text-util';

export function createVideoInfoClass(protocol: string, hasLargeThumbnail: (videoId: string) => boolean) {
  class VideoInfo {
    _rawData!: PocketVideoInfo;
    static createByThumbInfo(thumbInfo: ThumbInfoOk): VideoInfo {
      let thumbnail = thumbInfo.thumbnail;
      if (hasLargeThumbnail(thumbInfo.videoId)) {
        thumbnail = thumbnail.replace(/\.[ML]$/, undefined as unknown as string) + '.L';
      }
      const owner: { id?: string; name?: string; icon?: string } = thumbInfo.owner || {};
      const isChannel = thumbInfo.isChannel;
      const rawData: PocketVideoInfo = {
        status: thumbInfo.status,
        videoId: thumbInfo.id,
        watchId: thumbInfo.v,
        videoTitle: thumbInfo.title,
        videoThumbnail: thumbnail,
        uploadDate: thumbInfo.postedAt,
        duration: textUtil.secToTime(thumbInfo.duration),
        viewCounter: thumbInfo.viewCount,
        mylistCounter: thumbInfo.mylistCount,
        commentCounter: thumbInfo.commentCount,
        description: thumbInfo.description,
        lastResBody: thumbInfo.lastResBody,
        isChannel,
        ownerId: owner.id as string,
        ownerName: owner.name as string,
        ownerIcon: owner.icon as string,
        tags: thumbInfo.tagList.map((tag) => {
          return { text: tag.text as string, isLocked: tag.lock };
        }),
      };

      return new VideoInfo(rawData);
    }

    constructor(rawData: PocketVideoInfo) {
      this._rawData = rawData;
    }

    get status() {
      return this._rawData.status;
    }
    get videoId() {
      return this._rawData.videoId;
    }
    get watchId() {
      return this._rawData.watchId;
    }
    get originalVideoId() {
      return !this.isChannel && this.videoId !== this.watchId ? this.videoId : '';
    }
    get videoTitle() {
      return this._rawData.videoTitle;
    }
    get videoThumbnail() {
      return this._rawData.videoThumbnail;
    }
    get description() {
      return this._rawData.description;
    }
    get duration() {
      return this._rawData.duration;
    }
    get owner() {
      return {
        type: this.isChannel ? 'channel' : 'user',
        id: this.ownerId,
        linkId: this.ownerId ? (this.isChannel ? `ch${this.ownerId}` : `user/${this.ownerId}`) : 'xx',
        name: this.ownerName,
        icon: this.ownerIcon,
      };
    }

    get ownerPageLink() {
      const ownerId = this.ownerId;
      if (this.isChannel) {
        return `${protocol}//ch.nicovideo.jp/ch${ownerId}`;
      } else {
        return `${protocol}//www.nicovideo.jp/user/${ownerId}`;
      }
    }
    get ownerIcon() {
      return this._rawData.ownerIcon;
    }
    get ownerName() {
      return this._rawData.ownerName;
    }
    get localeOwnerName() {
      if (this.isChannel) {
        return this.ownerName;
      } else {
        // TODO: 言語依存
        return this.ownerName + ' さん';
      }
    }
    get ownerId() {
      return this._rawData.ownerId;
    }
    get isChannel() {
      return this._rawData.isChannel;
    }
    get uploadDate() {
      return new Date(this._rawData.uploadDate);
    }

    get viewCounter() {
      return this._rawData.viewCounter;
    }
    get mylistCounter() {
      return this._rawData.mylistCounter;
    }
    get commentCounter() {
      return this._rawData.commentCounter;
    }

    get lastResBody() {
      return this._rawData.lastResBody;
    }
    get tags() {
      return this._rawData.tags;
    }
  }
  return VideoInfo;
}
