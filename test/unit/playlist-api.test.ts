import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { PlaylistApiLoader } from '../../packages/lib/src/nico/playlist-api-loader';
import { netUtil } from '../../packages/lib/src/infra/net-util';
import { PlayList, VideoListItem } from '../../packages/futatsume/src/Playlist/playlist';
const original = netUtil.fetch,
  raf = globalThis.requestAnimationFrame;
beforeEach(() => {
  globalThis.requestAnimationFrame = (callback) => {
    queueMicrotask(() => callback(0));
    return 0;
  };
});
afterEach(async () => {
  netUtil.fetch = original;
  await Promise.resolve();
  await Promise.resolve();
  globalThis.requestAnimationFrame = raf;
});
const entries = [1, 2, 3].map((no) => ({
  watchId: 'sm' + no,
  content: {
    id: 'sm' + no,
    title: '動画' + no,
    duration: 60,
    count: { view: no, comment: 0, mylist: 0 },
    thumbnail: { url: 'https://fixture.invalid/poster.svg' },
    registeredAt: '2026-09-20',
  },
}));
test('P3-01 投稿者一覧APIは総数に達するまで全ページを取得し、完全結果だけをキャッシュする', async () => {
  const pages: string[] = [];
  netUtil.fetch = (raw) => {
    const url = new URL(raw);
    pages.push(url.searchParams.get('page')!);
    expect(url.pathname).toBe('/v1/playlist/user-uploaded/201');
    expect(url.searchParams.get('pageSize')).toBe('2');
    return Promise.resolve(
      Response.json({
        meta: { status: 200 },
        data: { totalCount: 3, items: url.searchParams.get('page') === '1' ? entries.slice(0, 2) : entries.slice(2) },
      })
    );
  };
  const request = { type: 'user-uploaded', id: '201', options: { pageSize: '2' } };
  expect(await PlaylistApiLoader.load(request)).toEqual(entries);
  expect(pages).toEqual(['1', '2']);
  expect(await PlaylistApiLoader.load(request)).toEqual(entries);
  expect(pages).toEqual(['1', '2']);
});
test('P3-01 2ページ目失敗では取得済みを全件扱いせず既存プレイリストを保持する', async () => {
  let fail = true;
  const pages: string[] = [];
  netUtil.fetch = (raw) => {
    const page = new URL(raw).searchParams.get('page')!;
    pages.push(page);
    return Promise.resolve(
      page === '2' && fail
        ? Response.json({ meta: { status: 200 } }, { status: 503 })
        : Response.json({
            meta: { status: 200 },
            data: { totalCount: 3, items: page === '1' ? entries.slice(0, 2) : entries.slice(2) },
          })
    );
  };
  const list = new PlayList({});
  list.model.setItem(VideoListItem.createBlankInfo('sm9'));
  list.setIndex(0, true);
  const view = spyOn(list, '_initializeView').mockImplementation(() => {});
  const request = { type: 'user-uploaded', id: '202', options: { pageSize: '2' } };
  try {
    const error: unknown = await list.load(request, { watchId: 'sm9' }, {}).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(list.model.items.map((item) => item.watchId)).toEqual(['sm9']);
    fail = false;
    expect(await PlaylistApiLoader.load(request)).toEqual(entries);
    expect(pages).toEqual(['1', '2', '1', '2']);
  } finally {
    view.mockRestore();
    list.clear();
  }
});
test('P3-01 動画切替後の遅い投稿者一覧は別動画の一覧へ混入しない', async () => {
  let resolve!: (response: Response) => void;
  netUtil.fetch = () =>
    new Promise<Response>((done) => {
      resolve = done;
    });
  const list = new PlayList({});
  list.model.setItem(VideoListItem.createBlankInfo('sm9'));
  list.setIndex(0, true);
  const view = spyOn(list, '_initializeView').mockImplementation(() => {});
  try {
    const pending = list
      .load({ type: 'user-uploaded', id: '203' }, { watchId: 'sm9' }, {})
      .catch((error: unknown) => error);
    list.model.setItem(VideoListItem.createBlankInfo('sm100'));
    list.setIndex(0, true);
    resolve(Response.json({ meta: { status: 200 }, data: { totalCount: 3, items: entries } }));
    const error = await pending;
    expect(error).toBeInstanceOf(DOMException);
    expect(list.model.items.map((item) => item.watchId)).toEqual(['sm100']);
  } finally {
    view.mockRestore();
    list.clear();
  }
});
test('P3-01 空一覧を識別し、総数欠落・途中空ページ・不正応答を成功にしない', async () => {
  netUtil.fetch = () => Promise.resolve(Response.json({ meta: { status: 200 }, data: { totalCount: 0, items: [] } }));
  expect(await PlaylistApiLoader.load({ type: 'user-uploaded', id: '204' })).toEqual([]);
  for (const [index, data] of [
    { items: entries },
    { totalCount: 2, items: [] },
    { totalCount: 1, items: [null] },
  ].entries()) {
    netUtil.fetch = () => Promise.resolve(Response.json({ meta: { status: 200 }, data }));
    const error: unknown = await PlaylistApiLoader.load({ type: 'user-uploaded', id: String(205 + index) }).catch(
      (error: unknown) => error
    );
    expect(error).toBeInstanceOf(Error);
  }
});
