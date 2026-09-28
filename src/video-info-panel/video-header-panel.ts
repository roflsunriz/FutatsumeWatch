import _ from 'lodash';
import { CONSTANT } from '../constant';
import { global } from '../futatsume-watch-index';
import { Emitter } from '../../packages/lib/src/emitter';
import { Fullscreen } from '../../packages/lib/src/dom/fullscreen';
import { css, cssUtil } from '../../packages/lib/src/css/css';
import { uq } from '../../packages/lib/src/u-query';
import { ClassList } from '../../packages/lib/src/dom/class-list-wrapper';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import type { VideoCountInfo, VideoInfoModel, UqResult, UqStatic } from './types';
import { VideoSearchForm } from './video-search-form';
import { RelatedInfoMenu } from './related-info-menu';
import { VideoMetaInfo } from './video-meta-info';
class VideoHeaderPanel extends Emitter {
  declare static __tpl__: string;
  declare static __css__: string;
  _videoTitle!: HTMLElement;
  _searchForm!: VideoSearchForm;
  _seriesCover!: HTMLElement;
  _relatedInfoMenu!: RelatedInfoMenu;
  _videoMetaInfo!: VideoMetaInfo;
  _videoInfo!: VideoInfoModel;
  _$view!: UqResult;
  classList!: DOMTokenList;
  _height: number | undefined;
  _isInitialized?: boolean;
  constructor() {
    super();
  }
  _initializeDom() {
    if (this._isInitialized) {
      return;
    }
    this._isInitialized = true;
    (cssUtil.addStyle as (styles: string) => unknown)(VideoHeaderPanel.__css__);
    const $view = (this._$view = (uq as unknown as UqStatic).html(VideoHeaderPanel.__tpl__));
    const view = $view[0]!;
    const classList = (this.classList = ClassList(view));

    this._videoTitle = $view.find('.videoTitle')[0] as unknown as HTMLElement;
    this._searchForm = new VideoSearchForm({
      parentNode: view,
    });

    $view.on('wheel', (e: Event) => e.stopPropagation(), { passive: true });
    this._seriesCover = view.querySelector('.series-thumbnail') as unknown as HTMLElement;

    this._relatedInfoMenu = new RelatedInfoMenu({
      parentNode: view.querySelector('.relatedInfoMenuContainer')!,
      isHeader: true,
    });
    this._relatedInfoMenu.on('open', () => classList.add('is-relatedMenuOpen'));
    this._relatedInfoMenu.on('close', () => classList.remove('is-relatedMenuOpen'));

    this._videoMetaInfo = new VideoMetaInfo({
      parentNode: view.querySelector('.videoMetaInfoContainer')!,
    });

    classList.add(Fullscreen.now() ? 'is-fullscreen' : 'is-notFullscreen');
    global.emitter.on('fullScreenStatusChange', ((isFull: boolean) => {
      classList.toggle('is-fullscreen', isFull);
      classList.toggle('is-notFullscreen', !isFull);
    }) as unknown as EmitterCallback);

    new MutationObserver((mutationList) => {
      for (const mutation of mutationList) {
        if (mutation.type !== 'attributes') return;
        if (mutation.attributeName !== 'data-screen-mode') return;

        this._resetHeight();
        window.setTimeout(() => this._onResize(), 1000);
        break;
      }
    }).observe(window.document.body, { attributes: true });
    window.addEventListener('resize', _.debounce(this._onResize.bind(this), 500));
  }
  update(videoInfo: VideoInfoModel) {
    this._videoInfo = videoInfo;

    this._videoTitle.title = this._videoTitle.textContent = videoInfo.title;

    this._videoMetaInfo.update(videoInfo);

    this._relatedInfoMenu.update(videoInfo);

    const classList = this.classList;
    classList.remove('userVideo', 'channelVideo', 'initializing');
    classList.toggle('is-community', this._videoInfo.isCommunityVideo);
    classList.toggle('is-mymemory', this._videoInfo.isMymemory);
    classList.toggle('has-Parent', this._videoInfo.hasParentVideo);
    classList.add(videoInfo.isChannel ? 'channelVideo' : 'userVideo');
    this._$view.raf.css('display', '');

    if (videoInfo.series && videoInfo.series.thumbnailUrl) {
      this._seriesCover.style.backgroundImage = `url("${videoInfo.series.thumbnailUrl}")`;
    } else {
      this._seriesCover.removeAttribute('style');
    }

    this._resetHeight();
    window.setTimeout(() => this._onResize(), 1000);
  }
  updateVideoCount(...args: [VideoCountInfo]) {
    this._videoMetaInfo.updateVideoCount(...args);
  }
  _resetHeight() {
    this._height = undefined;
  }
  _onResize() {
    const view = this._$view[0]!;
    const rect = view.getBoundingClientRect();
    const isOnscreen = this.classList.contains('is-onscreen');
    const height = this._height ?? rect.bottom - rect.top;
    if (!this._height && !isOnscreen) {
      this._height = height;
    }
    const top = isOnscreen ? rect.top - height : rect.top;
    this.classList.toggle('is-onscreen', top < -20);
  }
  appendTo(node: Element) {
    this._initializeDom();
    this._$view.appendTo(node);
  }
  hide() {
    if (!this._$view) {
      return;
    }
    this.classList.remove('show');
  }
  clear(): undefined {
    if (!this._$view) {
      return;
    }
    this.classList.add('initializing');

    this._videoTitle.textContent = '';
  }
  getPublicStatusDom() {
    return this._$view.find('.publicStatus').html();
  }
}

css.addStyle(
  `
  .futatsumeScreenMode_small .futatsumeWatchVideoHeaderPanel {
    display: none;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoHeaderPanel {
    top: 0;
    left: 400px;
    width: calc(100vw - 400px);
    bottom: auto;
    background: #272727;
    opacity: 0.9;
    height: 40px;
  }
  /* ヘッダ追従 */
  body.futatsumeScreenMode_sideView:not(.nofix)  .futatsumeWatchVideoHeaderPanel {
    top: 0;
  }
  /* ヘッダ固定 */
  .futatsumeScreenMode_sideView .futatsumeWatchVideoHeaderPanel .videoTitleContainer {
    margin: 0;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoHeaderPanel .publicStatus,
  .futatsumeScreenMode_sideView .futatsumeWatchVideoHeaderPanel .videoTagsContainer {
    display: none;
  }

  @media screen and (min-width: 1432px)
  {
    .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .tabSelectContainer {
      width: calc(100% - 16px);
    }
    .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel {
      top: calc((100vw - 1024px) * 9 / 16 + 4px);
      width: calc(100vw - 1024px);
      height: calc(100vh - (100vw - 1024px) * 9 / 16 - 70px);
    }

    .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .videoTagsContainer {
      width: calc(100vw - 1024px - 26px);
    }

    .futatsumeScreenMode_sideView .futatsumeWatchVideoHeaderPanel {
      width: calc(100vw - (100vw - 1024px));
      left:  calc(100vw - 1024px);
    }
  }

`,
  { className: 'screenMode for-popup videoHeaderPanel', disabled: true }
);

css.addStyle(
  `
  body .is-open .futatsumeWatchVideoHeaderPanel {
    width: calc(100% + ${CONSTANT.RIGHT_PANEL_WIDTH}px);
  }
    .futatsumeWatchVideoHeaderPanel.is-onscreen {
      top: 0px;
      bottom: auto;
      background: rgba(0, 0, 0, 0.5);
      opacity: 0;
      box-shadow: none;
    }

    .is-loading .futatsumeWatchVideoHeaderPanel.is-onscreen {
      opacity: 0.6;
      transition: 0.4s opacity;
    }

    .futatsumeWatchVideoHeaderPanel.is-onscreen:hover {
      opacity: 1;
      transition: 0.5s opacity;
    }

    .futatsumeWatchVideoHeaderPanel.is-onscreen:not(:hover) .videoTagsContainer {
      display: none;
    }
    .futatsumeWatchVideoHeaderPanel.is-onscreen .videoTitleContainer {
      width: calc(100% - 220px);
    }

    .futatsumeWatchVideoInfoPanelFoot {
      background: #222;
    }

`,
  { className: 'screenMode for-dialog videoHeaderPanel', disabled: true }
);

css.addStyle(
  `
  .is-open .futatsumeWatchVideoHeaderPanel {
    position: absolute; /* fixedだとFirefoxのバグでおかしくなる */
    top: 0px;
    bottom: auto;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    box-shadow: none;
  }

  .is-loading .futatsumeWatchVideoHeaderPanel,
  .is-mouseMoving .futatsumeWatchVideoHeaderPanel {
    opacity: 0.6;
    transition: 0.4s opacity;
  }

  .is-open .showVideoHeaderPanel .futatsumeWatchVideoHeaderPanel,
  .is-open .futatsumeWatchVideoHeaderPanel:hover {
    opacity: 1;
    transition: 0.5s opacity;
  }

  .is-open .futatsumeWatchVideoHeaderPanel:not(:hover) .videoTagsContainer {
    display: none;
  }

  .is-open .futatsumeWatchVideoHeaderPanel .videoTitleContainer {
    width: calc(100% - 220px);
  }

`,
  { className: 'screenMode for-full videoHeaderPanel', disabled: true }
);

VideoHeaderPanel.__css__ = `
    .futatsumeWatchVideoHeaderPanel {
      position: absolute;
      width: calc(100%);
      z-index: 30000;
      box-sizing: border-box;
      padding: 8px 8px 0;
      bottom: calc(100% + 8px);
      left: 0;
      background: #333;
      color: #ccc;
      text-align: left;
      box-shadow: 4px 4px 4px #000;
      transition: opacity 0.4s ease;
      will-change: transform;
    }
    .futatsumeWatchVideoHeaderPanel.is-onscreen {
      width: 100% !important;
    }
    .futatsumeScreenMode_sideView .futatsumeWatchVideoHeaderPanel,
    .futatsumeWatchVideoHeaderPanel.is-fullscreen {
      z-index: 20000;
    }

    .futatsumeWatchVideoHeaderPanel {
      pointer-events: none;
    }

    .is-mouseMoving .futatsumeWatchVideoHeaderPanel,
                    .futatsumeWatchVideoHeaderPanel:hover {
      pointer-events: auto;
    }

    .futatsumeWatchVideoHeaderPanel.initializing {
      display: none;
    }
    .futatsumeWatchVideoHeaderPanel.initializing>*{
      opacity: 0;
    }

    .futatsumeWatchVideoHeaderPanel .videoTitleContainer {
      margin: 8px;
    }
    .futatsumeWatchVideoHeaderPanel .publicStatus {
      position: relative;
      color: #ccc;
    }

    .futatsumeWatchVideoHeaderPanel .videoTitle {
      font-size: 24px;
      color: #fff;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
      display: block;
      padding: 2px 0;
    }

    .futatsumeWatchVideoHeaderPanel .videoTitle::before {
      display: none;
      position: absolute;
      font-size: 12px;
      top: 0;
      left: 0;
      background: #333;
      border: 1px solid #888;
      padding: 2px 4px;
      pointer-events: none;
    }
    .futatsumeWatchVideoHeaderPanel.is-mymemory:not(:hover) .videoTitle::before {
      content: 'マイメモリー';
      display: inline-block;
    }
    .futatsumeWatchVideoHeaderPanel.is-community:not(:hover) .videoTitle::before {
      content: 'コミュニティ動画';
      display: inline-block;
    }

    .videoMetaInfoContainer {
      display: inline-block;
    }

    .futatsumeWatchVideoHeaderPanel .relatedInfoMenuContainer {
      display: inline-block;
      position: absolute;
      top: 0;
      margin: 0 16px;
      z-index: 1000;
    }

    .futatsumeWatchVideoHeaderPanel:focus-within,
    .futatsumeWatchVideoHeaderPanel.is-relatedMenuOpen {
      z-index: 50000;
    }

    .futatsumeWatchVideoHeaderPanel .series-thumbnail-cover {
      position: absolute;
      top: 0px;
      right: 0px;
      width: 50%;
      height: 100%;
      display: inline-block;
      overflow: hidden;
      contain: strict;
      pointer-events: none;
      user-select: none;
    }
    .futatsumeWatchVideoHeaderPanel .series-thumbnail[style] {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      /*filter: sepia(50%) blur(4px);*/
      background-size: cover;
      background-position: center center;
      background-repeat: no-repeat;
      will-change: transform;
      -webkit-mask-image:
        linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 100%);
      mask-image:
        linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 100%);
    }
  `;

VideoHeaderPanel.__tpl__ = `
    <div class="futatsumeWatchVideoHeaderPanel show initializing" style="display: none;">
      <h2 class="videoTitleContainer">
        <span class="videoTitle"></span>
      </h2>
      <p class="publicStatus">
        <span class="videoMetaInfoContainer"></span>
        <span class="relatedInfoMenuContainer"></span>
      </p>
      <div class="series-thumbnail-cover"><div class="series-thumbnail"></div></div>
    </div>
  `.trim();

export { VideoHeaderPanel };
