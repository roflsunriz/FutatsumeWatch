import { describe, expect, it } from 'bun:test';
import { JSDOM } from 'jsdom';
import { migrateConfig } from '../../src/config-migration';

describe('旧設定の移行', () => {
  it('既存の新設定を優先し、旧値と無関係なデータを保持する', () => {
    const storage = new JSDOM('', { url: 'https://www.nicovideo.jp' }).window.localStorage;
    storage.setItem('ZenzaWatch_volume', '0.25');
    storage.setItem('ZenzaWatch_mute', 'true');
    storage.setItem('FutatsumeWatch_mute', 'false');
    storage.setItem('unrelated', 'keep');
    migrateConfig(storage, ['volume', 'mute']);
    expect(storage.getItem('FutatsumeWatch_volume')).toBe('0.25');
    expect(storage.getItem('FutatsumeWatch_mute')).toBe('false');
    expect(storage.getItem('ZenzaWatch_volume')).toBe('0.25');
    expect(storage.getItem('unrelated')).toBe('keep');
    storage.setItem('ZenzaWatch_volume', '0.8');
    migrateConfig(storage, ['volume']);
    expect(storage.getItem('FutatsumeWatch_volume')).toBe('0.25');
  });
  it('壊れた旧値を移さない', () => {
    const storage = new JSDOM('', { url: 'https://www.nicovideo.jp' }).window.localStorage;
    storage.setItem('ZenzaWatch_volume', '{broken');
    migrateConfig(storage, ['volume']);
    expect(storage.getItem('FutatsumeWatch_volume')).toBeNull();
    expect(storage.getItem('ZenzaWatch_volume')).toBe('{broken');
  });
});
