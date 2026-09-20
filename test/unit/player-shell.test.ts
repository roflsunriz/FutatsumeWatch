import { describe, expect, test } from 'bun:test';
import { ABRepeat } from '../../src/player-shell';
import { shellText } from '../../src/player-shell-view';
import { VideoListItem } from '../../packages/futatsume/src/Playlist/VideoListItem';

describe('AB repeat', () => {
  test('AとBを指定した区間だけを繰り返し、3回目で解除する', () => {
    const repeat = new ABRepeat();
    expect(repeat.seekTarget(30)).toBeNull();
    expect(repeat.advance(10)).toBe(true);
    expect(repeat.seekTarget(30)).toBeNull();
    expect(repeat.advance(20)).toBe(true);
    expect(repeat.seekTarget(19.9)).toBeNull();
    expect(repeat.seekTarget(20)).toBe(10);
    expect(repeat.seekTarget(100)).toBe(10);
    expect(repeat.advance(15)).toBe(true);
    expect(repeat.seekTarget(100)).toBeNull();
    expect(repeat.start).toBeNull();
  });
  test('BがA以前・短すぎる場合はAを保持して再選択できる', () => {
    const repeat = new ABRepeat();
    repeat.advance(10);
    for (const time of [0, 9, 10, 10.05]) expect(repeat.advance(time)).toBe(false);
    expect(repeat.start).toBe(10);
    expect(repeat.end).toBeNull();
    expect(repeat.advance(12)).toBe(true);
  });
  test('不正値から区間を生成しない', () => {
    const repeat = new ABRepeat();
    for (const time of [-1, NaN, Infinity]) expect(repeat.advance(time)).toBe(false);
    expect(repeat.start).toBeNull();
  });
  test('動画切替と終了時のclearは保留中のAも有効なABも消す', () => {
    const repeat = new ABRepeat();
    repeat.advance(0);
    repeat.clear();
    expect(repeat.start).toBeNull();
    repeat.advance(0);
    repeat.advance(8);
    expect(repeat.seekTarget(8)).toBe(0);
    repeat.clear();
    expect(repeat.seekTarget(8)).toBeNull();
  });
});
test('操作文言は日本語と英語フォールバックを提供する', () => {
  expect(shellText('ja-JP').play).toBe('再生');
  expect(shellText('en-US').play).toBe('Play');
  expect(shellText('de-DE').play).toBe('Play');
});
test('いいね数は一覧の保存・復元で失われず、未取得をゼロと扱わない', () => {
  const item = new VideoListItem({ id: 'sm9', title: 'video', like: 42, first_retrieve: '2007-03-06' });
  expect(new VideoListItem(item.serialize()).count.like).toBe(42);
  expect(new VideoListItem({ id: 'sm9', title: 'video' }).count.like).toBeUndefined();
});
