import { afterEach, expect, spyOn, test } from 'bun:test';
import { VideoCaptureUtil } from '../../packages/lib/src/dom/video-capture-util';

const restores: Array<() => void> = [];
afterEach(() => {
  for (const restore of restores.splice(0)) restore();
});
function frame({ readyState = 4, width = 320, height = 180 } = {}) {
  const video = document.createElement('video');
  video.src = 'https://fixture.invalid/generated.m3u8';
  Object.defineProperties(video, {
    readyState: { value: readyState },
    videoWidth: { value: width },
    videoHeight: { value: height },
  });
  return video;
}
function canvasBoundary(draw: () => void = () => {}, encode: () => string = () => 'data:image/png;base64,fixture') {
  const draws: CanvasImageSource[] = [];
  const context = {
    drawImage(source: CanvasImageSource) {
      draw();
      draws.push(source);
    },
  };
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLCanvasElement.prototype, 'getContext')!;
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => context });
  const data = spyOn(window.HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(encode);
  restores.push(
    () => Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', descriptor),
    () => data.mockRestore()
  );
  return draws;
}
const errorOf = async (promise: Promise<unknown>): Promise<Error> =>
  promise.then(
    () => {
      throw new Error('失敗すべき画像保存が成功した');
    },
    (error: Error) => error
  );

test('P2-04 ホスト名によらず実フレームを描画しPNG読み出しできた場合だけ成功する', async () => {
  const draws = canvasBoundary();
  const video = frame();
  const { canvas } = await VideoCaptureUtil.videoToCanvas(video);
  expect(draws).toEqual([video]);
  expect(canvas.width).toBe(320);
  expect(canvas.height).toBe(180);
});
test('P2-04 未読込と0寸法は描画せず復帰方法を返す', async () => {
  const draws = canvasBoundary();
  for (const video of [frame({ readyState: 1 }), frame({ width: 0 }), frame({ height: 0 })]) {
    expect((await errorOf(VideoCaptureUtil.videoToCanvas(video))).message).toContain('読み込み');
  }
  expect(draws).toHaveLength(0);
});
test('P2-04 CORSで実画素読み出しが拒否された場合は理由を返す', async () => {
  canvasBoundary(
    () => {},
    () => {
      throw new window.DOMException('tainted', 'SecurityError');
    }
  );
  expect((await errorOf(VideoCaptureUtil.videoToCanvas(frame()))).message).toContain('CORS');
});
test('P2-04 フレーム描画自体の失敗を成功にせず理由を保持する', async () => {
  canvasBoundary(() => {
    throw new Error('frame decode failed');
  });
  expect((await errorOf(VideoCaptureUtil.videoToCanvas(frame()))).message).toContain('frame decode failed');
});
