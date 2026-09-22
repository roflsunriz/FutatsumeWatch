import { describe, expect, test } from 'bun:test';
import { validateImportedConfig } from '../../src/config-validation';
import { migrateImportedConfig } from '../../src/config-migration';
import { Config } from '../../src/config';

const defaults = {
  volume: 0.3,
  baseChatScale: 1,
  autoPlay: true,
  commandFilter: '',
  userIdFilter: '',
  sharedNgLevel: 'MID',
  'commentLayer.textShadowType': '',
  'commentLayer.easyCommentOpacity': 0.5,
  wordRegFilter: [],
};
describe('設定ファイルの型と範囲', () => {
  test('既知キーの型・数値境界・刻み・enum・regexを読み込み前に拒否する', () => {
    for (const invalid of [
      { volume: 'oops' },
      { volume: -0.1 },
      { volume: 1.1 },
      { baseChatScale: 0 },
      { baseChatScale: 2.1 },
      { baseChatScale: 0.55 },
      { autoPlay: 'false' },
      { wordRegFilter: [3] },
      { commandFilter: {} },
      { sharedNgLevel: 'invalid' },
      { 'commentLayer.textShadowType': 'invalid' },
      { 'commentLayer.easyCommentOpacity': 0 },
      { wordRegFilter: ['/[/i'] },
      { wordRegFilter: ['/ok/ii'] },
    ])
      expect(() => validateImportedConfig(invalid, defaults)).toThrow();
  });
  test('旧版select由来の数値文字列と正当なNG配列・enum・改名キーを移行する', () => {
    const source = {
      volume: '0.3',
      baseChatScale: '1.2',
      wordFilter: ['a', 'b'],
      wordRegFilter: 'blocked',
      wordRegFilterFlags: 'i',
      commandFilter: 'red',
      sharedNgLevel: 'NONE',
      'commentLayer.textShadowType': 'shadow-type3',
      retiredKey: 'ignored',
    };
    const result = validateImportedConfig(migrateImportedConfig(source), defaults);
    expect(result).toEqual({
      volume: 0.3,
      baseChatScale: 1.2,
      wordRegFilter: ['/a/i', '/b/i', '/blocked/i'],
      commandFilter: 'red',
      sharedNgLevel: 'NONE',
      'commentLayer.textShadowType': 'shadow-type3',
    });
    expect(source.baseChatScale).toBe('1.2');
  });
  test('Config.importJsonは1項目でも不正なら既存値と保存領域を全て維持する', async () => {
    await Config.promise('restore');
    const before = Config.exportJson();
    const stored = localStorage.getItem('FutatsumeWatch_volume');
    for (const data of [
      { volume: 'oops', autoPlay: false },
      { baseChatScale: 0, volume: 0.8 },
      { wordRegFilter: [1], volume: 0.7 },
      { sharedNgLevel: 'BROKEN' },
    ]) {
      expect(() => Config.importJson(JSON.stringify(data))).toThrow();
      expect(Config.exportJson()).toBe(before);
      expect(localStorage.getItem('FutatsumeWatch_volume')).toBe(stored);
    }
  });
});
