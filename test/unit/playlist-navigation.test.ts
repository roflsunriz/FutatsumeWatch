import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { PlayList, VideoListItem } from '../../packages/futatsume/src/Playlist/playlist';
const originalRaf = globalThis.requestAnimationFrame;
const lists: PlayList[] = [];
beforeEach(() => {
  globalThis.requestAnimationFrame = (callback) => {
    queueMicrotask(() => callback(0));
    return 0;
  };
});
afterEach(async () => {
  for (const list of lists.splice(0)) list.clear();
  await Promise.resolve();
  await Promise.resolve();
  globalThis.requestAnimationFrame = originalRaf;
});
function create(ids: string[]) {
  const list = new PlayList({});
  lists.push(list);
  list.model.setItem(ids.map((id) => VideoListItem.createBlankInfo(id)));
  list.setIndex(ids.length ? 0 : -1, true);
  return list;
}
test('P1-04/P3-10 空・1件・複数件で前後とリストリピートの境界が一致する', () => {
  const empty = create([]);
  expect(empty.selectNext()).toBeNull();
  expect(empty.selectPrevious()).toBeNull();
  const list = create(['sm1', 'sm2', 'sm3']);
  expect(list.selectPrevious()).toBeNull();
  expect(list.selectNext()).toBe('sm2');
  expect(list.selectNext()).toBe('sm3');
  expect(list.selectNext()).toBeNull();
  list.toggleLoop();
  expect(list.selectNext()).toBe('sm1');
  expect(list.selectPrevious()).toBe('sm3');
  const single = create(['sm1']);
  expect(single.selectNext()).toBeNull();
  single.toggleLoop();
  expect(single.selectNext()).toBe('sm1');
  expect(single.selectPrevious()).toBe('sm1');
});
test('P3-11 逆順メニュー後は同じ選択動画から前後に進む', () => {
  const list = create(['sm1', 'sm2', 'sm3']);
  list._onCommand('reverse', undefined);
  expect(list.getIndex()).toBe(2);
  expect(list.selectPrevious()).toBe('sm2');
  expect(list.selectPrevious()).toBe('sm3');
});
test('P3-12 不正な保存データは既存の一覧・選択を破壊しない', () => {
  const list = create(['sm1', 'sm2']);
  const view = spyOn(list, '_initializeView').mockImplementation(() => {});
  try {
    for (const data of [null, {}, { items: {} }, { items: [null] }, { items: [{ id: '' }] }]) {
      list.unserialize(data);
      expect(list.model.items.map((item) => item.watchId)).toEqual(['sm1', 'sm2']);
      expect(list.getIndex()).toBe(0);
    }
  } finally {
    view.mockRestore();
  }
});
test('P3-12 正しい保存ファイルは保存位置で再開し、同じ位置の置換でも新しい行を選ぶ', () => {
  const list = create(['sm1', 'sm2']);
  const view = spyOn(list, '_initializeView').mockImplementation(() => {});
  const commands: unknown[][] = [];
  list.on('command', (...args) => commands.push(args));
  try {
    list._onImportFileCommand(
      JSON.stringify({ items: [{ id: 'sm3' }, { id: 'sm4' }], index: 1, enable: true, loop: true })
    );
    expect(list.getIndex()).toBe(1);
    expect(list.model.items[1]!.isActive).toBe(true);
    expect(commands).toContainEqual(['openNow', 'sm4']);
    expect(list.isEnable).toBe(true);
    expect(list.isLoop).toBe(true);
    list.unserialize({ items: [{ id: 'sm5' }, { id: 'sm6' }], index: 1 });
    expect(list.model.items[1]!.isActive).toBe(true);
    expect(list.selectPrevious()).toBe('sm5');
  } finally {
    view.mockRestore();
  }
});
