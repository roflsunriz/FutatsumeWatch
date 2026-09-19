import { BaseCommandElement } from './BaseCommandElement';
import { SettingsDialog } from '../settings-dialog';
import type { TemplateResult } from 'lit/html.js';
import type { CommandDetail, ElementEvents, LitModule, PropsMap, StateMap } from './BaseCommandElement';

export type HtmlTag = LitModule['html'];
const DialogProps: PropsMap = {};

class DialogElement extends BaseCommandElement {
  private _dialog: HTMLDialogElement | null = null;
  private modal?: SettingsDialog;
  static get propTypes(): PropsMap {
    return DialogProps;
  }
  static get defaultProps(): PropsMap {
    return DialogProps;
  }
  static get defaultState(): StateMap {
    return { isOpen: false };
  }
  static getContentsTemplate(
    _html: HtmlTag,
    _state: StateMap = {},
    _props: PropsMap = {},
    _events: ElementEvents = {}
  ): Promise<TemplateResult | null> {
    return Promise.resolve(null);
  }
  static async getTemplate(
    state: StateMap = {},
    props: PropsMap = {},
    events: ElementEvents = {}
  ): Promise<TemplateResult> {
    const { html } = await this.importLit();
    const contents = state.isOpen ? await this.getContentsTemplate(html, state, props, events) : null;
    return html`<div id="root" @click=${events.onClick}>
      <dialog class="dialog">
        <form @change=${events.onChange} @keydown=${events.onKeyDown} @keyup=${events.onKeyUp}>${contents}</form>
      </dialog>
    </div>`;
  }
  constructor() {
    super();
    Object.assign(this.events, {
      onChange: this.onChange.bind(this),
      onKeyDown: this.onKey.bind(this),
      onKeyUp: this.onKey.bind(this),
    });
  }
  async render(): Promise<void> {
    await super.render();
    const dialog = this._root?.querySelector<HTMLDialogElement>('.dialog');
    if (!dialog) return;
    if (dialog !== this._dialog) {
      this._dialog = dialog;
      this.modal = new SettingsDialog(dialog, 'general', () => this.setState({ isOpen: false }));
    }
    if (this.isOpen) {
      const wasOpen = dialog.open;
      this.modal?.open();
      if (!wasOpen) this.onOpen();
    } else this.modal?.close();
  }
  get isOpen(): boolean {
    return this.state.isOpen === true;
  }
  set isOpen(value: boolean) {
    if (value) this.open();
    else this.close();
  }
  get dialog(): Element | null {
    return this._dialog;
  }
  open(): void {
    this.setState({ isOpen: true });
  }
  close(): void {
    this.modal?.close();
    this.setState({ isOpen: false });
  }
  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }
  onCommand(event: Event): void {
    if ((event as CustomEvent<CommandDetail>).detail.command !== 'close') return;
    this.close();
    event.stopPropagation();
    event.preventDefault();
  }
  onChange(_event: Event): void {}
  onOpen(): void {}
  onKey(event: Event): void {
    event.stopPropagation();
  }
}

export { DialogElement, DialogProps };
