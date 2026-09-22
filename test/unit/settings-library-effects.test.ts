import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { Config } from '../../src/config';
import type { StoryboardRawData } from '../../packages/futatsume/src/storyboard/storyboard-info-model';
import { VideoSessionWorker } from '../../packages/lib/src/nico/video-session-worker';

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
const { Storyboard } = await import('../../packages/futatsume/src/storyboard/storyboard');
const header = document.querySelector<HTMLElement>('#CommonHeader') ?? document.createElement('header');
const originalHeader = header.getAttribute('data-common-header');
const hadHeader = header.isConnected;
header.id = 'CommonHeader';
if (!hadHeader) document.body.append(header);
let worker: ReturnType<typeof spyOn<typeof VideoSessionWorker, 'storyboard'>>;
const pending: Array<{ resolve(value: unknown): void; reject(error: Error): void }> = [];
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
beforeEach(() => {
  header.dataset.commonHeader = JSON.stringify({ initConfig: { user: { isLogin: true, isPremium: true } } });
  pending.length = 0;
  worker = spyOn(VideoSessionWorker, 'storyboard').mockImplementation(
    () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
  );
});
afterEach(async () => {
  await flush();
  worker.mockRestore();
});
afterAll(() => {
  if (originalHeader === null) header.removeAttribute('data-common-header');
  else header.setAttribute('data-common-header', originalHeader);
  if (!hadHeader) header.remove();
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
