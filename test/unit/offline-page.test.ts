import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createOfflineSite } from '../../scripts/offline-site';

test('視聴用文書は採取元の初期化メタデータを保持する', async () => {
  const site = createOfflineSite();
  const reply = await site.reply({ method: 'GET', url: 'https://www.nicovideo.jp/watch/sm9' });
  expect(reply?.status).toBe(200);
  if (typeof reply?.body !== 'string') throw new Error('HTML応答が必要です');
  const dom = new JSDOM(reply.body);
  try {
    const metadata = dom.window.document.querySelector<HTMLMetaElement>('meta[name="server-response"]');
    expect(metadata).not.toBeNull();
    expect(JSON.parse(metadata!.content)).toMatchObject({
      meta: { status: 200 },
      data: { response: { okReason: 'PURELY' } },
    });
    expect(dom.window.document.querySelector('h1')).not.toBeNull();
    expect(dom.window.document.querySelector('a[data-anchor-area="video_information"]')).not.toBeNull();
  } finally {
    dom.window.close();
  }
});
