import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { installWatchEntry, supportsWatchEntryPage, watchIdFromUrl } from '../../src/watch-entry';
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
      '<a id="thumb" href="/watch/sm9"><img alt="動画タイトル"></a><a id="title" href="/watch/sm9">動画タイトル</a>';
    const open = mock((id: string) => id);
    ui = installWatchEntry();
    ui.ready(open);
    expect(document.querySelectorAll('[data-futatsume-video]').length).toBe(1);
    expect(document.querySelector('[data-futatsume-video]')?.textContent).toBe('');
    expect(document.body.querySelector('[data-futatsume-entry]')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-futatsume-video="sm9"]')!.click();
    expect(open).toHaveBeenLastCalledWith('sm9');
    document.querySelector('#thumb')!.setAttribute('href', '/watch/so123');
    document.querySelector('#thumb img')!.setAttribute('alt', '別の動画');
    await flush();
    document.querySelector<HTMLButtonElement>('[data-futatsume-video="so123"]')!.click();
    expect(open).toHaveBeenLastCalledWith('so123');
    expect(document.querySelector('[data-futatsume-video="so123"]')?.getAttribute('aria-label')).toContain('別の動画');
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
  it('同じ動画IDへのリンクが複数あっても代表リンクに1個だけ置く', async () => {
    document.body.innerHTML =
      '<a id="image" href="https://www.nicovideo.jp/watch/sm9"><img alt="動画1"></a>' +
      '<a id="title" href="https://www.nicovideo.jp/watch/sm9">動画1のタイトル</a>' +
      '<a id="duplicate" href="/watch/sm9">動画1の説明</a>';
    const open = mock((id: string) => id);
    ui = installWatchEntry();
    ui.ready(open);
    expect(document.querySelectorAll('[data-futatsume-video="sm9"]')).toHaveLength(1);
    expect(document.querySelector('#image')?.nextElementSibling?.getAttribute('data-futatsume-video')).toBe('sm9');
    document.querySelector<HTMLButtonElement>('[data-futatsume-video="sm9"]')!.click();
    expect(open).toHaveBeenCalledWith('sm9');
    document.querySelector('#image')!.remove();
    await flush();
    expect(document.querySelectorAll('[data-futatsume-video="sm9"]')).toHaveLength(1);
    expect(document.querySelector('#title')?.nextElementSibling?.getAttribute('data-futatsume-video')).toBe('sm9');
  });
  it('同じ動画IDでは非表示リンクを避けて表示中のリンクへ1個だけ置く', () => {
    document.body.innerHTML =
      '<div hidden><a id="hidden" href="https://www.nicovideo.jp/watch/sm9">隠れた動画</a></div>' +
      '<a id="visible" href="https://www.nicovideo.jp/watch/sm9">表示中の動画</a>';
    ui = installWatchEntry();
    ui.ready(() => {});
    expect(document.querySelectorAll('[data-futatsume-video="sm9"]')).toHaveLength(1);
    expect(document.querySelector('#visible')?.nextElementSibling?.getAttribute('data-futatsume-video')).toBe('sm9');
    expect(
      document.querySelector('#hidden')?.nextElementSibling?.getAttribute('data-futatsume-video') ?? null
    ).toBeNull();
  });
  it('サムネ内の相対ボックス先頭へ重ねて統合し、タイトルを行の説明に使う', () => {
    document.body.innerHTML =
      '<div class="pos_relative"><a id="thumb" href="/watch/sm9"><div class="pos_relative ncnl-cache-thumbnail-host"><img alt="サムネ"><div class="pos_absolute"><time><span>6:47</span></time></div></div></a></div>' +
      '<div><a id="title" href="/watch/sm9">動画1のタイトル</a></div>';
    ui = installWatchEntry();
    ui.ready(() => {});
    expect(document.querySelectorAll('[data-futatsume-video="sm9"]')).toHaveLength(1);
    const control = document.querySelector('[data-futatsume-video="sm9"]')!;
    expect(control.parentElement?.classList.contains('pos_relative')).toBe(true);
    expect(control.parentElement?.firstElementChild).toBe(control);
    expect(document.querySelector('#title')?.nextElementSibling).toBeNull();
    expect(control.getAttribute('aria-label')).toContain('動画1のタイトル');
  });
  it('旧トップのサムネ容器へ統合し、汚染由来の付加要素へ結合しない', () => {
    document.body.innerHTML =
      '<div class="StageRecommendVideoCard"><a id="top" href="https://www.nicovideo.jp/watch/sm9">' +
      '<div class="StageRecommendVideoCard-thumbnailContainer"><div class="NC-Thumbnail">' +
      '<div class="NC-Thumbnail-image" data-thumbnail="" style="background-image:url(&quot;https://example.com/t.jpg&quot;)"></div>' +
      '</div><span class="cacheIcon ncnl-cache-icon">480p</span></div>' +
      '<div class="StageRecommendVideoCard-title">トップの動画</div></a></div>';
    ui = installWatchEntry();
    ui.ready(() => {});
    expect(document.querySelectorAll('[data-futatsume-video="sm9"]')).toHaveLength(1);
    const control = document.querySelector('[data-futatsume-video="sm9"]')!;
    expect(control.closest('.cacheIcon')).toBeNull();
    expect(control.parentElement?.classList.contains('StageRecommendVideoCard-thumbnailContainer')).toBe(true);
    expect(control.parentElement?.firstElementChild).toBe(control);
    expect(control.getAttribute('aria-label')).toContain('トップの動画');
  });
  it('見える起動アイコンがカードの透明リンクに覆われても、その位置の実クリックで起動する', () => {
    document.body.innerHTML =
      '<article><a href="https://www.nicovideo.jp/watch/sm9">表示中の動画</a><div id="cover"></div></article>';
    const open = mock((id: string) => id);
    ui = installWatchEntry();
    ui.ready(open);
    const control = document.querySelector<HTMLButtonElement>('[data-futatsume-video="sm9"]')!;
    control.getBoundingClientRect = () =>
      ({ left: 10, top: 20, right: 54, bottom: 64, width: 44, height: 44 }) as DOMRect;
    document.querySelector('#cover')!.dispatchEvent(
      new window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        detail: 1,
        clientX: 32,
        clientY: 42,
      })
    );
    expect(open).toHaveBeenCalledWith('sm9');
  });
  it('他ホストや壊れたURLを再生要求にしない', () => {
    expect(watchIdFromUrl('https://example.com/watch/sm9')).toBeNull();
    expect(watchIdFromUrl('/watch/not-a-video')).toBeNull();
    expect(watchIdFromUrl('/watch/sm9?from=3')).toBe('sm9');
    expect(watchIdFromUrl('/watch/12345')).toBe('12345');
  });
  it('プレイヤー本体を初期化する外部ページだけに入口を設置する', () => {
    expect(supportsWatchEntryPage(new URL('https://dic.nicovideo.jp/v/sm9'))).toBe(true);
    expect(supportsWatchEntryPage(new URL('https://anime.nicovideo.jp/'))).toBe(true);
    expect(supportsWatchEntryPage(new URL('https://www.google.com/search?q=sm9'))).toBe(true);
    expect(supportsWatchEntryPage(new URL('https://www.youtube.com/watch?v=test'))).toBe(false);
    expect(supportsWatchEntryPage(new URL('https://embed.nicovideo.jp/watch/sm9'))).toBe(false);
    expect(supportsWatchEntryPage(new URL('https://ext.nicovideo.jp/thumb/sm9'))).toBe(false);
  });
});
