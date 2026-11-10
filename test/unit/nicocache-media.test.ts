import { afterEach, expect, test } from 'bun:test';
import { isNicoCacheMediaUrl } from '../../packages/lib/src/nico/nicocache-media';
import { isDomandDeliveryUrl } from '../../src/hls/gate-hls-loader';
import { gate } from '../../packages/lib/src/message/gate';
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('採取したNicoCache_nlの映像・音声・初期化片だけをHLS中継へ接続する', () => {
  for (const [id, media, file] of [
    ['sm46861324video-h264-720p', 'video', '01.cmfv'],
    ['sm2057168audio-aac-192kbps', 'audio', 'init01.cmfa'],
    ['so46805846video-h264-360p', 'video', 'chunk-2.m4s'],
  ]) {
    const url = `https://nicocachenl.test/media/v1/playback-sessions/${id}/files/${media}/${file}?nicocachenl_media_version=2`;
    expect(isNicoCacheMediaUrl(url)).toBe(true);
    expect(isDomandDeliveryUrl(url)).toBe(true);
  }
});

test('別origin・資格情報・管理API・セッション作成・パス逸脱を許可しない', () => {
  const valid = 'https://nicocachenl.test/media/v1/playback-sessions/sm9video-h264-720p/files/video/01.cmfv';
  for (const url of [
    valid.replace('https:', 'http:'),
    valid.replace('nicocachenl.test', 'nicocachenl.test.evil.example'),
    valid.replace('nicocachenl.test', 'other.test'),
    valid.replace('nicocachenl.test', 'nicocachenl.test:8443'),
    valid.replace('nicocachenl.test', 'user:password@nicocachenl.test'),
    'https://nicocachenl.test/admin/',
    'https://nicocachenl.test/media/v1/playback-sessions',
    valid.replace('/01.cmfv', '/../settings.json'),
    valid.replace('/01.cmfv', '/%2fsettings.json'),
    valid.replace('/01.cmfv', '/nested/01.cmfv'),
  ])
    expect(isNicoCacheMediaUrl(url)).toBe(false);
});

test('iframeの通信窓口も映像GETだけを通し、管理URLや書込みは送信しない', async () => {
  const bridge = gate();
  let requests = 0;
  globalThis.fetch = Object.assign(
    () => {
      requests++;
      return Promise.resolve(new Response('media'));
    },
    { preconnect: originalFetch.preconnect }
  );
  const url = 'https://nicocachenl.test/media/v1/playback-sessions/sm9audio-aac-192kbps/files/audio/init01.cmfa';
  const response = (await bridge.uFetch({ url, options: { credentials: 'include' } })) as Response;
  expect(await response.text()).toBe('media');
  for (const [target, method] of [
    [url, 'POST'],
    ['https://nicocachenl.test/admin/', 'GET'],
  ]) {
    const result: unknown = await bridge.uFetch({ url: target!, options: { method } }).catch((error: unknown) => error);
    expect(result).toMatchObject({ status: 'fail' });
  }
  expect(requests).toBe(1);
});
