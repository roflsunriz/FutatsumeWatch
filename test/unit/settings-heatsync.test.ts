import { afterAll, afterEach, beforeAll, beforeEach, expect, spyOn, test } from 'bun:test';
import { Emitter } from '../../packages/lib/src/emitter';
import { FutatsumeDetector } from '../../packages/components/src/util/futatsume-detector';

type Value = boolean | number | string;
interface HeatSyncRuntime {
  isReady: boolean;
  config: { getKeys(): string[]; getValue(key: string): Value; setValue(key: string, value: Value): void };
  external: { syncer: { disable(): void; _enabled: boolean } };
}
const previousProduct = Reflect.get(window, 'HeatSync') as unknown;
const previousWatch = Reflect.get(window, 'FutatsumeWatch') as unknown;
const previousCustomEvent = globalThis.CustomEvent;
const emitter = new Emitter();
const dialog = new Emitter();
const video = document.createElement('video');
let duration = 60;
let paused = false;
Object.defineProperties(video, {
  duration: { get: () => duration },
  paused: { get: () => paused },
});
video.src = 'https://fixture.invalid/movie.mp4';
const requestedRates: number[] = [];
const host = {
  ready: true,
  emitter,
  debug: { dialog },
  external: { getVideoElement: () => video },
  config: {
    getValue: () => video.playbackRate,
    setValue(key: string, value: Value): void {
      if (key !== 'playbackRate' || typeof value !== 'number') throw new Error('予期しない再生設定');
      requestedRates.push(value);
      video.playbackRate = value;
    },
  },
};
let product: HeatSyncRuntime;
const originalSettings = new Map<string, Value>();
const originalStorage = new Map<string, string | null>();
const timers = new Map<number, () => void>();
let timerId = 0;
let interval: ReturnType<typeof spyOn<typeof globalThis, 'setInterval'>>;
let clear: ReturnType<typeof spyOn<typeof globalThis, 'clearInterval'>>;
const settings: Record<string, Value> = {
  'turbo.enabled': false,
  'turbo.red': 1,
  'turbo.smile-blue': 2,
  'turbo.dmc-blue': 2,
  'turbo.minDuration': 30,
  'turbo.ignoreTags': '',
};

beforeAll(async () => {
  // 時計だけを固定する。登録された本物のSyncerタイマーを実行し、制御関数は置換しない。
  interval = spyOn(globalThis, 'setInterval').mockImplementation(((callback: TimerHandler, delay?: number) => {
    if (typeof callback !== 'function' || delay !== 500) throw new Error('予期しないタイマー');
    const id = ++timerId;
    timers.set(id, callback as () => void);
    return id;
  }) as typeof setInterval);
  clear = spyOn(globalThis, 'clearInterval').mockImplementation((id) => {
    if (typeof id === 'number') timers.delete(id);
  });
  globalThis.CustomEvent = window.CustomEvent;
  Reflect.set(window, 'FutatsumeWatch', host);
  const detection = spyOn(FutatsumeDetector, 'detect').mockResolvedValue(host);
  try {
    await import('../../src/heatsync');
    await Promise.resolve();
    await Promise.resolve();
  } finally {
    detection.mockRestore();
  }
  product = Reflect.get(window, 'HeatSync') as HeatSyncRuntime;
  expect(product.isReady).toBe(true);
  for (const key of product.config.getKeys()) {
    originalSettings.set(key, product.config.getValue(key));
    originalStorage.set(key, localStorage.getItem('HeatSync_config_' + key));
  }
  emitter.emit('DialogPlayerOpen');
});
beforeEach(() => {
  product.external.syncer.disable();
  for (const [key, value] of Object.entries(settings)) product.config.setValue(key, value);
  product.config.setValue('turbo.enabled', true);
  product.external.syncer.disable();
  video.playbackRate = 1;
  video.currentTime = 0;
  duration = 60;
  paused = false;
  requestedRates.length = 0;
});
afterEach(() => product.external.syncer.disable());
afterAll(() => {
  for (const [key, value] of originalSettings) product.config.setValue(key, value);
  product.external.syncer.disable();
  for (const [key, value] of originalStorage) {
    if (value === null) localStorage.removeItem('HeatSync_config_' + key);
    else localStorage.setItem('HeatSync_config_' + key, value);
  }
  interval.mockRestore();
  clear.mockRestore();
  globalThis.CustomEvent = previousCustomEvent;
  if (previousProduct === undefined) Reflect.deleteProperty(window, 'HeatSync');
  else Reflect.set(window, 'HeatSync', previousProduct);
  if (previousWatch === undefined) Reflect.deleteProperty(window, 'FutatsumeWatch');
  else Reflect.set(window, 'FutatsumeWatch', previousWatch);
});
function heat(length: number, tags: string[] = []): void {
  duration = length;
  dialog.emit('loadVideoInfo', { tagList: tags.map((name) => ({ name })) });
  emitter.emit('heatMapUpdate', { map: [0, 0, 0, 0], duration: length });
}
function tick(): void {
  for (const callback of [...timers.values()]) callback();
}

test('P2-14/minDuration: 設定秒数未満は除外し、境界以上だけを加速する', () => {
  product.config.setValue('turbo.minDuration', 30);
  heat(29.9);
  tick();
  expect(timers.size).toBe(0);
  expect(requestedRates).toHaveLength(0);
  expect(video.playbackRate).toBe(1);
  heat(30);
  expect(timers.size).toBe(1);
  tick();
  expect(requestedRates).toHaveLength(1);
  expect(video.playbackRate).toBeGreaterThan(1);
  expect(video.playbackRate).toBeLessThanOrEqual(2);
});
test('P2-14/ignoreTags: 半角・全角区切りの一致タグだけを除外する', () => {
  product.config.setValue('turbo.ignoreTags', 'VOCALOID 音楽　ゲーム');
  for (const tag of ['vocaloid', '音楽', 'ゲーム']) {
    heat(60, [tag]);
    tick();
    expect(timers.size).toBe(0);
    expect(requestedRates).toHaveLength(0);
  }
  heat(60, ['音楽ゲーム']);
  tick();
  expect(video.playbackRate).toBeGreaterThan(1);
});
test('P2-14/ignoreTags-case: 除外語と動画タグの英字大小文字で効果が変わらない', () => {
  product.config.setValue('turbo.ignoreTags', 'vocaloid');
  heat(60, ['VOCALOID']);
  tick();
  expect(requestedRates).toHaveLength(0);
  expect(video.playbackRate).toBe(1);
});
test('P2-14/minDuration-transition: 加速中に短い動画へ切り替えても加速を残さない', () => {
  heat(60);
  tick();
  expect(video.playbackRate).toBeGreaterThan(1);
  heat(29.9);
  expect(timers.size).toBe(0);
  expect(video.playbackRate).toBe(1);
});
test('P2-14/ignoreTags-transition: 加速中に除外タグの動画へ切り替えても加速を残さない', () => {
  heat(60);
  tick();
  expect(video.playbackRate).toBeGreaterThan(1);
  product.config.setValue('turbo.ignoreTags', '音楽');
  heat(60, ['音楽']);
  expect(timers.size).toBe(0);
  expect(video.playbackRate).toBe(1);
});
test('P2-14/manual-slow: 手動の低速再生はタイマー・OFF・closeで上書きしない', () => {
  heat(60);
  tick();
  host.config.setValue('playbackRate', 0.75);
  requestedRates.length = 0;
  tick();
  expect(requestedRates).toHaveLength(0);
  expect(video.playbackRate).toBe(0.75);
  product.config.setValue('turbo.enabled', false);
  emitter.emit('DialogPlayerClose');
  expect(video.playbackRate).toBe(0.75);
  expect(timers.size).toBe(0);
});
test('P2-14/manual-off: 手動で選んだ速度はHeatSyncのOFFで以前の自動速度へ戻さない', () => {
  heat(60);
  tick();
  host.config.setValue('playbackRate', 1.25);
  product.config.setValue('turbo.enabled', false);
  expect(video.playbackRate).toBe(1.25);
  tick();
  expect(video.playbackRate).toBe(1.25);
});
test('P2-14/pause: 停止中は加速せず、再開時にだけ密度の速度を適用する', () => {
  paused = true;
  heat(60);
  tick();
  expect(requestedRates).toHaveLength(0);
  paused = false;
  tick();
  expect(video.playbackRate).toBeGreaterThan(1);
});
