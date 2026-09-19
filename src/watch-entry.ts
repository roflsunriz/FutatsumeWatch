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

export function installWatchEntry(): WatchEntry {
  const ja = navigator.language.startsWith('ja');
  const words = ja
    ? {
        loading: 'プレイヤーを準備しています…',
        ready: '再生できます',
        watch: 'この動画をFutatsumeWatchで再生',
        search: '動画タイトル横の「FWで再生」を押してください。',
        action: 'FWで再生',
        reload: '再読み込み',
        failed: '起動できませんでした。再読み込みしても直らない場合は、この表示を添えてお知らせください。',
      }
    : {
        loading: 'Preparing the player…',
        ready: 'Ready to play',
        watch: 'Play this video in FutatsumeWatch',
        search: 'Choose “Play with FW” beside a video title.',
        action: 'Play with FW',
        reload: 'Reload',
        failed: 'The player could not start. Reload the page; if this continues, report the message below.',
      };
  let openVideo: OpenVideo | undefined;
  let state: 'starting' | 'ready' | 'failed' = 'starting';
  let scheduled: number | undefined;
  const mounted = new Map<HTMLAnchorElement, HTMLButtonElement>();
  const panel = document.createElement('aside');
  panel.dataset.futatsumeEntry = '';
  panel.dataset.futatsumeVersion = VERSION;
  panel.dataset.state = state;
  panel.setAttribute('aria-label', 'FutatsumeWatch');
  const title = document.createElement('strong');
  title.textContent = `FutatsumeWatch ${VERSION}`;
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.textContent = words.loading;
  const hint = document.createElement('p');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.futatsumeOpen = '';
  button.textContent = words.watch;
  button.disabled = true;
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.dataset.futatsumeReload = '';
  reload.textContent = words.reload;
  reload.hidden = true;
  reload.addEventListener('click', () => location.reload());
  const open = (id: string): void => {
    if (!openVideo || state !== 'ready') return;
    document.querySelectorAll('video').forEach((video) => {
      if (!video.closest('#zenzaVideoPlayerDialog')) video.pause();
    });
    openVideo(id);
  };
  button.addEventListener('click', () => {
    const id = watchIdFromUrl(location.href);
    if (id) open(id);
  });
  panel.append(title, status, hint, button, reload);
  const style = document.createElement('style');
  style.textContent = `
    [data-futatsume-entry]{position:fixed;right:12px;bottom:12px;z-index:99999;box-sizing:border-box;width:300px;max-width:calc(100vw - 24px);padding:12px;border:1px solid #4acac0;border-radius:8px;background:#153b39;color:#fff;font:14px/1.5 sans-serif;box-shadow:0 3px 14px #0005;text-align:left}
    [data-futatsume-entry]>strong,[data-futatsume-entry]>[role=status]{display:block}
    [data-futatsume-entry]>[role=status]{font-size:12px;color:#b7ebe4}
    [data-futatsume-entry]>p{margin:6px 0;overflow-wrap:anywhere}
    [data-futatsume-entry] button,[data-futatsume-video]{box-sizing:border-box;border:1px solid #33877e;border-radius:5px;background:#e9fff9;color:#123e38;font:600 13px/1.4 sans-serif;cursor:pointer;padding:6px 10px}
    [data-futatsume-entry] button:disabled,[data-futatsume-video]:disabled{opacity:.6;cursor:wait}
    [data-futatsume-entry] [hidden]{display:none}
    [data-futatsume-video]{display:inline-block;margin:4px 6px 4px 0;position:relative;z-index:2;vertical-align:middle;max-width:100%}
    body.showNicoVideoPlayerDialog [data-futatsume-entry]{display:none}
  `;
  document.head.append(style);
  document.body.append(panel);
  const update = (): void => {
    scheduled = undefined;
    if (!panel.isConnected) document.body.append(panel);
    const isWatch = watchIdFromUrl(location.href) !== null;
    button.hidden = !isWatch;
    if (state !== 'failed') {
      const message = isWatch ? '' : words.search;
      if (hint.textContent !== message) hint.textContent = message;
    }
    // SPAや検索結果の再描画で、消えたリンクのボタンを残さない。
    for (const [link, control] of mounted) {
      const id = watchIdFromUrl(link.href);
      if (!link.isConnected || !id || isWatch || link.closest('#zenzaVideoPlayerDialog')) {
        control.remove();
        mounted.delete(link);
      } else if (control.dataset.futatsumeVideo !== id) {
        control.dataset.futatsumeVideo = id;
      }
    }
    if (isWatch) return;
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="/watch/"]')) {
      const id = watchIdFromUrl(link.href);
      if (
        !id ||
        !link.textContent?.trim() ||
        link.querySelector('img') ||
        link.closest('#zenzaVideoPlayerDialog, #mylistPocket-popup, [data-futatsume-entry]')
      )
        continue;
      const existing = mounted.get(link);
      const label = `${words.watch}: ${link.textContent.trim()}`;
      if (existing?.isConnected) {
        if (existing.title !== label) {
          existing.title = label;
          existing.setAttribute('aria-label', label);
        }
        continue;
      }
      existing?.remove();
      const control = document.createElement('button');
      control.type = 'button';
      control.dataset.futatsumeVideo = id;
      control.textContent = words.action;
      control.title = label;
      control.setAttribute('aria-label', label);
      control.disabled = state !== 'ready';
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
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
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
      panel.dataset.state = state;
      status.textContent = words.ready;
      button.disabled = false;
      for (const control of mounted.values()) control.disabled = false;
      update();
    },
    fail(message) {
      state = 'failed';
      panel.dataset.state = state;
      status.textContent = words.failed;
      hint.textContent = message;
      button.disabled = true;
      reload.hidden = false;
      for (const control of mounted.values()) control.disabled = true;
    },
    dispose() {
      observer.disconnect();
      if (scheduled !== undefined) window.cancelAnimationFrame(scheduled);
      window.removeEventListener('popstate', schedule);
      if (history.pushState === pushWrapper) history.pushState = push;
      if (history.replaceState === replaceWrapper) history.replaceState = replace;
      for (const control of mounted.values()) control.remove();
      mounted.clear();
      panel.remove();
      style.remove();
    },
  };
}
