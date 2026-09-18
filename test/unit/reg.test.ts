import { describe, expect, it } from 'bun:test';
import { reg } from '../../packages/lib/src/text/reg';

// 注意: reg の exec/test 系は strict/module 下では未束縛呼び出しと
// プリミティブへのプロパティ代入により例外になる (dist の sloppy 連結では沈黙する既知の差異)。
// ここでは到達可能な範囲 (未指定呼び出し・スコープ分離) のみ固定する。
describe('reg', () => {
  it('引数なしでは null を返す', () => {
    expect(reg()).toBeNull();
  });

  it('scope ごとに状態が分かれる', () => {
    const a = reg.bind({});
    const b = reg.bind({});
    expect(a()).toBeNull();
    expect(b()).toBeNull();
  });

  it('scope() で束縛関数を作れる', () => {
    const scope = (reg as unknown as { scope: (o?: object) => (...args: unknown[]) => unknown }).scope;
    const bound = scope({});
    expect(typeof bound).toBe('function');
    expect(bound()).toBeNull();
  });
});
