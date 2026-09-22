import { describe, expect, it } from 'bun:test';
import { JSDOM } from 'jsdom';
import { migrateConfig, migrateImportedConfig, migrateSharedStorage } from '../../src/config-migration';

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

  it('v1移行後にリセットした通常設定を復活させない', () => {
    const storage = new JSDOM('', { url: 'https://www.nicovideo.jp' }).window.localStorage;
    storage.setItem('FutatsumeWatch_storageVersion', '1');
    storage.setItem('ZenzaWatch_volume', '0.8');
    migrateConfig(storage, ['volume']);
    expect(storage.getItem('FutatsumeWatch_volume')).toBeNull();
    expect(storage.getItem('ZenzaWatch_volume')).toBe('0.8');
  });

  it('旧NGワードと単一正規表現を1行1表現の正規表現一覧へ移す', () => {
    const storage = new JSDOM('', { url: 'https://www.nicovideo.jp' }).window.localStorage;
    storage.setItem('FutatsumeWatch_storageVersion', '2');
    storage.setItem('FutatsumeWatch_wordFilter', JSON.stringify(['a.b', 'slash/value']));
    storage.setItem('FutatsumeWatch_wordRegFilter', JSON.stringify('^blocked$'));
    storage.setItem('FutatsumeWatch_wordRegFilterFlags', JSON.stringify('gi'));
    migrateConfig(storage, ['wordRegFilter']);
    expect(JSON.parse(storage.getItem('FutatsumeWatch_wordRegFilter')!)).toEqual([
      '/a\\.b/i',
      '/slash\\/value/i',
      '/^blocked$/gi',
    ]);
    expect(storage.getItem('FutatsumeWatch_storageVersion')).toBe('3');
    expect(storage.getItem('FutatsumeWatch_wordFilter')).toBe(JSON.stringify(['a.b', 'slash/value']));
  });

  it('旧NG設定ファイルを変換し、元の入力を保護する', () => {
    const old = {
      volume: 0.4,
      wordFilter: ['a.b'],
      wordRegFilter: '^blocked$',
      wordRegFilterFlags: 'i',
    };
    expect(migrateImportedConfig(old)).toEqual({
      volume: 0.4,
      wordRegFilter: ['/a\\.b/i', '/^blocked$/i'],
    });
    expect(old.volume).toBe(0.4);
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
