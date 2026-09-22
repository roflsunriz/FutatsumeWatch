import { SettingsDialog } from '../packages/components/src/settings-dialog';
import { FutatsumeDetector } from '../packages/components/src/util/futatsume-detector';
import { uq } from '../packages/lib/src/u-query';
import { cssUtil } from '../packages/lib/src/css/css';
import { Config } from './config';
import type { ConfigStore } from './config';
import { FutatsumeWatch } from './futatsume-watch-index';

interface SettingScriptUqCollection {
  find(selector: string): SettingScriptUqCollection;
  before(content: unknown): SettingScriptUqCollection;
  after(content: unknown): SettingScriptUqCollection;
  append(content: unknown): SettingScriptUqCollection;
  on(event: string, listener: (e: unknown) => void): SettingScriptUqCollection;
  toggleClass(name: string, force?: boolean): SettingScriptUqCollection;
  hasClass(name: string): boolean;
  addClass(name: string): SettingScriptUqCollection;
  removeClass(name: string): SettingScriptUqCollection;
  prop(name: string, value?: unknown): unknown;
  val(): string;
  val(value: string): SettingScriptUqCollection;
  forEach(callback: (elm: HTMLInputElement) => void): void;
}

interface SettingScriptUq {
  (html: string): SettingScriptUqCollection;
  (element: Element): SettingScriptUqCollection;
}

export interface SettingScriptPanelParams {
  playerConfig: ConfigStore;
  $container: SettingScriptUqCollection;
}

interface SettingScriptCssUtil {
  addStyle(cssText: string): void;
}
((window: Window) => {
  const monkey = async (): Promise<void> => {
    await Config.promise('restore');
    const $ = uq as unknown as SettingScriptUq;
    (window as unknown as { FutatsumeAdvancedSettings: unknown }).FutatsumeAdvancedSettings = {
      config: Config,
    };

    let panel: SettingPanel | undefined;

    const __tpl__ = `
      <button class="openFutatsumeAdvancedSettingPanel">FutatsumeWatch上級者設定</button>
    `.trim();

    const __css__ = `
      .openFutatsumeAdvancedSettingPanel {
        font-size: 12px;
        border-radius: 4px;
        -webkit-box-pack: justify;
        -ms-flex-pack: justify;
        justify-content: space-between;
        -webkit-box-align: center;
        -ms-flex-align: center;
        align-items: center;
        padding: 0 6px;
        color: #555;
        font-weight: 600;
        text-align: right;
        letter-spacing: .5px;
        cursor: pointer;
      }
      .openFutatsumeAdvancedSettingPanel:hover {
        background: #eee;
      }

      .openFutatsumeAdvancedSettingPanel:active {
        background: #ccc;
      }


      .summer2017Area {
        display: none !important;
      }
    `.trim();

    class SettingPanel {
      private modal!: SettingsDialog;
      static __css__: string;
      static __tpl__: string;
      private _playerConfig!: ConfigStore;
      private _$container!: SettingScriptUqCollection;
      private _$panel!: SettingScriptUqCollection;
      private _$view!: SettingScriptUqCollection;
      constructor(params: SettingScriptPanelParams) {
        this.initialize(params);
      }
      initialize(params: SettingScriptPanelParams): void {
        this._playerConfig = params.playerConfig;
        this._$container = params.$container;

        this._playerConfig.on('update', this._onPlayerConfigUpdate.bind(this));
      }
      _initializeDom(): void {
        if (this._$panel) {
          return;
        }
        const $container = this._$container;
        const config = this._playerConfig;

        (cssUtil as unknown as SettingScriptCssUtil).addStyle(SettingPanel.__css__);
        $container.append((uq as unknown as { html(tpl: string): unknown }).html(SettingPanel.__tpl__));

        const $panel = (this._$panel = $container.find('.futatsumeAdvancedSettingPanel'));
        this._$view = $container.find('.futatsumeAdvancedSettingPanel');
        const dialog = document.querySelector<HTMLDialogElement>('.futatsumeAdvancedSettingPanel')!;
        this.modal = new SettingsDialog(dialog, 'advanced', () => this._$view.toggleClass('show', false));
        this._$view.on('click', (e: unknown) => (e as { stopPropagation(): void }).stopPropagation());

        const onInputItemChange = this._onInputItemChange.bind(this);
        const $check = $panel.find('input[type=checkbox]');
        $check.forEach((check) => {
          const { settingName } = check.dataset;
          const val = !!config.props[settingName as string];
          check.checked = val;
          check.closest('.control')!.classList.toggle('checked', val);
        });
        $check.on('change', this._onToggleItemChange.bind(this));

        const $input = $panel.find('input[type=text], select, .textAreaInput');
        $input.forEach((input) => {
          const { settingName } = input.dataset;
          input.value =
            typeof config.props[settingName as string] === 'string' ||
            typeof config.props[settingName as string] === 'number'
              ? String(config.props[settingName as string])
              : '';
        });
        $input.on('change', onInputItemChange);

        $panel.find('.futatsumeAdvancedSetting-close').on('click', (e: unknown) => {
          (e as { stopPropagation(): void }).stopPropagation();
          this.hide();
        });
      }
      _onPlayerConfigUpdate(key: unknown, value: unknown): void {
        switch (key) {
          case 'enableFullScreenOnDoubleClick':
          case 'autoCloseFullScreen':
            this._$panel
              .find('.' + (key as string) + 'Control')
              .toggleClass('checked', value as boolean)
              .find('input[type=checkbox]')
              .prop('checked', value);
            break;
        }
      }
      _onToggleItemChange(e: unknown): void {
        const target = (e as { target: HTMLInputElement }).target;
        const { settingName } = target.dataset;
        const val = !!target.checked;

        this._playerConfig.props[settingName as string] = val;
        const saved = Boolean(this._playerConfig.props[settingName as string]);
        target.checked = saved;
        target.closest('.control')!.classList.toggle('checked', saved);
      }
      _onInputItemChange(e: unknown): void {
        (e as { stopPropagation(): void }).stopPropagation();
        const target = (e as { target: HTMLInputElement }).target;
        const $target = $((e as { target: Element }).target);
        const { settingName } = target.dataset;
        const val = target.value;

        window.setTimeout(() => $target.removeClass('update error'), 300);

        $target.addClass('update');

        this._playerConfig.props[settingName as string] = val;
        const saved = this._playerConfig.props[settingName as string];
        target.value = typeof saved === 'string' || typeof saved === 'number' ? String(saved) : '';
      }
      toggle(v?: boolean): void {
        this._initializeDom();
        // window.FutatsumeWatch.external.execCommand('close');
        this._$view.toggleClass('show', v);
        if (this._$view.hasClass('show')) {
          this.modal.open();
        } else this.modal.close();
      }
      show(): void {
        this.toggle(true);
      }
      hide(): void {
        this.toggle(false);
      }
    }

    SettingPanel.__css__ = `
      .futatsumeAdvancedSettingPanel {
        position: fixed;
        left: 50%;
        top: -100vh;
        pointer-events: none;
        transform: translate(-50%, -50%);
        z-index: 200000;
        width: 90vw;
        height: 90vh;
        color: #000;
        background: rgba(192, 192, 192, 1);
        transition: top 0.4s ease;
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
        overflow: hidden;
      }
      .futatsumeAdvancedSettingPanel.show {
        opacity: 1;
        top: 50%;
      }

      .futatsumeAdvancedSettingPanel.show {
        border: 2px outset #fff;
        box-shadow: 6px 6px 6px rgba(0, 0, 0, 0.5);
        pointer-events: auto;
      }

      .futatsumeAdvancedSettingPanel .settingPanelInner {
        box-sizing: border-box;
        margin: 8px;
        padding: 8px;
        overflow: auto;
        height: calc(100% - 86px);
        overscroll-behavior: contain;
        border: 1px inset;
      }
      .futatsumeAdvancedSettingPanel .caption {
        background: #333;
        font-size: 20px;
        padding: 4px 8px;
        color: #fff;
      }

      .futatsumeAdvancedSettingPanel .caption.sub {
        margin: 8px;
        font-size: 16px;
      }

      .futatsumeAdvancedSettingPanel .example {
        display: inline-block;
        margin: 0 16px;
        font-family: sans-serif;
      }

      .futatsumeAdvancedSettingPanel label {
        display: inline-block;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        padding: 4px 8px;
        cursor: pointer;
      }

      .futatsumeAdvancedSettingPanel .control {
        border-radius: 4px;
        background: rgba(88, 88, 88, 0.3);
        padding: 8px;
        margin: 16px 4px;
      }

      .futatsumeAdvancedSettingPanel .control:hover {
        background: rgba(88, 88, 128, 0.3);
      }

      .futatsumeAdvancedSettingPanel button {
        font-size: 10pt;
        padding: 4px 8px;
        background: #888;
        border-radius: 4px;
        border: solid 1px;
        cursor: pointer;
      }

      .futatsumeAdvancedSettingPanel input[type=checkbox] {
        transform: scale(2);
        margin-left: 8px;
        margin-right: 16px;
        cursor: pointer;
      }

      .futatsumeAdvancedSettingPanel .control.checked {
      }

      .futatsumeAdvancedSettingPanel input[type=text] {
        font-size: 24px;
        background: #ccc;
        color: #000;
        width: 90%;
        margin: 0 5%;
        padding: 8px;
        border-radius: 8px;
      }
      .futatsumeAdvancedSettingPanel input[type=text].update {
        color: #003;
        background: #fff;
        box-shadow: 0 0 8px #ff9;
      }
      .futatsumeAdvancedSettingPanel input[type=text].update:before {
        content: 'ok';
        position: absolute;
        left: 0;
        z-index: 100;
        color: blue;
      }

      .futatsumeAdvancedSettingPanel input[type=text].error {
        color: #300;
        background: #f00;
      }

      .futatsumeAdvancedSettingPanel select {
        font-size:24px;
        margin: 0 5%;
        border-radius: 8px;
       }

      .futatsumeAdvancedSetting-close {
        position: absolute;
        width: 50%;
        left: 50%;
        bottom: 8px;
        transform: translate(-50%);
        z-index: 160000;
        padding: 8px 16px;
        cursor: pointer;
        box-sizing: border-box;
        text-align: center;
        line-height: 30px;
        font-size: 24px;
        border: outset 2px;
        box-shadow: 0 0 4px #000;
        transition:
          opacity 0.4s ease,
          transform 0.2s ease,
          background 0.2s ease,
          box-shadow 0.2s ease
            ;
        pointer-events: auto;
        transform-origin: center center;
      }

      .textAreaInput {
        width: 90%;
        height: 200px;
        margin: 0 5%;
        word-break: break-all;
        overflow: scroll;
      }

      .futatsumeAdvancedSetting-close:active {
        box-shadow: none;
        border: inset 2px;
        transform: scale(0.8);
      }

      .example code {
        font-family: monospace;
        display: inline-block;
        margin: 4px;
        padding: 4px 8px;
        background: #333;
        color: #fe8;
        border-radius: 4px;
      }

    `.trim();

    SettingPanel.__tpl__ = `
      <dialog class="futatsumeAdvancedSettingPanel futatsume-family">
        <div class="settingPanelInner">
          <div class="enableFullScreenOnDoubleClickControl control toggle">
            <label>
              <input type="checkbox" class="checkbox" data-setting-name="enableFullScreenOnDoubleClick">
              画面ダブルクリックでフルスクリーン切り換え
            </label>
          </div>

          <div class="autoCloseFullScreenControl control toggle">
            <label>
              <input type="checkbox" class="checkbox" data-setting-name="autoCloseFullScreen">
              再生終了時に自動でフルスクリーン解除

            </label>
          </div>

        </div>
        <button type="button" class="futatsumeAdvancedSetting-close">閉じる</button>
      </dialog>
    `.trim();

    const initializePanel = (): void => {
      // Config.watch();
      if (panel == null) {
        panel = new SettingPanel({
          playerConfig: Config,
          $container: $('body'),
        });
      }
    };

    const initialize = (): void => {
      const openPanel = (): void => {
        initializePanel();
        panel!.toggle();
      };
      void FutatsumeWatch.emitter.promise('videoControBar.addonMenuReady').then((value) => {
        const { container } = value as { container: HTMLElement };
        const button = document.createElement('button');
        button.className = 'controlButton';
        button.dataset.command = 'toggleAdvancedSettings';
        button.textContent = '詳細設定';
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          openPanel();
        });
        container.append(button);
      });
      const $button = $(__tpl__);
      (cssUtil as unknown as SettingScriptCssUtil).addStyle(__css__);

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      document.querySelector('#js-initial-userpage-data')
        ? $('.Dropdown-button').before($button)
        : $('.accountEdit').after($button);

      $button.on('click', () => {
        openPanel();
      });
    };

    initialize();
  };

  const loadGM = (): void => {
    void monkey();
  };
  void FutatsumeDetector.detect().then(() => loadGM());
})(globalThis ? (globalThis as unknown as { window: Window }).window : window);
