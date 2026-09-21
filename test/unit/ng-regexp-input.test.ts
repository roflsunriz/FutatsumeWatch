import { describe, expect, test } from 'bun:test';
import {
  formatLiteralNgRegexpInput,
  formatNgRegexpInput,
  normalizeNgRegexpInputLines,
  parseNgRegexpInput,
} from '../../src/ng-regexp-input';

describe('NG正規表現の統合入力', () => {
  test('パターンとフラグを1つの入力へ往復する', () => {
    const formatted = formatNgRegexpInput('foo/bar$', 'gi');
    expect(formatted).toBe('/foo\\/bar$/gi');
    expect(parseNgRegexpInput(formatted)).toEqual({ pattern: 'foo\\/bar$', flags: 'gi' });
    expect(new RegExp(parseNgRegexpInput(formatted).pattern, 'gi').test('FOO/BAR')).toBe(true);
  });

  test('区切り・パターン・フラグの不正を拒否する', () => {
    for (const value of ['plain', '/unterminated', '/[/i', '/ok/ii']) {
      expect(() => parseNgRegexpInput(value)).toThrow();
    }
  });
  test('改行ごとに独立した表現を検証し、コメント本文はリテラルへ変換する', () => {
    expect(normalizeNgRegexpInputLines('/foo/i\n\n/^bar$/g')).toEqual(['/foo/i', '/^bar$/g']);
    expect(formatLiteralNgRegexpInput('a.b/c')).toBe('/a\\.b\\/c/i');
    expect(formatLiteralNgRegexpInput('first\r\nsecond')).toBe('/first\\r\\nsecond/i');
    expect(() => normalizeNgRegexpInputLines('/ok/i\n/[/g')).toThrow();
  });
});
