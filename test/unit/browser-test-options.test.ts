import { expect, test } from 'bun:test';
import { browserTestOptions, browserSuites } from '../../scripts/browser-test-options';

test('既定は全件オフラインで投稿を公開サーバーへ送らない', () => {
  expect(browserTestOptions([])).toEqual({ selected: [...browserSuites], mode: 'offline', url: undefined });
  expect(browserTestOptions(['--offline', 'ui']).selected).toEqual(['ui']);
  expect(browserTestOptions(['all', '--live']).selected).not.toContain('functionality');
  expect(browserTestOptions(['all', '--live']).selected).not.toContain('library');
});
test('モード重複・未実装指定・書込スイートのliveを起動前に拒否', () => {
  for (const args of [
    ['--live', '--offline'],
    ['oops'],
    ['ui', 'player'],
    ['functionality', '--live'],
    ['library', '--live'],
    ['--url'],
  ])
    expect(() => browserTestOptions(args)).toThrow();
});
test('実測URLは明示したplayerの公開視聴だけ', () => {
  expect(browserTestOptions(['player', '--live', '--url', 'https://www.nicovideo.jp/watch/sm9']).url).toBe(
    'https://www.nicovideo.jp/watch/sm9'
  );
  for (const args of [
    ['player', '--url', 'https://www.nicovideo.jp/watch/sm9'],
    ['player', '--live', '--url', 'https://example.com/watch/sm9'],
    ['entry', '--live', '--url', 'https://www.nicovideo.jp/watch/sm9'],
  ])
    expect(() => browserTestOptions(args)).toThrow();
});
