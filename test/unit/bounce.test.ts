import { describe, expect, it } from 'bun:test';
import { bounce, throttle } from '../../packages/lib/src/infra/bounce';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('bounce.time', () => {
  it('元関数を origin に保持し、最後の呼び出しだけ実行する', async () => {
    const calls: unknown[][] = [];
    const func = (...args: unknown[]): unknown => {
      calls.push(args);
      return args.length;
    };
    const debounced = bounce.time(func);
    void debounced(1);
    void debounced(2, 3);
    await sleep(50);
    expect(calls).toEqual([[2, 3]]);
  });
});

describe('throttle.time', () => {
  it('Promise を返し、実行結果を解決する', async () => {
    const throttled = throttle.time((...args: unknown[]) => args, 10);
    const result = (await throttled('a')) as { lastResult: unknown };
    expect(result.lastResult).toEqual(['a']);
  });

  it('cancel で待ちを解消できる', async () => {
    const throttled = throttle((...args: unknown[]) => args, 1000);
    const pending = throttled('a');
    throttled.cancel();
    const result = (await pending) as { lastResult: unknown };
    expect(result.lastResult).toBeNull();
  });
});
