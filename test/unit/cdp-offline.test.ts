import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import { isBlockedUrl } from '../fixtures/cdp/network-policy';
import { installOfflineScene, type OfflineSession } from '../fixtures/cdp/offline';
import { matchFixture, type CdpScene } from '../fixtures/cdp/scene';

const loadScene = (name: string): CdpScene => {
  const raw = fs.readFileSync(`./test/fixtures/cdp/scenes/${name}`, 'utf8');
  return JSON.parse(raw) as CdpScene;
};

describe('CDPオフラインフィクスチャ', () => {
  it('不要通信（広告・計測・編集・favicon）を遮断する', () => {
    expect(isBlockedUrl('https://ads.nicovideo.jp/ad')).toBe(true);
    expect(isBlockedUrl('https://www.google-analytics.com/g/collect')).toBe(true);
    expect(isBlockedUrl('https://www.nicovideo.jp/watch/sm9?edit=1')).toBe(true);
    expect(isBlockedUrl('https://www.nicovideo.jp/favicon.ico')).toBe(true);
    expect(isBlockedUrl('https://www.nicovideo.jp/robots.txt')).toBe(true);
  });

  it('必要通信（watch/nvapi/コメント/検索/サムネイル/HLS）を許可する', () => {
    expect(isBlockedUrl('https://www.nicovideo.jp/watch/sm9')).toBe(false);
    expect(isBlockedUrl('https://nvapi.nicovideo.jp/v1/watch/sm9?v=2')).toBe(false);
    expect(isBlockedUrl('https://public.nvcomment.nicovideo.jp/v1/threads')).toBe(false);
    expect(isBlockedUrl('https://api.search.nicovideo.jp/api/v2/video/contents/search?q=test')).toBe(false);
    expect(isBlockedUrl('https://ext.nicovideo.jp/api/getthumbinfo/sm9')).toBe(false);
    expect(isBlockedUrl('https://delivery.domand.nicovideo.jp/content/sm9/master.m3u8')).toBe(false);
  });

  it('watch基本シーンの必須エントリが解決できる', () => {
    const scene = loadScene('watch-basic-sm9.json');
    expect(scene.format).toBe('futatsume-cdp-scene/v1');
    expect(scene.watchId).toBe('sm9');
    const urls = [
      'https://www.nicovideo.jp/watch/sm9',
      'https://nvapi.nicovideo.jp/v1/watch/sm9?v=2',
      'https://ext.nicovideo.jp/api/getthumbinfo/sm9',
    ];
    for (const url of urls) {
      expect(matchFixture(scene, 'GET', url)).not.toBeNull();
    }
    expect(matchFixture(scene, 'POST', 'https://public.nvcomment.nicovideo.jp/v1/threads')).not.toBeNull();
  });

  it('未登録URLはオフラインで例外になり外部へ出ない', async () => {
    const scene = loadScene('watch-basic-sm9.json');
    let session: OfflineSession | null = null;
    try {
      session = installOfflineScene(scene);
      // 登録済みは解決できる
      const ok = await fetch('https://www.nicovideo.jp/watch/sm9');
      expect(ok.status).toBe(200);
      expect(ok.headers.get('x-futatsume-fixture')).toBe('1');
      // 未登録は例外になる（外部通信しない）
      let threw = false;
      try {
        await fetch('https://www.nicovideo.jp/watch/sm99999999');
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
      // 広告系は遮断例外になる
      let blocked = false;
      try {
        await fetch('https://ads.nicovideo.jp/ad');
      } catch {
        blocked = true;
      }
      expect(blocked).toBe(true);
    } finally {
      session?.restore();
    }
  });

  it('HLSシーンのマスタープレイリストが複数品質を持つ', async () => {
    const scene = loadScene('hls-playback-sm9.json');
    let session: OfflineSession | null = null;
    try {
      session = installOfflineScene(scene);
      const res = await fetch('https://delivery.domand.nicovideo.jp/content/sm9/master.m3u8');
      const text = await res.text();
      expect(text).toContain('#EXTM3U');
      expect(text).toContain('720p.m3u8');
      expect(text).toContain('360p.m3u8');
      const media = await (await fetch('https://delivery.domand.nicovideo.jp/content/sm9/720p.m3u8')).text();
      expect(media).toContain('#EXT-X-ENDLIST');
    } finally {
      session?.restore();
    }
  });
});
