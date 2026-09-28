import _ from 'lodash';
import { BaseViewComponent } from '../../packages/futatsume/src/parts/base-view-component';
import { ClassList } from '../../packages/lib/src/dom/class-list-wrapper';
import type { RelatedMenuElm, RelatedMenuParams, VideoInfoModel } from './types';
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

export { RelatedInfoMenu };
