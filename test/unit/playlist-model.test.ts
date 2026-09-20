import { afterAll, beforeAll, expect, test } from 'bun:test';
import { VideoListModel } from '../../packages/futatsume/src/Playlist/video-list-model';
import { VideoListItem } from '../../packages/futatsume/src/Playlist/video-list-item';
const raf = globalThis.requestAnimationFrame;
beforeAll(() => {
  globalThis.requestAnimationFrame = (callback) => {
    queueMicrotask(() => callback(0));
    return 0;
  };
});
afterAll(() => {
  globalThis.requestAnimationFrame = raf;
});

const item = (id: string, extra: Record<string, string | number> = {}) =>
  new VideoListItem({ id, title: id, first_retrieve: '2026-01-01', ...extra });
const ids = (model: VideoListModel) => model.items.map((entry) => entry.watchId);

test('P3-12 同じバッチ内と既存一覧に重複する動画を追加しない', () => {
  for (const method of ['appendItem', 'insertItem'] as const) {
    const model = new VideoListModel({ uniq: true });
    model.setItem(item('sm1'));
    model[method]([item('sm1'), item('sm2'), item('sm2'), item('sm3')]);
    expect(model.length).toBe(3);
    expect(new Set(ids(model)).size).toBe(3);
    expect(model.findByWatchId('sm2')).toBeDefined();
  }
});
test('P3-12 上限超過・置換・削除で消えた行は一覧に所属しない', () => {
  const model = new VideoListModel({ uniq: true, maxItems: 2 });
  const a = item('sm1'),
    b = item('sm2'),
    c = item('sm3');
  model.setItem([a, b, c]);
  expect(ids(model)).toEqual(['sm1', 'sm2']);
  model.appendItem(c);
  expect(ids(model)).toEqual(['sm2', 'sm3']);
  expect(a.groupList).toBeNull();
  model.insertItem(a, -5);
  expect(ids(model)).toEqual(['sm1', 'sm2']);
  expect(c.groupList).toBeNull();
  model.clear();
  expect(a.groupList).toBeNull();
  expect(b.groupList).toBeNull();
  expect(model.findByWatchId('sm1')).toBeUndefined();
});
test('P3-11 全ソート・逆順・シャッフルでも動画と選択行を保持する', () => {
  const model = new VideoListModel({ uniq: true });
  const a = item('sm1', { title: '第2回', length_seconds: 2, num_res: 2, mylist_counter: 2, view_counter: 2 });
  const b = item('sm2', { title: '第10回', length_seconds: 10, num_res: 10, mylist_counter: 10, view_counter: 10 });
  a.isActive = true;
  for (const key of ['watchId', 'duration', 'title', 'comment', 'mylist', 'view', 'postedAt']) {
    model.setItem([a, b]);
    model.sortBy(key);
    expect(ids(model)).toEqual(['sm1', 'sm2']);
    model.sortBy(key, true);
    expect(ids(model)).toEqual(['sm2', 'sm1']);
    expect(model.getItemByIndex(model.activeIndex)).toBe(a);
  }
  model.reverse();
  expect(ids(model)).toEqual(['sm1', 'sm2']);
  model.shuffle();
  expect(ids(model).sort()).toEqual(['sm1', 'sm2']);
  expect(model.getItemByIndex(model.activeIndex)).toBe(a);
  model.moveItemTo(a, item('sm99'));
  expect(ids(model).sort()).toEqual(['sm1', 'sm2']);
});
test('P3-12 視聴済み削除で再生中を残し、未視聴化と復元で識別子を保つ', () => {
  const model = new VideoListModel({ uniq: true });
  const a = item('sm1', { uniq_id: 'context1' }),
    b = item('sm2'),
    c = item('sm3');
  a.isActive = true;
  a.isPlayed = b.isPlayed = true;
  model.setItem([a, b, c]);
  model.removePlayedItem();
  expect(ids(model)).toEqual(['sm1', 'sm3']);
  model.resetPlayedItemFlag();
  expect(a.isPlayed).toBe(false);
  const restored = new VideoListModel({ uniq: true });
  restored.unserialize(model.serialize());
  expect(ids(restored)).toEqual(['sm1', 'sm3']);
  expect(restored.items[0]!.uniqId).toBe('context1');
  expect(restored.getItemByIndex(-1)).toBeNull();
  expect(restored.getItemByIndex(2)).toBeNull();
});
