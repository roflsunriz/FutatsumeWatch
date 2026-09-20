import { describe, expect, it } from 'bun:test';
import { JSDOM } from 'jsdom';
import {
  migrateAddonConfig,
  migrateConfig,
  migrateImportedConfig,
  migrateSharedStorage,
} from '../../src/config-migration';

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

  it('移行済みの旧版から名称変更した設定と視聴ページ設定を引き継ぐ', () => {
    const storage = new JSDOM('', { url: 'https://www.nicovideo.jp' }).window.localStorage;
    storage.setItem('FutatsumeWatch_storageVersion', '1');
    storage.setItem('ZenzaWatch_autoZenTube', 'false');
    storage.setItem('FutatsumeWatch_autoZenTube', 'true');
    storage.setItem('FutatsumeWatch_bestZenTube', 'true');
    storage.setItem('FutatsumeWatch_autoPlay:ginza', 'false');
    storage.setItem('ZenzaWatch_unrecognized', 'true');
    migrateConfig(storage, ['autoFutatsumeTube', 'bestFutatsumeTube', 'autoPlay:ginza']);
    expect(storage.getItem('FutatsumeWatch_autoFutatsumeTube')).toBe('true');
    expect(storage.getItem('FutatsumeWatch_bestFutatsumeTube')).toBe('true');
    expect(storage.getItem('FutatsumeWatch_autoPlay:ginza')).toBe('false');
    expect(storage.getItem('FutatsumeWatch_unrecognized')).toBeNull();
    expect(storage.getItem('FutatsumeWatch_storageVersion')).toBe('2');
  });

  it('v1移行後にリセットした通常設定と旧名称の設定を復活させない', () => {
    const storage = new JSDOM('', { url: 'https://www.nicovideo.jp' }).window.localStorage;
    storage.setItem('FutatsumeWatch_storageVersion', '1');
    storage.setItem('ZenzaWatch_volume', '0.8');
    storage.setItem('ZenzaWatch_autoZenTube', 'true');
    migrateConfig(storage, ['volume', 'autoFutatsumeTube']);
    expect(storage.getItem('FutatsumeWatch_volume')).toBeNull();
    expect(storage.getItem('FutatsumeWatch_autoFutatsumeTube')).toBeNull();
    expect(storage.getItem('ZenzaWatch_volume')).toBe('0.8');
  });

  it('未移行の場合は旧ブランドの改名設定と視聴ページ設定を引き継ぐ', () => {
    const storage = new JSDOM('', { url: 'https://www.nicovideo.jp' }).window.localStorage;
    storage.setItem('ZenzaWatch_autoZenTube', 'true');
    storage.setItem('ZenzaWatch_autoPlay:ginza', 'false');
    migrateConfig(storage, ['autoFutatsumeTube', 'autoPlay:ginza']);
    expect(storage.getItem('FutatsumeWatch_autoFutatsumeTube')).toBe('true');
    expect(storage.getItem('FutatsumeWatch_autoPlay:ginza')).toBe('false');
  });

  it('旧設定ファイルを変換し、現行キーと元の入力を保護する', () => {
    const old = { autoZenTube: true, bestZenTube: true, bestFutatsumeTube: false, volume: 0.4 };
    expect(migrateImportedConfig(old)).toEqual({ autoFutatsumeTube: true, bestFutatsumeTube: false, volume: 0.4 });
    expect(old.autoZenTube).toBe(true);
  });

  it('HLSとGamePadの既知の設定を移行し、リセット後に旧値を復活させない', () => {
    const storage = new JSDOM('', { url: 'https://www.nicovideo.jp' }).window.localStorage;
    storage.setItem('ZenzaWatch_video.hls.capLevelToPlayerSize', 'true');
    storage.setItem('ZenzaWatch_video.hls.debug', '{broken');
    storage.setItem('ZenzaGamePad_config_needFocus', 'true');
    storage.setItem('ZenzaGamePad_config_enabled', 'true');
    storage.setItem('FutatsumeGamePad_config_enabled', 'false');
    migrateAddonConfig(storage, 'hls', ['capLevelToPlayerSize', 'debug']);
    migrateAddonConfig(storage, 'gamepad', ['needFocus', 'enabled']);
    expect(storage.getItem('FutatsumeWatch_video.hls.capLevelToPlayerSize')).toBe('true');
    expect(storage.getItem('FutatsumeWatch_video.hls.debug')).toBeNull();
    expect(storage.getItem('FutatsumeGamePad_config_needFocus')).toBe('true');
    expect(storage.getItem('FutatsumeGamePad_config_enabled')).toBe('false');
    storage.removeItem('FutatsumeGamePad_config_needFocus');
    migrateAddonConfig(storage, 'gamepad', ['needFocus', 'enabled']);
    expect(storage.getItem('FutatsumeGamePad_config_needFocus')).toBeNull();
    expect(storage.getItem('ZenzaGamePad_config_needFocus')).toBe('true');
  });

  it('プレイリスト・許可ホスト・MylistPocket同期を引き継ぐ', () => {
    const { localStorage: local, sessionStorage: session } = new JSDOM('', { url: 'https://www.nicovideo.jp' }).window;
    local.setItem('ZenzaWatch_whiteHost', 'example.org,example.net');
    local.setItem('MylistPocket_config_ng.syncZenza', 'true');
    session.setItem('ZenzaWatchPlaylist', '{"items":[{"watchId":"sm9"}]}');
    session.setItem('unrelated', 'keep');
    migrateSharedStorage(local, session);
    expect(local.getItem('FutatsumeWatch_whiteHost')).toBe('example.org,example.net');
    expect(local.getItem('MylistPocket_config_ng.syncFutatsume')).toBe('true');
    expect(session.getItem('FutatsumeWatchPlaylist')).toBe(session.getItem('ZenzaWatchPlaylist'));
    expect(session.getItem('unrelated')).toBe('keep');
    session.setItem('FutatsumeWatchPlaylist', '{"items":[]}');
    migrateSharedStorage(local, session);
    expect(session.getItem('FutatsumeWatchPlaylist')).toBe('{"items":[]}');
  });

  it('書き込み失敗を成功扱いせず、再実行で移行できる', () => {
    const storage = new JSDOM('', { url: 'https://www.nicovideo.jp' }).window.localStorage;
    storage.setItem('ZenzaWatch_volume', '0.2');
    const failing = new Proxy(storage, {
      get(target, key) {
        if (key === 'setItem')
          return () => {
            throw new Error('quota');
          };
        const value: unknown = Reflect.get(target, key);
        return typeof value === 'function' ? (value.bind(target) as unknown) : value;
      },
    });
    expect(() => migrateConfig(failing, ['volume'])).toThrow('quota');
    expect(storage.getItem('FutatsumeWatch_storageVersion')).toBeNull();
    migrateConfig(storage, ['volume']);
    expect(storage.getItem('FutatsumeWatch_volume')).toBe('0.2');
  });
});
