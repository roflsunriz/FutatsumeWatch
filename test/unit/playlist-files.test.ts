import { expect, test } from 'bun:test';
import { PlayListView } from '../../packages/futatsume/src/Playlist/playlist-view';
test('P3-12 ファイル選択取消と空ドロップは例外も読込も起こさない', () => {
  let calls = 0;
  const context = {
    emit: () => {
      calls++;
    },
    _$fileDrop: { removeClass: () => {} },
  };
  const input = document.createElement('input');
  input.type = 'file';
  const event = { preventDefault: () => {}, stopPropagation: () => {}, target: input, dataTransfer: { files: [] } };
  expect(() =>
    PlayListView.prototype._onImportFileSelect.call(context as unknown as PlayListView, event as unknown as MouseEvent)
  ).not.toThrow();
  expect(() =>
    PlayListView.prototype._onDropFile.call(context as unknown as PlayListView, event as unknown as MouseEvent)
  ).not.toThrow();
  expect(calls).toBe(0);
});
