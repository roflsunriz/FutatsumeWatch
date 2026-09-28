import _ from 'lodash';
import { Config } from '../config/index';
import { global } from '../app/futatsume-watch-index';
import { css, cssUtil } from '../../packages/lib/src/css/css';
import { domEvent } from '../../packages/lib/src/dom/dom-event';
import { Emitter } from '../../packages/lib/src/emitter';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import type { VideoSearchFormInit, VideoSearchProps, VideoSearchFormControls } from './types';
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

export { VideoSearchForm };
