import { afterAll, expect, test } from 'bun:test';
const canvasDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLCanvasElement');
const imageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const rafDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
Object.defineProperty(globalThis, 'HTMLCanvasElement', { configurable: true, value: window.HTMLCanvasElement });
Object.defineProperty(globalThis, 'Image', {
  configurable: true,
  value: class {
    src = '';
    decode(): Promise<void> {
      return Promise.resolve();
    }
  },
});
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  configurable: true,
  value: (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(performance.now()));
    return 0;
  },
});
const { StoryboardWorker } = await import('../../packages/futatsume/src/storyboard/storyboard-worker');
afterAll(() => {
  if (canvasDescriptor) Object.defineProperty(globalThis, 'HTMLCanvasElement', canvasDescriptor);
  else Reflect.deleteProperty(globalThis, 'HTMLCanvasElement');
  if (imageDescriptor) Object.defineProperty(globalThis, 'Image', imageDescriptor);
  else Reflect.deleteProperty(globalThis, 'Image');
  if (rafDescriptor) Object.defineProperty(globalThis, 'requestAnimationFrame', rafDescriptor);
  else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
});

test('ストーリーボードは一つのCanvasに2種類の描画コンテキストを要求しない', async () => {
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
  const types: string[] = [];
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: (type: string) => {
      types.push(type);
      if (type !== '2d') throw new Error('Canvas already owns a 2d context');
      return { beginPath() {}, clearRect() {}, drawImage() {}, fillRect() {}, strokeRect() {} };
    },
  });
  try {
    const worker = StoryboardWorker.initWorker();
    const result = (await worker.post({
      command: 'createBoard',
      params: { canvas: document.createElement('canvas'), name: 'fixture' },
    })) as { id: string };
    expect(typeof result.id).toBe('string');
    expect(types).toEqual(['2d', '2d']);
    await worker.post({ command: 'dispose', params: { id: result.id } });
  } finally {
    if (original) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original);
  }
});
