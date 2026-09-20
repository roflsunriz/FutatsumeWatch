import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { Config } from '../../src/config';
import { VideoInfoLoader } from '../../packages/lib/src/nico/video-info-loader';
import { VideoInfoModel, VideoFilter } from '../../src/video-info';
import type { RawVideoInfoData } from '../../src/video-info';
import { VideoSessionWorker } from '../../packages/lib/src/nico/video-session-worker';
import { WatchInfoCacheDb } from '../../packages/lib/src/nico/watch-info-cache-db';
import { NVWatchCaller } from '../../packages/lib/src/nico/nv-watch-caller';
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

type DmcData = NonNullable<RawVideoInfoData['dmcInfo']>;
// 現行採取のdeliveryはnull。DMCの分岐は保持している旧形式の条件フィクスチャで検査し、
// 終了したDMCサービスへの接続・映像配信が成功したとは扱わない。
function oldDmc(height: number, protocols = ['http', 'hls']): DmcData {
  return {
    trackingId: 'fixture-tracking',
    movie: {
      session: {
        urls: [{ url: 'https://fixture.invalid/retired-dmc-session' }],
        signature: 'fixture',
        token: 'fixture',
        serviceUserId: 'fixture',
        contentId: 'fixture',
        playerId: 'fixture',
        recipeId: 'fixture',
        priority: 1,
        authTypes: ['ht2'],
        protocols,
      },
      audios: [{ id: 'audio', isAvailable: true, metadata: { levelIndex: 1 } }],
      videos: [{ id: `old-${height}`, isAvailable: true, metadata: { levelIndex: 1, resolution: { height } } }],
    },
  };
}
function response(
  options: {
    watchId?: string;
    domand?: boolean;
    height?: number;
    dmc?: DmcData | null;
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
          delivery: options.dmc ?? null,
          domand:
            options.domand === false
              ? null
              : {
                  ...data.media.domand,
                  videos: data.media.domand.videos.map((video, index) => ({
                    ...video,
                    height: options.height === undefined ? video.height : options.height / (index + 1),
                  })),
                },
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

async function choose(
  raw: RawVideoInfoData,
  options: { autoDisableNew?: boolean; onlyRequired?: boolean; preferred?: string; hlsSupported?: boolean } = {}
) {
  const creates: Array<Parameters<typeof VideoSessionWorker.create>[0]> = [];
  const mediaUrls: string[] = [];
  const cache = spyOn(WatchInfoCacheDb, 'put').mockResolvedValue({});
  const tracker = spyOn(NVWatchCaller, 'call').mockResolvedValue(undefined);
  const session = spyOn(VideoSessionWorker, 'create').mockImplementation((params) => {
    creates.push(params);
    return Promise.resolve({
      sessionId: 'fixture',
      serverType: params.serverType,
      isDmc: params.serverType === 'dmc',
      connect: () => Promise.resolve({ url: 'https://fixture.invalid/selected-stream', type: params.serverType }),
      getState: () => Promise.resolve({}),
      close: () => Promise.resolve(undefined),
    });
  });
  global.debug.isHLSSupported = options.hlsSupported ?? true;
  const state: Record<string, unknown> = {};
  const context = {
    _requestId: 'current',
    _view: { updateViewer() {} },
    _watchId: 'sm9',
    _playerConfig: {
      props: {
        autoDisableNew: options.autoDisableNew ?? false,
        dmcVideoQuality: 'legacy-quality',
        domandVideoQuality: 'current-quality',
        'video.hls.enableOnlyRequired': options.onlyRequired ?? true,
        screenMode: 'normal',
      },
    },
    _videoWatchOptions: { videoServerType: options.preferred ?? 'domand' },
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
    tracker.mockRestore();
    cache.mockRestore();
  }
}
test('P2-10/autoDisableNew-current: 現行採取のDomand単独は設定ON/OFFでも利用不能なDMCへ切り替えない', async () => {
  const data = await load();
  expect(data.dmcInfo).toBeNull();
  for (const enabled of [false, true]) {
    const result = await choose(data, { autoDisableNew: enabled });
    expect(result.serverType).toBe('domand');
    expect(result.videoQuality).toBe('current-quality');
    expect(result.useHLS).toBe(true);
  }
});
test('P2-10/autoDisableNew-legacy: 両方式がある旧条件でDMCが高解像度ならON時だけ選択を変更する', async () => {
  const data = await load({ height: 720, dmc: oldDmc(1080) });
  expect(new VideoInfoModel(data).maybeBetterQualityServerType).toBe('dmc');
  expect((await choose(data, { autoDisableNew: false })).serverType).toBe('domand');
  const enabled = await choose(data, { autoDisableNew: true });
  expect(enabled.serverType).toBe('dmc');
  expect(enabled.videoQuality).toBe('legacy-quality');
  for (const height of [1080, 1440]) {
    const currentBetter = await load({ height, dmc: oldDmc(1080) });
    expect((await choose(currentBetter, { autoDisableNew: true })).serverType).toBe('domand');
  }
});
test('P2-10/autoDisableNew-unavailable: 利用できない高画質候補を理由に配信方式を変更しない', async () => {
  const old = oldDmc(360);
  old.movie!.videos!.push({
    id: 'unavailable-1080',
    isAvailable: false,
    metadata: { levelIndex: 2, resolution: { height: 1080 } },
  });
  const data = await load({ height: 720, dmc: old });
  expect((await choose(data, { autoDisableNew: true })).serverType).toBe('domand');
  const unavailableCurrent = await load({ height: 1080, dmc: oldDmc(720) });
  unavailableCurrent.domandInfo!.videos[0]!.isAvailable = false;
  expect((await choose(unavailableCurrent, { autoDisableNew: true })).serverType).toBe('dmc');
});
test('P2-10/enableOnlyRequired: 旧DMCのHTTP併用可/必須条件を実セッション作成要求へ反映する', async () => {
  for (const protocols of [['http', 'hls'], ['hls']]) {
    const data = await load({ domand: false, dmc: oldDmc(720, protocols) });
    const required = !protocols.includes('http');
    expect(new VideoInfoModel(data).isHLSRequired).toBe(required);
    for (const onlyRequired of [false, true]) {
      const result = await choose(data, { onlyRequired, preferred: 'dmc' });
      expect(result.serverType).toBe('dmc');
      expect(result.useHLS).toBe(required || !onlyRequired);
    }
  }
});
test('P2-10/enableOnlyRequired-capability: HLS未対応なら設定だけでHLSを利用可能扱いにしない', async () => {
  const data = await load({ domand: false, dmc: oldDmc(720) });
  expect((await choose(data, { onlyRequired: false, preferred: 'dmc', hlsSupported: false })).useHLS).toBe(false);
});
