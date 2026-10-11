import type captured from './watch-response.json';

export type WatchFixtureFormat = 'legacy' | 'v4-envelope' | 'v4-flat' | 'v4-html' | 'v4-media';

// NicoCache_nl 8f1954fのWatchV4UnitTestが確認した構造。本文・URL・キーは既存の人工データだけを使う。
export function watchV4Data(data: typeof captured.data.response) {
  const domand = data.media.domand;
  return {
    ...data,
    media: {
      contents: [
        { videos: domand.videos.map(video => ({ ...video, isAvailable: false })), audios: domand.audios },
        { videos: domand.videos, audios: domand.audios },
        { videos: [{ id: 'video-h264-4320p', height: 4320, qualityLevel: 100, isAvailable: false, label: '4320p' }], audios: [] },
      ],
      hls: { url: `https://fixture.invalid/${data.video.id}/master.m3u8` },
    },
  };
}

export function watchV4Response(data: typeof captured.data.response, format: WatchFixtureFormat, hlsUrl?: string) {
  if (format === 'legacy') return { meta: { status: 200 }, data: { response: data } };
  const v4 = watchV4Data(data);
  if (hlsUrl !== undefined) v4.media.hls.url = hlsUrl;
  if (format === 'v4-flat') return { meta: { status: 200 }, data: v4 };
  if (format === 'v4-media') return { meta: { status: 200 }, data: { responseType: 'media', media: v4.media } };
  return { meta: { status: 200 }, data: { response: { $watchV4: { data: v4 }, pcweb: {} } } };
}

export function watchV4Html(data: typeof captured.data.response): string {
  const body = JSON.stringify(watchV4Response(data, 'v4-envelope')).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!doctype html><html><head><meta name="server-response" content="${body}"></head><body></body></html>`;
}
