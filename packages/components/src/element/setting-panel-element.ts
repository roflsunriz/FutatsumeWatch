import { DialogElement } from './dialog-element.js';
import { domEvent } from '../../../lib/src/dom/dom-event';
import { normalizeNgRegexpInputLines } from '../../../../src/ng-regexp-input';
// import {textUtil} from '../../../lib/src/text/text-util';
// import {cssUtil} from '../../../lib/src/css/css';
import type { TemplateResult } from 'lit/html.js';
import type { ElementEvents } from './base-command-element.js';
import type { HtmlTag } from './dialog-element.js';

interface SettingTouchConf {
  enable: unknown;
}

interface SettingCommentLayerConf {
  ownerCommentShadowColor: unknown;
  easyCommentOpacity: unknown;
  aiCommentOpacity: unknown;
  textShadowType: unknown;
}

interface SettingFilterConf {
  fork0: unknown;
  fork1: unknown;
  fork2: unknown;
  fork3: unknown;
  defaultThread: unknown;
  ownerThread: unknown;
  communityThread: unknown;
  nicosThread: unknown;
  easyThread: unknown;
  aiThread: unknown;
  extraDefaultThread: unknown;
  extraOwnerThread: unknown;
  extraCommunityThread: unknown;
  extraNicosThread: unknown;
  extraEasyThread: unknown;
}

interface SettingConf {
  touch: SettingTouchConf;
  commentLayer: SettingCommentLayerConf;
  filter: SettingFilterConf;
  wordRegFilter: unknown;
  commandFilter: unknown;
  userIdFilter: unknown;
  [key: string]: unknown;
}

interface SettingConfig {
  props: SettingConf;
  importJson(json: string): void;
}

interface SettingPanelProps {
  config: SettingConfig;
  [key: string]: unknown;
}

interface SettingPanelState {
  isOpen: boolean;
  revision: number;
  [key: string]: unknown;
}

interface SettingControlElement {
  dataset: DOMStringMap;
  value: string;
  checked: boolean;
  tagName: string;
  type: string;
  name: string;
  checkValidity(): boolean;
  reportValidity(): boolean;
  setCustomValidity(message: string): void;
}
//===BEGIN===

const { SettingPanelElement } = (() => {
  class SettingPanelElement extends DialogElement {
    static get defaultState(): SettingPanelState {
      return {
        isOpen: false,
        revision: 0,
      };
    }

    static getPlayerSettingMenu(html: HtmlTag, conf: SettingConf): TemplateResult {
      return html`
        <section class="player-setting" data-settings-section="player">
          <div class="control">
            <label>
              <input type="checkbox" class="checkbox" data-setting-name="autoPlay" ?checked=${conf.autoPlay} />
              自動で再生する
            </label>
          </div>

          <div class="control">
            <label>
              <input type="checkbox" class="checkbox" data-setting-name="enableResume" ?checked=${conf.enableResume} />
              続きから再生する
            </label>
          </div>

          <div class="control">
            <label>
              <input
                type="checkbox"
                class="checkbox"
                data-setting-name="enableTogglePlayOnClick"
                ?checked=${conf.enableTogglePlayOnClick}
              />
              画面クリックで再生/一時停止
            </label>
          </div>

          <div class="control">
            <label>
              <input
                type="checkbox"
                class="checkbox"
                data-setting-name="autoFullScreen"
                ?checked=${conf.autoFullScreen}
              />
              自動でフルスクリーンにする
            </label>
          </div>

          <div class="control">
            <label>
              <input
                type="checkbox"
                class="checkbox"
                data-setting-name="enableHeatMap"
                ?checked=${conf.enableHeatMap}
              />
              コメントの盛り上がりをシークバーに表示
            </label>
          </div>
          <div class="control">
            <label>
              <input
                type="checkbox"
                class="checkbox"
                data-setting-name="enableStoryboard"
                ?checked=${conf.enableStoryboard}
              />
              シークバーにサムネイルを表示
            </label>
          </div>
        </section>
      `;
    }
    static getCommentSettingMenu(html: HtmlTag, conf: SettingConf): TemplateResult {
      return html`
        <section class="comment-setting" data-settings-section="comments">
          <div class="control">
            <label>
              <input
                type="checkbox"
                class="checkbox"
                data-setting-name="baseFontBolder"
                ?checked=${conf.baseFontBolder}
              />
              フォントを太くする
            </label>
          </div>

          <div class="control">
            <h3>フォント名</h3>
            <label>
              <span class="info">入力例: 「'游ゴシック', 'メイリオ', '戦国TURB'」</span>
              <input type="text" class="textInput" value=${conf.baseFontFamily} data-setting-name="baseFontFamily" />
            </label>
          </div>
          <div class="control">
            <h3>投稿者コメントの影の色</h3>
            <label>
              <span class="info">※ リロード後に反映</span>
              <input
                type="text"
                class="textInput"
                pattern="(#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{6}|^[a-zA-Z]+$)"
                data-setting-name="commentLayer.ownerCommentShadowColor"
                value=${conf.commentLayer.ownerCommentShadowColor}
              />
            </label>
          </div>

          <div class="control">
            <label>
              フォントサイズ(倍率)
              <input
                type="number"
                value=${conf.baseChatScale}
                min="0.5"
                max="2.0"
                step="0.1"
                data-setting-name="baseChatScale"
                data-type="number"
              />
            </label>
          </div>

          <div class="control">
            <label>
              コメントの透明度
              <input
                type="range"
                value=${conf.commentLayerOpacity}
                min="0.1"
                max="1.0"
                step="0.1"
                data-setting-name="commentLayerOpacity"
                data-type="number"
              />
            </label>
            <label>
              かんたんコメント
              <input
                type="range"
                value=${conf.commentLayer.easyCommentOpacity}
                min="0.1"
                max="1.0"
                step="0.1"
                data-setting-name="commentLayer.easyCommentOpacity"
                data-type="number"
              />
            </label>
            <label>
              AIキャラクターコメント
              <input
                type="range"
                value=${conf.commentLayer.aiCommentOpacity}
                min="0.1"
                max="1.0"
                step="0.1"
                data-setting-name="commentLayer.aiCommentOpacity"
                data-type="number"
              />
            </label>
          </div>

          <div class="control">
            <h3>コメントの影</h3>
            <label>
              <input
                type="radio"
                name="textShadowType"
                data-setting-name="commentLayer.textShadowType"
                ?checked=${conf.commentLayer.textShadowType == ''}
                value=""
              />
              標準 (軽い)
            </label>

            <label>
              <input
                type="radio"
                name="textShadowType"
                data-setting-name="commentLayer.textShadowType"
                ?checked=${conf.commentLayer.textShadowType == 'shadow-type2'}
                value="shadow-type2"
              />
              縁取り
            </label>

            <label>
              <input
                type="radio"
                name="textShadowType"
                data-setting-name="commentLayer.textShadowType"
                ?checked=${conf.commentLayer.textShadowType == 'shadow-type3'}
                value="shadow-type3"
              />
              ぼかし (重い)
            </label>
          </div>
        </section>
      `;
    }
    static getFilterSettingMenu(html: HtmlTag, conf: SettingConf): TemplateResult {
      const wordRegexp = Array.isArray(conf.wordRegFilter) ? conf.wordRegFilter.join('\n') : '';
      const command = Array.isArray(conf.commandFilter) ? conf.commandFilter.join('\n') : conf.commandFilter;
      const userId = Array.isArray(conf.userIdFilter) ? conf.userIdFilter.join('\n') : conf.userIdFilter;
      const videoTag = typeof conf.videoTagFilter === 'string' ? conf.videoTagFilter : '';
      const videoOwner = typeof conf.videoOwnerFilter === 'string' ? conf.videoOwnerFilter : '';
      return html`
        <style>
          .filterEdit {
            display: block;
            width: 100%;
            min-height: 100px;
            margin: 0 auto 0;
            color: currentcolor;
          }
          .filterRegexpEdit {
            box-sizing: border-box;
            display: block;
            width: 100%;
          }
        </style>
        <section class="filter-setting" data-settings-section="filters">
          <div class="control">
            <label>
              <input type="checkbox" class="checkbox" data-setting-name="enableFilter" ?checked=${conf.enableFilter} />
              NGを有効にする
            </label>
          </div>

          <div class="control">
            <label>
              <input
                type="checkbox"
                class="checkbox"
                data-setting-name="removeNgMatchedUser"
                ?checked=${conf.removeNgMatchedUser}
              />
              コメントがNGにマッチしたら、その発言者のコメントを全て消す
            </label>
          </div>

          <div class="control" style="text-align: center;">
            <h3>NG共有</h3>
            <label class="short">
              <input
                type="radio"
                name="sharedNgLevel"
                data-setting-name="sharedNgLevel"
                ?checked=${conf.sharedNgLevel == 'NONE'}
                value="NONE"
              />
              OFF
            </label>
            <label class="short">
              <input
                type="radio"
                name="sharedNgLevel"
                data-setting-name="sharedNgLevel"
                ?checked=${conf.sharedNgLevel == 'LOW'}
                value="LOW"
              />
              弱
            </label>
            <label class="short">
              <input
                type="radio"
                name="sharedNgLevel"
                data-setting-name="sharedNgLevel"
                ?checked=${conf.sharedNgLevel == 'MID'}
                value="MID"
              />
              中
            </label>
            <label class="short">
              <input
                type="radio"
                name="sharedNgLevel"
                data-setting-name="sharedNgLevel"
                ?checked=${conf.sharedNgLevel == 'HIGH'}
                value="HIGH"
              />
              強
            </label>
            <label class="short">
              <input
                type="radio"
                name="sharedNgLevel"
                data-setting-name="sharedNgLevel"
                ?checked=${conf.sharedNgLevel == 'MAX'}
                value="MAX"
              />
              MAX
            </label>
          </div>

          <div class="control" style="text-align: center;">
            <h3>表示するコメント</h3>
            <label class="short">
              <input type="checkbox" data-setting-name="filter.fork0" ?checked=${conf.filter.fork0} value="" />
              通常コメント
            </label>
            <label class="short">
              <input type="checkbox" data-setting-name="filter.fork1" ?checked=${conf.filter.fork1} value="" />
              投稿者コメント
            </label>
            <label class="short">
              <input type="checkbox" data-setting-name="filter.fork2" ?checked=${conf.filter.fork2} value="" />
              かんたんコメント
            </label>
            <label class="short">
              <input type="checkbox" data-setting-name="filter.fork3" ?checked=${conf.filter.fork3} value="" />
              AIキャラクターコメント
            </label>
            <h4>種類</h4>
            <label class="short">
              <input
                type="checkbox"
                data-setting-name="filter.defaultThread"
                ?checked=${conf.filter.defaultThread}
                value=""
              />
              通常コメント
            </label>
            <label class="short">
              <input
                type="checkbox"
                data-setting-name="filter.ownerThread"
                ?checked=${conf.filter.ownerThread}
                value=""
              />
              投稿者コメント
            </label>
            <label class="short">
              <input
                type="checkbox"
                data-setting-name="filter.communityThread"
                ?checked=${conf.filter.communityThread}
                value=""
              />
              チャンネルコメント / コミュニティコメント
            </label>
            <label class="short">
              <input
                type="checkbox"
                data-setting-name="filter.nicosThread"
                ?checked=${conf.filter.nicosThread}
                value=""
              />
              ニコスクリプトコメント
            </label>
            <label class="short">
              <input
                type="checkbox"
                data-setting-name="filter.easyThread"
                ?checked=${conf.filter.easyThread}
                value=""
              />
              かんたんコメント
            </label>
            <label class="short">
              <input type="checkbox" data-setting-name="filter.aiThread" ?checked=${conf.filter.aiThread} value="" />
              AIキャラクターコメント
            </label>
            <!--
            <label class="short">
              <input type="checkbox"
                data-setting-name="filter.extraDefaultThread"
                ?checked=${conf.filter.extraDefaultThread}
                value="">
                ***extra-default
            </label>
            <label class="short">
              <input type="checkbox"
                data-setting-name="filter.extraOwnerThread"
                ?checked=${conf.filter.extraOwnerThread}
                value="">
                ***extra-owner
            </label>
            -->
            <label class="short">
              <input
                type="checkbox"
                data-setting-name="filter.extraCommunityThread"
                ?checked=${conf.filter.extraCommunityThread}
                value=""
              />
              引用コメント
            </label>
            <!--
            <label class="short">
              <input type="checkbox"
                data-setting-name="filter.extraNicosThread"
                ?checked=${conf.filter.extraNicosThread}
                value="">
                ***extra-nicos
            </label>
            -->
            <label class="short">
              <input
                type="checkbox"
                data-setting-name="filter.extraEasyThread"
                ?checked=${conf.filter.extraEasyThread}
                value=""
              />
              引用かんたんコメント
            </label>
          </div>
          <div class="control">
            <h3>NG正規表現</h3>
            <p class="info">
              1行に1つ、<code>/パターン/フラグ</code>の形式で入力します。例:
              <code>/([wWｗＷ]+$|^ん[？?]$|洗った？$)/i</code>
            </p>
            <label>
              <textarea
                class="filterEdit filterRegexpEdit"
                data-setting-name="wordRegFilter"
                data-ng-regexp-input
                .value=${wordRegexp}
              ></textarea>
            </label>
            <h3>NGコマンド</h3>
            <label>
              <textarea class="filterEdit" data-setting-name="commandFilter" data-type="array">${command}</textarea>
            </label>
            <h3>NGユーザー</h3>
            <label>
              <textarea class="filterEdit" data-setting-name="userIdFilter" data-type="array">${userId}</textarea>
            </label>
            <h3>NGタグ</h3>
            <p class="info">連続再生中に、このタグがある動画をスキップします。</p>
            <label>
              <textarea class="filterEdit" data-setting-name="videoTagFilter">${videoTag}</textarea>
            </label>
            <h3>NG投稿者</h3>
            <p class="info">連続再生中に、この投稿者IDの動画をスキップします。チャンネルはchから入力します。</p>
            <label>
              <textarea class="filterEdit" data-setting-name="videoOwnerFilter">${videoOwner}</textarea>
            </label>
          </div>
        </section>
      `;
    }

    static getContentsTemplate(
      html: HtmlTag,
      state: SettingPanelState = {} as SettingPanelState,
      props: SettingPanelProps = {} as SettingPanelProps,
      events: ElementEvents = {}
    ): Promise<TemplateResult> {
      const conf = props.config.props;
      return Promise.resolve(html`
        <style>
          label {
            display: block;
            margin: 8px;
            padding: 8px;
            cursor: pointer;
          }
          label.short {
            display: inline-block;
            min-width: 15%;
          }
          label:hover {
            border-radius: 4px;
            background: rgba(80, 80, 80, 0.3);
          }
          input[type='checkbox'],
          input[type='radio'] {
            transform: scale(2);
            margin-right: 8px;
          }
          input[type='text'],
          input[type='number'],
          select {
            border-radius: 4px;
            border: 1px solid currentcolor;
            font-size: 150%;
            padding: 8px;
            background: transparent;
            color: currentcolor;
          }
          input[type='range'] {
            width: 70%;
            margin: auto;
            cursor: pointer;
            border-radius: 4px;
            border: 1px solid currentcolor;
          }

          .import-export {
            padding: 8px;
            text-align: center;
            outline: none;
          }

          .export-config-button {
            display: inline-block;
          }

          .import-config-file-select {
            position: absolute;
            text-indent: -9999px;
            width: 160px;
            padding: 8px;
            opacity: 0;
            cursor: pointer;
          }

          .import-config-file-select-label {
            pointer-events: none;
            user-select: none;
          }
          .import-config-file-select-label,
          .export-config-button {
            display: inline-block;
            width: 160px;
            padding: 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            color: #000;
            background: #ccc;
            border: 0;
          }
        </style>
        <div data-revision="${state.revision}">
          ${this.getPlayerSettingMenu(html, conf)} ${this.getCommentSettingMenu(html, conf)}
          ${this.getFilterSettingMenu(html, conf)}

          <section data-settings-section="data">
            <div class="import-export">
              <button class="export-config-button" data-command="export-config">ファイルに保存</button>
              <input
                type="file"
                @change=${events.onImportFileSelect}
                class="import-config-file-select"
                aria-label="ファイルから読み込む"
                accept=".json"
                data-command="nop"
              />
              <div class="import-config-file-select-label">ファイルから読み込む</div>
            </div>
          </section>
        </div>
      `);
    }

    constructor() {
      super();
      Object.assign(this.events, {
        onChange: this.onChange.bind(this),
        onImportFileSelect: this.onImportFileSelect.bind(this),
      });
    }

    get config(): SettingConfig {
      return this.props.config as SettingConfig;
    }
    set config(v: SettingConfig) {
      this.props.config = v;
      this.state.revision = (this.state.revision as number) + 1;
    }

    onUIEvent(e: Event): boolean | undefined {
      // console.nicoru('target', e.target.closest('label, input, select, textarea'), e.target);
      const target = (e.target as Element).closest('label, input, select, textarea');
      if (target) {
        e.stopPropagation();
        return;
      }
      super.onUIEvent(e);
    }

    onKey(e: Event): void {
      if ((e as KeyboardEvent).key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
        return;
      }
      super.onKey(e);
    }

    onChange(e: Event): void {
      const path = (e as unknown as { path?: EventTarget[] }).path;
      const elm = ((path && path[0] ? path[0] : e.target) || {}) as SettingControlElement;
      const elmDataset: DOMStringMap | undefined = (elm as { dataset?: DOMStringMap }).dataset;
      if (elmDataset?.ngRegexpInput !== undefined) {
        try {
          const normalized = normalizeNgRegexpInputLines(elm.value);
          elm.setCustomValidity('');
          this.config.props.wordRegFilter = normalized;
          const saved = this.config.props.wordRegFilter;
          elm.value = Array.isArray(saved) ? saved.join('\n') : '';
        } catch (error) {
          elm.setCustomValidity(
            error instanceof Error ? error.message : '正規表現は /パターン/フラグ の形式で入力してください'
          );
          elm.reportValidity();
        }
        e.stopPropagation();
        return;
      }
      const settingName = elmDataset?.settingName;
      const type = elmDataset?.type;
      if (!settingName) {
        return super.onChange(e);
      }
      // change also fires when a number field is cleared or a pasted value is
      // outside its bounds. Keep the last valid setting and let the browser
      // explain the constraint instead of parsing an empty string as JSON.
      if (
        !elm.checkValidity() ||
        (type === 'number' && (elm.value.trim() === '' || !Number.isFinite(Number(elm.value))))
      ) {
        elm.reportValidity();
        e.stopPropagation();
        return;
      }
      let value: unknown = elm.value;
      // console.nicoru('onChange',
      //   {settingName, checked: elm.checked, value, type, tagName: elm.tagName}, elm, e);

      if (elm.tagName === 'INPUT' && elm.type === 'checkbox') {
        value = elm.checked;
      } else {
        if (type === 'number') {
          value = Number(value);
        } else if (['boolean', 'json'].includes(type as string)) {
          value = JSON.parse(value as string);
        } else if (type === 'array') {
          value = (value as string).split('\n');
        }
      }
      // console.nicoru({settingName, value, type});
      this.config.props[settingName] = value;
      const saved = this.config.props[settingName];
      if (saved !== value) {
        if (elm.type === 'checkbox') elm.checked = Boolean(saved);
        else if (elm.type === 'radio') {
          const root = (e.target as Element).getRootNode() as Document | ShadowRoot;
          for (const radio of root.querySelectorAll<HTMLInputElement>('input[type="radio"][data-setting-name]')) {
            if (radio.dataset.settingName === settingName) radio.checked = saved === radio.value;
          }
        } else
          elm.value = Array.isArray(saved)
            ? saved.join('\n')
            : typeof saved === 'string' || typeof saved === 'number'
              ? String(saved)
              : '';
      }
      e.stopPropagation();
    }

    onOpen(): void {
      super.onOpen();
      this.state.revision = (this.state.revision as number) + 1;
    }

    onImportFileSelect(e: Event): void {
      e.preventDefault();
      e.stopPropagation();

      const input = e.target as HTMLInputElement;
      const file = (input.files as FileList)[0] as File;
      if (!file || !/\.config\.json$/.test(file.name)) {
        return;
      }
      if (!confirm(`ファイル "${file.name}" で書き換えますか？`)) {
        return;
      }

      const fileReader = new FileReader();
      fileReader.onload = (ev: ProgressEvent): void => {
        const reader = ev.target as FileReader;
        try {
          this.config.importJson(reader.result as string);
          domEvent.dispatchCommand(input, 'close', undefined);
          location.reload();
        } catch (error) {
          alert(error instanceof Error ? error.message : '設定を読み込めませんでした。');
          input.value = '';
        }
      };
      fileReader.onerror = (): void => {
        alert('設定ファイルを読み取れませんでした。ファイルを確認して、もう一度お試しください。');
        input.value = '';
      };

      fileReader.readAsText(file);
    }
  }

  if (window.customElements) {
    if (!customElements.get('futatsume-setting-panel')) {
      customElements.define('futatsume-setting-panel', SettingPanelElement);
    }
  }
  return { SettingPanelElement };
})();

//===END===

export { SettingPanelElement };
