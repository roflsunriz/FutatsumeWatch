import { VERSION } from './version';

type OpenVideo = (watchId: string) => unknown;
export interface WatchEntry {
  ready(open: OpenVideo): void;
  fail(message: string): void;
  dispose(): void;
}

export function watchIdFromUrl(value: string, base = location.href): string | null {
  try {
    const url = new URL(value, base);
    return url.hostname === 'www.nicovideo.jp'
      ? (/^\/watch\/((?:[a-z]{2})?\d+)\/?$/.exec(url.pathname)?.[1] ?? null)
      : null;
  } catch {
    return null;
  }
}

// 公式の意味を持つdata属性とプロフィールURLを使い、生成クラス名に依存しない。
export function findWatchEntrySlot(doc: Document): { parent: HTMLElement; before: Element } | null {
  const headings = [...doc.querySelectorAll('h1')].filter((heading) => !heading.closest('#zenzaVideoPlayerDialog'));
  for (const heading of headings) {
    let row = heading.parentElement;
    for (let depth = 0; row && depth < 4; depth++, row = row.parentElement) {
      const owner = [...row.querySelectorAll<HTMLAnchorElement>('a[data-anchor-area="video_information"][href]')].find(
        (link) => {
          try {
            const url = new URL(link.href, doc.baseURI);
            return (
              (url.hostname === 'www.nicovideo.jp' && /^\/(user|channel)\//.test(url.pathname)) ||
              url.hostname === 'ch.nicovideo.jp'
            );
          } catch {
            return false;
          }
        }
      );
      if (!owner) continue;
      const titlePart = [...row.children].find((child) => child.contains(heading));
      const ownerPart = [...row.children].find((child) => child.contains(owner));
      if (titlePart && ownerPart && titlePart !== ownerPart) return { parent: row, before: ownerPart };
    }
  }
  return null;
}

function createIconButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.futatsumeLaunch = '';
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const offset of [3, 8]) {
    const rect = document.createElementNS(ns, 'rect');
    for (const [name, value] of Object.entries({
      x: String(offset),
      y: String(offset),
      width: '13',
      height: '13',
      rx: '1',
      fill: 'var(--fw-launch-background)',
      stroke: 'currentColor',
      'stroke-width': '1.8',
    }))
      rect.setAttribute(name, value);
    svg.append(rect);
  }
  button.append(svg);
  return button;
}

export function installWatchEntry(): WatchEntry {
  const ja = navigator.language.startsWith('ja');
  const words = ja
    ? {
        watch: 'FutatsumeWatchで再生',
        loading: 'プレイヤーを準備しています…',
        failed: '起動できませんでした。ページを再読み込みしてください。',
      }
    : {
        watch: 'Play in FutatsumeWatch',
        loading: 'Preparing the player…',
        failed: 'The player could not start. Please reload the page.',
      };
  let openVideo: OpenVideo | undefined;
  let state: 'starting' | 'ready' | 'failed' = 'starting';
  let failure = '';
  let scheduled: number | undefined;
  const mounted = new Map<HTMLAnchorElement, HTMLButtonElement>();
  // 導入確認用の非表示メタデータ。画面にポップアップは作らない。
  const marker = document.createElement('meta');
  marker.dataset.futatsumeEntry = '';
  marker.dataset.futatsumeVersion = VERSION;
  marker.dataset.state = state;
  const button = createIconButton();
  button.dataset.futatsumeOpen = '';
  const describe = (control: HTMLButtonElement, label: string): void => {
    const title =
      state === 'starting' ? `${label} — ${words.loading}` : state === 'failed' ? `${words.failed} ${failure}` : label;
    if (control.title !== title) {
      control.title = title;
      control.setAttribute('aria-label', title);
    }
    control.disabled = state !== 'ready';
    control.dataset.state = state;
    control.setAttribute('aria-busy', String(state === 'starting'));
  };
  const open = (id: string): void => {
    if (!openVideo || state !== 'ready') return;
    document.querySelectorAll('video').forEach((video) => {
      if (!video.closest('#zenzaVideoPlayerDialog')) video.pause();
    });
    openVideo(id);
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const id = watchIdFromUrl(location.href);
    if (id) open(id);
  });
  const style = document.createElement('style');
  style.textContent = `
    [data-futatsume-launch]{--fw-launch-background:#262626;box-sizing:border-box;display:inline-grid;place-items:center;flex:0 0 auto;width:30px;height:30px;padding:4px;border:1px solid #707070;border-radius:5px;background:var(--fw-launch-background);color:#eee;cursor:pointer;vertical-align:middle}
    [data-futatsume-launch]>svg{width:22px;height:22px;pointer-events:none}
    [data-futatsume-launch]:hover{--fw-launch-background:#3a3a3a;border-color:#ddd}
    [data-futatsume-launch]:focus-visible{outline:2px solid #40b8e8;outline-offset:2px}
    [data-futatsume-launch]:disabled{opacity:.55;cursor:wait}
    [data-futatsume-launch][data-state=failed]{border-color:#e66;cursor:help}
    [data-futatsume-open]{width:40px;height:40px;padding:8px;align-self:center;margin-inline:auto}
    [data-futatsume-video]{margin:4px 6px 4px 0;position:relative;z-index:2}
    @media(max-width:700px){[data-futatsume-open]{width:32px;height:32px;padding:4px;margin-inline:6px}}
  `;
  document.head.append(marker, style);
  const update = (): void => {
    scheduled = undefined;
    const isWatch = watchIdFromUrl(location.href) !== null;
    if (isWatch) {
      const slot = findWatchEntrySlot(document);
      if (slot) {
        if (button.parentElement !== slot.parent || button.nextElementSibling !== slot.before)
          slot.parent.insertBefore(button, slot.before);
      } else button.remove();
      describe(button, words.watch);
    } else button.remove();
    for (const [link, control] of mounted) {
      const id = watchIdFromUrl(link.href);
      if (!link.isConnected || !id || isWatch || link.closest('#zenzaVideoPlayerDialog')) {
        control.remove();
        mounted.delete(link);
      } else if (control.dataset.futatsumeVideo !== id) control.dataset.futatsumeVideo = id;
    }
    if (isWatch) return;
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="/watch/"]')) {
      const id = watchIdFromUrl(link.href);
      if (
        !id ||
        !link.textContent?.trim() ||
        link.querySelector('img') ||
        link.closest('#zenzaVideoPlayerDialog,#mylistPocket-popup')
      )
        continue;
      const existing = mounted.get(link);
      const label = `${words.watch}: ${link.textContent.trim()}`;
      if (existing?.isConnected) {
        describe(existing, label);
        continue;
      }
      existing?.remove();
      const control = createIconButton();
      control.dataset.futatsumeVideo = id;
      describe(control, label);
      control.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = watchIdFromUrl(link.href);
        if (id) open(id);
      });
      link.after(control);
      mounted.set(link, control);
    }
  };
  const schedule = (): void => {
    if (scheduled === undefined) scheduled = window.requestAnimationFrame(update);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  const push = history.pushState.bind(history),
    replace = history.replaceState.bind(history);
  const pushWrapper: History['pushState'] = (data: unknown, unused: string, url?: string | URL | null): void => {
    push(data, unused, url);
    schedule();
  };
  const replaceWrapper: History['replaceState'] = (data: unknown, unused: string, url?: string | URL | null): void => {
    replace(data, unused, url);
    schedule();
  };
  history.pushState = pushWrapper;
  history.replaceState = replaceWrapper;
  window.addEventListener('popstate', schedule);
  update();
  return {
    ready(callback) {
      openVideo = callback;
      state = 'ready';
      marker.dataset.state = state;
      update();
    },
    fail(message) {
      failure = message;
      state = 'failed';
      marker.dataset.state = state;
      update();
    },
    dispose() {
      observer.disconnect();
      if (scheduled !== undefined) window.cancelAnimationFrame(scheduled);
      window.removeEventListener('popstate', schedule);
      if (history.pushState === pushWrapper) history.pushState = push;
      if (history.replaceState === replaceWrapper) history.replaceState = replace;
      for (const control of mounted.values()) control.remove();
      mounted.clear();
      button.remove();
      marker.remove();
      style.remove();
    },
  };
}
