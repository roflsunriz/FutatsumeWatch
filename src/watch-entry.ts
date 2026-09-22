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

export function supportsWatchEntryPage(url: Pick<Location, 'hostname' | 'pathname'> = location): boolean {
  if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') return false;
  if (url.hostname === 'ext.nicovideo.jp' && url.pathname.startsWith('/thumb/')) return false;
  return !['live.nicovideo.jp', 'embed.nicovideo.jp', 'sp.nicovideo.jp'].includes(url.hostname);
}

// 公式の意味を持つdata属性とプロフィールURLを使い、生成クラス名に依存しない。
// 一覧系のサムネ特定は公式構造だけを正本にする。nicocache_nl / filter-matome 由来の
// 付加クラス（nl-cached / ncnl- / filter-matome / cacheIcon）や付加文言へは結合しない。
const THUMB_BOX_SELECTOR =
  'div.pos_relative,.StageRecommendVideoCard-thumbnailContainer,.NC-Thumbnail,.nicoad_article_slide_item_thumb';

function isContaminationBadge(element: Element): boolean {
  return (
    element.classList.contains('cacheIcon') ||
    element.hasAttribute('data-ncnl-cache-icon') ||
    element.closest('.cacheIcon,[data-ncnl-cache-icon]') !== null
  );
}

function findThumbBox(link: HTMLAnchorElement): HTMLElement | null {
  // 公式のサムネ箱を選ぶ。nicocache_nl が公式の箱へ付与する marker クラス
  //（ncnl-cache-thumbnail-host 等）では除外せず、汚染バッジ内だけを避ける。
  for (const box of link.querySelectorAll<HTMLElement>(THUMB_BOX_SELECTOR)) {
    if (!isContaminationBadge(box)) return box;
  }
  return null;
}

function isThumbAnchor(link: HTMLAnchorElement): boolean {
  if (link.querySelector('img')) return true;
  if (link.querySelector('.NC-Thumbnail-image,[data-thumbnail],time')) return true;
  return findThumbBox(link) !== null;
}

// duration表記（「6:47」や画質付加の「2:02 480p·192k」等）だけの短いラベルは
// 起動ボタンの説明に使わない。直後にタイトルが続く場合は実タイトルとして扱う。
function isDurationLabel(value: string): boolean {
  return /^\d{1,3}:\d{2}(\s*[\d.]+\s*[pk](·[\d.]+\s*k)?)?\s*$/.test(value.trim());
}

function labelForLink(link: HTMLAnchorElement): string | null {
  // 本文の実タイトルを最優先する。本文アイコン画像（例: 大百科の exit 画像）の
  // alt で上書きしない。先頭の duration＋画質トークンや末尾の再生数は
  // 付帯表示として取り除く。サムネ側の duration 表記は実タイトルとして使わない。
  const raw = link.textContent?.trim() ?? '';
  const stripped = raw
    .replace(/^\d{1,3}:\d{2}(\s*[\d.]+\s*[pk](·[\d.]+\s*k)?)?\s+/, '')
    .replace(/[\s]+\d{4,}$/, '')
    .trim();
  if (stripped && !isDurationLabel(stripped)) return stripped;
  const alt = link.querySelector<HTMLImageElement>('img[alt]')?.alt.trim() ?? '';
  if (alt) return alt;
  const accessible = link.getAttribute('aria-label')?.trim() || link.title.trim() || '';
  if (accessible) return accessible;
  return raw || null;
}

// Nアニメ等のカード全体リンクのように公式のサムネ内箱を持たないカードは、
// リンク自体へ重ねる。行内テキストリンク（高さが小さい）には重ねない。
function isCardAnchor(link: HTMLAnchorElement): boolean {
  const rect = link.getBoundingClientRect();
  return rect.width >= 100 && rect.height >= 80;
}
export function findWatchEntrySlot(doc: Document): { parent: HTMLElement; before: Element } | null {
  const headings = [...doc.querySelectorAll('h1')].filter((heading) => !heading.closest('#futatsumeVideoPlayerDialog'));
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
  const mounted = new Map<string, { link: HTMLAnchorElement; control: HTMLButtonElement }>();
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
      if (!video.closest('#futatsumeVideoPlayerDialog')) video.pause();
    });
    openVideo(id);
  };
  const onCoveredControlClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.detail === 0) return;
    const target = event.target;
    for (const [id, { control }] of mounted) {
      if (target && control.contains(target as Node)) return;
      const rect = control.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        open(id);
        return;
      }
    }
  };
  document.addEventListener('click', onCoveredControlClick, true);
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
    [data-futatsume-video]{margin:4px 6px 4px 0;position:relative;z-index:2147483646;isolation:isolate;pointer-events:auto}
    div.pos_relative>[data-futatsume-video],.StageRecommendVideoCard-thumbnailContainer>[data-futatsume-video],.NC-Thumbnail>[data-futatsume-video],.nicoad_article_slide_item_thumb>[data-futatsume-video]{position:absolute;top:6px;right:6px;left:auto;bottom:auto;margin:0;box-shadow:0 1px 6px rgba(0,0,0,.65)}
    a:has(>[data-futatsume-video]){position:relative}
    a>[data-futatsume-video]{position:absolute;top:6px;right:6px;left:auto;bottom:auto;margin:0;box-shadow:0 1px 6px rgba(0,0,0,.65)}
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
    if (isWatch) {
      for (const { control } of mounted.values()) control.remove();
      mounted.clear();
      return;
    }
    const candidates = new Map<string, { link: HTMLAnchorElement; label: string; priority: number }>();
    const titleById = new Map<string, string>();
    const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/watch/"]')];
    for (const link of links) {
      const id = watchIdFromUrl(link.href);
      if (!id || link.closest('#futatsumeVideoPlayerDialog,#mylistPocket-popup')) continue;
      // タイトル行の実タイトルを同一IDの説明文として保持する。サムネ側のdurationや
      // 外部付加文言（例: 画質表記）で上書きしない。
      if (!link.querySelector('img') && !isThumbAnchor(link)) {
        const title = labelForLink(link);
        if (title && !isDurationLabel(title) && !titleById.has(id)) titleById.set(id, title);
      }
    }
    for (const link of links) {
      const id = watchIdFromUrl(link.href);
      if (!id || link.closest('#futatsumeVideoPlayerDialog,#mylistPocket-popup')) continue;
      const rawLabel = labelForLink(link);
      if (!rawLabel) continue;
      const box = findThumbBox(link);
      const thumb = box !== null || isThumbAnchor(link);
      const label = thumb ? (titleById.get(id) ?? rawLabel) : rawLabel;
      // 公式のサムネ内箱を持つリンクを最優先し、次にサムネ側リンクを優先する。
      // タイトル行の後ろへボタンを足して行を崩さない。
      const priority = box !== null ? 4 : thumb ? 3 : 1;
      const style = window.getComputedStyle(link);
      const notHidden =
        style.display !== 'none' &&
        style.visibility === 'visible' &&
        Number(style.opacity) !== 0 &&
        !link.closest('[hidden],[aria-hidden="true"]');
      const current = candidates.get(id);
      const effectivePriority =
        priority + (notHidden ? 2 : 0) + (notHidden && link.getClientRects().length > 0 ? 2 : 0);
      if (!current || effectivePriority > current.priority)
        candidates.set(id, { link, label, priority: effectivePriority });
    }
    for (const [id, mountedEntry] of mounted) {
      const candidate = candidates.get(id);
      if (!candidate || candidate.link !== mountedEntry.link || !mountedEntry.control.isConnected) {
        mountedEntry.control.remove();
        mounted.delete(id);
      }
    }
    for (const [id, { link, label: linkLabel }] of candidates) {
      const existing = mounted.get(id);
      const label = `${words.watch}: ${linkLabel}`;
      if (existing) {
        describe(existing.control, label);
        continue;
      }
      const control = createIconButton();
      control.dataset.futatsumeVideo = id;
      describe(control, label);
      control.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = watchIdFromUrl(link.href);
        if (id) open(id);
      });
      // サムネ内の相対ボックス先頭へ重ねて統合する。hover待ちの表示切り替えはしない。
      // 箱を持たないカード全体リンク（Nアニメ等）はリンク自体の先頭へ重ね、
      // 行内テキストリンクにだけ従来どおり直後へ置く。
      const box = findThumbBox(link);
      if (box) box.prepend(control);
      else if (isCardAnchor(link)) link.prepend(control);
      else link.after(control);
      mounted.set(id, { link, control });
    }
  };
  const schedule = (): void => {
    if (scheduled === undefined) scheduled = window.requestAnimationFrame(update);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'class', 'hidden', 'style', 'aria-hidden'],
  });
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
      document.removeEventListener('click', onCoveredControlClick, true);
      if (history.pushState === pushWrapper) history.pushState = push;
      if (history.replaceState === replaceWrapper) history.replaceState = replace;
      for (const { control } of mounted.values()) control.remove();
      mounted.clear();
      button.remove();
      marker.remove();
      style.remove();
    },
  };
}
