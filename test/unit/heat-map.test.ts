import { afterAll, expect, test } from 'bun:test';
const canvasDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLCanvasElement');
Object.defineProperty(globalThis, 'HTMLCanvasElement', {
  value: document.createElement('canvas').constructor,
  configurable: true,
});
const { HeatMap } = await import('../../packages/futatsume/src/heatMap/heat-map-worker');
afterAll(() => {
  if (canvasDescriptor) Object.defineProperty(globalThis, 'HTMLCanvasElement', canvasDescriptor);
  else Reflect.deleteProperty(globalThis, 'HTMLCanvasElement');
});

test('既知時刻の密度は位置別に集計し簡単コメントと範囲外を除外する', () => {
  const model = new HeatMap({}).model;
  model.duration = 64;
  model.chatList = {
    top: [{ vpos: 2000, fork: 1 }],
    naka: [
      { vpos: 2100, fork: 0 },
      { vpos: 2100, fork: 0 },
      { vpos: 2100, fork: 2 },
      { vpos: -100, fork: 0 },
      { vpos: 6400, fork: 0 },
      { vpos: Infinity, fork: 0 },
      { vpos: NaN, fork: 0 },
    ],
    bottom: [],
  };
  expect(model.map).toHaveLength(64);
  expect(model.map[20]).toBe(1);
  expect(model.map[21]).toBe(2);
  expect(model.map.reduce((sum, n) => sum + n, 0)).toBe(3);
  expect(Object.keys(model.map)).toHaveLength(64);
});
test('空・0秒・不正時間と更新順によって壊れない', () => {
  for (const duration of [0, -1, NaN, Infinity]) {
    const model = new HeatMap({}).model;
    model.chatList = { top: [], naka: [], bottom: [] };
    expect(() => {
      model.duration = duration;
    }).not.toThrow();
    expect(model.map).toEqual([]);
  }
  const model = new HeatMap({}).model;
  model.chatList = { top: [], naka: [], bottom: [] };
  model.duration = 4;
  expect(model.map).toEqual([0, 0, 0, 0]);
  model.reset();
  expect(model.map).toEqual([]);
});
test('長い動画は200区間へ縮約し先頭集中の既存上限を保つ', () => {
  const model = new HeatMap({}).model;
  model.duration = 400;
  model.chatList = {
    top: [],
    bottom: [],
    naka: [
      ...Array.from({ length: 30 }, () => ({ vpos: 100, fork: 0 })),
      ...Array.from({ length: 30 }, () => ({ vpos: 5000, fork: 0 })),
      ...Array.from({ length: 30 }, () => ({ vpos: 16000, fork: 0 })),
    ],
  };
  expect(model.map).toHaveLength(200);
  expect(model.map[0]).toBe(5);
  expect(model.map[25]).toBe(10);
  expect(model.map[80]).toBe(30);
});
