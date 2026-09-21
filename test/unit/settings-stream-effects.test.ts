import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { Config } from '../../src/config';
import { VideoInfoLoader } from '../../packages/lib/src/nico/video-info-loader';
import { VideoInfoModel, VideoFilter } from '../../src/video-info';
import type { RawVideoInfoData } from '../../src/video-info';
import { VideoSessionWorker } from '../../packages/lib/src/nico/video-session-worker';
import { WatchInfoCacheDb } from '../../packages/lib/src/nico/watch-info-cache-db';
import { netUtil } from '../../packages/lib/src/infra/net-util';
import { global } from '../../src/futatsume-watch-index';
import captured from '../fixtures/functionality/watch-response.json';

await Config.promise('restore');
Object.assign(globalThis, {
  HTMLElement: window.HTMLElement,
  HTMLVideoElement: window.HTMLVideoElement,
  HTMLCanvasElement: window.HTMLCanvasElement,
  Image: window.Image,
  Element: window.Element,
  Document: window.Document,
  Node: window.Node,
  customElements: window.customElements,
  CustomEvent: window.CustomEvent,
  MutationObserver: window.MutationObserver,
});
const { NicoVideoPlayerDialog } = await import('../../src/nico-video-player-dialog');
const originalFetch = netUtil.fetch;
const originalLinked = Config.getValue('loadLinkedChannelVideo');
const originalHls = global.debug.isHLSSupported;
let log: ReturnType<typeof spyOn<typeof console, 'log'>>;
let errors: ReturnType<typeof spyOn<typeof window.console, 'error'>>;
let expectedErrors = 0;
beforeEach(() => {
  Config.setValue('loadLinkedChannelVideo', false);
  global.debug.isHLSSupported = true;
  // 動画情報全体のdebug出力だけを抑える。失敗ログは下で想定件数を照合する。
  log = spyOn(console, 'log').mockImplementation(() => {});
  errors = spyOn(window.console, 'error').mockImplementation(() => {});
  expectedErrors = 0;
});
afterEach(() => {
  expect(errors).toHaveBeenCalledTimes(expectedErrors);
  errors.mockRestore();
  log.mockRestore();
  netUtil.fetch = originalFetch;
  Config.setValue('loadLinkedChannelVideo', originalLinked);
  global.debug.isHLSSupported = originalHls;
});

function response(
  options: {
    watchId?: string;
    domand?: boolean;
    paid?: boolean;
    anime?: boolean;
  } = {}
) {
  const json = structuredClone(captured);
  const data = json.data.response;
  const watchId = options.watchId ?? 'sm9';
  return {
    ...json,
    data: {
      response: {
        ...data,
        client: { ...data.client, watchId },
        video: { ...data.video, id: watchId },
        genre: { ...data.genre, key: options.anime ? 'anime' : 'none' },
        payment: { ...data.payment, video: { ...data.payment.video, isPpv: options.paid ?? false } },
        media: {
          ...data.media,
          domand: options.domand === false ? null : data.media.domand,
        },
      },
    },
  };
}
async function load(options: Parameters<typeof response>[0] = {}): Promise<RawVideoInfoData> {
  const json = response(options);
  netUtil.fetch = () => Promise.resolve(Response.json(json));
  // ローダーのunknown返却を本体と同じ境界でVideoInfoModelへ渡す。
  return (await VideoInfoLoader.load(options.watchId ?? 'sm9', {})) as RawVideoInfoData;
}

test('P2-07/enableStoryboard: 会員別の応答値に関係なくStoryboard取得を試せる情報へ正規化する', async () => {
  const data = await load();
  expect(data.domandInfo?.isStoryboardAvailable).toBe(true);
  expect(new VideoInfoModel(data).hasStoryboard).toBe(true);
});

test('P2-10/loadLinkedChannelVideo: ON時だけ加入済みの関連動画を取得し、その配信資産へ切り替える', async () => {
  for (const enabled of [false, true]) {
    Config.setValue('loadLinkedChannelVideo', enabled);
    const requests: string[] = [];
    netUtil.fetch = (url) => {
      requests.push(url);
      if (url === 'https://www.nicovideo.jp/watch/so9001?responseType=json')
        return Promise.resolve(Response.json(response({ watchId: 'so9001', domand: false, paid: true, anime: true })));
      if (url === 'https://public-api.ch.nicovideo.jp/v1/user/channelVideoDAnimeLinks?videoId=so9001&_frontendId=6')
        return Promise.resolve(
          Response.json({
            data: {
              items: [
                { linkedVideoId: 'so9003', isChannelMember: false },
                { linkedVideoId: 'so9002', isChannelMember: true },
              ],
            },
          })
        );
      if (url === 'https://www.nicovideo.jp/watch/so9002?responseType=json')
        return Promise.resolve(Response.json(response({ watchId: 'so9002' })));
      throw new Error('未登録要求: ' + url);
    };
    if (!enabled) {
      expectedErrors++;
      const failure: unknown = await VideoInfoLoader.load('so9001', {}).then(
        () => null,
        (error: unknown) => error
      );
      expect(failure).not.toBeNull();
      expect(requests).toEqual(['https://www.nicovideo.jp/watch/so9001?responseType=json']);
    } else {
      const result = (await VideoInfoLoader.load('so9001', {})) as RawVideoInfoData;
      const model = new VideoInfoModel(result);
      expect(requests).toHaveLength(3);
      expect(requests[2]).toBe('https://www.nicovideo.jp/watch/so9002?responseType=json');
      expect(model.watchId).toBe('so9001');
      expect(model.domandInfo!.videoId).toBe('so9002');
      expect(model.isDomandAvailable).toBe(true);
    }
  }
});
test('P2-10/loadLinkedChannelVideo-unrelated: 元動画が再生可能・非アニメ・無料なら関連チャンネルを探さない', async () => {
  Config.setValue('loadLinkedChannelVideo', true);
  for (const options of [
    { domand: true, paid: true, anime: true },
    { domand: false, paid: true, anime: false },
    { domand: false, paid: false, anime: true },
  ]) {
    const requests: string[] = [];
    netUtil.fetch = (url) => {
      requests.push(url);
      return Promise.resolve(Response.json(response(options)));
    };
    if (!options.domand) expectedErrors++;
    const result: unknown = await VideoInfoLoader.load('sm9', {}).catch((error: unknown) => error);
    expect(requests).toEqual(['https://www.nicovideo.jp/watch/sm9?responseType=json']);
    if (options.domand) expect(new VideoInfoModel(result as RawVideoInfoData).domandInfo!.videoId).toBe('sm9');
  }
});
test('P2-10/loadLinkedChannelVideo-membership: 非加入候補だけなら勝手に別動画へ切り替えない', async () => {
  Config.setValue('loadLinkedChannelVideo', true);
  const requests: string[] = [];
  netUtil.fetch = (url) => {
    requests.push(url);
    return Promise.resolve(
      Response.json(
        url.includes('/watch/')
          ? response({ domand: false, paid: true, anime: true })
          : { data: { items: [{ linkedVideoId: 'so9002', isChannelMember: false }] } }
      )
    );
  };
  expectedErrors++;
  const failure: unknown = await VideoInfoLoader.load('sm9', {}).then(
    () => null,
    (error: unknown) => error
  );
  expect(failure).not.toBeNull();
  expect(requests).toHaveLength(2);
  expect(requests.some((url) => url.includes('/watch/so9002'))).toBe(false);
});

async function choose(raw: RawVideoInfoData) {
  const creates: Array<Parameters<typeof VideoSessionWorker.create>[0]> = [];
  const mediaUrls: string[] = [];
  const cache = spyOn(WatchInfoCacheDb, 'put').mockResolvedValue({});
  const session = spyOn(VideoSessionWorker, 'create').mockImplementation((params) => {
    creates.push(params);
    return Promise.resolve({
      sessionId: 'fixture',
      connect: () => Promise.resolve({ url: 'https://fixture.invalid/selected-stream', type: 'domand' }),
      getState: () => Promise.resolve({}),
      close: () => Promise.resolve(undefined),
    });
  });
  const state: Record<string, unknown> = {};
  const context = {
    _requestId: 'current',
    _view: { updateViewer() {} },
    _watchId: 'sm9',
    _playerConfig: {
      props: {
        domandVideoQuality: 'current-quality',
        screenMode: 'normal',
      },
    },
    _state: { setState: (values: Record<string, unknown>) => Object.assign(state, values) },
    _videoFilter: new VideoFilter([], []),
    setVideo: (url: string) => mediaUrls.push(url),
    emit() {},
    emitResolve() {},
    loadComment() {},
    execCommand() {},
  };
  try {
    await NicoVideoPlayerDialog.prototype._onVideoInfoLoaderLoad.call(context, 'current', [raw, {}, undefined]);
    expect(creates).toHaveLength(1);
    expect(mediaUrls).toEqual(['https://fixture.invalid/selected-stream']);
    const info: unknown = Reflect.get(context, '_videoInfo');
    expect(info).toBeInstanceOf(VideoInfoModel);
    return creates[0]!;
  } finally {
    session.mockRestore();
    cache.mockRestore();
  }
}
test('P2-10/current-stream: 現行Domandを選択画質とHLSで再生する', async () => {
  const data = await load();
  const result = await choose(data);
  expect(result.videoQuality).toBe('current-quality');
  expect(result.useHLS).toBe(true);
});
