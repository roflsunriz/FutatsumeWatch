import { afterEach, expect, test } from 'bun:test';
import { getNicodicArticleExists } from '../../packages/lib/src/nico/nico-dic-api';
import { netUtil } from '../../packages/lib/src/infra/net-util';
const original = netUtil.fetch;
afterEach(() => {
  netUtil.fetch = original;
});
test('P4-04 記号付きの記事名を公式APIへ照会し、同時照会を共有する', async () => {
  let calls = 0;
  const title = '辞書検証 日本語 & #';
  netUtil.fetch = (url, options) => {
    calls++;
    expect(url).toBe('https://api.dic.nicovideo.jp/v1/articles/article/' + encodeURIComponent(title));
    expect(options?.credentials).toBe('omit');
    return Promise.resolve(
      Response.json({ id: 354273, url: 'https://dic.nicovideo.jp/a/' + encodeURIComponent(title) })
    );
  };
  expect(await Promise.all([getNicodicArticleExists(title), getNicodicArticleExists(title)])).toEqual([true, true]);
  expect(calls).toBe(1);
});
test('P4-04 404だけを不存在とし、通信失敗・拒否・不正応答を未知と区別する', async () => {
  netUtil.fetch = () => Promise.resolve(Response.json({ error: 'not found' }, { status: 404 }));
  expect(await getNicodicArticleExists('辞書存在しないテスト')).toBe(false);
  for (const status of [403, 429, 500]) {
    netUtil.fetch = () => Promise.resolve(Response.json({ error: 'failure' }, { status }));
    expect(await getNicodicArticleExists('辞書失敗テスト' + status)).toBeUndefined();
  }
  netUtil.fetch = () => Promise.resolve(Response.json({ url: 'https://dic.nicovideo.jp/a/test' }));
  expect(await getNicodicArticleExists('辞書形式不正')).toBeUndefined();
  netUtil.fetch = () => Promise.resolve(Response.json({ id: 1, url: 'https://dic.nicovideo.jp/a/test' }));
  expect(await getNicodicArticleExists('辞書形式不正')).toBe(true);
});
