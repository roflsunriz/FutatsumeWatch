import jquery from 'jquery';

import * as lit from 'lit/html.js';
import { bounce } from '../packages/lib/src/infra/bounce';
import { cssUtil } from '../packages/lib/src/css/css';
import { PromiseHandler } from '../packages/lib/src/Emitter';

interface My4Lit {
  html: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
  render(template: unknown, container: Element): void;
}

interface My4JQueryResult {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

interface My4JQuery {
  (ready: () => void): unknown;
  (selector: string): My4JQueryResult;
}

interface My4FilterProps {
  playable?: string;
  word?: string;
}

interface My4ItemFilter {
  word: string;
}

interface My4Item {
  item_data: { title?: string; description?: string };
  description?: string;
}

((window: Window) => {
  const global = {
    PRODUCT: 'MylistFilter',
  };
  const { html } = lit;
  const $ = jquery;

  (cssUtil as unknown as { addStyle(cssText: string): void }).addStyle(`
    .ItemSelectMenuContainer-itemSelect {
      display: grid;
      grid-template-columns: 160px 1fr
    }

    .itemFilterContainer {
      display: grid;
      background: #f0f0f0;
      grid-template-rows: 1fr 1fr;
      grid-template-columns: auto 1fr;
      user-select: none;
    }

    .itemFilterContainer-title {
      grid-row: 1 / 3;
      grid-column: 1 / 2;
      display: flex;
      align-items: center;
      white-space: nowrap;
      padding: 8px;
    }

    .playableFilter {
      grid-row: 1;
      grid-column: 2;
      padding: 4px 8px;
    }

    .wordFilter {
      grid-row: 2;
      grid-column: 2;
      padding: 0 8px 4px;
    }

    .playableFilter, .wordFilter {
      display: inline-flex;
      align-items: center;
    }

    .playableFilter .caption, .wordFilter .caption {
      display: inline-block;
      margin-right: 8px;
    }

    .playableFilter input[type="radio"] {
      transform: scale(1.2);
      margin-right: 8px;
    }

    .playableFilter label {
      display: inline-flex;
      align-items: center;
      padding: 0 8px;
    }

    .playableFilter input[checked] + span {
      background: linear-gradient(transparent 80%, #99ccff 0%);
    }

    .wordFilter input[type="text"] {
      padding: 4px;
    }
    .wordFilter input[type="button"] {
      padding: 4px;
      border: 1px solid #ccc;
    }
  `);

  const playableFilterTpl = (props: My4FilterProps): lit.TemplateResult => {
    const playable = props.playable || '';
    return html` <div class="playableFilter">
      <span class="caption">状態</span>
      <label data-click-command="set-playable-filter" data-command-param="">
        <input
          type="radio"
          name="playable-filter"
          value=""
          ?checked=${playable !== 'playable' && playable !== 'not-playable'}
        />
        <span>指定なし</span>
      </label>
      <label data-click-command="set-playable-filter" data-command-param="playable">
        <input type="radio" name="playable-filter" value="playable" ?checked=${playable === 'playable'} />
        <span>視聴可能</span>
      </label>
      <label data-click-command="set-playable-filter" data-command-param="not-playable">
        <input type="radio" name="playable-filter" value="not-playable" ?checked=${playable === 'not-playable'} />
        <span>視聴不可</span>
      </label>
    </div>`;
  };

  const wordFilterTpl = (props: My4FilterProps): lit.TemplateResult => {
    return html` <div class="wordFilter">
      <input
        type="text"
        name="word-filter"
        class="wordFilterInput"
        placeholder="キーワード"
        value=${props.word || ''}
      />
      <input type="button" data-click-command="clear-word-filter" title="・✗・" value=" ✗ " />
      <small>\\u3000タイトル・マイリストコメント検索</small>
    </div>`;
  };

  const resetForm = (): void => {
    [...document.querySelectorAll<HTMLInputElement>('.itemFilterContainer input[name="playable-filter"]')].forEach(
      (r) => (r.checked = r.hasAttribute('checked'))
    );
    [...document.querySelectorAll<HTMLInputElement>('.wordFilterInput')].forEach(
      (r) => (r.value = r.getAttribute('value') as string)
    );
  };

  const itemFilterContainer = Object.assign(document.createElement('div'), {
    className: 'itemFilterContainer',
  });

  const render = (props: My4FilterProps): void => {
    if (!document.body.contains(itemFilterContainer)) {
      const parentNode = document.querySelector('.ItemSelectMenuContainer-itemSelect');
      if (parentNode) {
        parentNode.append(itemFilterContainer);
      }
    }

    lit.render(
      html`
        <div class="itemFilterContainer-title">絞り込み</div>
        ${playableFilterTpl(props)} ${wordFilterTpl(props)}
      `,
      itemFilterContainer
    );

    resetForm();
  };

  let override = false;
  const overrideFilter = (): void => {
    if (!(window as unknown as { MylistHelper?: { itemFilter: My4ItemFilter } }).MylistHelper || override) {
      return;
    }
    override = true;
    const self = (window as unknown as { MylistHelper?: { itemFilter: My4ItemFilter } }).MylistHelper!.itemFilter;
    Object.defineProperty(self, 'wordFilterCallback', {
      get: () => {
        const word = self.word.trim();

        return word
          ? (item: My4Item) => {
              return (
                (item.item_data.title || '').toLowerCase().indexOf(word) >= 0 ||
                (item.item_data.description || '').toLowerCase().indexOf(word) >= 0 ||
                (item.description || '').toLowerCase().indexOf(word) >= 0
              );
            }
          : () => true;
      },
    });
  };

  const parseProps = (): My4FilterProps => {
    if (!location.hash || (location as unknown as { length: number }).length <= 2) {
      return {};
    }
    return location.hash
      .substring(1)
      .split('+')
      .reduce<Record<string, string>>((map, entry) => {
        const [key, val] = entry.split('=').map((e) => decodeURIComponent(e));
        map[key as string] = val as string;
        return map;
      }, {});
  };

  const update = (): void => {
    overrideFilter();
    const props = parseProps();
    // console.log('update form', props);
    render(props);
  };

  const init = (): void => {
    const _update = (
      bounce as unknown as {
        time(fn: () => void, ms: number): () => void;
      }
    ).time(update, 100);
    _update();
    $('.content').on('nicoPageChanged', _update);
  };

  $(() => init());
})(globalThis ? (globalThis as unknown as { window: Window }).window : window);
