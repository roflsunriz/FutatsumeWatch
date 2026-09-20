import { expect, test, spyOn } from 'bun:test';
import { PlayListSession } from '../../packages/futatsume/src/Playlist/playlist-session';
test('P3-12 同じ内容でも保存領域が消されたら再保存する', () => {
  const data = { items: [], index: -1, enable: false, loop: false };
  PlayListSession.save(data);
  sessionStorage.removeItem('FutatsumeWatchPlaylist');
  PlayListSession.save(data);
  expect(PlayListSession.restore()).toEqual(data);
});
test('P3-12 破損JSONは復元せず、容量不足でも無関係な保存値を残して再試行できる', () => {
  sessionStorage.setItem('FutatsumeWatchPlaylist', '{broken');
  sessionStorage.setItem('unrelated-playlist-test', 'keep');
  expect(PlayListSession.isExist()).toBe(false);
  expect(PlayListSession.restore()).toBeNull();
  const fail = spyOn(sessionStorage, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  const log = spyOn(window.console, 'error').mockImplementation(() => {});
  try {
    expect(() => PlayListSession.save({ items: ['sm1'] })).toThrow('quota');
    expect(sessionStorage.getItem('unrelated-playlist-test')).toBe('keep');
  } finally {
    fail.mockRestore();
    log.mockRestore();
  }
  PlayListSession.save({ items: ['sm1'] });
  expect(PlayListSession.restore()).toEqual({ items: ['sm1'] });
  sessionStorage.removeItem('unrelated-playlist-test');
});
