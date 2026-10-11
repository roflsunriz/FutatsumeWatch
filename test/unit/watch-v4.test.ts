import { afterEach, expect, test } from 'bun:test';
import { VideoInfoLoader } from '../../packages/lib/src/nico/video-info-loader';
import { VideoInfoModel } from '../../src/video-info-panel/video-info';
import type { RawVideoInfoData } from '../../src/video-info-panel/video-info';
import { netUtil } from '../../packages/lib/src/infra/net-util';
import base from '../fixtures/functionality/watch-response.json';
import { watchV4Data, watchV4Html, watchV4Response } from '../fixtures/functionality/watch-v4';
import {
  isWatchPageResponse,
  normalizeWatchV4Media,
  parseWatchResponseText,
  unwrapWatchResponse,
} from '../../packages/lib/src/nico/watch-response';
import { TagEditApi } from '../../packages/lib/src/nico/tag-edit-api';

const originalFetch = netUtil.fetch;
afterEach(() => {
  netUtil.fetch = originalFetch;
});

for (const format of ['v4-envelope', 'v4-flat', 'v4-html'] as const) {
  test(`${format}から動画・コメント・タグ・シリーズと全配信グループを読み取る`, async () => {
    netUtil.fetch = () =>
      Promise.resolve(
        format === 'v4-html'
          ? new Response(watchV4Html(base.data.response), { headers: { 'Content-Type': 'text/html' } })
          : Response.json(watchV4Response(base.data.response, format))
      );
    const raw = (await VideoInfoLoader.load('sm9', {})) as RawVideoInfoData;
    const model = new VideoInfoModel(raw);
    expect(model.videoId).toBe('sm9');
    expect(model.title).toBe(base.data.response.video.title);
    expect(model.description).toBe(base.data.response.video.description);
    expect(model.series?.id).toBe(base.data.response.series.id);
    expect(raw.msgInfo).toMatchObject({ nvComment: base.data.response.comment.nvComment });
    expect(model.tagList.map((tag) => tag.name)).toEqual(base.data.response.tag.items.map((tag) => tag.name));
    expect(model.domandInfo?.availableVideoIds).toEqual(
      base.data.response.media.domand.videos.map((video) => video.id)
    );
    expect(model.domandInfo?.availableAudioIds).toEqual(
      base.data.response.media.domand.audios.map((audio) => audio.id)
    );
    expect(raw.domandInfo).toMatchObject({ hlsUrl: 'https://fixture.invalid/sm9/master.m3u8' });
    expect(model.hasStoryboard).toBe(false);
  });
}

test('mediaだけの応答は同じ動画の初期HTMLを一度取得してメタデータを補う', async () => {
  const requests: string[] = [];
  netUtil.fetch = (url) => {
    requests.push(url);
    return Promise.resolve(
      requests.length === 1
        ? Response.json({ meta: { status: 200 }, data: { media: { hls: { url: 'opaque-fixture' } } } })
        : new Response(watchV4Html(base.data.response))
    );
  };
  const raw = (await VideoInfoLoader.load('sm9', {})) as RawVideoInfoData;
  expect(raw.watchApiData.videoDetail.id).toBe('sm9');
  expect(requests).toEqual([
    'https://www.nicovideo.jp/watch/sm9?responseType=json',
    'https://www.nicovideo.jp/watch/sm9',
  ]);
});

test('外側に残るコメント・タグを保持し、watchV4の動画情報を優先する', () => {
  const data = unwrapWatchResponse({
    data: {
      response: {
        ...base.data.response,
        $watchV4: {
          data: { video: { ...base.data.response.video, title: '新しいタイトル' }, media: { contents: [] } },
        },
      },
    },
  });
  expect(data.comment).toEqual(base.data.response.comment);
  expect(data.tag).toEqual(base.data.response.tag);
  expect(data.video).toMatchObject({ title: '新しいタイトル' });
  expect(
    unwrapWatchResponse({ data: { response: { ...base.data.response, $watchV4: { data: null } } } }).video
  ).toEqual(base.data.response.video);
});

test('視聴ページは新旧応答で判定し、mediaだけ・エラー・不完全な包みを除外する', () => {
  expect(isWatchPageResponse(JSON.stringify(base))).toBe(true);
  expect(isWatchPageResponse(JSON.stringify(watchV4Response(base.data.response, 'v4-envelope')))).toBe(true);
  expect(isWatchPageResponse(JSON.stringify(watchV4Response(base.data.response, 'v4-media')))).toBe(false);
  expect(isWatchPageResponse(JSON.stringify({ meta: { status: 403 }, data: base.data }))).toBe(false);
  expect(isWatchPageResponse('null')).toBe(false);
  expect(() => parseWatchResponseText('<html><body>missing</body></html>')).toThrow('動画情報');
  expect(() => unwrapWatchResponse({ data: { response: { $watchV4: {} } } })).toThrow('watchV4');
});

test('全グループの利用可能性をORでまとめ、IDから解像度・音声の優先度を補う', () => {
  const delivery = normalizeWatchV4Media({
    contents: [
      {
        videos: [{ id: 'video-h264-720p', isAvailable: false }],
        audios: [{ id: 'audio-aac-64kbps', isAvailable: true }],
      },
      {
        videos: [
          { id: 'video-h264-720p', isAvailable: true },
          { id: 'video-h264-480p', isAvailable: true },
        ],
        audios: [{ id: 'audio-aac-192kbps', isAvailable: true }],
      },
    ],
    hls: { url: 'https://delivery.domand.nicovideo.jp/fixture/master.m3u8?session=fixture' },
  });
  expect(delivery?.videos.map((video) => [video.id, video.isAvailable, video.height, video.label])).toEqual([
    ['video-h264-720p', true, 720, '720p'],
    ['video-h264-480p', true, 480, '480p'],
  ]);
  expect(delivery?.audios.map((audio) => audio.id)).toEqual(['audio-aac-192kbps', 'audio-aac-64kbps']);
  for (const url of ['opaque-fixture', 'javascript:alert(1)', 'https://user:pass@example.com/master.m3u8'])
    expect(normalizeWatchV4Media({ contents: [], hls: { url } })?.hlsUrl).toBeNull();
});

test('HTTP拒否を成功metaで隠さず、HTMLフォールバックや自動再送をしない', async () => {
  let count = 0;
  netUtil.fetch = () => {
    count++;
    return Promise.resolve(Response.json(base, { status: 403 }));
  };
  const result: unknown = await VideoInfoLoader.load('sm9', {}).catch((error: unknown) => error);
  expect(result).toMatchObject({ watchId: 'sm9', message: '動画情報の取得に失敗しました (HTTP 403)' });
  expect(count).toBe(1);
});

test('watchV4のタグ編集キーを一度取得し、期限切れ操作を一度だけ再送する', async () => {
  let count = 0;
  netUtil.fetch = (_url, init) => {
    count++;
    if (count === 1)
      return Promise.resolve(Response.json({ meta: { status: 401, errorCode: 'KEY_EXPIRED' } }, { status: 401 }));
    if (count === 2) return Promise.resolve(Response.json(watchV4Response(base.data.response, 'v4-envelope')));
    expect(new Headers(init?.headers).get('X-Tag-Edit-Key')).toBe(base.data.response.tag.edit.editKey);
    return Promise.resolve(Response.json({ meta: { status: 200 }, data: { tags: [] } }));
  };
  expect((await new TagEditApi().change('POST', 'sm9', '検証', 'old')).editKey).toBe(
    base.data.response.tag.edit.editKey
  );
  expect(count).toBe(3);
});

test('利用可能な画質のない有料動画は、従来の購入案内を保持する', async () => {
  const original = structuredClone(base.data.response);
  original.payment.video.isPpv = true;
  const data = watchV4Data(original);
  for (const group of data.media.contents) for (const video of group.videos) video.isAvailable = false;
  netUtil.fetch = () =>
    Promise.resolve(Response.json({ meta: { status: 200 }, data: { response: { $watchV4: { data } } } }));
  const error: unknown = await VideoInfoLoader.load('sm9', {}).catch((value: unknown) => value);
  expect(error).toMatchObject({ watchId: 'sm9', message: 'この動画は有料です' });
});
