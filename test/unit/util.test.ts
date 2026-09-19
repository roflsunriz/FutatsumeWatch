import { describe, expect, it } from 'bun:test';
import { Config } from '../../src/Config';

// 製品（main.ts 初期化順序）と同じく、先に Config の restore 完了を待ってから
// util モジュールを評価する。util.ts はモジュール評価時に Config.props.debug を読む。
await Config.promise('restore');
const { util: importedUtil } = await import('../../src/util');

// NOTE: src/util.js は //@require 連結で機能を集約するため、
// TS の JS 推論では dateToString / sortedLastIndex が見えない。
// 境界で unknown を受けて型ガードで絞り込む。
interface TestUtil {
  dateToString(value: Date | string): string;
  sortedLastIndex(arr: readonly number[], value: number): number;
}

const asTestUtil = (v: unknown): TestUtil => {
  if (typeof v !== 'object' || v === null) {
    throw new Error('util が未解決');
  }
  const o = v as Record<string, unknown>;
  if (typeof o.dateToString !== 'function' || typeof o.sortedLastIndex !== 'function') {
    throw new Error('util の形式が不正');
  }
  return v as unknown as TestUtil;
};

const rawUtil: unknown = importedUtil;
const testUtil = asTestUtil(rawUtil);

describe('dateToString', () => {
  it('一桁の列も0埋めされてYYYY/MM/DD hh:mm:ssのフォーマットになる', () => {
    const match = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/;
    let d: Date;
    for (let i = 0; i < 100; i++) {
      d = new Date(Date.now() * Math.random());
      expect(match.test(testUtil.dateToString(d))).toBe(true);
    }
  });
  it('パースできない文字列を渡したらそのまま返す', () => {
    const d = 'aaaa/bb/cc dd:ee:ff';
    expect(testUtil.dateToString(d)).toBe(d);
  });
});

describe('sortedLastIndex', () => {
  it('どのメンバーよりも小さかったら 0.  -1 ではない', () => {
    const array = [1, 3, 5, 7, 9, 11];
    expect(testUtil.sortedLastIndex(array, -1)).toBe(0);
    expect(testUtil.sortedLastIndex(array, 0)).toBe(0);
  });

  it('どのメンバーよりも大きかったら右端', () => {
    const array = [1, 3, 5, 7, 9, 11];
    expect(testUtil.sortedLastIndex(array, 15)).toBe(array.length);
  });

  it('sortedLastIndex', () => {
    const array = [1, 3, 5, 7, 9, 11];
    expect(testUtil.sortedLastIndex(array, 0)).toBe(0);

    expect(testUtil.sortedLastIndex(array, 1)).toBe(1);

    expect(testUtil.sortedLastIndex(array, 3)).toBe(2);
    expect(testUtil.sortedLastIndex(array, 4)).toBe(2);

    expect(testUtil.sortedLastIndex(array, 5)).toBe(3);
    expect(testUtil.sortedLastIndex(array, 7)).toBe(4);
  });
});
