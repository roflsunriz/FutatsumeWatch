import { expect, spyOn, test } from 'bun:test';
import { Config } from '../../src/config';
import { Fullscreen } from '../../packages/lib/src/dom/fullscreen';
import { VideoInfoModel } from '../../src/video-info';
import type { RawVideoInfoData } from '../../src/video-info';
import { Emitter } from '../../packages/lib/src/emitter';
await Config.promise('restore');
Object.assign(globalThis, {
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  HTMLVideoElement: window.HTMLVideoElement,
  HTMLCanvasElement: window.HTMLCanvasElement,
  Image: window.Image,
  Node: window.Node,
  Document: window.Document,
  CustomEvent: window.CustomEvent,
  MutationObserver: window.MutationObserver,
  customElements: window.customElements,
});
const { NicoVideoPlayerDialog } = await import('../../src/nico-video-player-dialog');
const { VideoInfoPanel } = await import('../../src/video-info-panel');

test('終端の全画面解除は設定・動画別指定・次動画の継続を尊重する', () => {
  let cancels = 0,
    next = 0;
  const now = spyOn(Fullscreen, 'now').mockReturnValue(true);
  const cancel = spyOn(Fullscreen, 'cancel').mockImplementation(() => {
    cancels++;
  });
  try {
    for (const enabled of [false, true])
      for (const override of [undefined, false, true])
        for (const hasNext of [false, true]) {
          cancels = 0;
          next = 0;
          const context = {
            _view: { repeatOnEnded: () => false },
            emitAsync: () => Promise.resolve(),
            _state: { setVideoEnded: () => undefined },
            _savePlaybackPosition: () => undefined,
            _videoInfo: { contextWatchId: 'sm9' },
            isPlaylistEnable: hasNext,
            _playlist: { hasNext, toggleEnable: () => undefined },
            playNextVideo: () => next++,
            _videoWatchOptions: { hasKey: () => override !== undefined, isAutoCloseFullScreen: override },
            _playerConfig: { getValue: () => enabled },
          };
          NicoVideoPlayerDialog.prototype._onVideoEnded.call(context);
          expect(next).toBe(hasNext ? 1 : 0);
          expect(cancels).toBe(!hasNext && (override ?? enabled) ? 1 : 0);
        }
  } finally {
    now.mockRestore();
    cancel.mockRestore();
  }
});

test('動画情報パネルは実canPlayイベントから関連取得へ接続する', async () => {
  const dialog = new Emitter();
  const panel = new VideoInfoPanel({ dialog });
  const raw: unknown = await Bun.file('test/fixtures/video-info-raw-data.json').json();
  const info = new VideoInfoModel(raw as RawVideoInfoData) as Parameters<typeof panel._onVideoCanPlay>[1];
  panel._videoInfo = info;
  const requests: string[] = [];
  panel._relatedVideoList = {
    fetchRecommend: (id: string) => {
      requests.push(id);
      return Promise.resolve();
    },
  } as typeof panel._relatedVideoList;
  dialog.emit('canPlay', 'sm9', info, {});
  await Bun.sleep(20);
  expect(requests).toEqual([info.videoId]);
});
