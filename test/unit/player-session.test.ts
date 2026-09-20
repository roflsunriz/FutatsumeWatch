import { expect, it } from 'bun:test';
import { JSDOM } from 'jsdom';
import { PlayerSession } from '../../packages/futatsume/src/init/PlayerSession';
import { migrateSharedStorage } from '../../src/config-migration';

it('移行した再生状態を一度だけ復元し、旧データは復旧用に保持する', () => {
  const { localStorage, sessionStorage } = new JSDOM('', { url: 'https://www.nicovideo.jp' }).window;
  const status = { watchId: 'sm9', playing: true, currentTime: 12 };
  sessionStorage.setItem('ZenzaWatch_PlayingStatus', JSON.stringify(status));
  migrateSharedStorage(localStorage, sessionStorage);
  const session = { session: {}, storage: sessionStorage, KEY: 'FutatsumeWatch_PlayingStatus' };
  expect(PlayerSession.hasRecord.call(session)).toBe(true);
  expect(PlayerSession.restore.call(session)).toEqual(status);
  expect(PlayerSession.hasRecord.call(session)).toBe(false);
  migrateSharedStorage(localStorage, sessionStorage);
  expect(PlayerSession.restore.call(session)).toEqual({});
  expect(sessionStorage.getItem('ZenzaWatch_PlayingStatus')).toBe(JSON.stringify(status));
});
