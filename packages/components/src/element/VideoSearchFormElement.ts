import { BaseCommandElement } from './BaseCommandElement.js';
import { util } from '../util/util.js';
import { VideoItemElement, VideoItemProps } from './VideoItemElement';
import { NicoQuery } from '../../../lib/src/nico/NicoQuery';

import type { TemplateResult } from 'lit/html.js';
import type { ElementEvents, PropsMap, StateMap } from './BaseCommandElement.js';

interface ParsedNicoQuery {
  type: string;
  id: string;
  params: Record<string, string>;
}

interface SearchFormControls extends HTMLFormElement {
  word: HTMLInputElement;
}

//===BEGIN===
const { VideoSearchFormElement } = (() => {
  const VideoSearchFormProps = {
    query: '',
    word: '',
    type: 'tag',
    sort: '-f',
    dateFrom: '',
    dateTo: '',
    commentCount: 0,
    f_range: '',
    l_range: '',
    channelId: 0,
    userId: 0,
    ownerFilter: false,
  };
  const VideoSearchFormAttributes = Object.keys(VideoSearchFormProps).map((prop) =>
    BaseCommandElement.toAttributeName(prop)
  );

  class VideoSearchFormElement extends BaseCommandElement {
    static get propTypes(): PropsMap {
      return VideoSearchFormProps;
    }

    static get defaultProps(): PropsMap {
      return VideoSearchFormProps;
    }

    static get observedAttributes(): string[] {
      return VideoSearchFormAttributes;
    }

    static get defaultState(): StateMap {
      return {};
    }

    static async getTemplate(
      state: StateMap = {},
      props: PropsMap = {},
      events: ElementEvents = {}
    ): Promise<TemplateResult> {
      const { html } = await this.importLit();
      return html`
        <div class="root" id="root" @click=${events.onClick} @paste=${events.onPaste}>
          <style>
            * {
              outline: none;
              box-sizing: border-box;
            }

            .root {
              display: inline-block;
              width: 100%;
              pointer-events: auto;
              user-select: none;

              background-color: var(--list-bg-color, #666);
              color: var(--list-text-color, #ccc);
            }

            form {
              margin: 0;
            }

            .searchInputHead {
              padding: 4px;
            }
            .searchMode {
              position: absolute;
              opacity: 0;
            }

            .searchModeLabel {
              cursor: pointer;
            }

            .searchModeLabel span {
              display: inline-block;
              padding: 4px 8px;
              cursor: pointer;
              border-radius: 8px;
              border-color: transparent;
              border-style: solid;
              border-width: 1px;
              pointer-events: none;
            }
            .searchModeLabel:hover span {
              background: #888;
            }
            .searchModeLabel input:checked + span {
              border-color: currentColor;
              cursor: default;
            }

            .searchWord {
              display: flex;
              padding: 4px;
              white-space: nowrap;
            }

            .searchWordInput {
              flex: 1;
              margin: 0;
              height: 32px;
              line-height: 32px;
              font-size: 20px;
              padding: 0 4px;
              color: var(--list-text-color, #ccc);
              background-color: var(--list-bg-color, #666);
              border: 1px solid;
              user-select: auto;
            }

            .searchWordInput:-webkit-autofill {
              background: transparent;
            }

            .searchSubmit {
              width: 48px;
              margin: 0;
              padding: 0;
              font-size: 24px;
              line-height: 32px;
              height: 32px;
              color: var(--list-text-color, #ccc);
              background-color: var(--list-bg-color, #666);
              border: solid 1px;
              cursor: pointer;
            }

            .searchSubmit:hover {
            }

            .searchSubmit:active {
              border-style: inset;
            }

            .searchClear {
              display: none;
              width: 48px;
              margin: 0;
              padding: 0;
              font-size: 26px;
              line-height: 32px;
              height: 32px;
              border: none;
              cursor: pointer;
              color: var(--list-text-color, #ccc);
              background-color: var(--list-bg-color, #666);
            }

            .searchInputFoot {
              white-space: nowrap;
              padding: 4px;
              /*display: flex;
              justify-content: space-between;*/
            }

            .searchSortSelect,
            .searchSortSelect option {
              color: var(--list-text-color, #ccc);
              background-color: var(--list-bg-color, #666);
              font-size: 16px;
              height: 32px;
            }

            .ownerFilterTabs {
              background: #444;
              padding: 0;
            }
            .ownerFilterTabs input[type='radio'] {
              outline: none;
              position: absolute;
              left: -9999px;
            }

            .ownerFilterTab {
              height: 32px;
              line-height: 32px;
              cursor: pointer;
              padding: 0 16px;
              color: #888;
              display: inline-block;
              border-style: solid;
              border-color: #666;
              border-width: 1px 1px 0 1px;
            }

            .ownerFilterTabs input:checked + .ownerFilterTab {
              /*font-weight: bold;*/
              color: #ccc;
              background: #666;
              border-color: currentColor;
              border-style: outset;
            }
          </style>
          <form action="javascript: void(0);" @submit=${events.onSubmit} @change=${events.onChange}>
            <div class="searchInputHead">
              <label class="searchModeLabel">
                <input type="radio" name="type" class="searchMode" value="search" ?checked=${state.type !== 'tag'} />
                <span>キーワード</span>
              </label>

              <label class="searchModeLabel">
                <input type="radio" name="type" class="searchMode" value="tag" ?checked=${state.type === 'tag'} />
                <span>タグ</span>
              </label>
            </div>

            <div class="searchWord">
              <button class="searchClear" type="button" data-command="clear" title="クリア">&#x2716;</button>
              <input
                type="text"
                value=${state.word}
                autocomplete="on"
                name="word"
                accesskey="e"
                placeholder="検索"
                class="searchWordInput"
                maxlength="75"
              />
              <input type="submit" value="&#128269;" name="post" class="searchSubmit" />
            </div>

            <div class="searchInputFoot">
              <div>
                <select name="sort" class="searchSortSelect">
                  <option value="-f" ?selected=${state.sort === '-f'}>投稿の新しい順</option>
                  <option value="-h" ?selected=${state.sort === '-h'}>人気順</option>
                  <option value="-n" ?selected=${state.sort === '-n'}>最新コメント</option>
                  <option value="-r" ?selected=${state.sort === '-r'}>コメント数</option>
                  <option value="-m" ?selected=${state.sort === '-m'}>マイリスト数</option>
                  <option value="-l" ?selected=${state.sort === '-l'}>長い順</option>
                  <option value="+l" ?selected=${state.sort === '+l'}>短い順</option>
                </select>
              </div>
              <div class="ownerFilterTabs">
                <input
                  id="ownerFilterDisable"
                  type="radio"
                  name="ownerFilter"
                  value="all"
                  ?checked=${!state.ownerFilter}
                />
                <label class="ownerFilterTab" for="ownerFilterDisable"> 全動画から </label>
                <input
                  id="ownerFilterEnable"
                  type="radio"
                  name="ownerFilter"
                  value="owner"
                  ?checked=${state.ownerFilter}
                />
                <label class="ownerFilterTab" for="ownerFilterEnable"> 投稿者の動画から </label>
              </div>
            </div>
          </form>
        </div>
      `;
    }

    get query(): NicoQuery {
      const params = Object.assign({}, this.state);
      delete params.word;
      // self.console.log('self.query', JSON.stringify({type: this.state.type, id: this.word, params}));
      return new util.NicoQuery({ type: this.state.type as string, id: this.word, params });
    }

    get title(): string {
      return `${this.state.type === 'tag' ? 'タグ検索' : 'キーワード検索'}: 「${this.word}」`;
    }

    get word(): string {
      return this._form ? this._form.word.value : (this.state.word as string);
    }

    private _form: SearchFormControls | null = null;
    private _submit: HTMLElement | null = null;

    constructor() {
      super();
      this.events = {
        onSubmit: this._onSubmit.bind(this),
        onChange: this._onChange.bind(this),
        onPaste: (e: Event): void => {
          console.log('paste!', e);
          e.stopPropagation();
        },
      };
      Object.assign(this.state, this.props);
    }

    async connectedCallback(): Promise<void> {
      await super.connectedCallback();
      if (this._root) {
        this._form = this._root.querySelector('form') as SearchFormControls | null;
        this._submit = this._root.querySelector('.searchSubmit') as unknown as HTMLElement | null;
      }
      // self.console.log('connectedCallback', this.query);
    }

    attributeChangedCallback(attr: string, oldValue: string | null, newValue: string | null): void {
      if (oldValue === newValue) {
        return;
      }
      attr = attr.startsWith('data-') ? (this.constructor as typeof VideoSearchFormElement).toPropName(attr) : attr;
      switch (attr) {
        case 'query':
          this._applyQuery(newValue as string);
          break;
        case 'word':
        case 'type':
        case 'sort':
        case 'userId':
        case 'channelId':
        case 'dateFrom':
        case 'dateTo':
        case 'commentCount':
        case 'f_range':
        case 'l_range':
        case 'ownerFilter':
          if (typeof this.props[attr] !== 'string') {
            const parsed: unknown = JSON.parse(newValue ?? 'null');
            newValue = parsed as string;
          }
          this.setState(attr, newValue);
      }
    }

    _applyQuery(query: string): void {
      const { type, id, params } = NicoQuery.parse(query) as ParsedNicoQuery;
      Object.assign(this.dataset, {
        type,
        word: id,
      });
      Object.keys(params).forEach((key) => {
        if (this.dataset[key] !== params[key]) {
          this.dataset[key] = params[key];
        }
      });
    }

    _onChange(e: Event): void {
      const target = e.target as HTMLInputElement;
      switch (target.name) {
        case 'ownerFilter':
          this.state.ownerFilter = target.value === 'owner';
          // this._form.word.focus();
          (this._submit as HTMLElement).click();
          break;
        default:
          this.state[target.name] = target.value;
          (this._form as SearchFormControls).word.focus();
      }
      e.stopPropagation();
    }

    _onSubmit(e: Event): void {
      e.preventDefault();
      e.stopPropagation();
      const word = this.word.trim();
      if (!word) {
        return;
      }
      this.dispatchCommand('fetch-by-query', { query: this.query });
    }
  }

  return { VideoSearchFormElement };
})();
//===END===

export { VideoSearchFormElement };
