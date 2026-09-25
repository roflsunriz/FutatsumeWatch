import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { Config } from '../../src/config';
import { VideoInfoLoader } from '../../packages/lib/src/nico/video-info-loader';
import { VideoInfoModel } from '../../src/video-info';
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
const originalHls = global.debug.isHLSSupported;
let log: ReturnType<typeof spyOn<typeof console, 'log'>>;
let errors: ReturnType<typeof spyOn<typeof window.console, 'error'>>;
let expectedErrors = 0;
beforeEach(() => {
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
