import { afterEach, expect, test } from 'bun:test';
import { netUtil } from '../../packages/lib/src/infra/net-util';
import { MylistManagementApi } from '../../packages/lib/src/nico/mylist-management-api';
import { MylistApiLoader } from '../../packages/lib/src/nico/mylist-api-loader';

const original = netUtil.fetch;
afterEach(() => {
  netUtil.fetch = original;
});
const response = (data: object, status = 200): Response => Response.json({ meta: { status }, data }, { status });

test('公式契約の作成・設定更新・削除はフォームとヘッダーを渡し、結果を検証する', async () => {
  const seen: Array<{ url: URL; method: string; body: string; headers: Headers }> = [];
  netUtil.fetch = (raw, init) => {
    seen.push({
      url: new URL(raw),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : '',
      headers: new Headers(init?.headers),
    });
    return Promise.resolve(
      response(
        { mylist: { id: 42, name: '保存後', description: '説明', isPublic: false } },
        init?.method === 'POST' ? 201 : 200
      )
    );
  };
  const fields = {
    name: '保存後',
    description: '説明',
    isPublic: false,
    defaultSortKey: 'addedAt',
    defaultSortOrder: 'desc',
  };
  expect((await MylistManagementApi.create(fields)).name).toBe('保存後');
  expect((await MylistManagementApi.update('42', fields)).description).toBe('説明');
  await MylistManagementApi.remove('42');
  expect(seen.map((entry) => [entry.method, entry.url.pathname])).toEqual([
    ['POST', '/v1/users/me/mylists'],
    ['PUT', '/v1/users/me/mylists/42'],
    ['DELETE', '/v1/users/me/mylists/42'],
  ]);
  expect(new URLSearchParams(seen[0]!.body).get('defaultSortOrder')).toBe('desc');
  expect(seen[0]!.headers.get('X-Request-With')).toBe('https://www.nicovideo.jp');
  expect(seen[0]!.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
});

test('動画追加は公式のクエリ契約、メモ編集はフォーム契約で送る', async () => {
  const seen: Array<{ url: URL; method: string; body: string }> = [];
  netUtil.fetch = (raw, init) => {
    seen.push({
      url: new URL(raw),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : '',
    });
    return Promise.resolve(response({ item: {} }, init?.method === 'POST' ? 201 : 200));
  };
  await MylistManagementApi.addItem('42', 'sm9', '記録');
  await MylistManagementApi.updateItem('42', '321', '新しいメモ');
  await MylistManagementApi.removeItem('42', '321');
  await MylistManagementApi.addWatchLater('sm9', '後で');
  await MylistManagementApi.updateWatchLater('321', '更新');
  await MylistManagementApi.removeWatchLater('321');
  expect(seen[0]!.url.searchParams.get('itemId')).toBe('sm9');
  expect(seen[0]!.url.searchParams.get('description')).toBe('記録');
  expect(seen[0]!.body).toBe('');
  expect(new URLSearchParams(seen[1]!.body).get('description')).toBe('新しいメモ');
  expect(seen[2]!.url.searchParams.get('itemIds')).toBe('321');
  expect(new URLSearchParams(seen[3]!.body).get('memo')).toBe('後で');
  expect(new URLSearchParams(seen[4]!.body).get('memo')).toBe('更新');
  expect(seen[5]!.url.searchParams.get('itemIds')).toBe('321');
});

test('既存ローダーは追加後にとりマイを削除せず、個別削除には項目IDを使う', async () => {
  const seen: Array<{ url: URL; method: string }> = [];
  netUtil.fetch = (raw, init) => {
    const url = new URL(raw),
      method = init?.method ?? 'GET';
    seen.push({ url, method });
    if (method === 'GET')
      return Promise.resolve(response({ mylist: { items: [{ watchId: 'sm9', itemId: '321' }], hasNext: false } }));
    return Promise.resolve(response({}, method === 'POST' ? 201 : 200));
  };
  await MylistApiLoader.addMylistItem('sm9', '42', '');
  await MylistApiLoader.removeMylistItem('sm9', '42');
  expect(
    seen.filter((entry) => entry.method === 'DELETE').map((entry) => entry.url.searchParams.get('itemIds'))
  ).toEqual(['321']);
  expect(seen.some((entry) => entry.url.pathname.includes('watch-later'))).toBe(false);
});

test('登録動画ととりマイは後続ページを結合し、動画IDと登録項目IDを区別する', async () => {
  const seen: string[] = [];
  netUtil.fetch = (raw) => {
    const url = new URL(raw),
      page = url.searchParams.get('page')!;
    seen.push(`${url.pathname}:${page}`);
    return Promise.resolve(
      response({
        [url.pathname.includes('watch-later') ? 'watchLater' : 'mylist']: {
          hasNext: page === '1',
          items: [
            {
              itemId: page === '1' ? '101' : '102',
              watchId: page === '1' ? 'sm9' : 'sm100',
              description: `memo${page}`,
              content: { title: `動画${page}` },
            },
          ],
        },
      })
    );
  };
  const regular = await MylistManagementApi.items('42');
  const later = await MylistManagementApi.watchLaterItems();
  expect(regular.map((item) => [item.itemId, item.watchId, item.description, item.title])).toEqual([
    ['101', 'sm9', 'memo1', '動画1'],
    ['102', 'sm100', 'memo2', '動画2'],
  ]);
  expect(later).toHaveLength(2);
  expect(seen).toEqual([
    '/v1/users/me/mylists/42:1',
    '/v1/users/me/mylists/42:2',
    '/v1/users/me/watch-later:1',
    '/v1/users/me/watch-later:2',
  ]);
});

test('拒否応答と不正な一覧を成功扱いしない', async () => {
  netUtil.fetch = () => Promise.resolve(response({}, 403));
  const denied: unknown = await MylistManagementApi.remove('42').catch((error: unknown) => error);
  expect(denied).toBeInstanceOf(Error);
  netUtil.fetch = () => Promise.resolve(response({ mylists: [{ name: 'IDなし' }] }));
  const malformed: unknown = await MylistManagementApi.list().catch((error: unknown) => error);
  expect(malformed).toBeInstanceOf(Error);
});
