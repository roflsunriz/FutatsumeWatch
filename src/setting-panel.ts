import { Emitter } from '../packages/lib/src/emitter';
import { cssUtil } from '../packages/lib/src/css/css';
import { uq } from '../packages/lib/src/u-query';
import { domEvent } from '../packages/lib/src/dom/dom-event';
import type { ConfigStore } from './config';

interface SettingEmitter {
  emit(event: string, ...args: unknown[]): unknown;
}

interface SettingEmitterCtor {
  new (): SettingEmitter;
}

export interface SettingUqCollection {
  [index: number]: HTMLInputElement;
  length: number;
  [Symbol.iterator](): Iterator<HTMLInputElement>;
  on(event: string, listener: (e: unknown) => void, options?: unknown): SettingUqCollection;
  appendTo(node: Node): unknown;
  mapQuery(queries: Record<string, string>): { result: SettingMapQueryResult };
}

export interface SettingMapQueryResult {
  $check: SettingUqCollection;
  $radio: SettingUqCollection;
  $text: SettingUqCollection;
  $filterEdit: SettingUqCollection;
  wordFilter: HTMLTextAreaElement;
  userIdFilter: HTMLTextAreaElement;
  commandFilter: HTMLTextAreaElement;
  fileSelect: HTMLInputElement;
}

export interface SettingPanelParams {
  playerConfig: ConfigStore;
  $parent: SettingUqCollection;
  player: unknown;
}

interface SettingCssUtil {
  addStyle(cssText: string): void;
}

interface SettingUqStatic {
  html(tpl: string): SettingUqCollection;
}

interface SettingDomEvent {
  dispatchCommand(target: Element, command: string, param?: unknown): void;
}

//===BEGIN===

class SettingPanel extends (Emitter as unknown as SettingEmitterCtor) {
  static __css__: string;
  static __tpl__: string;
  private _params!: SettingPanelParams;
  private _initialized!: boolean;
  private _playerConfig!: ConfigStore;
  private _$parent!: SettingUqCollection;
  private _player!: unknown;
  private _$view!: SettingUqCollection;
  private elm!: SettingMapQueryResult;
  constructor(params: SettingPanelParams) {
    super();
    this._params = params;
    this._initialized = false;
  }
  initialize(): void {
    if (this._initialized) {
      return;
    }
    const params = this._params;
    this._playerConfig = params.playerConfig;
    this._$parent = params.$parent;
    this._player = params.player;

    this._playerConfig.on('change', this._onPlayerConfigChange.bind(this));
    this._initializeDom();
    this._initializeCommentFilterEdit();
    this.sync();
    this._initialized = true;
  }
  _initializeDom(): void {
    const $parent = this._$parent;

    (cssUtil as unknown as SettingCssUtil).addStyle(SettingPanel.__css__);
    const $view = (this._$view = (uq as unknown as SettingUqStatic).html(SettingPanel.__tpl__));
    $view.appendTo($parent[0]!);
    this.elm = $view.mapQuery({
      $check: 'input[type=checkbox]',
      $radio: 'input[type=radio]',
      $text: 'input[type=text], select',
      $filterEdit: '.filterEdit',
      wordFilter: '.wordFilterEdit',
      userIdFilter: '.userIdFilterEdit',
      commandFilter: '.commandFilterEdit',
      fileSelect: '.import-config-file-select',
    }).result;

    $view
      .on('click', this._onClick.bind(this))
      .on('wheel', (e: unknown) => (e as { stopPropagation(): void }).stopPropagation(), { passive: true })
      .on('paste', (e: unknown) => (e as { stopPropagation(): void }).stopPropagation());

    const { $check, $radio, $text, $filterEdit } = this.elm;
    $check.on('change', this._onToggleItemChange.bind(this));
    $radio.on('change', this._onRadioItemChange.bind(this));
    $text.on('change', this._onInputItemChange.bind(this));
    $filterEdit.on('change', this._onFilterEditChange.bind(this));

    this.elm.fileSelect.addEventListener('change', this._onImportFileSelect.bind(this));
  }
  _initializeCommentFilterEdit(): void {
    this.elm.$filterEdit.on('change', (e: unknown) =>
      this.emit(
        'command',
        (e as { target: HTMLTextAreaElement }).target.dataset.command,
        (e as { target: HTMLTextAreaElement }).target.value
      )
    );
  }
  sync(): void {
    const config = this._playerConfig;
    const { wordFilter, userIdFilter, commandFilter, $check, $radio, $text } = this.elm;
    const filterMap: Record<string, HTMLTextAreaElement> = { wordFilter, userIdFilter, commandFilter };
    Object.keys(filterMap).forEach((v) => {
      let value: unknown = config.props[v] || [];
      value = Array.isArray(value) ? value.join('\n') : value;
      filterMap[v]!.value = value as string;
    });

    for (const check of $check) {
      const settingName = check.dataset.settingName as string;
      const val = config.props[settingName];
      check.checked = val as boolean;
      (check.closest('.control') || check).classList.toggle('checked', val as boolean);
    }

    for (const check of $radio) {
      const settingName = check.dataset.settingName as string;
      const val = config.props[settingName];
      check.checked = (val as string) === check.value;
    }

    for (const elm of $text) {
      const settingName = elm.dataset.settingName as string;
      const val = config.props[settingName];
      elm.value = val as string;
    }
  }
  _onClick(e: unknown): void {
    const target = (e as { target: Element }).target.closest<HTMLElement>('[data-command]');
    (e as { stopPropagation(): void }).stopPropagation();

    if (!target) {
      return;
    }

    const { command, type = 'string', param: rawParam } = target.dataset;
    let param: unknown = rawParam;
    if (type !== 'string') {
      param = JSON.parse(rawParam as string);
    }

    (domEvent as unknown as SettingDomEvent).dispatchCommand(target, command as string, param);
  }
  _onPlayerConfigChange(changed: unknown): void {
    const keys = [
      'wordFilter',
      'userIdFilter',
      'commandFilter',
      'loop',
      'autoPlay',
      'enableHeatMap',
      'autoFullScreen',
      'enableStoryboard',
      'loadLinkedChannelVideo',
    ];
    if ([...(changed as Map<string, unknown>).keys()].some((key) => keys.includes(key))) {
      this.sync();
    }
  }
  _onToggleItemChange(e: unknown): void {
    const target = (e as { target: HTMLInputElement }).target;
    const name = target.dataset.settingName as string;
    const val = !!target.checked;

    this._playerConfig.props[name] = val;
    target.closest('.control')!.classList.toggle('checked', val);
  }
  _onRadioItemChange(e: unknown): void {
    const target = (e as { target: HTMLInputElement }).target;
    const name = target.dataset.settingName as string;
    const checked = !!target.checked;
    if (!checked) {
      return;
    }
    this._playerConfig.props[name] = target.value;
  }
  _onInputItemChange(e: unknown): void {
    const target = (e as { target: HTMLInputElement }).target;
    const name = target.dataset.settingName as string;
    const val = target.value;
    this._playerConfig.props[name] = val;
  }
  _onFilterEditChange(e: unknown): void {
    const target = (e as { target: HTMLTextAreaElement }).target;
    const command = target.dataset.commandName as string;
    const param = target.value;
    (domEvent as unknown as SettingDomEvent).dispatchCommand(target, command, param);
  }
  toggle(v?: boolean): void {
    if (v !== false) {
      this.initialize();
    } else if (!this._initialized) {
      return;
    }
    const view = this._$view[0]!;
    if (typeof v !== 'boolean') {
      v = !view.contains(document.activeElement);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    v ? view.focus() : view.blur();
    if (v) {
      this.sync();
    }
  }
  show(): void {
    this.toggle(true);
  }
  hide(): void {
    this.toggle(false);
  }
  _onImportFileSelect(e: Event): void {
    e.preventDefault();

    const file = ((e.target as HTMLInputElement).files as FileList)[0] as File;
    if (!/\.config\.json$/.test(file.name)) {
      return;
    }
    if (!confirm(`ファイル "${file.name}" で書き換えますか？`)) {
      return;
    }

    (domEvent as unknown as SettingDomEvent).dispatchCommand(e.target as Element, 'close');

    const fileReader = new FileReader();
    fileReader.onload = (ev) => {
      this._playerConfig.importJson((ev.target as FileReader).result as string);
      location.reload();
    };

    fileReader.readAsText(file);
  }
}
SettingPanel.__css__ = `
  .futatsumeSettingPanel {
    display: block;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -100vh);
    z-index: 170000;
    color: #fff;
    transition: transform 0.4s ease;
    will-change: transform;
    pointer-events: none;
    user-select: none;
    overflow-y: hidden;
    outline: none;
    contain: strict;
  }
  .futatsumeSettingPanel:not(:focus-within) >* {
    display: none;
  }
  .futatsumeSettingPanel:focus-within {
    width: 500px;
    height: 400px;
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, -50%);
    overflow-y: scroll;
    overflow-x: hidden;
    overscroll-behavior: contain;
    background: rgba(0, 0, 0, 0.8);
  }

  .futatsumeSettingPanel:focus-within::-webkit-scrollbar {
    width: 16px;
    background: var(--scrollbar-bg-color);
  }
  .futatsumeSettingPanel:focus-within::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb-color);
  }

  .futatsumeScreenMode_sideView .futatsumeSettingPanel:focus-within,
  .futatsumeScreenMode_small    .futatsumeSettingPanel:focus-within {
    position: fixed;
  }

  .futatsumeSettingPanel:focus-within {
    border: 2px outset #fff;
    box-shadow: 6px 6px 6px rgba(0, 0, 0, 0.5);
    pointer-events: auto;
  }


  .futatsumeSettingPanel .settingPanelInner {
    box-sizing: border-box;
    margin: 16px;
    overflow: visible;
  }
  .futatsumeSettingPanel .caption {
    background: #333;
    font-size: 20px;
    padding: 4px 2px;
    color: #fff;
  }

  .futatsumeSettingPanel label {
    display: inline-block;
    box-sizing: border-box;
    width: 100%;
    padding: 4px 8px;
    cursor: pointer;
  }

  .futatsumeSettingPanel .control {
    border-radius: 4px;
    background: rgba(88, 88, 88, 0.3);
    padding: 8px;
    margin: 16px 4px;
  }

  .futatsumeSettingPanel .control:hover {
    border-color: #ff9;
  }

  .futatsumeSettingPanel button {
    font-size: 10pt;
    padding: 4px 8px;
    background: #888;
    border-radius: 4px;
    border: solid 1px;
    cursor: pointer;
  }

  .futatsumeSettingPanel input[type=checkbox] {
    transform: scale(2);
    margin-left: 8px;
    margin-right: 16px;
  }

  .futatsumeSettingPanel .filterEditContainer {
    color: #fff;
    margin-bottom: 32px;
  }
  .futatsumeSettingPanel .filterEditContainer.forGuest {
    padding: 8px;
  }
  .futatsumeSettingPanel .filterEditContainer p {
    color: #fff;
    font-size: 120%;
  }

  .futatsumeSettingPanel .filterEditContainer .info {
    color: #ccc;
    font-size: 90%;
    display: inline-block;
    margin: 8px 0;
  }

  .futatsumeSettingPanel .filterEdit {
    background: #000;
    color: #ccc;
    width: 90%;
    margin: 0 5%;
    min-height: 150px;
    white-space: pre;
  }

  .futatsumeSettingPanel .fontEdit .info {
    color: #ccc;
    font-size: 90%;
    display: inline-block;
    margin: 8px 0;
  }

  .futatsumeSettingPanel .fontEdit p {
    color: #fff;
    font-size: 120%;
  }

  .futatsumeSettingPanel input[type=text] {
    font-size: 24px;
    background: #000;
    color: #ccc;
    width: 90%;
    margin: 0 5%;
    border-radius: 8px;
  }
  .futatsumeSettingPanel select {
    font-size:24px;
    background: #000;
    color: #ccc;
    margin: 0 5%;
    border-radius: 8px;
    }

  .futatsumeSettingPanel .import-export {
    padding: 8px;
    text-align: center;
  }

  .futatsumeSettingPanel .export-config-button {
    display: inline-block;
  }

  .futatsumeSettingPanel  .import-config-file-select {
    position: absolute;
    text-indent: -9999px;
    width: 160px;
    padding: 8px;
    opacity: 0;
    cursor: pointer;
  }

  .futatsumeSettingPanel  .import-config-file-select-label {
    pointer-events: none;
    user-select: none;
  }
  .futatsumeSettingPanel .import-config-file-select-label,
  .futatsumeSettingPanel .export-config-button {
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
  `.trim();

SettingPanel.__tpl__ = `
  <div class="futatsumeSettingPanel" tabindex="0">
    <div class="settingPanelInner">
      <p class="caption">プレイヤーの設定</p>
      <div class="autoPlayControl control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="autoPlay">
          自動で再生する
        </label>
      </div>

      <div class="enableTogglePlayOnClickControl control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="enableTogglePlayOnClick">
          画面クリックで再生/一時停止
        </label>
      </div>

      <div class="autoFullScreenControl control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="autoFullScreen">
          自動でフルスクリーンにする
          <small>(singletonモードでは使えません)</small>
        </label>
      </div>

      <div class="enableSingleton control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="enableSingleton">
          FutatsumeWatchを起動してるタブがあればそちらで開く<br>
          <smal>(singletonモード)</small>
        </label>
      </div>

      <div class="enableHeatMapControl control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="enableHeatMap">
          コメントの盛り上がりをシークバーに表示
        </label>
      </div>

      <div class="overrideGinzaControl control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="overrideGinza">
          動画視聴ページでも公式プレイヤーの代わりに起動する
        </label>
      </div>

      <div class="overrideWatchLinkControl control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="overrideWatchLink">
          [Futatsume]ボタンなしでFutatsumeWatchを開く(リロード後に反映)
        </label>
      </div>

      <div class="overrideWatchLinkControl control toggle forPremium">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="enableStoryboard">
          シークバーにサムネイルを表示 <small>(※ プレミアム)</small>
        </label>
      </div>

      <div class="UaaEnableControl control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="uaa.enable">
          ニコニ広告の情報を取得する(対応ブラウザのみ)
        </label>
      </div>

      <div class="enableAutoMylistCommentControl control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="enableAutoMylistComment">
          マイリストコメントに投稿者名を入れる
        </label>
      </div>

      <div class="autoDisableDmc control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="autoDisableDmc">
          旧システムのほうが画質が良さそうな時は旧システムを使う<br>
          <small>たまに誤爆することがあります (回転情報の含まれる動画など)</small>
        </label>
      </div>

      <div class="enableNicosJumpVideo control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="enableNicosJumpVideo"
          data-command="toggle-enableNicosJumpVideo">
          ＠ジャンプで指定された動画をプレイリストに入れる
        </label>
      </div>

      <div class="enableOnlyRequired control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="video.hls.enableOnlyRequired"
          data-command="toggle-video.hls.enableOnlyRequired">
          HLSが必須の動画だけHLSを使用する (※ HLSが重い環境用)
        </label>
      </div>

      <div class="touchEnable control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="touch.enable"
          data-command="toggle-touchEnable">
          タッチパネルのジェスチャを有効にする
          <smal>(2本指左右シーク・上下で速度変更/3本指で動画切替)</small>
        </label>
      </div>

      <div class="bestFutatsumeTube control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="bestFutatsumeTube"
          data-command="toggle-bestFutatsumeTube">
            FutatsumeTube使用時に最高画質をリクエストする (※ 機能してないかも)
        </label>
      </div>

      <div class="loadLinkedChannelVideoControl control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="loadLinkedChannelVideo">
          無料期間の切れた動画はdアニメの映像を流す<br>
          <small>(当然ながらdアニメニコニコチャンネル加入が必要)</small>
        </label>
      </div>

      <div class="menuScaleControl control toggle">
        <label>
          <select class="menuScale" data-setting-name="menuScale">
              <option value="0.8">0.8倍</option>
              <option value="1" selected>標準</option>
              <option value="1.2">1.2倍</option>
              <option value="1.5">1.5倍</option>
              <option value="2.0">2倍</option>
          </select>
          ボタンの大きさ(倍率)
          <small>※ 一部レイアウトが崩れます</small>
        </label>
      </div>

      <p class="caption">コメント・フォントの設定</p>
      <div class="fontEdit">

        <div class="autoCommentSpeedRate control toggle">
          <label>
            <input type="checkbox" class="checkbox" data-setting-name="autoCommentSpeedRate">
            倍速再生でもコメントは速くしない<br>
              <small>※ コメントのレイアウトが一部崩れます</small>
          </label>
        </div>

        <div class="commentSpeedRate control toggle">
          <label>
            <select class="commentSpeedRate" data-setting-name="commentSpeedRate">
                <option value="0.5">0.5倍</option>
                <option value="0.8">0.8倍</option>
                <option value="1" selected>標準</option>
                <option value="1.2">1.2倍</option>
                <option value="1.5">1.5倍</option>
                <option value="2.0">2倍</option>
            </select>
            コメントの速度(倍率)<br>
              <small>※ コメントのレイアウトが一部崩れます</small>
          </label>
        </div>

        <div class="baseFontBolderControl control toggle">
          <label>
            <input type="checkbox" class="checkbox" data-setting-name="baseFontBolder">
            フォントを太くする
          </label>
        </div>

        <p>フォント名</p>
        <span class="info">入力例: 「'游ゴシック', 'メイリオ', '戦国TURB'」</span>
        <input type="text" class="textInput"
          data-setting-name="baseFontFamily">

        <p>投稿者コメントの影の色</p>
        <input type="text" class="textInput" pattern="(#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{6}|^[a-zA-Z]+$)"
          data-setting-name="commentLayer.ownerCommentShadowColor">

        <div class="baseChatScaleControl control toggle">
          <label>
          <select class="baseChatScale" data-setting-name="baseChatScale">
            <option value="0.5">0.5</option>
            <option value="0.6">0.6</option>
            <option value="0.7">0.7</option>
            <option value="0.8">0.8</option>
            <option value="0.9">0.9</option>
            <option value="1"  selected>1.0</option>
            <option value="1.1">1.1</option>
            <option value="1.2">1.2</option>
            <option value="1.3">1.3</option>
            <option value="1.4">1.4</option>
            <option value="1.5">1.5</option>
            <option value="1.6">1.6</option>
            <option value="1.7">1.7</option>
            <option value="1.8">1.8</option>
            <option value="1.9">1.9</option>
            <option value="2.0">2.0</option>
          </select>
          フォントサイズ(倍率)
          </label>
        </div>

        <div class="commentLayerOpacityControl control">
          <label>
          <select class="commentLayerOpacity" data-setting-name="commentLayerOpacity">
            <option value="0.1">90%</option>
            <option value="0.2">80%</option>
            <option value="0.3">70%</option>
            <option value="0.4">60%</option>
            <option value="0.5">50%</option>
            <option value="0.6">40%</option>
            <option value="0.7">30%</option>
            <option value="0.8">20%</option>
            <option value="0.9">10%</option>
            <option value="1" selected>0%</option>
          </select>
          コメントの透明度
          </label>
        </div>

        <div class="commentLayer-textShadowType control">
          <p>コメントの影</p>
          <label>
            <input type="radio"
              name="textShadowType"
              data-setting-name="commentLayer.textShadowType"
              value="">
              標準 (軽い)
          </label>

          <label>
            <input type="radio"
              name="textShadowType"
              data-setting-name="commentLayer.textShadowType"
              value="shadow-type2">
              縁取り
          </label>

          <label>
            <input type="radio"
              name="textShadowType"
              data-setting-name="commentLayer.textShadowType"
              value="shadow-type3">
            ぼかし (重い)
          </label>

          <label>
            <input type="radio"
              name="textShadowType"
              data-setting-name="commentLayer.textShadowType"
              value="shadow-stroke">
              縁取り2 (対応ブラウザのみ。やや重い)
          </label>

          <label style="font-family: 'dokaben_ver2_1' !important;">
            <input type="radio"
              name="textShadowType"
              data-setting-name="commentLayer.textShadowType"
              value="shadow-dokaben">
              ドカベン <s>(飽きたら消します)</s>
          </label>

        </div>

      <div class="backCommentControl control toggle">
        <label>
          <input type="checkbox" class="checkbox" data-setting-name="backComment">
          コメントを動画の後ろに流す
        </label>
      </div>

      </div>

      <p class="caption">NG設定</p>
      <div class="filterEditContainer forGuest">
        設定の変更はログイン中のみ可能です。<br>
        非ログインでも、設定済みの内容は反映されます。
      </div>
      <div class="filterEditContainer forMember">
        <span class="info">
          １行ごとに入力。上限はありませんが、増やしすぎると重くなります。
        </span>
        <p>NGワード</p>
        <textarea
          class="filterEdit wordFilterEdit"
          data-command-name="setWordFilterList"></textarea>
        <p>NGコマンド</p>
        <textarea
          class="filterEdit commandFilterEdit"
          data-command-name="setCommandFilterList"></textarea>
        <p>NGユーザー</p>
        <textarea
          class="filterEdit userIdFilterEdit"
          data-command-name="setUserIdFilterList"></textarea>
      </div>

      <p class="caption">インポート・エクスポート</p>
      <div class="import-export">
        <button class="export-config-button" data-command="export-config">ファイルに保存</button>
        <input type="file" class="import-config-file-select" accept=".json" data-command="nop">
        <div class="import-config-file-select-label">ファイルから読み込む</div>
      </div>
    </div>
  </div>
  `.trim();

//===END===
//

export { SettingPanel };
