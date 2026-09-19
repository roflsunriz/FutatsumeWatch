import { describe, expect, it } from 'bun:test';
import { VERSION, STABLE_USERSCRIPT_FILE, parseUserscriptVersion } from '../../src/version';
import packageJson from '../../package.json';

describe('version', () => {
  it('ユーザースクリプトヘッダーからバージョンを抜き出す', () => {
    const header = '// ==UserScript==\n// @name ZenzaWatch\n// @version 2.6.3-fix-playlist.53\n// ==/UserScript==';
    expect(parseUserscriptVersion(header)).toBe('2.6.3-fix-playlist.53');
  });

  it('バージョン行がなければ null を返す', () => {
    expect(parseUserscriptVersion('// ==UserScript==\n// @name ZenzaWatch\n')).toBeNull();
  });

  it('版と単一配布先が一致する', () => {
    expect(VERSION).toBe(packageJson.version);
    expect(STABLE_USERSCRIPT_FILE).toBe('dist/FutatsumeWatch.user.js');
  });
});
