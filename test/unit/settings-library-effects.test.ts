import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { Config } from '../../src/config';
import type { StoryboardRawData } from '../../packages/futatsume/src/storyboard/storyboard-info-model';
import { VideoSessionWorker } from '../../packages/lib/src/nico/video-session-worker';
import { ThumbInfoLoader, parseThumbInfo } from '../../packages/lib/src/nico/thumb-info-loader';
import { netUtil } from '../../packages/lib/src/infra/net-util';
import { createOfflineSite } from '../../scripts/offline-site';
import { createLibraryRoutes } from '../../scripts/offline-library';
import { openMylistPicker, closeMylistPicker } from '../../src/mylist-picker';

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
const { Storyboard } = await import('../../packages/futatsume/src/storyboard/storyboard');
const originalFetch = netUtil.fetch;
const originalAutoComment = Config.getValue('enableAutoMylistComment');
const header = document.querySelector<HTMLElement>('#CommonHeader') ?? document.createElement('header');
const originalHeader = header.getAttribute('data-common-header');
const hadHeader = header.isConnected;
header.id = 'CommonHeader';
if (!hadHeader) document.body.append(header);
const dialogPrototype = window.HTMLDialogElement.prototype;
const originalShow = Object.getOwnPropertyDescriptor(dialogPrototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, 'close');
Object.defineProperties(dialogPrototype, {
  showModal: {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  },
  close: {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new window.Event('close'));
    },
  },
});
let timer: ReturnType<typeof spyOn<typeof window, 'setTimeout'>>;
let clearTimer: ReturnType<typeof spyOn<typeof window, 'clearTimeout'>>;
let worker: ReturnType<typeof spyOn<typeof VideoSessionWorker, 'storyboard'>>;
const pending: Array<{ resolve(value: unknown): void; reject(error: Error): void }> = [];
let nextTimer = 0;
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
beforeEach(() => {
  header.dataset.commonHeader = JSON.stringify({ initConfig: { user: { isLogin: true, isPremium: true } } });
  pending.length = 0;
  worker = spyOn(VideoSessionWorker, 'storyboard').mockImplementation(
    () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
  );
  // 投稿結果の検査に不要な10秒/2秒のロック解除時計だけを固定する。
  timer = spyOn(window, 'setTimeout').mockImplementation((() => ++nextTimer) as unknown as typeof window.setTimeout);
  clearTimer = spyOn(window, 'clearTimeout').mockImplementation(() => {});
});
afterEach(async () => {
  await flush();
  closeMylistPicker();
  worker.mockRestore();
  timer.mockRestore();
  clearTimer.mockRestore();
  netUtil.fetch = originalFetch;
});
afterAll(() => {
  Config.setValue('enableAutoMylistComment', originalAutoComment);
  if (originalHeader === null) header.removeAttribute('data-common-header');
  else header.setAttribute('data-common-header', originalHeader);
  if (!hadHeader) header.remove();
  if (originalShow) Object.defineProperty(dialogPrototype, 'showModal', originalShow);
  else Reflect.deleteProperty(dialogPrototype, 'showModal');
  if (originalClose) Object.defineProperty(dialogPrototype, 'close', originalClose);
  else Reflect.deleteProperty(dialogPrototype, 'close');
});
const raw = (duration: number): StoryboardRawData => ({
  status: 'ok',
  format: 'domand',
  duration,
  storyboard: {
    thumbnail: { width: 160, height: 90 },
    columns: 2,
    rows: 2,
    count: 4,
    interval: 1000,
    images: [{ url: 'https://fixture.invalid/storyboard.jpg' }],
  },
});
function board() {
  const props = { enableStoryboard: true, enableStoryboardBar: false };
  const state = { isStoryboardAvailable: false };
  const value = new Storyboard({ playerConfig: { props }, state });
  // 準備済みの描画先を前提とする。取得・世代・モデル更新は実コード。
  value.view = { isEnable: false, setCurrentTime() {}, toggle() {} };
  void value.emitResolve('dom-ready');
  return { value, props, state };
}
function info(watchId = 'sm9', hasStoryboard = true) {
  return { watchId, hasStoryboard, hasDomandStoryboard: true, toJSON: () => ({ watchId }) };
}

test('P2-07/enableStoryboard: 会員状態に関係なくON・資産ありのときだけWorkerへ取得を要求する', async () => {
  for (const [enabled, available] of [
    [false, true],
    [true, false],
  ]) {
    const fixture = board();
    fixture.props.enableStoryboard = enabled!;
    fixture.value.onVideoCanPlay('sm9', info('sm9', available));
    expect(pending).toHaveLength(0);
    expect(fixture.state.isStoryboardAvailable).toBe(false);
  }
  header.dataset.commonHeader = JSON.stringify({ initConfig: { user: { isLogin: true, isPremium: false } } });
  const fixture = board();
  fixture.value.onVideoCanPlay('sm9', info());
  expect(worker).toHaveBeenCalledTimes(1);
  expect(worker.mock.calls[0]![0].info.watchId).toBe('sm9');
  pending[0]!.resolve(raw(60));
  await flush();
  expect(fixture.state.isStoryboardAvailable).toBe(true);
  expect(fixture.value.model.duration).toBe(60);
});
test('P2-07/storyboard-stale: 新しい動画の結果より後に届く古い成功・失敗を無視する', async () => {
  for (const failed of [false, true]) {
    pending.length = 0;
    const fixture = board();
    fixture.value.onVideoCanPlay('sm9', info());
    fixture.value.onVideoCanPlay('sm100', info('sm100'));
    pending[1]!.resolve(raw(100));
    await flush();
    if (failed) pending[0]!.reject(new Error('古い取得失敗'));
    else pending[0]!.resolve(raw(60));
    await flush();
    expect(fixture.state.isStoryboardAvailable).toBe(true);
    expect(fixture.value.model.duration).toBe(100);
  }
});
test('P2-07/storyboard-reset: reset後の遅い成功で利用可能状態を復活させない', async () => {
  const fixture = board();
  fixture.value.onVideoCanPlay('sm9', info());
  fixture.value.reset();
  pending[0]!.resolve(raw(60));
  await flush();
  expect(fixture.state.isStoryboardAvailable).toBe(false);
  expect(fixture.value.model.isAvailable).toBe(false);
});
test('P2-07/storyboard-disabled: OFFまたは資産なしへ切替後の古い応答を適用しない', async () => {
  for (const disabled of [true, false]) {
    pending.length = 0;
    const fixture = board();
    fixture.value.onVideoCanPlay('sm9', info());
    fixture.props.enableStoryboard = !disabled;
    fixture.value.onVideoCanPlay('sm100', info('sm100', disabled));
    pending[0]!.resolve(raw(60));
    await flush();
    expect(fixture.state.isStoryboardAvailable).toBe(false);
    expect(fixture.value.model.isAvailable).toBe(false);
  }
});
test('P2-07/storyboard-unavailable: Workerの資産なし応答を利用可能と表示しない', async () => {
  const fixture = board();
  fixture.value.onVideoCanPlay('sm9', info());
  pending[0]!.resolve({ status: 'fail', watchId: 'sm9' });
  await flush();
  expect(fixture.value.model.isAvailable).toBe(false);
  expect(fixture.state.isStoryboardAvailable).toBe(false);
});

function api() {
  const routes = createLibraryRoutes();
  netUtil.fetch = async (url, init = {}) => {
    const reply = await routes.reply({
      url,
      method: init.method ?? 'GET',
      postData: typeof init.body === 'string' ? init.body : undefined,
    });
    if (!reply) throw new Error('未登録要求: ' + url);
    if (typeof reply.body !== 'string') throw new Error('JSON要求へバイナリ応答が返りました');
    return new Response(reply.body, { status: reply.status, headers: { 'Content-Type': reply.mime } });
  };
  return routes;
}
function context(enabled: boolean) {
  let complete!: () => void;
  const done = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const notices: string[] = [];
  return {
    done,
    notices,
    value: {
      _watchId: 'sm9',
      _state: { isUpdatingMylist: false, isUpdatingDeflist: false },
      _videoInfo: { watchId: 'sm9', owner: { name: '投稿 & 者', linkId: 'user/42' }, originalVideoId: 'sm100' },
      _playerConfig: { props: { enableAutoMylistComment: enabled }, getValue: () => enabled },
      execCommand(command: string) {
        notices.push(command);
        complete();
      },
    },
  };
}
test('P2-07/enableAutoMylistComment: 通常/後で見るの実API要求へ説明をON時だけ付与する', async () => {
  for (const enabled of [false, true])
    for (const kind of ['mylist', 'watchlater']) {
      const routes = api(),
        fixture = context(enabled);
      if (kind === 'mylist') NicoVideoPlayerDialog.prototype._onMylistAdd.call(fixture.value, '42', '追加先');
      else NicoVideoPlayerDialog.prototype._onDeflistAdd.call(fixture.value, 'sm9');
      await fixture.done;
      await flush();
      expect(fixture.notices).toEqual(['notify']);
      const posts = routes.writes.filter((request) => request.method === 'POST');
      expect(posts).toHaveLength(1);
      const body = new URLSearchParams(posts[0]!.postData);
      expect(body.size).toBe(2);
      expect(body.get(kind === 'mylist' ? 'description' : 'memo')).toBe(
        enabled ? '投稿者: 投稿 & 者 user/42 元動画: sm100' : ''
      );
      expect(body.get(kind === 'mylist' ? 'itemId' : 'watchId')).toBe('sm9');
    }
});
test('P2-07/auto-description-related: 別動画追加時は対象動画の投稿者を使い、OFFなら取得しない', async () => {
  const response = await createOfflineSite().reply({
    url: 'https://ext.nicovideo.jp/api/getthumbinfo/sm100',
    method: 'GET',
  });
  if (!response || typeof response.body !== 'string') throw new Error('動画情報fixtureなし');
  const thumb = parseThumbInfo(response.body);
  const load = spyOn(ThumbInfoLoader, 'load').mockResolvedValue(thumb);
  try {
    for (const enabled of [false, true]) {
      load.mockClear();
      const routes = api(),
        fixture = context(enabled);
      NicoVideoPlayerDialog.prototype._onDeflistAdd.call(fixture.value, 'sm100');
      await fixture.done;
      await flush();
      expect(fixture.notices).toEqual(['notify']);
      expect(load).toHaveBeenCalledTimes(enabled ? 1 : 0);
      expect(new URLSearchParams(routes.writes[0]!.postData).get('memo')).toBe(
        enabled ? '投稿者: 検証投稿者 user/4 ' : ''
      );
    }
  } finally {
    load.mockRestore();
  }
});
test('P2-07/auto-description-picker: 現行の追加先ダイアログもON時に投稿者説明を送る', async () => {
  const response = await createOfflineSite().reply({
    url: 'https://ext.nicovideo.jp/api/getthumbinfo/sm100',
    method: 'GET',
  });
  if (!response || typeof response.body !== 'string') throw new Error('動画情報fixtureなし');
  const load = spyOn(ThumbInfoLoader, 'load').mockResolvedValue(parseThumbInfo(response.body));
  try {
    for (const enabled of [false, true]) {
      load.mockClear();
      Config.setValue('enableAutoMylistComment', enabled);
      const routes = api();
      await openMylistPicker('sm100');
      document.querySelector<HTMLButtonElement>('[data-mylist-choice="42"]')!.click();
      await flush();
      expect(load).toHaveBeenCalledTimes(enabled ? 1 : 0);
      if (enabled) expect(load).toHaveBeenCalledWith('sm100');
      expect(new URLSearchParams(routes.writes[0]!.postData).get('description')).toBe(
        enabled ? '投稿者: 検証投稿者 user/4 ' : ''
      );
      closeMylistPicker();
    }
  } finally {
    load.mockRestore();
  }
});
test('P2-07/auto-description-cancel: 投稿者取得中に閉じた追加先へ後から書き込まない', async () => {
  const response = await createOfflineSite().reply({
    url: 'https://ext.nicovideo.jp/api/getthumbinfo/sm100',
    method: 'GET',
  });
  if (!response || typeof response.body !== 'string') throw new Error('動画情報fixtureなし');
  let resolve!: (value: Awaited<ReturnType<typeof ThumbInfoLoader.load>>) => void;
  const load = spyOn(ThumbInfoLoader, 'load').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  try {
    Config.setValue('enableAutoMylistComment', true);
    const routes = api();
    await openMylistPicker('sm100');
    document.querySelector<HTMLButtonElement>('[data-mylist-choice="42"]')!.click();
    closeMylistPicker();
    resolve(parseThumbInfo(response.body));
    await flush();
    expect(routes.writes).toHaveLength(0);
  } finally {
    load.mockRestore();
  }
});
