import * as _ from 'lodash';
import { Emitter } from './baselib';
import { css } from '../packages/lib/src/css/css';
import { uq } from '../packages/lib/src/uQuery';
import type { ConfigStore } from './Config';

interface CommentInputEmitter {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
}

interface CommentInputEmitterCtor {
  new (): CommentInputEmitter;
}

export interface CommentInputUq {
  append(content: unknown): CommentInputUq;
  find(selector: string): CommentInputUq;
  on(event: string, listener: (e: unknown) => void, options?: unknown): CommentInputUq;
  addClass(name: string): CommentInputUq;
  removeClass(name: string): CommentInputUq;
  hasClass(name: string): boolean;
  hasFocus(): boolean;
  toggleClass(name: string, force?: boolean): CommentInputUq;
  val(): string;
  val(value: string): CommentInputUq;
  focus(): CommentInputUq;
  blur(): CommentInputUq;
  prop(name: string, value?: unknown): unknown;
}

export interface CommentInputPanelParams {
  $playerContainer: CommentInputUq;
  playerConfig: ConfigStore;
}

interface CommentInputCss {
  addStyle(cssText: string): void;
}

interface CommentInputUqStatic {
  html(tpl: string): unknown;
}
//===BEGIN===
class CommentInputPanel extends (Emitter as unknown as CommentInputEmitterCtor) {
  static __css__: string;
  static __tpl__: string;
  private _$playerContainer!: CommentInputUq;
  private config!: ConfigStore;
  private _$view!: CommentInputUq;
  private _$input!: CommentInputUq;
  private _$form!: CommentInputUq;
  private _$autoPause!: CommentInputUq;
  private _$commandInput!: CommentInputUq;
  private _$commentInput!: CommentInputUq;
  private _$commentSubmit!: CommentInputUq;
  private _hasFocus!: boolean;
  constructor(params: CommentInputPanelParams) {
    super();

    this._$playerContainer = params.$playerContainer;
    this.config = params.playerConfig;

    this._initializeDom();

    this.config.onkey('autoPauseCommentInput', this._onAutoPauseCommentInputChange.bind(this));
  }
  _initializeDom(): void {
    const $container = this._$playerContainer;
    const config = this.config;

    (css as unknown as CommentInputCss).addStyle(CommentInputPanel.__css__);
    $container.append((uq as unknown as CommentInputUqStatic).html(CommentInputPanel.__tpl__));

    const $view = (this._$view = $container.find('.commentInputPanel'));
    const $input = (this._$input = $view.find('.commandInput, .commentInput'));
    this._$form = $container.find('form');
    const $autoPause = (this._$autoPause = $container.find('.autoPause'));
    this._$commandInput = $container.find('.commandInput');
    const $cmt = (this._$commentInput = $container.find('.commentInput'));
    this._$commentSubmit = $container.find('.commentSubmit');
    const preventEsc = (e: unknown): void => {
      if ((e as { keyCode?: number }).keyCode === 27) {
        // ESC
        (e as { preventDefault(): void }).preventDefault();
        (e as { stopPropagation(): void }).stopPropagation();
        this.emit('esc');
        (e as { target: { blur(): void } }).target.blur();
      }
    };

    $input
      .on('focus', this._onFocus.bind(this))
      .on('blur', _.debounce(this._onBlur.bind(this), 500))
      .on('keydown', preventEsc)
      .on('keyup', preventEsc);

    $autoPause.prop('checked', config.props.autoPauseCommentInput);
    this._$autoPause.on('change', (ev: unknown) => {
      config.props.autoPauseCommentInput = (ev as { target: HTMLInputElement }).target.checked;
      $cmt.focus();
    });
    this._$view.find('label').on('click', (e: unknown) => (e as { stopPropagation(): void }).stopPropagation());
    this._$form.on('submit', this._onSubmit.bind(this));
    this._$commentSubmit.on('click', this._onSubmitButtonClick.bind(this));
    $view
      .on('click', (e: unknown) => (e as { stopPropagation(): void }).stopPropagation())
      .on('paste', (e: unknown) => (e as { stopPropagation(): void }).stopPropagation());
  }
  _onFocus(): void {
    if (!this._hasFocus) {
      this.emit('focus', this.isAutoPause);
    }
    this._hasFocus = true;
  }
  _onBlur(): void {
    if (this._$commandInput.hasFocus() || this._$commentInput.hasFocus()) {
      return;
    }
    this.emit('blur', this.isAutoPause);

    this._hasFocus = false;
  }
  _onSubmit(): void {
    this.submit();
  }
  _onSubmitButtonClick(): void {
    this.submit();
  }
  _onAutoPauseCommentInputChange(val: unknown): void {
    this._$autoPause.prop('checked', !!val);
  }
  submit(): void {
    const chat = this._$commentInput.val().trim();
    const cmd = this._$commandInput.val().trim();
    if (!chat.length) {
      return;
    }

    setTimeout(() => {
      this._$commentInput.val('').blur();
      this._$commandInput.blur();

      const $view = this._$view.addClass('updating');
      new Promise((resolve, reject) => this.emit('post', { resolve, reject }, chat, cmd))
        .then(() => $view.removeClass('updating'))
        .catch(() => $view.removeClass('updating'));
    }, 0);
  }
  get isAutoPause(): boolean {
    return this.config.props.autoPauseCommentInput;
  }
  focus(): void {
    this._$commentInput.focus();
    this._onFocus();
  }
  blur() {
    this._$commandInput.blur();
    this._$commentInput.blur();
    this._onBlur();
  }
}

CommentInputPanel.__css__ = `
  .commentInputPanel {
    position: fixed;
    top:  calc(-50vh + 50% + 100vh);
    left: 50vw;
    box-sizing: border-box;

    width: 200px;
    height: 50px;
    z-index: 30000;
    transform: translate(-50%, -170px);
    overflow: visible;
  }
  .is-notPlayed .commentInputPanel,
  .is-waybackMode .commentInputPanel,
  .is-mymemory .commentInputPanel,
  .is-loading  .commentInputPanel,
  .is-error    .commentInputPanel {
    display: none;
  }

  .commentInputPanel:focus-within {
    width: 500px;
    z-index: 100000;
  }
  .futatsumeScreenMode_wide .commentInputPanel,
  .is-fullscreen           .commentInputPanel {
    position: absolute !important; /* fixedだとFirefoxのバグで消える */
    top:  auto !important;
    bottom: 120px !important;
    transform: translate(-50%, 0);
    left: 50%;
  }

  .commentInputPanel>* {
    pointer-events: none;
  }

  .commentInputPanel input {
    font-size: 18px;
  }

  .commentInputPanel:focus-within>*,
  .commentInputPanel:hover>* {
    pointer-events: auto;
  }

  .is-mouseMoving .commentInputOuter {
    border: 1px solid #888;
    box-sizing: border-box;
    border-radius: 8px;
    opacity: 0.5;
  }
  .is-mouseMoving:not(:focus-within) .commentInputOuter {
    box-shadow: 0 0 8px #fe9, 0 0 4px #fe9 inset;
  }

  .commentInputPanel:focus-within .commentInputOuter,
  .commentInputPanel:hover  .commentInputOuter {
    border: none;
    opacity: 1;
  }

  .commentInput {
    width: 100%;
    height: 30px !important;
    font-size: 24px;
    background: transparent;
    border: none;
    opacity: 0;
    transition: opacity 0.3s ease, box-shadow 0.4s ease;
    text-align: center;
    line-height: 26px !important;
    padding-right: 32px !important;
    margin-bottom: 0 !important;
  }

  .commentInputPanel:hover  .commentInput {
    opacity: 0.5;
  }
  .commentInputPanel:focus-within .commentInput {
    opacity: 0.9 !important;
  }
  .commentInputPanel:focus-within .commentInput,
  .commentInputPanel:hover  .commentInput {
    box-sizing: border-box;
    border: 1px solid #888;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 0 8px #fff;
    color: #000;
  }
  .commentInputPanel:focus-within :where(.commandInput, .commentSubmit) {
    background: #fff;
    color: #000;
  }

  .commentInputPanel .autoPauseLabel {
    position: absolute;
    width: 145px;
    height: 21px !important;
    font-size: 13px;
    top: 9px;
    left: 50%;
    transform: translate(-50%, 0);
    background: #336;
    z-index: -1;
    opacity: 0;
    transition: top 0.2s ease, opacity 0.2s ease;
    text-align: center;
    color: #ccc;
  }
  .commentInputPanel:focus-within .autoPauseLabel {
    top: 36px;
    z-index: 100;
    opacity: 1;
  }

  .commandInput {
    position: absolute;
    width: 100px;
    height: 30px !important;
    font-size: 24px;
    top: 0;
    left: 0;
    border-radius: 8px;
    z-index: -1;
    opacity: 0;
    transition: left 0.2s ease, opacity 0.2s ease;
    text-align: center;
    line-height: 26px !important;
    padding: 0 !important;
    margin-bottom: 0 !important;
  }
  .commentInputPanel:focus-within .commandInput {
    left: -108px;
    z-index: 1;
    opacity: 0.9;
    border: none;
    pointer-evnets: auto;
    box-shadow: 0 0 8px #fff;
    padding: 0;
  }

  .commentSubmit {
    position: absolute;
    width: 100px !important;
    height: 30px !important;
    font-size: 24px;
    top: 0;
    right: 0;
    border: none;
    border-radius: 8px;
    z-index: -1;
    opacity: 0;
    transition: right 0.2s ease, opacity 0.2s ease;
    line-height: 26px;
    letter-spacing: 0.2em;
  }
  .commentInputPanel:focus-within .commentSubmit {
    right: -108px;
    z-index: 1;
    opacity: 0.9;
    box-shadow: 0 0 8px #fff;
  }
  .commentInputPanel:focus-within .commentSubmit:active {
    color: #000;
    background: #fff;
    box-shadow: 0 0 16px #ccf;
  }
`.trim();

CommentInputPanel.__tpl__ = `
  <div class="commentInputPanel forMember" autocomplete="new-password">
    <form action="javascript: void(0);">
      <div class="commentInputOuter">
        <input
          type="text"
          value=""
          autocomplete="on"
          name="mail"
          placeholder="コマンド"
          class="commandInput"
          maxlength="30"
        >
        <input
          type="text"
          value=""
          autocomplete="off"
          name="chat"
          accesskey="c"
          placeholder="コメント入力(C)"
          class="commentInput"
          maxlength="75"
          >
        <input
          type="submit"
          value="送信"
          name="post"
          class="commentSubmit"
          >
        <div class="recButton" title="音声入力">
        </div>
    </div>
    </form>
    <label class="autoPauseLabel">
      <input type="checkbox" class="autoPause" checked="checked">
      入力時に一時停止
    </label>
  </div>
`.trim();

//===END===
//

export { CommentInputPanel };
