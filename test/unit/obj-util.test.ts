import { describe, expect, it } from 'bun:test';
import { objUtil } from '../../packages/lib/src/infra/objUtil';

describe('objUtil.isObject', () => {
  it('オブジェクトだけ真を返す', () => {
    expect(objUtil.isObject({})).toBe(true);
    expect(objUtil.isObject([])).toBe(true);
    expect(objUtil.isObject(null)).toBe(false);
    expect(objUtil.isObject('s')).toBe(false);
    expect(objUtil.isObject(1)).toBe(false);
  });
});

describe('objUtil.toMap', () => {
  it('プレーンオブジェクトを Map にする', () => {
    const m = objUtil.toMap({ a: 1 });
    expect(m).toBeInstanceOf(Map);
    expect(m.get('a')).toBe(1);
  });

  it('Map はそのまま返す', () => {
    const m = new Map([['a', 1]]);
    expect(objUtil.toMap(m)).toBe(m);
  });
});

describe('objUtil.mapToObj', () => {
  it('Map をプレーンオブジェクトに戻す', () => {
    expect(objUtil.mapToObj(new Map([['a', 1]]))).toEqual({ a: 1 });
  });

  it('Map でなければそのまま返す', () => {
    const o = { a: 1 };
    expect(objUtil.mapToObj(o)).toBe(o);
  });
});

describe('objUtil.bridge', () => {
  it('相手のメソッドを自分に束縛コピーする', () => {
    class Counter {
      count = 0;
      inc(): number {
        this.count++;
        return this.count;
      }
    }
    const self: { constructor: { prototype: object }; [key: string]: unknown } = {
      constructor: { prototype: {} },
    };
    objUtil.bridge(self, new Counter() as unknown as { constructor: { prototype: object }; [key: string]: unknown });
    const inc = self['inc'] as () => number;
    expect(inc()).toBe(1);
    expect(inc()).toBe(2);
  });
});
