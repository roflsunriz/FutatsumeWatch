import { describe, expect, it } from 'bun:test';
import {
  DEV_USERSCRIPT_FILE,
  STABLE_USERSCRIPT_FILE,
  isDevUserscript,
  parseUserscriptVersion,
  resolveUserscriptOutFile,
} from '../../src/version';

describe('version', () => {
  it('ユーザースクリプトヘッダーからバージョンを抜き出す', () => {
    const header = '// ==UserScript==\n// @name ZenzaWatch\n// @version 2.6.3-fix-playlist.53\n// ==/UserScript==';
    expect(parseUserscriptVersion(header)).toBe('2.6.3-fix-playlist.53');
  });

  it('バージョン行がなければ null を返す', () => {
    expect(parseUserscriptVersion('// ==UserScript==\n// @name ZenzaWatch\n')).toBeNull();
  });

  it('dev 判定と生成物パス解決が一致する', () => {
    expect(isDevUserscript(DEV_USERSCRIPT_FILE)).toBe(true);
    expect(isDevUserscript(STABLE_USERSCRIPT_FILE)).toBe(false);
    expect(resolveUserscriptOutFile(true)).toBe(DEV_USERSCRIPT_FILE);
    expect(resolveUserscriptOutFile(false)).toBe(STABLE_USERSCRIPT_FILE);
  });
});
