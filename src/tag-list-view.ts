import { BaseViewComponent } from '../packages/futatsume/src/parts/base-view-component';
import { Config } from './config';
import { textUtil } from '../packages/lib/src/text/text-util';
import { getNicodicArticleExists } from '../packages/lib/src/nico/nico-dic-api';

export interface TagListTagData {
  name: string;
  isNicodicArticleExists?: boolean;
  isLocked?: boolean;
}

export interface TagListUpdateParams {
  tagList?: TagListTagData[];
}

interface TagListViewState {
  isEmpty?: boolean;
}

interface TagListElmTable {
  videoTagsInner: HTMLElement;
}

interface TagListBaseView {
  setState(state: Record<string, unknown>): void;
  emit(event: string, ...args: unknown[]): unknown;
  _initDom(...args: unknown[]): void;
  _onCommand(command: string, param: unknown): void;
  _onClick(e: unknown): void;
}

interface TagListBaseViewCtor {
  new (options: Record<string, unknown>): TagListBaseView;
}

interface TagTextUtil {
  escapeToZenkaku(text: string): string;
  unescapeHtml(text: string): string;
  escapeHtml(text: string): string;
}

//===BEGIN===

class TagListView extends (BaseViewComponent as unknown as TagListBaseViewCtor) {
  static __shadow__: string;
  static __css__: string;
  protected _state!: TagListViewState;
  protected _elm!: TagListElmTable;
  protected _shadow!: ShadowRoot | null;
  protected _view!: Element;
  private _generation = 0;
  private _tags: TagListTagData[] = [];
  constructor({ parentNode }: { parentNode: Element }) {
    super({
      parentNode,
      name: 'TagListView',
      template: '<div class="TagListView"></div>',
      shadow: TagListView.__shadow__,
      css: TagListView.__css__,
    });

    this._state = {};
  }

  _initDom(...args: unknown[]): void {
    super._initDom(...args);

    const v = this._shadow || this._view;
    Object.assign(this._elm, {
      videoTagsInner: v.querySelector('.videoTagsInner') as HTMLElement,
    });
    v.addEventListener('click', (e: Event) => e.stopPropagation());
  }

  _onCommand(command: string, param: unknown): void {
    switch (command) {
      case 'tag-search':
        this._onTagSearch(param as string);
        break;
      case 'none':
        break;
      default:
        super._onCommand(command, param);
        break;
    }
  }

  _onTagSearch(word: string): void {
    const config = Config.namespace('videoSearch');

    const option: {
      searchType: unknown;
      order: unknown;
      sort: unknown;
      owner: unknown;
      playlistSort?: boolean;
    } = {
      searchType: config.getValue('mode'),
      order: config.getValue('order'),
      sort: config.getValue('sort') || 'playlist',
      owner: config.getValue('ownerOnly'),
    };

    if (option.sort === 'playlist') {
      option.sort = 'f';
      option.playlistSort = true;
    }

    super._onCommand('playlistSetSearchVideo', { word, option });
  }

  update({ tagList = [] }: TagListUpdateParams): void {
    this._generation++;
    this._update(tagList);
  }

  _update(tagList: TagListTagData[] = []): void {
    this._tags = tagList.map((tag) => ({ ...tag, isNicodicArticleExists: undefined }));
    const tags: string[] = [];
    this._tags.forEach((tag) => {
      tags.push(this._createTag(tag));
    });
    this.setState({ isEmpty: tagList.length < 1 });
    this._elm.videoTagsInner.innerHTML = tags.join('');
    const generation = this._generation;
    for (const tag of this._tags) {
      void getNicodicArticleExists(tag.name).then((exists) => {
        if (generation !== this._generation) return;
        const current = this._tags.find((value) => value.name === tag.name);
        const item = Array.from(this._elm.videoTagsInner.querySelectorAll<HTMLElement>('.tagItem')).find(
          (node) => node.dataset.tagId === tag.name
        );
        if (!current || !item) return;
        current.isNicodicArticleExists = exists;
        const menu = item.querySelector('futatsume-tag-item-menu');
        if (menu) menu.outerHTML = this._createDicIcon(tag.name, exists);
      });
    }
  }

  _createDicIcon(text: string, hasDic?: boolean): string {
    const href = `https://dic.nicovideo.jp/a/${encodeURIComponent(text)}`;
    const src = hasDic
      ? 'https://live.nicovideo.jp/img/2012/watch/tag_icon002.png'
      : 'https://live.nicovideo.jp/img/2012/watch/tag_icon003.png';
    const icon = `<img class="dicIcon" src="${src}">`;

    const hasNicodic = hasDic === undefined ? 'unknown' : hasDic ? '1' : '0';
    const title = hasDic === undefined ? '大百科の有無は未取得' : hasDic ? '大百科あり' : '大百科なし';
    return `<futatsume-tag-item-menu
        class="tagItemMenu"
        data-text="${encodeURIComponent(text)}"
        data-has-nicodic="${hasNicodic}"
        title="${title}"
      ><a target="_blank" class="nicodic" href="${href}">${icon}</a></futatsume-tag-item-menu>`;
  }

  _createLink(text: string): string {
    const href = `//www.nicovideo.jp/tag/${encodeURIComponent(text)}`;
    // タグはエスケープされた物が来るのでそのままでつっこんでいいはずだが、
    // 古いのはけっこういい加減なデータもあったりして信頼できない
    text = (textUtil as unknown as TagTextUtil).escapeToZenkaku(
      (textUtil as unknown as TagTextUtil).unescapeHtml(text)
    );
    return `<a class="tagLink" href="${href}">${text}</a>`;
  }

  _createSearch(text: string): string {
    const title = 'プレイリストに追加';
    const command = 'tag-search';
    const param = (textUtil as unknown as TagTextUtil).escapeHtml(text);
    return `<futatsume-playlist-append class="playlistAppend" title="${title}" data-command="${command}" data-param="${param}">▶</futatsume-playlist-append>`;
  }

  _createTag(tag: TagListTagData): string {
    const tagName = tag.name;
    const dic = this._createDicIcon(tagName, tag.isNicodicArticleExists);
    const escapedName = textUtil.escapeHtml(tagName);
    const link = this._createLink(tagName);
    const search = this._createSearch(tagName);
    const data = (textUtil as unknown as TagTextUtil).escapeHtml(JSON.stringify(tag));
    const className = tag.isLocked ? 'tagItem is-Locked' : 'tagItem';

    return `<li class="${className}" data-tag="${data}" data-tag-id="${escapedName}">${dic}${link}${search}</li>`;
  }
}

TagListView.__shadow__ = `
    <style>
      :host-context(.videoTagsContainer.sideTab) .tagLink {
        color: #fff !important;
        text-decoration: none;
      }

      .TagListView {
        position: relative;
        user-select: none;
      }

      .videoTags {
        display: inline-block;
        padding: 0;
      }

      .videoTagsInner {
        display: flex;
        flex-wrap: wrap;
        padding: 0 8px;
      }

      .TagListView .tagItem {
        position: relative;
        list-style-type: none;
        display: inline-flex;
        margin-right: 2px;
        line-height: 20px;
        max-width: 50vw;
        align-items: center;
      }

      .tagLink {
        color: #fff;
        text-decoration: none;
        user-select: none;
        display: inline-block;
        border: 1px solid rgba(0, 0, 0, 0);
      }

      .TagListView .nicodic {
        display: inline-block;
        margin-right: 4px;
        line-height: 20px;
        cursor: pointer;
        vertical-align: middle;
      }

      .tagItem .playlistAppend {
        display: inline-block;
        position: relative;
        left: auto;
        bottom: auto;
      }

      .TagListView .tagItem .playlistAppend {
        display: inline-block;
        font-size: 16px;
        line-height: 24px;
        width: 24px;
        height: 24px;
        bottom: 4px;
        background: #666;
        color: #ccc;
        text-decoration: none;
        border: 1px outset;
        cursor: pointer;
        text-align: center;
        user-select: none;
        visibility: hidden;
        margin-right: -2px;
      }

      .tagItem:hover .playlistAppend {
        visibility: visible;
      }

      .tagItem:hover .playlistAppend:hover {
        transform: scale(1.5);
      }

      .tagItem:hover .playlistAppend:active {
        transform: scale(1.4);
      }

    </style>
    <div class="root TagListView">
      <div class="videoTags">
        <span class="videoTagsInner"></span>
      </div>
    </div>
  `.trim();

TagListView.__css__ = `

    /* Firefox用 ShaowDOMサポートしたら不要 */
    .videoTagsContainer.sideTab a {
      color: #fff !important;
      text-decoration: none !important;
    }
    .videoTagsContainer.videoHeader a {
      color: #fff !important;
      text-decoration: none !important;
    }
  `.trim();

class TagItemMenu extends HTMLElement {
  private hasNicodic!: boolean;
  private text!: string;
  private _shadow!: ShadowRoot;
  static template({ text }: { text: string }): string {
    const host = location.host;
    return `
      <style>
        .root {
          display: inline-block;
          --icon-size: 16px;
          margin-right: 4px;
          outline: none;
        }

        .icon {
          position: relative;
          display: inline-block;
          vertical-align: middle;
          box-sizing: border-box;
          width: var(--icon-size);
          height: var(--icon-size);
          margin: 0;
          padding: 0;
          font-size: var(--icon-size);
          line-height: calc(var(--icon-size));
          text-align: center;
          cursor: pointer;
        }

        .nicodic, .toggle {
          background: #888;
          color: #ccc;
          box-shadow: 0.1em 0.1em 0 #333;
        }
        .has-nicodic .nicodic,.has-nicodic .toggle {
          background: #900;
        }
        .toggle::after {
          content: '？';
          position: absolute;
          width: var(--icon-size);
          left: 0;
          font-size: 0.8em;
          font-weight: bolder;
        }
        .has-nicodic .toggle::after {
          content: '百';
        }

        .menu {
          display: none;
          position: fixed;
          background-clip: content-box;
          border-style: solid;
          border-width: 16px 0 16px 0;
          border-color: transparent;
          padding: 0;
          z-index: 100;
          transform: translateY(-30px);
        }

        :host-context(.futatsumeWatchVideoInfoPanelFoot) .menu {
          position: absolute;
          bottom: 0;
          transform: translateY(8x);
        }

        .root .menu:hover,
        .root:focus-within .menu {
          display: inline-block;
        }

        li {
          list-style-type: none;
          padding: 2px 8px 2px 20px;
          background: rgba(80, 80, 80, 0.95);
        }

        li a {
          display: inline-block;
          white-space: nowrap;
          text-decoration: none;
          color: #ccc;
        }

        li a:hover {
          text-decoration: underline;
        }

      </style>
      <div class="root" tabindex="-1">
        <div class="icon toggle"></div>
        <ul class="menu">

          <li>
            <a href="//dic.nicovideo.jp/a/${text}"
              ${host !== 'dic.nicovideo.jp' ? 'target="_blank"' : ''}>
              大百科を見る
            </a>
          </li>
          <li>
            <a href="//ch.nicovideo.jp/search/${text}?type=video&mode=t"
              ${host !== 'ch.nicovideo.jp' ? 'target="_blank"' : ''}>
              チャンネル検索
            </a>
          </li>
          <li>
            <a href="https://www.google.co.jp/search?q=${text}%20site:www.nicovideo.jp&num=100&tbm=vid"
              ${host !== 'www.google.co.jp' ? 'target="_blank"' : ''}>
              Googleで検索
            </a>
          </li>
          <li>
            <a href="https://www.bing.com/videos/search?q=${text}%20site:www.nicovideo.jp&qft=+filterui:msite-nicovideo.jp"
              ${host !== 'www.bing.com' ? 'target="_blank"' : ''}>Bingで検索
            </a>
          </li>
          <li>
            <a href="https://www.google.co.jp/search?q=${text}%20site:www.nicovideo.jp/series&num=100"
              ${host !== 'www.google.co.jp' ? 'target="_blank"' : ''}>
              シリーズ検索
            </a>
          </li>
        </ul>
      </div>
    `;
  }
  constructor() {
    super();
    this.hasNicodic = this.dataset.hasNicodic === '1';
    this.text = (textUtil as unknown as TagTextUtil).escapeToZenkaku(this.dataset.text as string);
    const shadow = (this._shadow = this.attachShadow({ mode: 'open' }));
    shadow.innerHTML = (
      this.constructor as unknown as {
        template(args: { text: string }): string;
      }
    ).template({ text: this.text });
    shadow.querySelector('.root')!.classList.toggle('has-nicodic', this.hasNicodic);
  }
}
if (window.customElements) {
  window.customElements.define('futatsume-tag-item-menu', TagItemMenu);
}

//===END===

export { TagListView };
