import { Emitter } from './baselib';
import type { ConfigStore } from './config';
import type { PlayerState } from './state';
import { commentFormText, commentFormTemplate, commandGroups } from './comment-input-view';

export interface CommentInputPanelParams {
  playerContainer: HTMLElement;
  playerConfig: {
    props: Pick<ConfigStore['props'], 'autoPauseCommentInput'>;
    onkey(key: string, listener: () => void): unknown;
  };
  playerState: Pick<
    PlayerState,
    'isRegularUser' | 'isOpen' | 'isLoading' | 'isCommentReady' | 'isWaybackMode' | 'isMymemory' | 'isError'
  > & { onkey(key: string, listener: () => void): unknown };
  isLoggedIn: boolean;
}

export class CommentInputPanel extends Emitter {
  readonly element: HTMLFormElement;
  private readonly text = commentFormText(navigator.language);
  private readonly input: HTMLTextAreaElement;
  private readonly commands: HTMLInputElement;
  private readonly palette: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly autoPause: HTMLInputElement;
  private readonly status: HTMLElement;
  private posting = false;
  private composing = false;
  private hasFocus = false;
  private revision = 0;

  constructor(private readonly params: CommentInputPanelParams) {
    super();
    this.element = document.createElement('form');
    this.element.className = 'commentInputPanel';
    this.element.setAttribute('aria-label', this.text.comment);
    this.element.innerHTML = commentFormTemplate(this.text, !params.playerState.isRegularUser);
    params.playerContainer.append(this.element);
    this.input = this.require('.commentInput');
    this.commands = this.require('.commandInput');
    this.palette = this.require('.commentCommandPalette');
    this.toggle = this.require('[data-comment-palette]');
    this.autoPause = this.require('.autoPause');
    this.status = this.require('.commentPostStatus');
    this.autoPause.checked = this.isAutoPause;
    params.playerConfig.onkey('autoPauseCommentInput', () => (this.autoPause.checked = this.isAutoPause));
    for (const key of ['isOpen', 'isLoading', 'isCommentReady', 'isWaybackMode', 'isMymemory', 'isError'])
      params.playerState.onkey(key, () => this.updateAvailability());
    this.autoPause.addEventListener('change', () => {
      params.playerConfig.props.autoPauseCommentInput = this.autoPause.checked;
    });
    this.element.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });
    this.input.addEventListener('input', () => this.updateCount());
    this.input.addEventListener('compositionstart', () => (this.composing = true));
    this.input.addEventListener('compositionend', () => (this.composing = false));
    this.input.addEventListener('focus', () => this.setPalette(false));
    this.element.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        this.emit('esc');
        if (!this.palette.hidden) {
          this.setPalette(false);
          this.toggle.focus();
        } else this.blur();
      } else if (event.key === 'Enter' && !event.shiftKey && event.target === this.input) {
        if (event.isComposing || this.composing || event.keyCode === 229) return;
        event.preventDefault();
        void this.submit();
      }
    });
    this.element.addEventListener('keyup', (event) => event.stopPropagation());
    for (const name of ['click', 'dblclick', 'paste'])
      this.element.addEventListener(name, (event) => event.stopPropagation());
    this.element.addEventListener('focusin', () => {
      if (!this.hasFocus) this.emit('focus', this.isAutoPause);
      this.hasFocus = true;
    });
    this.element.addEventListener('focusout', (event) => {
      if (event.relatedTarget instanceof Node && this.element.contains(event.relatedTarget)) return;
      setTimeout(() => {
        if (this.element.contains(document.activeElement)) return;
        this.setPalette(false);
        this.endFocus();
      }, 0);
    });
    this.toggle.addEventListener('click', () => this.setPalette(this.palette.hidden));
    this.commands.addEventListener('input', () => this.updateSelection());
    this.palette.addEventListener('click', (event) => {
      const button =
        event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-comment-command]') : null;
      if (!button) return;
      const command = button.dataset.commentCommand!;
      const group = Object.values(commandGroups).find((values) => values.some(([value]) => value === command));
      const current = this.commands.value.split(/\s+/).filter(Boolean);
      this.commands.value =
        command === 'reset'
          ? ''
          : [...current.filter((value) => !group?.some(([item]) => item === value)), command].join(' ');
      this.updateSelection();
    });
    params.playerContainer.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Node && !this.element.contains(event.target)) this.setPalette(false);
    });
    this.updateAvailability();
  }

  private require<T extends HTMLElement>(selector: string): T {
    const element = this.element.querySelector<T>(selector);
    if (!element) throw new Error(`Comment form missing: ${selector}`);
    return element;
  }
  get isAutoPause(): boolean {
    return this.params.playerConfig.props.autoPauseCommentInput;
  }
  updateViewer({ isLoggedIn, isPremium }: { isLoggedIn: boolean; isPremium: boolean }): void {
    this.params.isLoggedIn = isLoggedIn;
    const template = document.createElement('template');
    template.innerHTML = commentFormTemplate(this.text, isLoggedIn && isPremium);
    this.require('.commentColorOptions').replaceChildren(
      ...template.content.querySelector('.commentColorOptions')!.childNodes
    );
    this.updateSelection();
    this.updateAvailability();
  }
  private get unavailable(): string {
    const state = this.params.playerState;
    if (!this.params.isLoggedIn) return this.text.login;
    if (state.isWaybackMode || state.isMymemory) return this.text.readOnly;
    if (!state.isOpen || state.isLoading || !state.isCommentReady || state.isError) return this.text.notReady;
    return '';
  }
  private updateAvailability(): void {
    this.input.disabled = this.posting || !!this.unavailable;
    this.require<HTMLButtonElement>('.commentSubmit').disabled = this.input.disabled;
    this.element.setAttribute('aria-busy', String(this.posting));
    this.element.dataset.posting = String(this.posting);
    this.palette.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button').forEach((element) => {
      element.disabled = this.posting;
    });
    if (this.unavailable) this.setStatus(this.unavailable);
    else if (this.status.dataset.state === 'unavailable') this.setStatus('');
    if (this.unavailable) this.status.dataset.state = 'unavailable';
  }
  private setStatus(message: string, error = false): void {
    this.status.textContent = message;
    this.status.dataset.state = error ? 'error' : 'info';
  }
  private updateCount(): void {
    this.require('.commentCount').textContent = `${this.input.value.length}/75`;
  }
  private updateSelection(): void {
    const commands = this.commands.value.split(/\s+/);
    this.palette.querySelectorAll<HTMLButtonElement>('[data-comment-command]').forEach((button) => {
      button.setAttribute('aria-pressed', String(commands.includes(button.dataset.commentCommand!)));
    });
    this.toggle.title = this.commands.value || this.text.palette;
  }
  private setPalette(open: boolean): void {
    this.palette.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }
  private endFocus(): void {
    if (!this.hasFocus) return;
    this.hasFocus = false;
    this.emit('blur', this.isAutoPause);
  }
  async submit(): Promise<void> {
    if (this.posting || this.composing || this.unavailable) return;
    const body = this.input.value;
    if (!body.trim() || body.length > 75) {
      this.setStatus(body.length > 75 ? this.text.tooLong : this.text.empty, true);
      this.input.focus();
      return;
    }
    const revision = this.revision;
    this.posting = true;
    this.setPalette(false);
    this.setStatus(this.text.posting);
    this.updateAvailability();
    try {
      await new Promise<void>((resolve, reject) =>
        this.emit('post', { resolve, reject }, body, this.commands.value.trim())
      );
      if (revision !== this.revision) return;
      this.input.value = '';
      this.updateCount();
      this.setStatus(this.text.success);
    } catch (error) {
      if (revision !== this.revision) return;
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
            ? error.message
            : this.text.failure;
      this.setStatus(message || this.text.failure, true);
    } finally {
      if (revision === this.revision) {
        this.posting = false;
        this.updateAvailability();
        if (!this.unavailable) this.input.focus();
      }
    }
  }
  reset(): void {
    this.revision++;
    this.posting = false;
    this.composing = false;
    this.blur();
    this.input.value = '';
    this.updateCount();
    this.setStatus('');
    this.updateAvailability();
  }
  focus(): void {
    this.input.focus();
  }
  blur(): void {
    this.setPalette(false);
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.element.contains(active)) active.blur();
    this.endFocus();
  }
}
