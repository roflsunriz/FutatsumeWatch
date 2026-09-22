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
    return Promise.resolve(Response.json({ meta: { status: 200 }, data: { articleId: 354273 } }));
  };
  expect(await Promise.all([getNicodicArticleExists(title), getNicodicArticleExists(title)])).toEqual([true, true]);
  expect(calls).toBe(1);
});
test('P4-04 2xxを存在、404を不存在とし、通信失敗と他の拒否を未知にする', async () => {
  netUtil.fetch = () => Promise.resolve(Response.json({ error: 'not found' }, { status: 404 }));
  expect(await getNicodicArticleExists('辞書存在しないテスト')).toBe(false);
  for (const status of [403, 429, 500]) {
    netUtil.fetch = () => Promise.resolve(Response.json({ error: 'failure' }, { status }));
    expect(await getNicodicArticleExists('辞書失敗テスト' + status)).toBeUndefined();
  }
  netUtil.fetch = () => Promise.resolve(Response.json({ any: 'official response shape' }));
  expect(await getNicodicArticleExists('辞書200')).toBe(true);
});
