import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { netUtil as util } from '../../packages/lib/src/infra/net-util';
import { nicoUtil } from '../../packages/lib/src/nico/nico-util';
import { TagEditApi } from '../../packages/lib/src/nico/tag-edit-api';
Object.assign(globalThis, { HTMLElement: window.HTMLElement });
const { TagListView } = await import('../../src/tag-list-view');
const originalFetch = util.fetch;
let login: ReturnType<typeof spyOn<typeof nicoUtil, 'isLogin'>>;
const containers: HTMLElement[] = [];
function stubFetch(fetch: typeof util.fetch) {
  util.fetch = (url, options) =>
    url.startsWith('https://api.dic.nicovideo.jp/')
      ? Promise.resolve(Response.json({ error: 'not found' }, { status: 404 }))
      : fetch(url, options);
}
beforeEach(() => {
  login = spyOn(nicoUtil, 'isLogin').mockReturnValue(true);
  stubFetch(originalFetch);
});
afterEach(() => {
  util.fetch = originalFetch;
  login.mockRestore();
  for (const node of containers.splice(0)) node.remove();
});
function create() {
  const parentNode = document.createElement('div');
  document.body.append(parentNode);
  containers.push(parentNode);
  const view = new TagListView({ parentNode });
  view.update({
    watchId: 'sm9',
    videoId: 'sm9',
    tagEdit: { editKey: 'test-edit-key' },
    tagList: [{ name: '既存', isLocked: true }],
  });
  const root = parentNode.firstElementChild!.shadowRoot!;
  const input = root.querySelector<HTMLInputElement>('.tagInputText')!;
  const tags = () => Array.from(root.querySelectorAll<HTMLElement>('.tagItem')).map((tag) => tag.dataset.tagId);
  return { view, root, input, tags };
}
test('P4-02 タグ追加と削除は動画・メソッド・記号付きタグ・認証ヘッダーを通信境界で照合する', async () => {
  const stored = ['既存'];
  const requests: string[] = [];
  stubFetch((raw: string, init: RequestInit = {}) => {
    const url = new URL(raw);
    expect(url.origin + url.pathname).toBe('https://nvapi.nicovideo.jp/v2/videos/sm9/tags');
    expect(new Headers(init.headers).get('X-Tag-Edit-Key')).toBe('test-edit-key');
    expect(init.credentials).toBe('include');
    requests.push(init.method!);
    if (init.method === 'POST') stored.push(url.searchParams.get('tag')!);
    if (init.method === 'DELETE') stored.splice(stored.indexOf(url.searchParams.get('tag')!), 1);
    return Promise.resolve(Response.json({ data: { tags: stored.map((name) => ({ name })) } }));
  });
  const api = new TagEditApi();
  const tag = '日本語 & "quoted" / #';
  expect((await api.add({ videoId: 'sm9', tag, editKey: 'test-edit-key' })).tags.map((entry) => entry.name)).toEqual([
    '既存',
    tag,
  ]);
  expect((await api.load('sm9', 'test-edit-key')).tags).toHaveLength(2);
  expect((await api.remove({ videoId: 'sm9', tag, editKey: 'test-edit-key' })).tags).toEqual([{ name: '既存' }]);
  expect(requests).toEqual(['POST', 'GET', 'DELETE']);
});
test('P4-02 HTTP拒否・API拒否・不正一覧を成功にせず再取得も実行する', async () => {
  const api = new TagEditApi();
  for (const response of [
    Response.json({}, { status: 403 }),
    Response.json({ meta: { status: 429 } }),
    Response.json({ data: { tags: [{}] } }),
  ]) {
    stubFetch(() => Promise.resolve(response));
    const result = await api.load('sm9', 'key').catch((error: unknown) => error);
    expect(result).toBeInstanceOf(Error);
  }
  const calls: string[] = [];
  stubFetch((_url: string, init: RequestInit = {}) => {
    calls.push(init.method!);
    return Promise.resolve(
      Response.json(init.method === 'POST' ? { data: {} } : { data: { tags: [{ name: '追加' }] } })
    );
  });
  expect((await api.add({ videoId: 'sm9', tag: '追加', editKey: 'key' })).tags).toEqual([{ name: '追加' }]);
  expect(calls).toEqual(['POST', 'GET']);
});
test('P4-01/02 失敗時に一覧・本文を残し、連打・空白・重複・ロックを送信しない', async () => {
  const f = create();
  let count = 0;
  stubFetch(() => {
    count++;
    return Promise.resolve(Response.json({}, { status: 403 }));
  });
  f.view._beginInput();
  f.input.value = '残す本文';
  const first = f.view._addTag(f.input.value);
  await f.view._addTag(f.input.value);
  await first;
  expect(count).toBe(1);
  expect(f.input.value).toBe('残す本文');
  expect(f.root.querySelector('[data-tag-status]')!.textContent).toContain('403');
  expect(f.tags()).toEqual(['既存']);
  expect(f.root.querySelector('.root')!.classList.contains('is-Updating')).toBe(false);
  await f.view._addTag(' ');
  await f.view._addTag('既存');
  await f.view._removeTag('既存', '既存');
  expect(count).toBe(1);
  stubFetch(() => Promise.resolve(Response.json({ data: { tags: [{ name: '既存' }, { name: '残す本文' }] } })));
  await f.view._addTag(f.input.value);
  expect(f.input.value).toBe('');
  expect(f.tags()).toEqual(['既存', '残す本文']);
});
test('P4-03 更新失敗で一覧を消さず、同じ動画へ戻っても古い応答を適用しない', async () => {
  const f = create();
  stubFetch(() => Promise.resolve(Response.json({}, { status: 500 })));
  await f.view._refreshTag();
  expect(f.tags()).toEqual(['既存']);
  let resolve!: (value: Response) => void;
  stubFetch(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      })
  );
  const old = f.view._refreshTag();
  f.view.update({ watchId: 'sm10', videoId: 'sm10', tagList: [{ name: '別動画' }] });
  f.view.update({ watchId: 'sm9', videoId: 'sm9', tagList: [{ name: '新しい一覧' }] });
  resolve(Response.json({ data: { tags: [{ name: '古い一覧' }] } }));
  await old;
  expect(f.tags()).toEqual(['新しい一覧']);
});
test('P4-01/04 権限が消えた動画では編集せず、引用符を含むタグの大百科有無とURLを保つ', async () => {
  const f = create();
  const tag = '日本語 " & <tag>';
  f.view.update({
    watchId: 'sm10',
    videoId: 'sm10',
    tagList: [
      { name: tag, isNicodicArticleExists: true },
      { name: 'なし', isNicodicArticleExists: false },
      { name: '未取得' },
    ],
  });
  let count = 0;
  stubFetch(() => {
    count++;
    return Promise.reject(new Error('送信禁止'));
  });
  f.view._beginInput();
  await f.view._addTag('不可');
  expect(count).toBe(0);
  expect(f.tags()).toEqual([tag, 'なし', '未取得']);
  const menus = f.root.querySelectorAll<HTMLElement>('futatsume-tag-item-menu');
  expect(menus[0]!.dataset.hasNicodic).toBe('1');
  expect(menus[0]!.shadowRoot!.querySelector('.root')!.classList.contains('has-nicodic')).toBe(true);
  expect(menus[1]!.dataset.hasNicodic).toBe('0');
  expect(menus[2]!.dataset.hasNicodic).toBe('unknown');
  expect(menus[0]!.querySelector('a')!.href).toBe(`https://dic.nicovideo.jp/a/${encodeURIComponent(tag)}`);
});
