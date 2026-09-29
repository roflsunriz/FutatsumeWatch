import { afterEach, expect, test } from 'bun:test';
import { TagEditApi } from '../../packages/lib/src/nico/tag-edit-api';
import { netUtil } from '../../packages/lib/src/infra/net-util';

const original = netUtil.fetch;
afterEach(() => {
  netUtil.fetch = original;
});

test('公式契約のPOST/DELETEと日本語タグのクエリ、編集ヘッダーを使う', async () => {
  const calls: Array<{ url: string; method?: string; headers?: HeadersInit }> = [];
  netUtil.fetch = (url, init) => {
    calls.push({ url, method: init?.method, headers: init?.headers });
    return Promise.resolve(
      Response.json({ meta: { status: 200 }, data: { tags: [{ name: '既存', isLocked: true }] } })
    );
  };
  const api = new TagEditApi();
  expect((await api.change('POST', 'sm9', '日本語 タグ', 'key')).tags[0]?.isLocked).toBe(true);
  await api.change('DELETE', 'sm9', '日本語 タグ', 'key');
  expect(calls.map((call) => call.method)).toEqual(['POST', 'DELETE']);
  for (const call of calls) {
    expect(new URL(call.url).pathname).toBe('/v2/videos/sm9/tags');
    expect(new URL(call.url).searchParams.get('tag')).toBe('日本語 タグ');
    expect(new Headers(call.headers).get('X-Tag-Edit-Key')).toBe('key');
    expect(new Headers(call.headers).get('X-Request-With')).toBe('https://www.nicovideo.jp');
  }
});

test('期限切れキーはwatch応答から一度だけ更新して同じ操作を再送する', async () => {
  const calls: string[] = [];
  netUtil.fetch = (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
    if (calls.length === 1)
      return Promise.resolve(Response.json({ meta: { status: 401, errorCode: 'KEY_EXPIRED' } }, { status: 401 }));
    if (calls.length === 2)
      return Promise.resolve(
        Response.json({ data: { response: { tag: { edit: { editKey: 'fresh', isEditable: true } } } } })
      );
    expect(new Headers(init?.headers).get('X-Tag-Edit-Key')).toBe('fresh');
    return Promise.resolve(Response.json({ meta: { status: 200 }, data: { tags: [{ name: '更新後' }] } }));
  };
  const result = await new TagEditApi().change('POST', 'sm9', '更新後', 'old');
  expect(result).toEqual({
    tags: [{ name: '更新後', isLocked: false, isNicodicArticleExists: false }],
    editKey: 'fresh',
  });
  expect(calls).toEqual(['POST /v2/videos/sm9/tags', 'GET /watch/sm9', 'POST /v2/videos/sm9/tags']);
});

test('ロック等の拒否は再送せずエラーとして示す', async () => {
  let calls = 0;
  netUtil.fetch = () => {
    calls++;
    return Promise.resolve(Response.json({ meta: { status: 403, errorCode: 'TAG_LOCKED' } }, { status: 403 }));
  };
  const error: unknown = await new TagEditApi()
    .change('DELETE', 'sm9', '固定', 'key')
    .catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('TAG_LOCKED');
  expect(calls).toBe(1);
});
