import { SETTINGS_DIALOG_THEME } from './settings-dialog-theme';
import { domEvent } from '../../lib/src/dom/dom-event';

export type SettingsPanel = 'general';
type SettingsTab = 'player' | 'comments' | 'filters';
const tabs: readonly SettingsTab[] = ['player', 'comments', 'filters'];
const navigation: { section: SettingsTab } = {
  section: 'player',
};
let createSidebarExtras: (() => HTMLElement) | undefined;
export function configureSettingsNavigation(sidebarExtras?: () => HTMLElement): void {
  createSidebarExtras = sidebarExtras;
}
const labels = {
  ja: {
    general: '一般設定',
    player: 'プレイヤー',
    comments: 'コメント・フォント',
    filters: 'NG・フィルター',
    import: 'インポート',
    export: 'エクスポート',
    navigation: '設定カテゴリ',
    close: '閉じる',
  },
  en: {
    general: 'General settings',
    player: 'Player',
    comments: 'Comments & fonts',
    filters: 'Filters',
    import: 'Import',
    export: 'Export',
    navigation: 'Settings categories',
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
  private readonly body: HTMLDivElement;
  private readonly sidebar: HTMLElement;
  private readonly sidebarExtras: HTMLDivElement;
  private readonly heading: HTMLHeadingElement;
  constructor(
    readonly element: HTMLDialogElement,
    private readonly name: SettingsPanel,
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
    const body = (this.body = document.createElement('div'));
    body.className = 'fw-modal-body';
    body.id = `fw-settings-body-${name}`;
    body.append(...element.childNodes);
    const layout = document.createElement('div');
    layout.className = 'fw-settings-layout';
    this.sidebar = document.createElement('nav');
    this.sidebar.className = 'fw-settings-sidebar';
    this.sidebar.setAttribute('aria-label', text.navigation);
    const brand = document.createElement('div');
    brand.className = 'fw-settings-brand';
    const menuMark = document.createElement('span');
    menuMark.className = 'fw-settings-brand-mark';
    menuMark.textContent = '☰';
    menuMark.setAttribute('aria-hidden', 'true');
    const brandText = document.createElement('span');
    const product = document.createElement('strong');
    product.textContent = 'FutatsumeWatch';
    const version = document.createElement('small');
    version.textContent = `v${document.querySelector<HTMLElement>('[data-futatsume-entry]')?.dataset.futatsumeVersion ?? ''}`;
    brandText.append(product, version);
    brand.append(menuMark, brandText);
    this.sidebar.append(brand);
    const tablist = document.createElement('div');
    tablist.className = 'fw-settings-tabs';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-orientation', 'vertical');
    tablist.setAttribute('aria-label', text.navigation);
    this.sidebar.append(tablist);
    for (const tab of tabs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.settingsTab = tab;
      button.id = `fw-settings-tab-${name}-${tab}`;
      button.setAttribute('role', 'tab');
      button.textContent = text[tab];
      button.addEventListener('click', () => this.selectTab(tab));
      button.addEventListener('keydown', (event) => {
        const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        let index = tabs.indexOf(tab);
        if (direction) index = (index + direction + tabs.length) % tabs.length;
        else if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = tabs.length - 1;
        else return;
        event.preventDefault();
        event.stopPropagation();
        const next = this.sidebar.querySelector<HTMLButtonElement>(`[data-settings-tab="${tabs[index]}"]`);
        next?.focus();
        next?.click();
      });
      tablist.append(button);
    }
    const transfers = document.createElement('div');
    transfers.className = 'fw-settings-file-actions';
    for (const action of ['import', 'export'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.settingsFileAction = action;
      button.textContent = text[action];
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        domEvent.dispatchCommand(element, `${action}-config`, undefined);
      });
      transfers.append(button);
    }
    this.sidebar.append(transfers);
    this.sidebarExtras = document.createElement('div');
    this.sidebarExtras.className = 'fw-settings-sidebar-extras';
    this.sidebar.append(this.sidebarExtras);
    const header = document.createElement('header');
    header.className = 'fw-modal-heading';
    const title = (this.heading = document.createElement('h2'));
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
    const main = document.createElement('div');
    main.className = 'fw-settings-main';
    main.append(header, body);
    layout.append(this.sidebar, main);
    this.content.append(layout);
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
    this.sidebarExtras.replaceChildren(...(createSidebarExtras ? [createSidebarExtras()] : []));
    this.syncTabs();
    if (this.element.open) return;
    if (activeSettings.dialog && activeSettings.dialog !== this) activeSettings.dialog.close();
    this.element.showModal();
    this.active = true;
    activeSettings.dialog = this;
  }
  private selectTab(tab: SettingsTab): void {
    navigation.section = tab;
    this.syncTabs();
    this.body.scrollTop = 0;
  }
  private syncTabs(): void {
    const text = labels[navigator.language.startsWith('ja') ? 'ja' : 'en'];
    const selected = navigation.section;
    this.heading.textContent = text[selected];
    for (const button of this.sidebar.querySelectorAll<HTMLButtonElement>('[data-settings-tab]')) {
      const tab = button.dataset.settingsTab as SettingsTab;
      const active = tab === selected;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      button.setAttribute('aria-controls', `fw-settings-section-${tab}`);
    }
    const sections = this.body.querySelectorAll<HTMLElement>('[data-settings-section]');
    this.body.setAttribute('role', sections.length ? 'presentation' : 'tabpanel');
    if (!sections.length) this.body.setAttribute('aria-labelledby', `fw-settings-tab-${this.name}-${selected}`);
    for (const section of sections) {
      const tab = section.dataset.settingsSection;
      section.id = `fw-settings-section-${tab}`;
      section.setAttribute('role', 'tabpanel');
      section.setAttribute('aria-labelledby', `fw-settings-tab-general-${tab}`);
      section.hidden = tab !== selected;
    }
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
