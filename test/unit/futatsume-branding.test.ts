import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import { STABLE_USERSCRIPT_FILE, parseUserscriptVersion } from '../../src/version';

describe('FutatsumeWatch改名', () => {
  it('製品定数が現行名称を指す', () => {
    // FutatsumeWatchIndex は window 前提の依存を引くため静的 import せず原文で固定する
    const src = fs.readFileSync('./src/FutatsumeWatchIndex.ts', 'utf8');
    expect(src).toContain(`PRODUCT = 'FutatsumeWatch'`);
    expect(src).not.toContain('LEGACY_PRODUCT');
  });

  it('版管理が新生成物を指す', () => {
    expect(STABLE_USERSCRIPT_FILE).toBe('dist/FutatsumeWatch.user.js');
  });

  it('生成物のUserScriptヘッダが新名称・新リポジトリを指す', () => {
    for (const file of [STABLE_USERSCRIPT_FILE]) {
      expect(fs.existsSync(file)).toBe(true);
      const header = fs.readFileSync(file, 'utf8').slice(0, 8000);
      expect(header).toContain('==UserScript==');
      expect(header).toContain('FutatsumeWatch');
      expect(header).toContain('https://github.com/roflsunriz/FutatsumeWatch/');
      expect(header).not.toContain('github.com/segabito/');
      expect(header).not.toContain('github.com/kphrx/ZenzaWatch');
      expect(parseUserscriptVersion(header)).not.toBeNull();
    }
  });

  it('配布物を自己完結した単一ファイルにする', () => {
    expect(fs.readdirSync('./dist')).toEqual(['FutatsumeWatch.user.js']);
    const source = fs.readFileSync(STABLE_USERSCRIPT_FILE, 'utf8');
    expect(source).not.toMatch(/^\/\/\s*@require\s/m);
  });

  it('移行境界以外の現行コードとパスに旧ブランド名が残らない', () => {
    const oldBrand = /zenza|\bzen\b|zentube|zenbutton|iszen\b/i;
    for (const root of ['src', 'packages', 'scripts']) {
      for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
        expect(entry.name).not.toMatch(oldBrand);
        if (!entry.isFile() || !/\.(ts|css)$/.test(entry.name)) continue;
        if (root === 'src' && entry.name === 'config-migration.ts') continue;
        expect(fs.readFileSync(`${entry.parentPath}/${entry.name}`, 'utf8')).not.toMatch(oldBrand);
      }
    }
  });
});
