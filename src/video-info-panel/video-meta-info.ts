import { BaseViewComponent } from '../../packages/futatsume/src/parts/base-view-component';
import type { VideoCountInfo, VideoInfoModel, VideoMetaElm } from './types';
class VideoMetaInfo extends BaseViewComponent {
  declare static _shadow_: string;
  declare static _css_: string;
  declare _elm: VideoMetaElm;
  constructor({ parentNode }: { parentNode: Element | null }) {
    super({
      parentNode,
      name: 'VideoMetaInfo',
      template: '<div class="VideoMetaInfo"></div>',
      shadow: VideoMetaInfo._shadow_,
      css: VideoMetaInfo._css_,
    });

    this._state = {};

    this._bound.update = this.update.bind(this) as unknown as (e: Event) => void;
  }

  _initDom(...args: [Record<string, unknown>]) {
    super._initDom(...args);

    const shadow = this._shadow || this._view;
    this._elm = Object.assign({}, this._elm, {
      postedAt: shadow.querySelector('.postedAt'),
      body: shadow.querySelector('.videoMetaInfo'),
      viewCount: shadow.querySelector('.viewCount'),
      commentCount: shadow.querySelector('.commentCount'),
      mylistCount: shadow.querySelector('.mylistCount'),
    });
  }

  update(videoInfo: VideoInfoModel) {
    this._elm.postedAt!.textContent = new Date(videoInfo.postedAt).toLocaleString();
    const count = videoInfo.count;
    this.updateVideoCount(count);
  }

  updateVideoCount({ comment, view, mylist }: VideoCountInfo) {
    const addComma = (m: number): string | number => (m.toLocaleString ? m.toLocaleString() : m);
    if (typeof comment === 'number') {
      this._elm.commentCount!.textContent = addComma(comment) as string;
    }
    if (typeof view === 'number') {
      this._elm.viewCount!.textContent = addComma(view) as string;
    }
    if (typeof mylist === 'number') {
      this._elm.mylistCount!.textContent = addComma(mylist) as string;
    }
  }
}

VideoMetaInfo._css_ = ''.trim();

VideoMetaInfo._shadow_ = `
    <style>
      .VideoMetaInfo .postedAtOuter {
        display: inline-block;
        margin-right: 24px;
      }
      .VideoMetaInfo .postedAt {
        font-weight: bold
      }

      .VideoMetaInfo .countOuter {
        white-space: nowrap;
      }

      .VideoMetaInfo .countOuter .column {
        display: inline-block;
        white-space: nowrap;
      }

      .VideoMetaInfo .count {
        font-weight: bolder;
      }

      .userVideo .channelVideo,
      .channelVideo .userVideo
      {
        display: none !important;
      }

      :host-context(.userVideo) .channelVideo,
      :host-context(.channelVideo) .userVideo
      {
        display: none !important;
      }

    </style>
    <div class="VideoMetaInfo root">
      <span class="postedAtOuter">
        <span class="userVideo">投稿日:</span>
        <span class="channelVideo">配信日:</span>
        <span class="postedAt"></span>
      </span>

      <span class="countOuter">
        <span class="column">再生:       <span class="count viewCount"></span></span>
        <span class="column">コメント:   <span class="count commentCount"></span></span>
        <span class="column">マイリスト: <span class="count mylistCount"></span></span>
      </span>
    </div>
  `;

//===END===
export { VideoMetaInfo };
