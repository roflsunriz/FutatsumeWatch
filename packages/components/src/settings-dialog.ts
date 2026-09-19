import { SETTINGS_DIALOG_THEME } from './settings-dialog-theme';

export type SettingsPanel = 'general' | 'advanced' | 'hls' | 'masked' | 'gamepad' | 'heatsync';
const labels = {
  ja: {
    general: '一般設定',
    advanced: '詳細設定',
    hls: 'HLS',
    masked: 'MaskedWatch',
    gamepad: 'GamePad',
    heatsync: 'HeatSync',
    close: '閉じる',
  },
  en: {
    general: 'General settings',
    advanced: 'Advanced settings',
    hls: 'HLS',
    masked: 'MaskedWatch',
    gamepad: 'GamePad',
    heatsync: 'HeatSync',
    close: 'Close',
  },
};
const activeSettings: { dialog?: SettingsDialog } = {};
export function closeSettingsDialog(): void {
  activeSettings.dialog?.close();
}

/** Shared native modal: preserves each panel's inputs and save handlers. */
export class SettingsDialog {
  private active = false;
  private outsidePress = false;
  private outsideRelease = false;
  readonly content: HTMLDivElement;
  constructor(
    readonly element: HTMLDialogElement,
    name: SettingsPanel,
    private readonly onClose: () => void
  ) {
    const text = labels[navigator.language.startsWith('ja') ? 'ja' : 'en'];
    element.dataset.fwSettings = name;
    element.classList.add('fw-settings-dialog');
    element.setAttribute('aria-label', text[name]);
    const root = element.getRootNode();
    const styleRoot = root instanceof ShadowRoot ? root : document.head;
    if (!styleRoot.querySelector('[data-fw-settings-theme]')) {
      const style = document.createElement('style');
      style.dataset.fwSettingsTheme = '';
      style.textContent = SETTINGS_DIALOG_THEME;
      styleRoot.append(style);
    }
    this.content = document.createElement('div');
    this.content.className = 'fw-modal-content';
    const body = document.createElement('div');
    body.className = 'fw-modal-body';
    body.append(...element.childNodes);
    const header = document.createElement('header');
    header.className = 'fw-modal-heading';
    const title = document.createElement('h2');
    title.textContent = text[name];
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'fw-modal-close';
    close.dataset.settingsClose = '';
    close.setAttribute('aria-label', text.close);
    close.textContent = '×';
    close.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });
    header.append(title, close);
    this.content.append(header, body);
    element.append(this.content);
    element.addEventListener(
      'pointerdown',
      (event) => {
        this.outsidePress = event.target === element;
        this.outsideRelease = false;
      },
      true
    );
    element.addEventListener('pointercancel', () => {
      this.outsidePress = false;
      this.outsideRelease = false;
    });
    element.addEventListener(
      'pointerup',
      (event) => {
        this.outsideRelease = event.target === element;
      },
      true
    );
    element.addEventListener(
      'click',
      (event) => {
        if (event.target !== element) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.outsidePress && this.outsideRelease) this.close();
        this.outsidePress = false;
        this.outsideRelease = false;
      },
      true
    );
    element.addEventListener('click', (event) => event.stopPropagation());
    element.addEventListener('keydown', (event) => event.stopPropagation());
    element.addEventListener('cancel', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });
    element.addEventListener('close', () => {
      if (!element.open) this.finishClose();
    });
  }
  open(): void {
    if (this.element.open) return;
    if (activeSettings.dialog && activeSettings.dialog !== this) activeSettings.dialog.close();
    this.element.showModal();
    this.active = true;
    activeSettings.dialog = this;
  }
  close(): void {
    if (this.element.open) this.element.close();
    this.finishClose();
  }
  private finishClose(): void {
    if (!this.active) return;
    this.active = false;
    this.outsidePress = false;
    this.outsideRelease = false;
    if (activeSettings.dialog === this) activeSettings.dialog = undefined;
    this.onClose();
  }
}
