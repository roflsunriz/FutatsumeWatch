import _ from 'lodash';
import { global } from './futatsume-watch-index';
import { CONSTANT } from './constant';
import { Config } from './config';
import { RelatedVideoList } from '../packages/futatsume/src/Playlist/related-video-list';
import { TagListView } from './tag-list-view';
import { BaseViewComponent } from '../packages/futatsume/src/parts/base-view-component';
import { Emitter } from '../packages/lib/src/emitter';
import { sleep } from '../packages/lib/src/infra/sleep';
import { Fullscreen } from '../packages/lib/src/dom/fullscreen';
import { textUtil } from '../packages/lib/src/text/text-util';
import { nicoUtil } from '../packages/lib/src/nico/nico-util';
import { css, cssUtil } from '../packages/lib/src/css/css';
import { uq } from '../packages/lib/src/u-query';
import { domEvent } from '../packages/lib/src/dom/dom-event';
import { ClassList } from '../packages/lib/src/dom/class-list-wrapper';
import { MylistPocketDetector } from '../packages/futatsume/src/init/mylist-pocket-detector';
import type { EmitterCallback } from '../packages/lib/src/emitter';
import type { ConfigProps } from './config';
import type { TagListTagData } from './tag-list-view';
interface VideoOwnerInfo {
  icon: string;
  url: string;
  name: string;
  id: string;
}
interface VideoSeriesItem {
  id: string;
}
interface VideoSeriesVideo {
  prev: VideoSeriesItem | null;
  next: VideoSeriesItem | null;
}
interface VideoSeriesInfo {
  title: string;
  thumbnailUrl?: string;
  video: VideoSeriesVideo;
  [key: string]: unknown;
}
interface VideoCountInfo {
  comment?: number;
  view?: number;
  mylist?: number;
}
interface VideoInfoModel {
  owner: VideoOwnerInfo;
  title: string;
  description: string;
  series: VideoSeriesInfo | null;
  tagList: TagListTagData[];
  watchId: string;
  videoId: string;
  csrfToken: string;
  isCommunityVideo: boolean;
  isMymemory: boolean;
  isChannel: boolean;
  hasParentVideo: boolean;
  postedAt: string | number;
  count: VideoCountInfo;
  getCurrentVideo: () => Promise<string>;
}
interface VideoInfoPanelParams {
  dialog: InstanceType<typeof Emitter>;
  node?: Element | null;
}
interface VideoSearchProps {
  ownerOnly: boolean;
  mode: unknown;
  word: string;
  sort: string;
  [key: string]: unknown;
}
interface VideoSearchFormControls {
  ownerOnly: HTMLInputElement;
  mode: RadioNodeList | HTMLInputElement;
  word: HTMLInputElement;
  sort: HTMLSelectElement;
  [name: string]: HTMLInputElement | HTMLSelectElement | RadioNodeList;
}
interface VideoSearchFormInit {
  parentNode?: Element | DocumentFragment | null;
}
interface RelatedMenuParams {
  parentNode: Element | null;
  isHeader?: boolean;
}
type RelatedMenuElm = {
  body: Element;
  summary: Element;
};
type VideoMetaElm = {
  postedAt: Element | null;
  body: Element | null;
  viewCount: Element | null;
  commentCount: Element | null;
  mylistCount: Element | null;
};
interface PocketApi {
  external: { info(param: unknown): void };
}
interface RecommendVideoInfoLike {
  watchId: unknown;
  contextWatchId: unknown;
  title: unknown;
  duration: unknown;
  count: { comment: unknown; mylist: unknown; view: unknown };
  thumbnail: unknown;
  postedAt: unknown;
  owner: unknown;
}
interface UqRafHandle {
  addClass(className: string): UqResult;
  removeClass(className: string): UqResult;
  css(name: string, value: string): UqResult;
}
type UqAppendContent = string | Element | DocumentFragment | UqResult | null | undefined;
interface UqResult<TElement extends Element = Element> {
  readonly length: number;
  [index: number]: TElement;
  [Symbol.iterator](): ArrayIterator<TElement>;
  find(selector: string): UqResult;
  query<TQuery extends Element = Element>(selector: string): UqResult<TQuery>;
  attr(name: string, value: string): UqResult<TElement>;
  text(): string;
  text(value: string): UqResult<TElement>;
  addClass(className: string): UqResult<TElement>;
  removeClass(className: string): UqResult<TElement>;
  append(content: UqAppendContent): UqResult<TElement>;
  appendTo(target: string | Element | null | undefined): UqResult<TElement>;
  on(name: string, callback: (event: Event) => void, options?: AddEventListenerOptions): UqResult<TElement>;
  html(): string;
  raf: UqRafHandle;
}
interface UqStatic {
  (target: string | Element | null | undefined): UqResult;
  html(template: string): UqResult;
  ready(): Promise<void>;
}
const VideoItemObserver: { observe(params: { container: Element | null }): void } = {
  observe: () => {},
};
//===BEGIN===

class VideoInfoPanel extends Emitter {
  declare static __tpl__: string;
  _videoHeaderPanel: VideoHeaderPanel;
  _dialog: InstanceType<typeof Emitter>;
  _config: { props: ConfigProps };
  _$view!: UqResult;
  _view!: Element;
  classList!: DOMTokenList;
  _$ownerIcon!: UqResult;
  _$ownerName!: UqResult;
  _$ownerPageLink!: UqResult;
  _description!: Element;
  _seriesList!: Element;
  _tagListView!: TagListView;
  _relatedInfoMenu!: RelatedInfoMenu;
  _videoMetaInfo!: VideoMetaInfo;
  _videoInfo!: VideoInfoModel;
  _relatedVideoList?: RelatedVideoList;
  _pocket!: PocketApi;
  _activeTabName?: string;
  _isInitialized?: boolean;
  private playbackGeneration = 0;
  constructor(params: VideoInfoPanelParams) {
    super();
    this._videoHeaderPanel = new VideoHeaderPanel();
    this._dialog = params.dialog;
    this._config = Config;

    this._dialog.on('canPlay', this._onVideoCanPlay.bind(this) as unknown as EmitterCallback);
    this._dialog.on('videoCount', this._onVideoCountUpdate.bind(this) as unknown as EmitterCallback);

    if (params.node) {
      this.appendTo(params.node);
    }
  }
  _initializeDom() {
    if (this._isInitialized) {
      return;
    }
    this._isInitialized = true;

    const $view = (this._$view = (uq as unknown as UqStatic).html(VideoInfoPanel.__tpl__));
    const view = (this._view = $view[0]!);
    const classList = (this.classList = ClassList(view));

    const $icon = (this._$ownerIcon = $view.find('.ownerIcon'));
    this._$ownerName = $view.find('.ownerName');
    this._$ownerPageLink = $view.find('.ownerPageLink');

    this._description = view.querySelector('.videoDescription')!;
    this._seriesList = view.querySelector('.seriesList')!;

    this._tagListView = new TagListView({
      parentNode: view.querySelector('.videoTagsContainer')!,
    });

    this._relatedInfoMenu = new RelatedInfoMenu({
      parentNode: view.querySelector('.relatedInfoMenuContainer')!,
    });

    this._videoMetaInfo = new VideoMetaInfo({
      parentNode: view.querySelector('.videoMetaInfoContainer')!,
    });

    view.addEventListener('mousemove', (e) => e.stopPropagation());
    view.addEventListener('command', this._onCommandEvent.bind(this));
    view.addEventListener('click', (e) => this._onClick(e as MouseEvent));
    view.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    $icon.on('load', () => $icon.raf.removeClass('is-loading'));

    classList.add(Fullscreen.now() ? 'is-fullscreen' : 'is-notFullscreen');
    global.emitter.on('fullscreenStatusChange', ((isFull: boolean) => {
      classList.toggle('is-fullscreen', isFull);
      classList.toggle('is-notFullscreen', !isFull);
    }) as unknown as EmitterCallback);

    view.addEventListener('touchenter', () => classList.add('is-slideOpen'), { passive: true });
    global.emitter.on('hideHover', () => classList.remove('is-slideOpen'));
    cssUtil.registerProps({
      name: '--base-description-color',
      syntax: '<color>',
      initialValue: '#888',
      inherits: true,
    });
    void MylistPocketDetector.detect().then((pocket) => {
      this._pocket = pocket as PocketApi;
      classList.add('is-pocketReady');
    });
    if (window.customElements) {
      VideoItemObserver.observe({ container: this._description });
    }
  }
  update(videoInfo: VideoInfoModel) {
    this._videoInfo = videoInfo;
    this._videoHeaderPanel.update(videoInfo);

    const owner = videoInfo.owner;
    this._$ownerIcon.attr('src', owner.icon);
    this._$ownerPageLink.attr('href', owner.url);
    this._$ownerName.text(owner.name);

    this._videoMetaInfo.update(videoInfo);
    this._tagListView.update({
      tagList: videoInfo.tagList,
    });

    this._seriesList.textContent = '';
    if (videoInfo.series) {
      const label = document.createElement('futatsume-video-series-label');
      Object.assign(label.dataset, videoInfo.series);
      this._seriesList.append(label);
    }
    void this._updateVideoDescription(videoInfo.description, videoInfo.series);

    const classList = this.classList;
    classList.remove('userVideo', 'channelVideo', 'initializing');
    classList.toggle('is-community', this._videoInfo.isCommunityVideo);
    classList.toggle('is-mymemory', this._videoInfo.isMymemory);
    classList.add(videoInfo.isChannel ? 'channelVideo' : 'userVideo');

    this._relatedInfoMenu.update(videoInfo);
  }
  /**
   * 説明文中のurlの自動リンク等の処理
   */
  async _updateVideoDescription(html: string, series: VideoSeriesInfo | null = null) {
    this._description.textContent = '';
    if (series) {
      if (series.video.prev || series.video.next) {
        html += `<br><br>「${textUtil.escapeHtml(series.title)}」 シリーズ前後の動画`;
      }
      if (series.video.prev) {
        html += `<br>前の動画 <a class="watch" href="https://www.nicovideo.jp/watch/${series.video.prev.id}">${series.video.prev.id}</a>`;
      }
      if (series.video.next) {
        html += `<br>次の動画 <a class="watch" href="https://www.nicovideo.jp/watch/${series.video.next.id}">${series.video.next.id}</a>`;
      }
    }
    const decorateWatchLink = (watchLink: HTMLAnchorElement) => {
      const videoId = watchLink.textContent.replace('watch/', '').replace('shorts/', '');

      if (
        !/^(sm|nm|so|ss)[0-9]+$/.test(videoId) ||
        !['www.nicovideo.jp'].includes(watchLink.hostname) ||
        !(watchLink.pathname.startsWith('/watch/') || watchLink.pathname.startsWith('/shorts/'))
      ) {
        return;
      }
      watchLink.classList.add('noHoverMenu');
      Object.assign(watchLink.dataset, { command: 'open', param: videoId });

      if (!window.customElements) {
        const $watchLink = (uq as unknown as UqStatic)(watchLink);
        const thumbnail = nicoUtil.getThumbnailUrlByVideoId(videoId);
        if (thumbnail) {
          const $img = (uq as unknown as UqStatic)('<img class="videoThumbnail">').attr('src', thumbnail);
          $watchLink.append($img);
        }
        const buttons = (uq as unknown as UqStatic)(`<futatsume-playlist-append
          class="playlistAppend clickable-item" title="プレイリストで開く"
          data-command="playlistAppend" data-param="${videoId}"
        >▶</futatsume-playlist-append><div
          class="deflistAdd" title="とりあえずマイリスト"
          data-command="deflistAdd" data-param="${videoId}"
        >&#x271A;</div
        ><div class="pocket-info" title="動画情報"
          data-command="pocket-info" data-param="${videoId}"
        >？</div>`);
        $watchLink.append(buttons);
      } else {
        const vitem = document.createElement('futatsume-video-item');
        vitem.dataset.videoId = videoId;
        watchLink.after(vitem);
        watchLink.classList.remove('watch');
      }
    };
    const seekTime = (seek: HTMLElement) => {
      const [min, sec] = (seek.dataset.seektime || '0:0').split(':');
      Object.assign(seek.dataset, { command: 'seek', type: 'number', param: Number(min) * 60 + Number(sec) * 1 });
    };
    const mylistLink = (link: HTMLAnchorElement) => {
      link.classList.add('mylistLink');
      const mylistId = link.textContent.split('/')[1];
      const button = (uq as unknown as UqStatic)(`<futatsume-mylist-link data-mylist-id="${mylistId}">
          ${link.outerHTML}
          <futatsume-playlist-append
            class="playlistSetMylist clickable-item" title="プレイリストで開く"
            data-command="playlistSetMylist" data-param="${mylistId}"
          >▶</futatsume-playlist-append>
        </futatsume-mylist-link>`)[0]!;
      link.replaceWith(button);
    };
    const seriesLink = (link: HTMLAnchorElement) => {
      link.classList.add('seriesLink');
      const seriesId = link.textContent.split('/')[1];
      const button = (uq as unknown as UqStatic)(`<futatsume-series-link data-series-id="${seriesId}">
          ${link.outerHTML}
          <futatsume-playlist-append
            class="playlistSetSeries clickable-item" title="プレイリストで開く"
            data-command="playlistSetSeries" data-param="${seriesId}"
          >▶</futatsume-playlist-append>
        </futatsume-series-link>`)[0]!;
      link.replaceWith(button);
    };
    const youtube = (link: HTMLAnchorElement) => {
      const btn = (uq as unknown as UqStatic)(`<futatsumetube-button
        class="futatsumeTubeButton"
        title="FutatsumeWatchで開く(実験中)"
        accesskey="z"
        data-command="setVideo;"
        >▷Futatsume<span>Tube</span></futatsumetube-button>`)[0] as unknown as HTMLElement;
      Object.assign(btn.dataset, {
        command: 'setVideo',
        param: link.href,
      });
      link.parentNode!.insertBefore(btn, link);
    };

    await sleep.promise();

    const $description = (uq as unknown as UqStatic)(
      `<futatsume-video-description>${html}</futatsume-video-description>`
    );
    for (const a of $description.query<HTMLAnchorElement>('a')) {
      a.classList.add('noHoverMenu');
      const href = a.href;
      if (a.classList.contains('watch')) {
        decorateWatchLink(a);
      } else if (a.classList.contains('seekTime')) {
        seekTime(a);
      } else if (/^mylist\//.test(a.textContent)) {
        mylistLink(a);
      } else if (/^series\//.test(a.textContent)) {
        seriesLink(a);
      } else if (/^https?:\/\/((www\.|)youtube\.com\/watch|youtu\.be)/.test(href)) {
        youtube(a);
      }
    }
    for (const e of $description.query<HTMLElement>('[style*="color: #000000;"],[style*="color: black;"]')) {
      e.dataset.originalCss = (e as unknown as { cssText: string }).cssText;
      e.style.color = '#FFF';
    }
    for (const e of $description.query('span')) {
      e.classList.add('videoDescription-font');
    }

    this._description.append($description[0]!);
  }
  async _onVideoCanPlay(watchId: string, videoInfo: VideoInfoModel) {
    const generation = ++this.playbackGeneration;
    // 動画の再生を優先するため、比較的どうでもいい要素はこのタイミングで初期化するのがよい
    if (!this._relatedVideoList) {
      this._relatedVideoList = new (
        RelatedVideoList as unknown as new (params: { container: Element | undefined }) => RelatedVideoList
      )({
        container: this._$view.find('.relatedVideoContainer')[0],
      });
      this._relatedVideoList.on('command', this._onCommand.bind(this) as unknown as EmitterCallback);
    }

    await sleep.idle();
    if (generation !== this.playbackGeneration || this._videoInfo !== videoInfo) return;
    void this._relatedVideoList.fetchRecommend(
      videoInfo.videoId,
      watchId,
      videoInfo as unknown as RecommendVideoInfoLike
    );
  }
  cancelPending(): void {
    this.playbackGeneration++;
  }
  _onVideoCountUpdate(...args: [VideoCountInfo]) {
    if (!this._videoHeaderPanel) {
      return;
    }
    this._videoMetaInfo.updateVideoCount(...args);
    this._videoHeaderPanel.updateVideoCount(...args);
  }
  _onClick(e: MouseEvent) {
    e.stopPropagation();
    if (e.button !== 0 || e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) {
      return true;
    }
    const target = (e.target as unknown as HTMLElement).closest('[data-command]') as unknown as HTMLElement | null;
    if (!target) {
      void global.emitter.emitAsync('hideHover'); // 手抜き
      return;
    }
    const { command, type } = target.dataset;
    let { param } = target.dataset;
    if (param && (type === 'bool' || type === 'json')) {
      param = JSON.parse(param) as string;
    }
    e.preventDefault();

    domEvent.dispatchCommand(e.target as unknown as Element, command as string, param);
  }
  _onCommand(command: string, param: unknown) {
    switch (command) {
      default:
        domEvent.dispatchCommand(this._view, command, param);
        break;
    }
  }
  _onCommandEvent(e: Event) {
    const { command, param } = (e as CustomEvent<{ command: string; param: unknown }>).detail;
    switch (command) {
      case 'pocket-info':
        this._pocket.external.info(param);
        break;
      case 'ownerVideo':
        domEvent.dispatchCommand(this._view, 'playlistSetUploadedVideo', this._videoInfo.owner.id);
        break;
      default:
        return;
    }
    e.stopPropagation();
  }
  appendTo(node: Element) {
    this._initializeDom();
    this._$view.appendTo(node);
    this._videoHeaderPanel.appendTo(node);
  }
  hide() {
    this._videoHeaderPanel.hide();
  }
  close() {
    this._tagListView?.update({});
  }
  clear(): undefined {
    this._tagListView?.update({});
    this._videoHeaderPanel.clear();
    this.classList.add('initializing');
    this._$ownerIcon.raf.addClass('is-loading');
    this._description.textContent = '';
  }
  selectTab(tabName: string) {
    const $view = this._$view;
    const $target = $view.find(`.tabs.${tabName}, .tabSelect.${tabName}`);
    this._activeTabName = tabName;
    $view.find('.activeTab').removeClass('activeTab');
    $target.addClass('activeTab');
  }
  blinkTab(tabName: string) {
    const $view = this._$view;
    const $target = $view.find(`.tabs.${tabName}, .tabSelect.${tabName}`);
    if (!$target.length) {
      return;
    }
    $target.addClass('blink');
    window.setTimeout(() => $target.removeClass('blink'), 50);
  }
  appendTab(tabName: string, title: string, content?: UqAppendContent) {
    const $view = this._$view;
    const $select = (uq as unknown as UqStatic)('<div class="tabSelect"/>')
      .addClass(tabName)
      .attr('data-command', 'selectTab')
      .attr('data-param', tabName)
      .text(title);
    const $body = (uq as unknown as UqStatic)('<div class="tabs"/>').addClass(tabName);
    if (content) {
      $body.append(content);
    }

    $view.find('.tabSelectContainer').append($select);
    $view.append($body);

    if (this._activeTabName === tabName) {
      $select.addClass('activeTab');
      $body.addClass('activeTab');
    }
    return $body;
  }
}

css.addStyle(
  `
  .futatsumeWatchVideoInfoPanel .tabs:not(.activeTab) {
    display: none;
    pointer-events: none;
    overflow: hidden;
  }

  .futatsumeWatchVideoInfoPanel .tabs.activeTab {
    margin-top: 32px;
    box-sizing: border-box;
    position: relative;
    width: 100%;
    height: calc(100% - 32px);
    overflow-x: hidden;
    overflow-y: visible;
    overscroll-behavior: none;
    text-align: left;
  }
  .futatsumeWatchVideoInfoPanel .tabs.relatedVideoTab.activeTab {
    overflow: hidden;
  }

  .futatsumeWatchVideoInfoPanel .tabs:not(.activeTab) {
    display: none !important;
    pointer-events: none;
    opacity: 0;
  }

  .futatsumeWatchVideoInfoPanel .tabSelectContainer {
    position: absolute;
    display: flex;
    height: 32px;
    z-index: 100;
    width: 100%;
    white-space: nowrap;
    user-select: none;
  }

  .futatsumeWatchVideoInfoPanel .tabSelect {
    flex: 1;
    box-sizing: border-box;
    display: inline-block;
    height: 32px;
    font-size: 12px;
    letter-spacing: 0;
    line-height: 32px;
    color: #666;
    background: #222;
    cursor: pointer;
    text-align: center;
    transition: text-shadow 0.2s ease, color 0.2s ease;
  }
  .futatsumeWatchVideoInfoPanel .tabSelect.activeTab {
    font-size: 14px;
    letter-spacing: 0.1em;
    color: #ccc;
    background: #333;
  }

  .futatsumeWatchVideoInfoPanel .tabSelect.blink:not(.activeTab) {
    color: #fff;
    text-shadow: 0 0 4px #ff9;
    transition: none;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel.is-notFullscreen .tabSelect.blink:not(.activeTab) {
    color: #fff;
    text-shadow: 0 0 4px #006;
    transition: none;
  }

  .futatsumeWatchVideoInfoPanel .tabSelect:not(.activeTab):hover {
    background: #888;
  }

  .futatsumeWatchVideoInfoPanel.initializing {
  }

  .futatsumeWatchVideoInfoPanel>* {
    transition: opacity 0.4s ease;
    pointer-events: none;
  }

  .is-mouseMoving .futatsumeWatchVideoInfoPanel>*,
                .futatsumeWatchVideoInfoPanel:hover>* {
    pointer-events: auto;
  }


  .futatsumeWatchVideoInfoPanel.initializing>* {
    opacity: 0;
    color: #333;
    transition: none;
  }

  .futatsumeWatchVideoInfoPanel {
    position: absolute;
    top: 0;
    width: 320px;
    height: 100%;
    box-sizing: border-box;
    z-index: 25000;
    background: #333;
    color: #ccc;
    overflow-x: hidden;
    overflow-y: hidden;
    transition: opacity 0.4s ease;
  }

  .futatsumeWatchVideoInfoPanel .ownerPageLink {
    display: block;
    margin: 0 auto 8px;
    width: 104px;
  }

  .futatsumeWatchVideoInfoPanel .ownerIcon {
    width: 96px;
    height: 96px;
    border: none;
    border-radius: 4px;
    transition: opacity 1s ease;
    vertical-align: middle;
  }
  .futatsumeWatchVideoInfoPanel .ownerIcon.is-loading {
    opacity: 0;
  }

  .futatsumeWatchVideoInfoPanel .ownerName {
    font-size: 20px;
    word-break: break-all;
  }

  .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer {
    padding: 16px;
    display: table;
    width: 100%;
  }

  .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer>*{
    display: block;
    vertical-align: middle;
    text-align: center;
  }

  .futatsumeWatchVideoInfoPanel .videoDescription {
    padding: 8px 8px 8px;
    margin: 4px 0px;
    word-break: break-all;
    line-height: 1.5;
  }

  .futatsumeWatchVideoInfoPanel .videoDescription a {
    display: inline-block;
    font-weight: bold;
    text-decoration: none;
    color: #ff9;
    padding: 2px;
  }
  .futatsumeWatchVideoInfoPanel .videoDescription a:visited {
    color: #ffd;
  }

  .futatsumeWatchVideoInfoPanel .videoDescription .watch {
    display: block;
    position: relative;
    line-height: 60px;
    box-sizing: border-box;
    padding: 4px 16px;;
    min-height: 60px;
    width: 272px;
    margin: 8px 10px;
    background: #444;
    border-radius: 4px;
  }
  .futatsumeWatchVideoInfoPanel .videoDescription .watch:hover {
    background: #446;
  }

  .videoDescription-font[style*="color"] {
    text-shadow:
      0 -1px 2px var(--base-description-color, #888),
      1px 0 2px var(--base-description-color, #888),
      0 1px 2px var(--base-description-color, #888),
      -1px 0 2px var(--base-description-color, #888);
  }

  .futatsumeWatchVideoInfoPanel .videoDescription .mylistLink,
  .futatsumeWatchVideoInfoPanel .videoDescription .seriesLink {
    white-space: nowrap;
    display: inline-block;
  }

  .futatsumeWatchVideoInfoPanel:not(.is-pocketReady) .pocket-info {
    display: none !important;
  }
  .pocket-info {
    font-family: Menlo;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistAppend,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .deflistAdd,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetMylist,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetSeries,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .pocket-info,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetUploadedVideo {
    display: inline-block;
    font-size: 16px;
    line-height: 20px;
    width: 24px;
    height: 24px;
    background: #666;
    color: #ccc !important;
    background: #666;
    text-decoration: none;
    border: 1px outset;
    cursor: pointer;
    text-align: center;
    user-select: none;
    margin-left: 8px;
  }
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistAppend,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .pocket-info,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .deflistAdd {
    display: none;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .owner:hover .playlistAppend,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .watch:hover .playlistAppend,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .watch:hover .pocket-info,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .watch:hover .deflistAdd {
    display: inline-block;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistAppend {
    position: absolute;
    bottom: 4px;
    left: 16px;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .pocket-info {
    position: absolute;
    bottom: 4px;
    left: 48px;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .deflistAdd {
    position: absolute;
    bottom: 4px;
    left: 80px;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .pocket-info:hover,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistAppend:hover,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .deflistAdd:hover,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetMylist:hover,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetSeries:hover,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetUploadedVideo:hover {
    transform: scale(1.5);
  }
  .futatsumeWatchVideoInfoPanel .videoInfoTab .pocket-info:active,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistAppend:active,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .deflistAdd:active,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetMylist:active,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetSeries:active,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetUploadedVideo:active {
    transform: scale(1.2);
    border: 1px inset;
  }


  .futatsumeWatchVideoInfoPanel .videoDescription .watch .videoThumbnail {
    position: absolute;
    right: 16px;
    height: 60px;
    pointer-events: none;
  }
  .futatsumeWatchVideoInfoPanel .videoDescription:hover .watch .videoThumbnail {
    filter: none;
  }



  .futatsumeWatchVideoInfoPanel .publicStatus,
  .futatsumeWatchVideoInfoPanel .videoTagsContainer {
    display: none;
  }

  .futatsumeWatchVideoInfoPanel .publicStatus {
    display: none;
    position: relative;
    margin: 8px 0;
    padding: 8px;
    line-height: 150%;
    text-align: center;
    color: #333;
  }

  .futatsumeWatchVideoInfoPanel .videoMetaInfoContainer {
    display: inline-block;
    padding: 0 8px;
  }


  .futatsumeWatchVideoInfoPanel .relatedVideoTab .relatedVideoContainer {
    box-sizing: border-box;
    position: relative;
    width: 100%;
    height: 100%;
    margin: 0;
    user-select: none;
  }

  .futatsumeWatchVideoInfoPanel .videoListFrame,
  .futatsumeWatchVideoInfoPanel .commentListFrame {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border: 0;
    background: #333;
  }

  .futatsumeWatchVideoInfoPanel .nowLoading {
    display: none;
    opacity: 0;
    pointer-events: none;
  }
  .futatsumeWatchVideoInfoPanel.initializing .nowLoading {
    display: block !important;
    opacity: 1 !important;
    color: #888;
  }
  .futatsumeWatchVideoInfoPanel .nowLoading {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
  }
  .futatsumeWatchVideoInfoPanel .kurukuru {
    position: absolute;
    display: inline-block;
    font-size: 96px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  @keyframes loadingRolling {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(1800deg); }
  }
  .futatsumeWatchVideoInfoPanel.initializing .kurukuruInner {
    display: inline-block;
    pointer-events: none;
    text-align: center;
    text-shadow: 0 0 4px #888;
    animation-name: loadingRolling;
    animation-iteration-count: infinite;
    animation-duration: 4s;
  }
  .futatsumeWatchVideoInfoPanel .nowLoading .loadingMessage {
    position: absolute;
    display: inline-block;
    font-family: Impact;
    font-size: 32px;
    text-align: center;
    top: calc(50% + 48px);
    left: 0;
    width: 100%;
  }

  ${CONSTANT.SCROLLBAR_CSS}

  .futatsumeWatchVideoInfoPanel .futatsumeWatchVideoInfoPanelInner {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
    .futatsumeWatchVideoInfoPanelContent {
      flex: 1;
    }

  .futatsumeTubeButton {
    display: inline-block;
    padding: 4px 8px;
    cursor: pointer;
    background: #666;
    color: #ccc;
    border-radius: 4px;
    border: 1px outset;
    margin: 0 8px;
  }
  .futatsumeTubeButton:hover {
    box-shadow: 0 0 8px #fff, 0 0 4px #ccc;
  }
    .futatsumeTubeButton span {
      pointer-events: none;
      display: inline-block;
      background: #ccc;
      color: #333;
      border-radius: 4px;
    }
    .futatsumeTubeButton:hover span {
      background: #f33;
      color: #ccc;
    }
  .futatsumeTubeButton:active {
    box-shadow:  0 0 2px #ccc, 0 0 4px #000 inset;
    border: 1px inset;
  }

  .futatsumeWatchVideoInfoPanel .relatedInfoMenuContainer {
    text-align: left;
  }

  .futatsumeWatchVideoInfoPanel .seriesList {
    padding: 0 8px;
  }

  futatsume-video-item,
  futatsume-video-series-label,
  futatsume-vieo-description {
    content-visibility: auto;
  }

  `,
  { className: 'videoInfoPanel' }
);

css.addStyle(
  `
  .is-open .futatsumeWatchVideoInfoPanel>* {
    display: none;
    pointer-events: none;
  }
  .futatsumeWatchVideoInfoPanel:hover>* {
    display: inherit;
    pointer-events: auto;
  }
  .futatsumeWatchVideoInfoPanel:hover .tabSelectContainer {
    display: flex;
  }

  .futatsumeWatchVideoInfoPanel {
    top: 20%;
    right: calc(32px - 320px);
    left: auto;
    width: 320px;
    height: 60%;
    border: 1px solid transparent;
    background: none;
    opacity: 0;
    box-shadow: none;
    transition: opacity 0.4s ease, transform 0.4s ease 1s;
    will-change: opacity, transform;
  }

  .is-mouseMoving  .futatsumeWatchVideoInfoPanel {
    border: 1px solid #888;
    opacity: 0.5;
  }

  .futatsumeWatchVideoInfoPanel.is-slideOpen,
  .futatsumeWatchVideoInfoPanel:hover {
    background: #333;
    box-shadow: 4px 4px 4px #000;
    border: none;
    opacity: 0.9;
    transform: translate3d(-288px, 0, 0);
    transition: opacity 0.4s ease, transform 0.4s ease 1s;
  }

`,
  { className: 'screenMode for-full videoInfoPanel' }
);

css.addStyle(
  `
  .futatsumeScreenMode_small .futatsumeWatchVideoInfoPanel {
    display: none;
  }

  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .tabSelectContainer {
    width: calc(100% - 16px);
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .tabSelect {
    background: #ccc;
    color: #888;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .tabSelect.activeTab {
    background: #ddd;
    color: black;
    border: none;
  }

  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel {
    top: 230px;
    left: 0;
    width: ${CONSTANT.SIDE_PLAYER_WIDTH}px;
    height: calc(100vh - 296px);
    bottom: 48px;
    padding: 8px;
    box-shadow: none;
    background: #f0f0f0;
    color: #000;
    border: 1px solid #333;
    margin: 4px 2px;
  }

  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .publicStatus {
    display: block;
    text-align: center;
  }

  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .videoDescription a {
    color: #006699;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .videoDescription a:visited {
    color: #666666;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .videoTagsContainer {
    display: block;
    bottom: 48px;
    width: 364px;
    margin: 0 auto;
    padding: 8px;
    background: #ccc;
  }

  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .videoDescription .watch {
    background: #ddd;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .videoDescription .watch:hover {
    background: #ddf;
  }

  .futatsumeScreenMode_sideView .videoInfoTab::-webkit-scrollbar {
    background: #f0f0f0;
  }

  .futatsumeScreenMode_sideView .videoInfoTab::-webkit-scrollbar-thumb {
    border-radius: 0;
    background: #ccc;
  }
`,
  { className: 'screenMode for-popup videoInfoPanel' }
);

void (uq as unknown as UqStatic).ready().then(() => {
  if (document.body.classList.contains('MatrixRanking-body')) {
    css.addStyle(
      `
      body.futatsumeScreenMode_sideView.MatrixRanking-body .RankingRowRank {
        line-height: 48px;
        height: 48px;
        pointer-events: none;
        user-select: none;
      }
      body.futatsumeScreenMode_sideView.MatrixRanking-body .RankingRowRank {
        position: sticky;
        left: calc(var(--sideView-left-margin) - 8px);
        z-index: 100;
        transform: none;
        padding-right: 16px;
        width: 64px;
        overflow: visible;
        text-align: right;
        mix-blend-mode: difference;
        text-shadow:
          1px  1px 0 #fff,
          1px -1px 0 #fff,
          -1px  1px 0 #fff,
          -1px -1px 0 #fff;
      }
      body.futatsumeScreenMode_sideView.MatrixRanking-body .BaseLayout-block {
        width: ${1024 + 64 * 2}px;
      }
      .RankingMainContainer-decorateChunk+.RankingMainContainer-decorateChunk,
      .RankingMainContainer-decorateChunk>*+* {
        margin-top: 0;
      }
      body.futatsumeScreenMode_sideView .RankingMainContainer {
        width: ${1024}px;
      }
      body.futatsumeScreenMode_sideView.MatrixRanking-body .RankingMatrixVideosRow {
        width: ${1024 + 64}px;
        margin-left: ${-64}px;
      }
        .RankingGenreListContainer-categoryHelp {
          position: static;
        }
        .RankingMatrixNicoadsRow>*+*,
        .RankingMatrixVideosRow>:nth-child(n+3) {
          margin-left: 13px;
        }
        .RankingBaseItem {
          width: 160px;
          height: 196px;
        }
          body.futatsumeScreenMode_sideView .RankingBaseItem .Card-link {
            grid-template-rows: 90px auto;
          }
          .VideoItem.RankingBaseItem .VideoThumbnail {
            border-radius: 3px 3px 0 0;
          }

          [data-nicoad-grade] .Thumbnail.VideoThumbnail .Thumbnail-image {
            margin: 3px;
            background-size: calc(100% + 6px);
          }
          [data-nicoad-grade] .Thumbnail.VideoThumbnail:after {
            width: 40px;
            height: 40px;
            background-size: 80px 80px;
          }
          .Thumbnail.VideoThumbnail .VideoLength {
            bottom: 3px;
            right: 3px;
          }
          .VideoThumbnailComment {
            transform: scale(0.8333);
          }
          .RankingBaseItem-meta {
            position: static;
            padding: 0 4px 8px;
          }
          .VideoItem.RankingBaseItem .VideoItem-metaCount>.VideoMetaCount {
            white-space: nowrap;
          }
      .RankingMainContainer .ToTopButton {
        transform: translateX(calc(100vw / 2 - 100% - 36px));
        user-select: none;
      }
    `,
      { className: 'screenMode for-sideView MatrixRanking', disabled: true }
    );
  }
});

css.addStyle(
  `
  .is-open .futatsumeWatchVideoInfoPanel {
    display: none;
    left: calc(100%);
    top: 0;
  }

  @media screen {
    @media (min-width: 992px) {
      .futatsumeScreenMode_normal .futatsumeWatchVideoInfoPanel {
        display: inherit;
      }
    }

    @media (min-width: 1216px) {
      .futatsumeScreenMode_big .futatsumeWatchVideoInfoPanel {
        display: inherit;
      }
    }

    /* 縦長モニター */
    @media
      (max-width: 991px) and (min-height: 700px)
    {
      .futatsumeScreenMode_normal .futatsumeWatchVideoInfoPanel {
        display: inherit;
        top: 100%;
        left: 0;
        width: 100%;
        height: ${CONSTANT.BOTTOM_PANEL_HEIGHT}px;
        z-index: 20000;
      }


      .futatsumeScreenMode_normal .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer {
        display: table;
      }
      .futatsumeScreenMode_normal .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer>* {
        display: table-cell;
        text-align: left;
      }
      .futatsumeScreenMode_normal .futatsumeWatchVideoHeaderPanel {
        width: 100% !important;
      }
    }

    @media
      (max-width: 1215px) and (min-height: 700px) {
      .futatsumeScreenMode_big .futatsumeWatchVideoInfoPanel {
        display: inherit;
        top: 100%;
        left: 0;
        width: 100%;
        height: ${CONSTANT.BOTTOM_PANEL_HEIGHT}px;
        z-index: 20000;
      }


      .futatsumeScreenMode_big .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer {
        display: table;
      }
      .futatsumeScreenMode_big .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer>* {
        display: table-cell;
        text-align: left;
      }

      .futatsumeScreenMode_big .futatsumeWatchVideoHeaderPanel {
        width: 100% !important;
      }
    }
  }

`,
  { className: 'screenMode for-dialog videoInfoPanel' }
);

css.addStyle(
  `
  .futatsumeWatchVideoInfoPanel .comment {
    padding-left: 0;
  }
`,
  { className: 'domain slack-com', disabled: true }
);

VideoInfoPanel.__tpl__ = `
    <div class="futatsumeWatchVideoInfoPanel show initializing">
      <div class="nowLoading">
        <div class="kurukuru"><span class="kurukuruInner">&#x262F;</span></div>
        <div class="loadingMessage">Loading...</div>
      </div>

      <div class="tabSelectContainer"><div class="tabSelect videoInfoTab activeTab" data-command="selectTab" data-param="videoInfoTab">動画情報</div><div class="tabSelect relatedVideoTab" data-command="selectTab" data-param="relatedVideoTab">関連動画</div></div>

      <div class="tabs videoInfoTab activeTab">
        <div class="futatsumeWatchVideoInfoPanelInner">
          <div class="futatsumeWatchVideoInfoPanelContent">
            <div class="videoOwnerInfoContainer">
              <a class="ownerPageLink" rel="noopener" target="_blank">
                <img class="ownerIcon loading"/>
              </a>
              <span class="owner">
                <span class="ownerName"></span>
                <futatsume-playlist-append class="playlistSetUploadedVideo userVideo"
                  data-command="ownerVideo"
                  title="投稿動画一覧をプレイリストで開く">▶</futatsume-playlist-append>
              </span>
            </div>
            <div class="publicStatus">
              <div class="videoMetaInfoContainer"></div>
              <div class="relatedInfoMenuContainer"></div>
            </div>
            <div class="seriesList"></div>
            <div class="videoDescription"></div>
          </div>
          <div class="futatsumeWatchVideoInfoPanelFoot">
            <div class="videoTagsContainer sideTab"></div>
          </div>
        </div>
      </div>

      <div class="tabs relatedVideoTab">
        <div class="relatedVideoContainer"></div>
      </div>

    </div>
  `.trim();

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

class VideoSearchForm extends Emitter {
  declare static __tpl__: string;
  declare static __css__: string;
  _config: { props: VideoSearchProps };
  _view!: Element;
  _form!: HTMLFormElement;
  _word!: HTMLInputElement;
  _sort!: HTMLSelectElement;
  _mode!: Element | string;
  constructor(...args: [VideoSearchFormInit]) {
    super();
    this._config = Config.namespace('videoSearch') as unknown as { props: VideoSearchProps };
    this._initDom(...args);
  }

  _initDom({ parentNode }: VideoSearchFormInit) {
    let tpl = document.getElementById('futatsumeVideoSearchPanelTemplate') as unknown as HTMLTemplateElement | null;
    if (!tpl) {
      (cssUtil.addStyle as (styles: string) => unknown)(VideoSearchForm.__css__);
      tpl = document.createElement('template');
      tpl.innerHTML = VideoSearchForm.__tpl__;
      tpl.id = 'futatsumeVideoSearchPanelTemplate';
    }
    const view = document.importNode(tpl.content, true);

    this._view = view.querySelector('*')!;
    this._form = view.querySelector('form')!;
    this._word = view.querySelector('.searchWordInput') as unknown as HTMLInputElement;
    this._sort = view.querySelector('.searchSortSelect') as unknown as HTMLSelectElement;
    this._mode = view.querySelector('.searchMode') || 'tag';

    this._form.addEventListener('submit', this._onSubmit.bind(this));

    const config = this._config;
    const form = this._form;

    config.props.ownerOnly = false;
    (form as unknown as VideoSearchFormControls).ownerOnly.checked = config.props.ownerOnly;
    const confMode = config.props.mode;
    if (typeof confMode === 'string' && ['tag', 'keyword'].includes(confMode)) {
      (form as unknown as VideoSearchFormControls).mode.value = confMode;
    } else if (typeof confMode === 'boolean') {
      (form as unknown as VideoSearchFormControls).mode.value = confMode ? 'tag' : 'keyword';
    } else {
      (form as unknown as VideoSearchFormControls).mode.value = 'tag';
    }
    (form as unknown as VideoSearchFormControls).word.value = config.props.word;
    (form as unknown as VideoSearchFormControls).sort.value = config.props.sort;

    this._view.addEventListener('click', (e) => this._onClick(e as MouseEvent));
    view.addEventListener('paste', (e) => e.stopPropagation());
    const submit = _.debounce(this.submit.bind(this), 500);
    Array.from(view.querySelectorAll('input, select')).forEach((item) => {
      if ((item as unknown as HTMLInputElement).type === 'checkbox') {
        item.addEventListener('change', () => {
          this._word.focus();
          config.props[(item as unknown as HTMLInputElement).name] = (item as unknown as HTMLInputElement).checked;
          submit();
        });
      } else if ((item as unknown as HTMLInputElement).type === 'radio') {
        item.addEventListener('change', () => {
          this._word.focus();
          config.props[(item as unknown as HTMLInputElement).name] = (this._form as unknown as VideoSearchFormControls)[
            (item as unknown as HTMLInputElement).name
          ]!.value;
          submit();
        });
      } else {
        item.addEventListener('change', () => {
          config.props[(item as unknown as HTMLInputElement).name] = (
            item as unknown as HTMLInputElement | HTMLSelectElement
          ).value;
          if (item.tagName === 'SELECT') {
            submit();
          }
        });
      }
    });

    global.emitter.on('searchVideo', (({ word }: { word: string }) => {
      (form as unknown as VideoSearchFormControls).word.value = word;
    }) as unknown as EmitterCallback);

    if (parentNode) {
      parentNode.appendChild(view);
    }

    global.debug.searchForm = this;
  }

  _onClick(e: MouseEvent) {
    e.stopPropagation();
    const tagName = ((e.target as unknown as Element).tagName || '').toLowerCase();
    const target = (e.target as unknown as HTMLElement).closest('.command') as unknown as HTMLElement | null;

    if (!['input', 'select'].includes(tagName)) {
      this._word.focus();
    }

    if (!target) {
      return;
    }

    const command = target.dataset.command;
    if (!command) {
      return;
    }
    e.preventDefault();
    const type = target.getAttribute('data-type') || 'string';
    let param = target.getAttribute('data-param');
    if (type !== 'string') {
      param = JSON.parse(param as string) as string;
    }

    switch (command) {
      case 'clear':
        this._word.value = '';
        break;
      default:
        domEvent.dispatchCommand(e.target as unknown as Element, command, param);
    }
  }

  _onSubmit(e: Event) {
    this.submit();
    e.stopPropagation();
  }

  submit() {
    const word = this.word;
    if (!word) {
      return;
    }

    domEvent.dispatchCommand(this._view, 'playlistSetSearchVideo', {
      word,
      option: {
        searchType: this.searchType,
        sort: this.sort,
        order: this.order,
        owner: this.isOwnerOnly,
        playlistSort: this.isPlaylistSort,
      },
    });
  }

  _hasFocus() {
    return !!document.activeElement!.closest('#futatsumeVideoSearchPanel');
  }

  _updateFocus() {}

  get word() {
    return (this._word.value || '').trim();
  }

  get searchType() {
    return (this._form as unknown as VideoSearchFormControls).mode.value;
  }

  get sort() {
    const sortTmp = (this._sort.value || '').split(',');
    const playlistSort = sortTmp[0] === 'playlist';
    return playlistSort ? 'f' : sortTmp[0];
  }

  get order() {
    const sortTmp = (this._sort.value || '').split(',');
    return sortTmp[1] || 'd';
  }

  get isPlaylistSort() {
    const sortTmp = (this._sort.value || '').split(',');
    return sortTmp[0] === 'playlist';
  }

  get isOwnerOnly() {
    return (this._form as unknown as VideoSearchFormControls).ownerOnly.checked;
  }
}

css.addStyle(
  `
  .is-open .futatsumeWatchVideoHeaderPanel .futatsumeVideoSearchPanel {
    top: 120px;
    right: 32px;
  }
`,
  { className: 'screenMode for-popup videoSearchPanel', disabled: true }
);

VideoSearchForm.__css__ = `
    .futatsumeVideoSearchPanel {
      pointer-events: auto;
      position: absolute;
      top: 32px;
      right: 8px;
      padding: 0 8px
      width: 248px;
      z-index: 1000;
    }

    .futatsumeScreenMode_normal .futatsumeWatchVideoHeaderPanel.is-onscreen .futatsumeVideoSearchPanel {
      top: 36px;
      right: -24px;
    }
    .futatsumeScreenMode_big    .futatsumeWatchVideoHeaderPanel.is-onscreen .futatsumeVideoSearchPanel,
    .futatsumeScreenMode_3D    .futatsumeVideoSearchPanel,
    .futatsumeScreenMode_wide  .futatsumeVideoSearchPanel,
    .futatsumeWatchVideoHeaderPanel.is-fullscreen .futatsumeVideoSearchPanel {
      top: 64px;
    }

    .futatsumeVideoSearchPanel:focus-within {
      background: rgba(50, 50, 50, 0.8);
    }

    .futatsumeVideoSearchPanel:not(:focus-within) .focusOnly {
      opacity: 0;
    }

    .futatsumeVideoSearchPanel .searchInputHead {
      position: absolute;
      opacity: 0;
      pointer-events: none;
      padding: 4px;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    .futatsumeVideoSearchPanel .searchInputHead:hover,
    .futatsumeVideoSearchPanel:focus-within .searchInputHead {
      background: rgba(50, 50, 50, 0.8);
    }

    .futatsumeVideoSearchPanel           .searchInputHead:hover,
    .futatsumeVideoSearchPanel:focus-within .searchInputHead {
      pointer-events: auto;
      opacity: 1;
      transform: translate3d(0, -100%, 0);
    }
      .futatsumeVideoSearchPanel .searchMode {
        position: absolute;
        opacity: 0;
      }

      .futatsumeVideoSearchPanel .searchModeLabel {
        cursor: pointer;
      }

     .futatsumeVideoSearchPanel .searchModeLabel span {
        display: inline-block;
        padding: 4px 8px;
        line-height: 1;
        color: #666;
        cursor: pointer;
        border-radius: 8px;
        border-color: transparent;
        border-style: solid;
        border-width: 1px;
        pointer-events: none;
      }
      .futatsumeVideoSearchPanel .searchModeLabel:hover span {
        background: #888;
      }
      .futatsumeVideoSearchPanel .searchModeLabel input:checked + span {
        color: #ccc;
        border-color: currentColor;
        cursor: default;
      }

    .futatsumeVideoSearchPanel .searchWord {
      white-space: nowrap;
      padding: 0 4px;
    }

      .futatsumeVideoSearchPanel .searchWordInput {
        width: 200px;
        margin: 0;
        height: 24px;
        line-height: 24px;
        background: transparent;
        font-size: 16px;
        padding: 0 4px;
        color: #ccc;
        border: 1px solid #ccc;
        opacity: 0;
        transition: opacity 0.2s ease;
        will-change: opacity;
      }

      .futatsumeVideoSearchPanel .searchWordInput:-webkit-autofill {
        background: transparent;
      }

      .is-mouseMoving .searchWordInput {
        opacity: 0.5;
      }

      .is-mouseMoving .searchWordInput:hover {
        opacity: 0.8;
      }

      .futatsumeVideoSearchPanel:focus-within .searchWordInput {
        opacity: 1 !important;
      }

      .futatsumeVideoSearchPanel .searchSubmit {
        width: 34px;
        margin: 0;
        padding: 0;
        font-size: 14px;
        line-height: 24px;
        height: 24px;
        border: solid 1px #ccc;
        cursor: pointer;
        background: #888;
        pointer-events: none;
        opacity: 0;
        transform: translate3d(-100%, 0, 0);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .futatsumeVideoSearchPanel:focus-within .searchSubmit {
        pointer-events: auto;
        opacity: 1;
        transform: translate3d(0, 0, 0);
      }

      .futatsumeVideoSearchPanel:focus-within .searchSubmit:hover {
        transform: scale(1.5);
      }

      .futatsumeVideoSearchPanel:focus-within .searchSubmit:active {
        transform: scale(1.2);
        border-style: inset;
      }

      .futatsumeVideoSearchPanel .searchClear {
        display: inline-block;
        width: 28px;
        margin: 0;
        padding: 0;
        font-size: 16px;
        line-height: 24px;
        height: 24px;
        border: none;
        cursor: pointer;
        color: #ccc;
        background: transparent;
        pointer-events: none;
        opacity: 0;
        transform: translate3d(100%, 0, 0);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .futatsumeVideoSearchPanel:focus-within .searchClear {
        pointer-events: auto;
        opacity: 1;
        transform: translate3d(0, 0, 0);
      }

      .futatsumeVideoSearchPanel:focus-within .searchClear:hover {
        transform: scale(1.5);
      }

      .futatsumeVideoSearchPanel:focus-within .searchClear:active {
        transform: scale(1.2);
      }


    .futatsumeVideoSearchPanel .searchInputFoot {
      white-space: nowrap;
      position: absolute;
      opacity: 0;
      padding: 4px;
      pointer-events: none;
      transition: transform 0.2s ease, opacity 0.2s ease;
      transform: translate3d(0, -100%, 0);
    }

    .futatsumeVideoSearchPanel .searchInputFoot:hover,
    .futatsumeVideoSearchPanel:focus-within .searchInputFoot {
      pointer-events: auto;
      opacity: 1;
      background: rgba(50, 50, 50, 0.8);
      transform: translate3d(0, 0, 0);
    }

      .futatsumeVideoSearchPanel .searchSortSelect,
      .futatsumeVideoSearchPanel .searchSortSelect option{
        background: #333;
        color: #ccc;
      }

      .futatsumeVideoSearchPanel .ownerOnlyLabel {
        cursor: pointer;
      }

      .futatsumeVideoSearchPanel .ownerOnlyLabel input + span {
        display: inline-block;
        pointer-events: none;
      }
      .futatsumeVideoSearchPanel .ownerOnlyLabel input[disabled] + span {
        filter: brightness(80%);
        text-decoration: line-through;
      }

  `.trim();

VideoSearchForm.__tpl__ = `
    <div class="futatsumeVideoSearchPanel" id="futatsumeVideoSearchPanel">
      <form action="javascript: void(0);">

        <div class="searchInputHead">
          <label class="searchModeLabel">
            <input type="radio" name="mode" class="searchMode" value="keyword">
            <span>キーワード</span>
          </label>

          <label class="searchModeLabel">
            <input type="radio" name="mode" class="searchMode" value="tag"
              id="futatsumeVideoSearch-tag" checked="checked">
              <span>タグ</span>
          </label>
        </div>

        <div class="searchWord">
          <button class="searchClear command"
            type="button"
            data-command="clear"
            title="クリア">&#x2716;</button>
          <input
            type="text"
            value=""
            autocomplete="on"
            name="word"
            accesskey="e"
            placeholder="簡易検索(テスト中)"
            class="searchWordInput"
            maxlength="75"
            >
          <input
            type="submit"
            value="▶"
            name="post"
            class="searchSubmit"
            >
        </div>

        <div class="searchInputFoot focusOnly">
          <select name="sort" class="searchSortSelect">
            <option value="playlist">自動(連続再生用)</option>
            <option value="f">新しい順</option>
            <option value="h">人気順</option>
            <option value="n">最新コメント</option>
            <option value="r">コメント数</option>
            <option value="m">マイリスト数</option>
            <option value="l">長い順</option>
            <option value="l,a">短い順</option>
          </select>
          <label class="ownerOnlyLabel">
            <input type="checkbox" name="ownerOnly" checked="checked" disabled>
            <span>投稿者の動画のみ</span>
          </label>
        </div>

      </form>
    </div>
  `.toString();

class RelatedInfoMenu extends BaseViewComponent {
  declare static _shadow_: string;
  declare static _css_: string;
  declare _elm: RelatedMenuElm;
  _ginzaLink!: HTMLAnchorElement;
  _originalLink!: HTMLAnchorElement;
  _twitterLink!: HTMLAnchorElement;
  _parentVideoLink!: HTMLAnchorElement;
  _currentWatchId!: string;
  _currentVideoId!: string;
  constructor({ parentNode, isHeader }: RelatedMenuParams) {
    super({
      parentNode,
      name: 'RelatedInfoMenu',
      template: '<div class="RelatedInfoMenu" tabindex="-1"></div>',
      shadow: RelatedInfoMenu._shadow_,
      css: RelatedInfoMenu._css_,
    });

    this._state = {};

    this._bound.update = this.update.bind(this) as unknown as (e: Event) => void;
    this._bound._onBodyClick = _.debounce(this._onBodyClick.bind(this), 0);
    this.setState({ isHeader });
  }

  _initDom(...args: [Record<string, unknown>]) {
    super._initDom(...args);

    ClassList(this._view as Element).toggle('is-Edge', /edge/i.test(navigator.userAgent));
    const shadow = (this._shadow || this._view) as unknown as HTMLDetailsElement;
    this._elm = {
      body: shadow.querySelector('.RelatedInfoMenuBody') as unknown as Element,
      summary: shadow.querySelector('summary') as unknown as Element,
    };
    shadow.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    this._elm.summary.addEventListener(
      'click',
      _.debounce(() => {
        if (shadow.open) {
          document.body.addEventListener('mouseup', this._bound._onBodyClick!, { once: true });
          this.emit('open');
        }
      }, 100)
    );

    this._ginzaLink = shadow.querySelector('.ginzaLink') as unknown as HTMLAnchorElement;
    this._originalLink = shadow.querySelector('.originalLink') as unknown as HTMLAnchorElement;
    this._twitterLink = shadow.querySelector('.twitterHashLink') as unknown as HTMLAnchorElement;
    this._parentVideoLink = shadow.querySelector('.parentVideoLink') as unknown as HTMLAnchorElement;
  }

  _onBodyClick() {
    const shadow = (this._shadow || this._view) as unknown as HTMLDetailsElement;
    shadow.open = false;
    document.body.removeEventListener('mouseup', this._bound._onBodyClick!);
    this.emit('close');
  }

  update(videoInfo: VideoInfoModel) {
    const shadow = (this._shadow || this._view) as unknown as HTMLDetailsElement;
    shadow.open = false;

    this._currentWatchId = videoInfo.watchId;
    this._currentVideoId = videoInfo.videoId;
    this.setState({
      isParentVideoExist: videoInfo.hasParentVideo,
      isCommunity: videoInfo.isCommunityVideo,
      isMymemory: videoInfo.isMymemory,
    });

    const vid = this._currentVideoId;
    const wid = this._currentWatchId;
    this._ginzaLink.setAttribute('href', `//www.nicovideo.jp/watch/${wid}`);
    this._originalLink.setAttribute('href', `//www.nicovideo.jp/watch/${vid}`);
    this._twitterLink.setAttribute('href', `https://twitter.com/hashtag/${vid}`);
    this._parentVideoLink.setAttribute('href', `//commons.nicovideo.jp/tree/${vid}`);
    this.emit('close');
  }

  _onCommand(command: string, param: unknown) {
    let url: string | undefined;
    const shadow = (this._shadow || this._view) as unknown as HTMLDetailsElement;
    shadow.open = false;

    switch (command) {
      case 'watch-ginza':
        window.open(this._ginzaLink.href, 'watchGinza');
        (super._onCommand as (command: string) => void)('pause');
        break;
      case 'open-uad':
        url = `//nicoad.nicovideo.jp/video/publish/${this._currentWatchId}?frontend_id=6&frontend_version=0&futatsume_watch`;
        window.open(url, '', 'width=428, height=600, toolbar=no, scrollbars=1');
        break;
      case 'open-twitter-hash':
        window.open(this._twitterLink.href);
        break;
      case 'open-parent-video':
        window.open(this._parentVideoLink.href);
        break;
      case 'copy-video-watch-url':
        super._onCommand(command, param);
        super._onCommand('notify', 'コピーしました');
        break;
      case 'open-original-video':
        super._onCommand('openNow', this._currentVideoId);
        break;
      default:
        super._onCommand(command, param);
    }
    this.emit('close');
  }
}

RelatedInfoMenu._css_ = ''.trim();

RelatedInfoMenu._shadow_ = `
    <style>
      .RelatedInfoMenu,
      .RelatedInfoMenu * {
        box-sizing: border-box;
        user-select: none;
      }

      .RelatedInfoMenu {
        display: inline-block;
        padding: 8px;
        font-size: 16px;
        cursor: pointer;
      }

      .RelatedInfoMenu summary {
        display: inline-block;
        background: transparent;
        color: #333;
        padding: 4px 8px;
        border-radius: 4px;
        outline: none;
        border: 1px solid #ccc;
      }

      .RelatedInfoMenu ul {
        list-style-type: none;
        padding-left: 32px;
      }

      .RelatedInfoMenu li {
        padding: 4px;
      }

      .RelatedInfoMenu li > .command {
        display: inline-block;
        text-decoration: none;
        color: #ccc;
      }

      .RelatedInfoMenu li > .command:hover {
        text-decoration: underline;
      }

      .RelatedInfoMenu li > .command:hover::before {
        content: '▷';
        position: absolute;
        transform: translate(-100%, 0);
      }


        .RelatedInfoMenu .originalLinkMenu,
        .RelatedInfoMenu .parentVideoMenu {
          display: none;
        }

        .RelatedInfoMenu.is-Community        .originalLinkMenu,
        .RelatedInfoMenu.is-Mymemory         .originalLinkMenu,
        .RelatedInfoMenu.is-ParentVideoExist .parentVideoMenu {
          display: block;
        }


      .futatsumeScreenMode_sideView .is-fullscreen .RelatedInfoMenu summary{
        background: #888;
      }

      :host-context(.futatsumeScreenMode_sideView .is-fullscreen) .RelatedInfoMenu summary {
        background: #888;
      }

      /* :host-contextで分けたいけどFirefox対応のため */
      .RelatedInfoMenu.is-Header {
        font-size: 13px;
        padding: 0 8px;
      }
      .RelatedInfoMenu.is-Header summary {
        background: #666;
        color: #ccc;
        padding: 0 8px;
        border: none;
      }
      .RelatedInfoMenu.is-Header[open] {
        background: rgba(80, 80, 80, 0.9);
      }
      .RelatedInfoMenu.is-Header ul {
        font-size: 16px;
        line-height: 20px;
      }

      :host-context(.futatsumeWatchVideoInfoPanel) .RelatedInfoMenu li > .command {
        color: #222;
      }

      .futatsumeWatchVideoInfoPanel .RelatedInfoMenu li > .command {
        color: #222;
      }

        /* for Edge */
        .is-Edge .RelatedInfoMenuBody {
          display: none;
          color: #ccc;
          background: rgba(80, 80, 80, 0.9);
        }
        .RelatedInfoMenu[open] .RelatedInfoMenuBody,
        .RelatedInfoMenu:focus .RelatedInfoMenuBody,
        .RelatedInfoMenuBody:hover {
          display: block;
        }
    </style>
    <details class="root RelatedInfoMenu">
      <summary class="RelatedInfoMenuSummary clickable">関連メニュー</summary>
      <div class="RelatedInfoMenuBody">
        <ul>
          <li class="ginzaMenu">
            <a class="ginzaLink command"
              rel="noopener" data-command="watch-ginza">公式プレイヤーで開く</a>
          </li>
          <li class="uadMenu">
            <span class="uadLink command"
              rel="noopener" data-command="open-uad">ニコニ広告で宣伝</span>
          </li>
          <li class="twitterHashMenu">
            <a class="twitterHashLink command"
              rel="noopener" data-command="open-twitter-hash">twitterの反応を見る</a>
          </li>
          <li class="originalLinkMenu">
            <a class="originalLink command"
              rel="noopener" data-command="open-original-video">元動画を開く</a>
          </li>
          <li class="parentVideoMenu">
            <a class="parentVideoLink command"
              rel="noopener" data-command="open-parent-video">親作品・コンテンツツリー</a>
          </li>
          <li class="copyVideoWatchUrlMenu">
            <span class="copyVideoWatchUrlLink command"
              rel="noopener" data-command="copy-video-watch-url">動画URLをコピー</span>
          </li>
        </ul>
      </div>
    </details>
  `.trim();

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

export { VideoInfoPanel, VideoHeaderPanel, VideoSearchForm, RelatedInfoMenu, VideoMetaInfo };
