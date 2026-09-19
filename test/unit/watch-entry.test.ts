import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { installWatchEntry, watchIdFromUrl } from '../../src/watch-entry';
import type { WatchEntry } from '../../src/watch-entry';

let ui: WatchEntry | undefined;
let nodes: ChildNode[];
let originalUrl: string;
let originalRaf: PropertyDescriptor | undefined;
let originalCancel: PropertyDescriptor | undefined;
const descriptors = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  nodes = [...document.body.childNodes];
  document.body.replaceChildren();
  originalUrl = window.location.href;
  for (const key of ['location', 'history', 'MutationObserver'])
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.assign(globalThis, {
    location: window.location,
    history: window.history,
    MutationObserver: window.MutationObserver,
  });
  originalRaf = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
  originalCancel = Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame');
  window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 0);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  history.replaceState(null, '', '/search/test');
});
afterEach(() => {
  ui?.dispose();
  ui = undefined;
  history.replaceState(null, '', originalUrl);
  document.body.replaceChildren(...nodes);
  if (originalRaf) Object.defineProperty(window, 'requestAnimationFrame', originalRaf);
  else Reflect.deleteProperty(window, 'requestAnimationFrame');
  if (originalCancel) Object.defineProperty(window, 'cancelAnimationFrame', originalCancel);
  else Reflect.deleteProperty(window, 'cancelAnimationFrame');
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  descriptors.clear();
});
const flush = async (): Promise<void> => {
  await Bun.sleep(20);
};
const watchHeader =
  '<section><div id="info-row"><div><h1>動画タイトル</h1></div><div id="owner"><a data-anchor-area="video_information" href="/user/4">投稿者</a></div></div><div>タグ</div></section>';

describe('初めて使う人の起動導線', () => {
  it('ポップアップを作らず、アイコンの操作状態と説明を保持する', () => {
    history.replaceState(null, '', '/watch/sm9');
    document.body.innerHTML = watchHeader;
    ui = installWatchEntry();
    expect(document.querySelector('[data-futatsume-entry]')?.getAttribute('data-state')).toBe('starting');
    expect(document.querySelector<HTMLButtonElement>('[data-futatsume-open]')?.disabled).toBe(true);
    ui.fail('読み込み失敗');
    expect(document.querySelector('[data-futatsume-entry]')?.getAttribute('data-state')).toBe('failed');
    expect(document.querySelector('[data-futatsume-open]')?.getAttribute('aria-label')).toContain('読み込み失敗');
    expect(document.querySelector('[data-futatsume-open]')?.textContent).toBe('');
    expect(document.body.querySelector('[data-futatsume-entry]')).toBeNull();
    expect(document.querySelector('#info-row')?.children[1] ?? null).toBe(
      document.querySelector('[data-futatsume-open]')
    );
  });
  it('検索結果のテキストリンクに操作ボタンを加え、現在の動画IDを開く', async () => {
    document.body.innerHTML =
      '<a href="/watch/sm9"><img alt="thumbnail"></a><a id="title" href="/watch/sm9">動画タイトル</a>';
    const open = mock((id: string) => id);
    ui = installWatchEntry();
    ui.ready(open);
    expect(document.querySelectorAll('[data-futatsume-video]').length).toBe(1);
    expect(document.querySelector('[data-futatsume-video]')?.textContent).toBe('');
    expect(document.body.querySelector('[data-futatsume-entry]')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-futatsume-video]')!.click();
    expect(open).toHaveBeenLastCalledWith('sm9');
    document.querySelector('#title')!.setAttribute('href', '/watch/so123');
    document.querySelector('#title')!.textContent = '別の動画';
    await flush();
    document.querySelector<HTMLButtonElement>('[data-futatsume-video]')!.click();
    expect(open).toHaveBeenLastCalledWith('so123');
    expect(document.querySelector('[data-futatsume-video]')?.getAttribute('aria-label')).toContain('別の動画');
  });
  it('再読み込みしない検索→視聴→検索でも導線を切り替える', async () => {
    document.body.innerHTML = '<a href="/watch/sm9">動画タイトル</a>';
    ui = installWatchEntry();
    ui.ready(() => {});
    expect(document.querySelector('[data-futatsume-open]')).toBeNull();
    history.pushState(null, '', '/watch/sm9');
    document.body.insertAdjacentHTML('beforeend', watchHeader);
    await flush();
    expect(document.querySelector<HTMLButtonElement>('[data-futatsume-open]')?.hidden).toBe(false);
    expect(document.querySelectorAll('[data-futatsume-video]').length).toBe(0);
    history.replaceState(null, '', '/tag/test');
    await flush();
    expect(document.querySelector('[data-futatsume-open]')).toBeNull();
    expect(document.querySelectorAll('[data-futatsume-video]').length).toBe(1);
  });
  it('検索結果の差替えに追従し重複ボタンを作らない', async () => {
    const list = document.createElement('section');
    document.body.append(list);
    ui = installWatchEntry();
    ui.ready(() => {});
    list.innerHTML = '<a href="/watch/sm9">動画1</a>';
    await flush();
    list.innerHTML = '<a href="/watch/sm10">動画2</a>';
    await flush();
    expect(document.querySelectorAll('[data-futatsume-video]').length).toBe(1);
    expect(document.querySelector<HTMLButtonElement>('[data-futatsume-video]')?.dataset.futatsumeVideo).toBe('sm10');
    list.remove();
    await flush();
    expect(document.querySelectorAll('[data-futatsume-video]').length).toBe(0);
  });
  it('他ホストや壊れたURLを再生要求にしない', () => {
    expect(watchIdFromUrl('https://example.com/watch/sm9')).toBeNull();
    expect(watchIdFromUrl('/watch/not-a-video')).toBeNull();
    expect(watchIdFromUrl('/watch/sm9?from=3')).toBe('sm9');
    expect(watchIdFromUrl('/watch/12345')).toBe('12345');
  });
});
