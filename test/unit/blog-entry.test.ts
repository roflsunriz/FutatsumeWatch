import { describe, expect, it } from 'bun:test';
import { getBlogPartsContext } from '../../src/blog';

describe('埋め込みサムネイルの起動導線', () => {
  it('ニコ百の文書URLをoriginへ正規化し、クエリを除いた動画IDを返す', () => {
    expect(
      getBlogPartsContext('https://ext.nicovideo.jp/thumb/sm9?from=nicopedia', 'https://dic.nicovideo.jp/v/sm9')
    ).toEqual({ targetOrigin: 'https://dic.nicovideo.jp', watchId: 'sm9' });
  });

  it('ニコニコ外の親・別経路・壊れた動画IDを拒否する', () => {
    expect(getBlogPartsContext('https://ext.nicovideo.jp/thumb/sm9', 'https://example.com/article')).toBeNull();
    expect(getBlogPartsContext('https://ext.nicovideo.jp/other/sm9', 'https://dic.nicovideo.jp/a/test')).toBeNull();
    expect(
      getBlogPartsContext('https://ext.nicovideo.jp/thumb/not-video', 'https://dic.nicovideo.jp/a/test')
    ).toBeNull();
  });
});
