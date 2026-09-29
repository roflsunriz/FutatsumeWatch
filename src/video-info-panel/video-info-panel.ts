import { global } from '../app/futatsume-watch-index';
import { Config } from '../config/index';
import { RelatedVideoList } from '../../packages/futatsume/src/Playlist/related-video-list';
import { TagListView } from '../tags/tag-list-view';
import { Emitter } from '../../packages/lib/src/emitter';
import { sleep } from '../../packages/lib/src/infra/sleep';
import { Fullscreen } from '../../packages/lib/src/dom/fullscreen';
import { nicoUtil } from '../../packages/lib/src/nico/nico-util';
import { cssUtil } from '../../packages/lib/src/css/css';
import { uq } from '../../packages/lib/src/u-query';
import { domEvent } from '../../packages/lib/src/dom/dom-event';
import { ClassList } from '../../packages/lib/src/dom/class-list-wrapper';
import { MylistPocketDetector } from '../../packages/futatsume/src/init/mylist-pocket-detector';
import { PlaylistApiLoader } from '../shared/external-api';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import type { ConfigProps } from '../config/index';
import type {
  VideoCountInfo,
  VideoInfoModel,
  VideoSeriesInfo,
  VideoInfoPanelParams,
  PocketApi,
  RecommendVideoInfoLike,
  UqAppendContent,
  UqResult,
  UqStatic,
} from './types';
import { RelatedInfoMenu } from './related-info-menu';
import { VideoMetaInfo } from './video-meta-info';
import { VideoHeaderPanel } from './video-header-panel';
import { toSeriesVideoCardData } from './series-video-card';
import './styles';
const VideoItemObserver: { observe(params: { container: Element | null }): void } = {
  observe: () => {},
};
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
  _seriesVideoList!: Element;
  _tagListView!: TagListView;
  _relatedInfoMenu!: RelatedInfoMenu;
  _videoMetaInfo!: VideoMetaInfo;
  _videoInfo!: VideoInfoModel;
  _relatedVideoList?: RelatedVideoList;
  _pocket!: PocketApi;
  _activeTabName?: string;
  _isInitialized?: boolean;
  private playbackGeneration = 0;
  private seriesVideoGeneration = 0;
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
    this._seriesVideoList = view.querySelector('.seriesVideos')!;

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
    void this._updateSeriesVideos(videoInfo.series);
    void this._updateVideoDescription(videoInfo.description);

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
  async _updateVideoDescription(html: string) {
    this._description.textContent = '';
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
  async _updateSeriesVideos(series: VideoSeriesInfo | null): Promise<void> {
    const generation = ++this.seriesVideoGeneration;
    const summaries = [
      series?.video.prev ? { ...series.video.prev, relation: '前の動画' } : null,
      series?.video.next ? { ...series.video.next, relation: '次の動画' } : null,
    ].filter((video): video is { id: string; title?: string; relation: string } => video !== null);
    this._seriesVideoList.textContent = '';
    if (!series || summaries.length === 0) return;
    const status = document.createElement('p');
    status.className = 'seriesVideoStatus';
    status.setAttribute('aria-live', 'polite');
    this._seriesVideoList.append(status);

    const cards = summaries.map((summary) => {
      const thumbnail = nicoUtil.getThumbnailUrlByVideoId(summary.id) || '';
      const cardData = toSeriesVideoCardData(null, {
        id: summary.id,
        title: summary.title || summary.id,
        thumbnail,
      });
      const section = document.createElement('section');
      section.className = 'seriesVideo';
      const heading = document.createElement('div');
      heading.className = 'seriesVideoHeading';
      heading.textContent = summary.relation;
      const item = document.createElement('futatsume-video-item');
      Object.assign(item.dataset, {
        watchId: cardData.id,
        videoId: cardData.id,
        title: cardData.title,
        duration: String(cardData.duration),
        commentCount: String(cardData.commentCount),
        mylistCount: String(cardData.mylistCount),
        viewCount: String(cardData.viewCount),
        likeCount: String(cardData.likeCount),
        thumbnail: cardData.thumbnail,
        postedAt: cardData.postedAt,
        showActions: 'false',
        showMetadataIcons: 'true',
      });
      section.append(heading, item);
      this._seriesVideoList.append(section);
      return { id: summary.id, fallback: { id: summary.id, title: cardData.title, thumbnail }, item };
    });

    try {
      const items = (await PlaylistApiLoader.load({ type: 'series', id: series.id })) as unknown[];
      if (generation !== this.seriesVideoGeneration) return;
      let matched = 0;
      for (const card of cards) {
        const entry = items.find((candidate) => {
          if (typeof candidate !== 'object' || candidate === null) return false;
          const record = candidate as Record<string, unknown>;
          const content =
            typeof record.content === 'object' && record.content !== null
              ? (record.content as Record<string, unknown>)
              : {};
          return record.watchId === card.id || content.id === card.id;
        });
        if (!entry) continue;
        Object.assign(card.item.dataset, toSeriesVideoCardData(entry, card.fallback));
        matched++;
      }
      if (matched !== cards.length) {
        status.textContent = 'シリーズ内の動画情報が一部見つかりません。IDとタイトルを表示しています。';
      }
    } catch (error) {
      if (generation !== this.seriesVideoGeneration) return;
      status.textContent = 'シリーズの動画情報を取得できませんでした。IDとタイトルを表示しています。';
      window.console.warn('シリーズ前後動画の詳細取得に失敗しました。', error);
    }
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
    this.seriesVideoGeneration++;
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

VideoInfoPanel.__tpl__ = `
    <div class="futatsumeWatchVideoInfoPanel show initializing">
      <div class="nowLoading">
        <div class="loadingIndicator" role="status" aria-live="polite">
          <div class="loadingMessage">Loading...</div>
          <div class="loadingProgress" role="progressbar" aria-label="サイドバーを読み込み中" aria-valuetext="読み込み中">
            <span></span>
          </div>
        </div>
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
            <div class="seriesVideos"></div>
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
export { VideoInfoPanel };
