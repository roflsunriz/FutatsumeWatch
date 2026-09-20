import { afterEach, expect, test } from 'bun:test';
import { MylistApiLoader } from '../../packages/lib/src/nico/mylist-api-loader';
import { netUtil } from '../../packages/lib/src/infra/net-util';
const original = netUtil.fetch;
afterEach(() => {
  netUtil.fetch = original;
});
test('P3-04 後で見るとマイリストの複数ページを欠落なく結合する', async () => {
  for (const kind of ['watchLater', 'mylist'] as const) {
    const pages: string[] = [];
    netUtil.fetch = (raw) => {
      const url = new URL(raw),
        page = url.searchParams.get('page')!;
      pages.push(page);
      return Promise.resolve(
        Response.json({
          meta: { status: 200 },
          data: {
            [kind]: {
              hasNext: page === '1',
              hasInvisibleItems: false,
              items: [{ watchId: page === '1' ? 'sm9' : 'sm100', itemId: page }],
            },
          },
        })
      );
    };
    const items =
      kind === 'watchLater' ? await MylistApiLoader._getDeflistItems() : await MylistApiLoader._getMylistItems('42');
    expect(items.map((item) => item.watchId)).toEqual(['sm9', 'sm100']);
    expect(pages).toEqual(['1', '2']);
  }
});
test('P3-04 明示的な再取得はキャッシュを越えて変更された追加先を読む', async () => {
  let calls = 0;
  netUtil.fetch = () => {
    calls++;
    return Promise.resolve(
      Response.json({ meta: { status: 200 }, data: { mylists: calls === 1 ? [] : [{ id: 42, name: '新規一覧' }] } })
    );
  };
  expect(await MylistApiLoader.getMylistList({ forceRefresh: true })).toEqual([]);
  expect(await MylistApiLoader.getMylistList()).toEqual([]);
  expect(calls).toBe(1);
  expect(await MylistApiLoader.getMylistList({ forceRefresh: true })).toEqual([{ id: 42, name: '新規一覧' }]);
  expect(calls).toBe(2);
});
test('P3-04 HTTP失敗と不正スキーマを取得・追加の成功として扱わない', async () => {
  for (const data of [
    { meta: { status: 200 }, data: { mylists: 'bad' } },
    { meta: { status: '200' }, data: { mylists: [] } },
    { meta: { status: 200 }, data: { mylists: [{ name: 'IDなし' }] } },
  ]) {
    netUtil.fetch = () => Promise.resolve(Response.json(data));
    const error: unknown = await MylistApiLoader.getMylistList({ forceRefresh: true }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
  }
  for (const operation of [
    () => MylistApiLoader.getMylistList({ forceRefresh: true }),
    () => MylistApiLoader.addMylistItem('sm9', '42', ''),
    () => MylistApiLoader.addDeflistItem('sm9', ''),
  ]) {
    let calls = 0;
    netUtil.fetch = () => {
      calls++;
      return Promise.resolve(Response.json({ meta: { status: 201 }, data: { mylists: [] } }, { status: 500 }));
    };
    const error: unknown = await operation().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(calls).toBe(1);
  }
});
