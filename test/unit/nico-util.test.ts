import { describe, expect, it } from 'bun:test';
import { setupNicoDom } from './nico-test-setup';

setupNicoDom();

const { nicoUtil } = await import('../../packages/lib/src/nico/nico-util');

describe('nicoUtil.hasLargeThumbnail', () => {
  it('sm16371888以降を大サムネありと判定する', () => {
    expect(nicoUtil.hasLargeThumbnail('sm16371888')).toBe(true);
    expect(nicoUtil.hasLargeThumbnail('sm16371887')).toBe(false);
  });

  it('nmは大サムネなしと判定する', () => {
    expect(nicoUtil.hasLargeThumbnail('nm12345678')).toBe(false);
  });
});

describe('nicoUtil.getThumbnailUrlByVideoId', () => {
  it('不正なIDではnullを返す', () => {
    expect(nicoUtil.getThumbnailUrlByVideoId('hogehoge')).toBeNull();
    expect(nicoUtil.getThumbnailUrlByVideoId('')).toBeNull();
  });

  it('新サーバーのIDではnicovideo.cdnのURLを返す', () => {
    expect(nicoUtil.getThumbnailUrlByVideoId('sm35374758')).toBe(
      'https://nicovideo.cdn.nimg.jp/thumbnails/35374758/35374758.L'
    );
  });

  it('旧サーバーのIDではsmileのURLを返す', () => {
    expect(nicoUtil.getThumbnailUrlByVideoId('sm9')).toBe('https://tn.smilevideo.jp/smile?i=9.');
  });
});

describe('nicoUtil.getWatchId', () => {
  it('nico.ms短縮URLからIDを抜き出す', () => {
    expect(nicoUtil.getWatchId('https://nico.ms/sm9')).toBe('sm9');
  });

  it('watch URLからIDを抜き出す', () => {
    expect(nicoUtil.getWatchId('https://www.nicovideo.jp/watch/sm9')).toBe('sm9');
  });

  it('shorts URLからIDを抜き出す', () => {
    expect(nicoUtil.getWatchId('https://www.nicovideo.jp/shorts/sm9')).toBe('sm9');
  });
});

describe('nicoUtil.parseWatchQuery', () => {
  it('シリーズのプレイリストを復元する', () => {
    const playlist = { type: 'series', context: { seriesId: '123' } };
    const encoded = Buffer.from(JSON.stringify(playlist)).toString('base64');
    const result = nicoUtil.parseWatchQuery(`playlist=${encoded}`);
    const playlistResult = result.playlist;
    expect(typeof playlistResult === 'object' && playlistResult !== null).toBe(true);
    if (typeof playlistResult !== 'object' || playlistResult === null) {
      return;
    }
    const typed = playlistResult as { type?: string; id?: string };
    expect(typed.type).toBe('series');
    expect(typed.id).toBe('123');
  });

  it('不正なクエリでは空オブジェクトを返す', () => {
    expect(nicoUtil.parseWatchQuery('playlist=%%%')).toEqual({});
  });
});

describe('nicoUtil.isGinzaWatchUrl', () => {
  it('視聴ページURLを判定する', () => {
    expect(nicoUtil.isGinzaWatchUrl('https://www.nicovideo.jp/watch/sm9')).toBe(true);
    expect(nicoUtil.isGinzaWatchUrl('https://www.nicovideo.jp/ranking')).toBe(false);
  });
});
