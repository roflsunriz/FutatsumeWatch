import type { ConfigStore } from './config';
import type { PlayerState } from './state';
import { closeSettingsDialog, configureSettingsNavigation } from '../packages/components/src/settings-dialog';
import { shellButton, shellIcon, shellText } from './player-shell-view';

interface ShellPlayer {
  currentTime: number;
  duration: number;
  volume: number;
}
interface ShellVideo {
  title: string;
  postedAt: string | number;
  count: { view: number; comment: number; mylist: number; like?: number };
  domandInfo?: { availableVideos: ReadonlyArray<{ label?: string; height: number }> } | null;
}
export class ABRepeat {
  start: number | null = null;
  end: number | null = null;
  advance(time: number): boolean {
    if (!Number.isFinite(time) || time < 0) return false;
    if (this.end !== null) this.clear();
    else if (this.start === null) this.start = time;
    else if (time > this.start + 0.1) this.end = time;
    else return false;
    return true;
  }
  clear(): void {
    this.start = this.end = null;
  }
  seekTarget(time: number): number | null {
    return this.start !== null && this.end !== null && time >= this.end ? this.start : null;
  }
}

export class PlayerShell {
  private readonly text = shellText(navigator.language);
  private readonly controls: HTMLElement;
  private readonly backdrop: HTMLButtonElement;
  private readonly info: HTMLElement;
  private readonly detailsLockButton: HTMLButtonElement;
  private readonly playButton: HTMLButtonElement;
  private readonly abButton: HTMLButtonElement;
  private readonly volume: HTMLInputElement;
  private readonly speed: HTMLSelectElement;
  private readonly timeLabel: HTMLElement;
  private readonly ab = new ABRepeat();
  private panel: 'details' | null = null;
  private detailsLocked = false;
  private qualityLabels: string[] = [];
  private activeQuality: HTMLSelectElement | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private clockTimer: ReturnType<typeof setInterval> | undefined;
  private focusReturn: HTMLElement | null = null;
  private keyboardFocus = false;
  private pointerDown = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly config: ConfigStore,
    private readonly state: PlayerState,
    private readonly player: ShellPlayer,
    private readonly command: (name: string, param?: string | number) => void,
    private readonly generalSettings: () => void,
    private readonly layoutChanged: () => void
  ) {
    configureSettingsNavigation(
      (panel) => {
        if (panel === 'general') this.generalSettings();
        else this.container.querySelector<HTMLElement>('[data-command="toggleAdvancedSettings"]')?.click();
      },
      () => this.createSettingsSidebarExtras()
    );
    container.classList.add('fw-player');
    this.info = this.require('.futatsumeWatchVideoInfoPanel');
    this.info.id = 'fw-details';
    this.info.setAttribute('aria-label', this.text.details);
    this.info.setAttribute('role', 'region');
    this.info.inert = true;
    this.detailsLockButton = document.createElement('button');
    this.detailsLockButton.type = 'button';
    this.detailsLockButton.className = 'fw-details-lock';
    this.detailsLockButton.dataset.shellAction = 'details-lock';
    this.detailsLockButton.setAttribute('aria-pressed', 'false');
    this.updateDetailsLockButton();
    this.require('.tabSelectContainer').append(this.detailsLockButton);
    this.controls = document.createElement('div');
    this.controls.className = 'fw-controls';
    const t = this.text;
    this.controls.innerHTML = `
      <header class="fw-header">
        ${shellButton('settings', t.settings, 'menu')}
        <div class="fw-heading"><div class="fw-title"></div><div class="fw-stats"></div></div>
        ${shellButton('details', t.details, 'details', 'aria-expanded="false" aria-controls="fw-details"')}
        ${shellButton('close', t.close, 'close')}
      </header>
      <div class="fw-transport">
        ${shellButton('playPreviousVideo', t.previous, 'previous')}
        ${shellButton('togglePlay', t.play, 'play')}
        ${shellButton('playNextVideo', t.next, 'next')}
      </div>
      <div class="fw-bottom">
        ${shellButton('toggle-loop', t.repeat, 'repeat', 'aria-pressed="false"')}
        <button type="button" data-shell-action="ab" aria-label="${t.setA}" title="${t.helpAB}">A↔B</button>
        <label class="fw-speed" title="${t.speed}">${shellIcon('speed')}<select aria-label="${t.speed}" data-shell-speed>
          ${[0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4, 5, 10].map((v) => `<option value="${v}">${v}×</option>`).join('')}
        </select></label>
        ${shellButton('toggle-mute', t.mute, 'volume', 'aria-pressed="false"')}
        <input data-shell-volume type="range" min="0" max="1" step="0.01" aria-label="${t.volume}">
        <span class="fw-time"></span>
        ${shellButton('toggle-showComment', t.comments, 'comment', 'aria-pressed="true"')}
        ${shellButton('fullscreen', t.fullscreen, 'fullscreen')}
      </div>
      <span class="fw-announcement" role="status" aria-live="polite"></span>`;
    this.backdrop = document.createElement('button');
    this.backdrop.type = 'button';
    this.backdrop.className = 'fw-backdrop';
    this.backdrop.setAttribute('aria-label', t.close);
    this.backdrop.tabIndex = -1;
    this.backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPanel(null);
    });
    container.append(this.controls, this.backdrop);
    this.playButton = this.require('[data-shell-action="togglePlay"]');
    this.abButton = this.require('[data-shell-action="ab"]');
    this.volume = this.require('[data-shell-volume]');
    this.speed = this.require('[data-shell-speed]');
    this.timeLabel = this.require('.fw-time');
    this.volume.after(this.require('.commentInputPanel'));
    for (const root of [this.controls, this.info]) {
      root.addEventListener('click', (e) => this.onClick(e));
      root.addEventListener('keydown', (e) => e.stopPropagation());
    }
    this.speed.addEventListener('change', () => this.command('playbackRate', Number(this.speed.value)));
    this.volume.addEventListener('input', () => this.command('volume', Number(this.volume.value)));
    container.addEventListener('pointermove', () => this.reveal(), { passive: true });
    container.addEventListener(
      'pointerdown',
      () => {
        this.keyboardFocus = false;
        this.pointerDown = true;
        this.reveal();
      },
      true
    );
    container.ownerDocument.addEventListener('pointerup', () => {
      this.pointerDown = false;
      if (this.state.isOpen) this.reveal();
    });
    container.addEventListener('pointercancel', () => {
      this.pointerDown = false;
      this.reveal();
    });
    window.addEventListener('blur', () => {
      this.pointerDown = false;
    });
    container.addEventListener(
      'keydown',
      (e) => {
        this.keyboardFocus = true;
        if (e.key === 'Escape' && this.panel) {
          e.preventDefault();
          e.stopPropagation();
          this.setPanel(null);
        }
        this.reveal();
      },
      true
    );
    container.addEventListener('focusin', () => this.reveal());
    container.addEventListener('focusout', () => {
      this.keyboardFocus = false;
      this.reveal();
    });
    const sync = (): void => this.sync();
    for (const key of ['isPlaying', 'isMute', 'isLoop', 'isShowComment', 'playbackRate', 'currentTab'])
      state.onkey(key, sync);
    for (const key of ['volume', 'domandVideoQuality']) config.onkey(key, sync);
    state.onkey('isOpen', () => (state.isOpen ? this.open() : this.close()));
    this.decorateTabs();
    new MutationObserver(() => this.decorateTabs()).observe(this.require('.tabSelectContainer'), { childList: true });
    this.sync();
  }
  private require<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.container.querySelector<T>(selector);
    if (!element) throw new Error(`Player UI missing: ${selector}`);
    return element;
  }
  private onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-shell-action]') : null;
    if (!target) return;
    event.stopPropagation();
    const action = target.dataset.shellAction!;
    switch (action) {
      case 'details':
        this.setPanel(this.panel === action ? null : action);
        break;
      case 'settings':
        if (this.detailsLocked) {
          this.detailsLocked = false;
          this.updateDetailsLockButton();
        }
        this.setPanel(null, true);
        this.layoutChanged();
        this.generalSettings();
        break;
      case 'details-lock':
        this.detailsLocked = !this.detailsLocked;
        this.updateDetailsLockButton();
        this.setPanel('details', true);
        this.layoutChanged();
        break;
      case 'ab': {
        const accepted = this.ab.advance(this.player.currentTime);
        if (accepted && this.ab.start !== null && this.state.isLoop) this.command('toggle-loop');
        this.updateAB();
        this.require('.fw-announcement').textContent = accepted ? this.abButton.title : this.text.invalidB;
        break;
      }
      case 'toggle-loop':
        this.ab.clear();
        this.updateAB();
        this.command(action);
        break;
      default:
        if (this.panel) this.setPanel(null);
        this.command(action);
    }
    this.reveal();
  }
  private decorateTabs(): void {
    const t = this.text;
    const tabs = {
      videoInfoTab: ['info', 'details'],
      relatedVideoTab: ['related', 'related'],
      comment: ['comment', 'comment'],
      playlist: ['playlist', 'playlist'],
    } as const;
    this.require('.tabSelectContainer').setAttribute('role', 'tablist');
    for (const tab of this.info.querySelectorAll<HTMLElement>('.tabSelect')) {
      const name = tab.dataset.param as keyof typeof tabs;
      const def = tabs[name];
      if (!def) continue;
      if (!tab.dataset.shellTab) {
        tab.dataset.shellTab = name;
        tab.innerHTML = shellIcon(def[1]);
        tab.title = t[def[0]];
        tab.setAttribute('aria-label', t[def[0]]);
        tab.setAttribute('role', 'tab');
        tab.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            tab.click();
          }
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            const siblings = Array.from(this.info.querySelectorAll<HTMLElement>('[data-shell-tab]'));
            const next =
              siblings[
                (siblings.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + siblings.length) % siblings.length
              ];
            next?.click();
            next?.focus();
          }
          event.stopPropagation();
        });
      }
      const selected = this.state.currentTab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = this.info.querySelector<HTMLElement>(`.tabs.${name}`);
      if (panel) {
        panel.id = `fw-tab-${name}`;
        panel.setAttribute('role', 'tabpanel');
        tab.setAttribute('aria-controls', panel.id);
      }
    }
  }
  private updateDetailsLockButton(): void {
    const label = this.detailsLocked ? this.text.unlockDetails : this.text.lockDetails;
    this.detailsLockButton.title = label;
    this.detailsLockButton.setAttribute('aria-label', label);
    this.detailsLockButton.setAttribute('aria-pressed', String(this.detailsLocked));
    this.detailsLockButton.innerHTML = shellIcon(this.detailsLocked ? 'lock' : 'unlock');
    this.container.dataset.detailsLocked = String(this.detailsLocked);
  }
  private createSettingsSidebarExtras(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'fw-settings-utilities';
    const quality = document.createElement('label');
    quality.className = 'fw-quality';
    quality.append(document.createTextNode(this.text.quality));
    const select = document.createElement('select');
    select.dataset.shellQuality = '';
    select.setAttribute('aria-label', this.text.quality);
    select.addEventListener('change', () => this.command('update-domandVideoQuality', select.value));
    quality.append(select);
    this.activeQuality = select;
    this.populateQuality(select);
    const github = document.createElement('a');
    github.href = 'https://github.com/roflsunriz/FutatsumeWatch';
    github.target = '_blank';
    github.rel = 'noopener noreferrer';
    github.textContent = 'GitHub ↗';
    const actions = document.createElement('div');
    actions.className = 'fw-settings-actions';
    actions.setAttribute('aria-label', this.text.more);
    for (const [action, label] of [
      ['reload', this.text.reload],
      ['screenShotWithComment', this.text.capture],
      ['openGinza', this.text.original],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.settingsAction = action;
      button.textContent = label;
      button.addEventListener('click', () => {
        closeSettingsDialog();
        this.command(action);
      });
      actions.append(button);
    }
    root.append(quality, github, actions);
    return root;
  }
  private populateQuality(select: HTMLSelectElement): void {
    select.replaceChildren(new Option(this.text.auto, 'auto'));
    for (const label of this.qualityLabels) select.add(new Option(label, label));
    select.disabled = select.options.length < 2;
    const preferred = this.config.props.domandVideoQuality;
    select.value = [...select.options].some((option) => option.value === preferred)
      ? preferred
      : (select.options[1]?.value ?? 'auto');
  }
  setPanel(panel: 'details' | null, force = false): void {
    if (!force && this.detailsLocked && this.panel === 'details' && panel !== 'details') return;
    if (!this.panel && panel)
      this.focusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.panel = panel;
    this.container.dataset.panel = panel ?? '';
    this.info.inert = panel !== 'details';
    const isModal = panel !== null && !(panel === 'details' && this.detailsLocked);
    this.controls.inert = isModal;
    this.container.querySelectorAll<HTMLElement>('.videoControlBar,.commentInputPanel').forEach((element) => {
      element.inert = isModal;
    });
    this.require('[data-shell-action="details"]').setAttribute('aria-expanded', String(panel === 'details'));
    if (panel) {
      const focus = this.info.querySelector<HTMLElement>('.tabSelect.activeTab');
      focus?.focus();
    } else {
      this.focusReturn?.focus();
      this.focusReturn = null;
    }
    this.reveal();
  }
  reveal(): void {
    this.container.dataset.controls = 'visible';
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      const active = document.activeElement;
      const editing =
        active instanceof HTMLElement &&
        this.container.contains(active) &&
        (active.matches('input,select,textarea,[contenteditable="true"]') || this.keyboardFocus);
      if (
        (this.panel && !(this.panel === 'details' && this.detailsLocked)) ||
        this.pointerDown ||
        editing ||
        this.container.querySelector(
          '.commentInputPanel[data-posting="true"], [data-comment-palette][aria-expanded="true"]'
        )
      )
        return;
      this.container.dataset.controls = 'hidden';
    }, 3000);
  }
  open(): void {
    this.reveal();
    clearInterval(this.clockTimer);
    this.clockTimer = setInterval(() => this.tick(), 80);
  }
  close(): void {
    this.detailsLocked = false;
    this.updateDetailsLockButton();
    this.setPanel(null, true);
    this.layoutChanged();
    clearTimeout(this.hideTimer);
    clearInterval(this.clockTimer);
    this.ab.clear();
    this.updateAB();
  }
  reset(): void {
    this.ab.clear();
    this.updateAB();
    this.reveal();
  }
  repeatOnEnded(): boolean {
    if (this.ab.start === null || this.ab.end === null) return false;
    this.command('seek', this.ab.start);
    this.command('play');
    return true;
  }
  updateVideo(video: ShellVideo): void {
    this.qualityLabels = [
      ...new Set(video.domandInfo?.availableVideos.map((item) => item.label ?? `${item.height}p`) ?? []),
    ];
    if (this.activeQuality) this.populateQuality(this.activeQuality);
    this.require('.fw-title').textContent = video.title;
    this.require('.fw-title').title = video.title;
    const stats = this.require('.fw-stats');
    stats.replaceChildren();
    const date = new Date(video.postedAt);
    const entries = [
      ['date', this.text.date, Number.isNaN(date.valueOf()) ? '—' : date.toLocaleDateString()],
      ['play', this.text.views, video.count.view.toLocaleString()],
      ['comment', this.text.commentCount, video.count.comment.toLocaleString()],
      ['mylists', this.text.mylists, video.count.mylist.toLocaleString()],
      ['likes', this.text.likes, video.count.like?.toLocaleString() ?? '—'],
    ] as const;
    for (const [icon, label, value] of entries) {
      const item = document.createElement('span');
      item.title = label;
      item.setAttribute('aria-label', `${label}: ${value}`);
      item.innerHTML = shellIcon(icon);
      item.append(document.createTextNode(value));
      stats.append(item);
    }
  }
  private sync(): void {
    const playing = this.state.isPlaying;
    this.playButton.innerHTML = shellIcon(playing ? 'pause' : 'play');
    this.playButton.title = playing ? this.text.pause : this.text.play;
    this.playButton.setAttribute('aria-label', this.playButton.title);
    for (const [action, pressed] of [
      ['toggle-loop', this.state.isLoop],
      ['toggle-mute', this.state.isMute],
      ['toggle-showComment', this.state.isShowComment],
    ] as const)
      this.require(`[data-shell-action="${action}"]`).setAttribute('aria-pressed', String(pressed));
    this.require('[data-shell-action="toggle-mute"]').innerHTML = shellIcon(this.state.isMute ? 'mute' : 'volume');
    this.volume.value = String(this.config.props.volume);
    this.speed.value = String(this.state.playbackRate);
    this.syncQuality();
    this.decorateTabs();
  }
  private syncQuality(): void {
    if (this.activeQuality) this.populateQuality(this.activeQuality);
  }
  private updateAB(): void {
    const { start, end } = this.ab;
    this.abButton.textContent =
      start === null ? 'A↔B' : end === null ? `A ${this.time(start)} → B` : `${this.time(start)} ↔ ${this.time(end)}`;
    this.abButton.title = start === null ? this.text.setA : end === null ? this.text.setB : this.text.clearAB;
    this.abButton.setAttribute('aria-label', this.abButton.title);
    this.abButton.setAttribute('aria-pressed', String(end !== null));
    this.abButton.dataset.repeat = end !== null ? 'active' : start !== null ? 'start' : 'off';
  }
  private time(value: number): string {
    const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  private tick(): void {
    const current = this.player.currentTime;
    const target = this.ab.seekTarget(current);
    if (this.state.isPlaying && target !== null) this.command('seek', target);
    this.timeLabel.textContent = `${this.time(current)} / ${this.time(this.player.duration)}`;
  }
}
