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
  watchLoginRequiredMessage,
} from '../../packages/lib/src/nico/watch-response';
import { TagEditApi } from '../../packages/lib/src/nico/tag-edit-api';
import { watchLoginRequired as loginRequired } from '../fixtures/functionality/watch-login-required';
import { currentWatchV4Data, currentWatchV4Lazy, watchHtml } from '../fixtures/functionality/watch-v4-current';

const originalFetch = netUtil.fetch;
afterEach(() => {
  netUtil.fetch = originalFetch;
});

test('未ログインの制限動画は理由とログイン後の再生手順を案内し、自動再送しない', async () => {
  let requests = 0;
  netUtil.fetch = (_url, options) => {
    requests++;
    expect(options?.credentials).toBe('include');
    return Promise.resolve(Response.json(loginRequired, { status: 400 }));
  };
  const error: unknown = await VideoInfoLoader.load('sm20516122', {}).catch((value: unknown) => value);
  expect(error).toMatchObject({ watchId: 'sm20516122', message: watchLoginRequiredMessage(loginRequired) });
  expect(requests).toBe(1);
  expect(watchLoginRequiredMessage(loginRequired, 'ja')).toContain('公式視聴ページ');
  expect(watchLoginRequiredMessage(loginRequired, 'en')).toContain('Sign in');
  expect(() => unwrapWatchResponse(loginRequired)).toThrow(watchLoginRequiredMessage(loginRequired)!);
  const signedIn = structuredClone(loginRequired);
  signedIn.data.googleTagManager.user.login_status = 'login';
  expect(watchLoginRequiredMessage(signedIn)).toBeNull();
  const other = structuredClone(loginRequired);
  other.data.response.reasonCode = 'OTHER';
  expect(watchLoginRequiredMessage(other)).toBeNull();
});

test('通常HTMLのHTTP400でも未ログイン拒否を解析し、他のHTTP400と区別する', async () => {
  netUtil.fetch = () => Promise.resolve(new Response(watchHtml(loginRequired), { status: 400 }));
  const error: unknown = await VideoInfoLoader.load('sm9', {}).catch((value: unknown) => value);
  expect(error).toMatchObject({ message: watchLoginRequiredMessage(loginRequired) });
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

test('通常HTMLを1回取得し、版番号必須のresponseType=jsonを要求しない', async () => {
  const requests: string[] = [];
  netUtil.fetch = (url, options) => {
    requests.push(url);
    expect(new Headers(options?.headers).get('Accept')).toBe('text/html');
    return Promise.resolve(
      new URL(url).searchParams.has('responseType')
        ? Response.json(
            { data: { response: { reason: 'nvpcClientVersion is missing or does not match.' } } },
            { status: 400 }
          )
        : new Response(watchV4Html(base.data.response))
    );
  };
  const raw = (await VideoInfoLoader.load('sm9', {})) as RawVideoInfoData;
  expect(raw.watchApiData.videoDetail.id).toBe('sm9');
  expect(requests).toEqual(['https://www.nicovideo.jp/watch/sm9']);
});

for (const directHls of [false, true]) {
  test(`現行watchV4のHTMLからコメント・タグ・投稿者・シリーズを接続する（直接HLS=${directHls}）`, async () => {
    const data = currentWatchV4Data(base.data.response, directHls);
    const requests: string[] = [];
    netUtil.fetch = (url, init) => {
      requests.push(url);
      if (url === 'https://www.nicovideo.jp/watch/sm9')
        return Promise.resolve(new Response(watchHtml({ data: { response: { $watchV4: { data } } } })));
      expect(url).toBe('https://nvapi.nicovideo.jp/v4/watch/lazy/sm9');
      expect(init?.method).toBe('POST');
      expect(typeof init?.body).toBe('string');
      expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({
        actionTrackId: 'fixture-track',
        keyToken: 'fixture-lazy-key',
      });
      return Promise.resolve(Response.json(currentWatchV4Lazy(base.data.response)));
    };
    const raw = (await VideoInfoLoader.load('sm9', {})) as RawVideoInfoData;
    const model = new VideoInfoModel(raw);
    expect(model.videoId).toBe('sm9');
    expect(model.series).toEqual(base.data.response.series);
    expect(raw.watchApiData.uploaderInfo).toMatchObject({
      id: base.data.response.owner.id,
      name: base.data.response.owner.nickname,
    });
    expect(model.tagList).toHaveLength(data.tags.items.length);
    expect(raw.msgInfo).toMatchObject({
      threadId: data.comment.threads.find((thread) => thread.isPostTarget)!.id,
      nvComment: data.comment.nvComment,
    });
    expect(model.domandInfo?.hlsUrl).toBe(
      directHls ? 'https://delivery.domand.nicovideo.jp/fixtures/sm9/master.m3u8' : undefined
    );
    expect(model.domandInfo?.accessRightKey).toBe(base.data.response.media.domand.accessRightKey);
    expect(model.domandInfo?.availableVideoIds).toEqual(data.media.contents.videos.map((video) => video.id));
    expect(requests).toHaveLength(2);
  });
}

test('通常HTMLが不完全でも同じURLを再要求せず、HTTP拒否も再送しない', async () => {
  for (const status of [200, 400]) {
    let calls = 0;
    netUtil.fetch = () => {
      calls++;
      return Promise.resolve(Response.json({ data: { media: {} } }, { status }));
    };
    const error: unknown = await VideoInfoLoader.load('sm9', {}).catch((value: unknown) => value);
    expect(error).toMatchObject({
      message: status === 400 ? '動画情報の取得に失敗しました (HTTP 400)' : '視聴ページの動画情報が不完全です',
    });
    expect(calls).toBe(1);
  }
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
