import { describe, expect, it } from 'bun:test';
import { Emitter, Handler } from '../../packages/lib/src/emitter';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('Handler', () => {
  it('登録順と逆に実行する', () => {
    const order: number[] = [];
    const h = new Handler(
      () => order.push(1),
      () => order.push(2)
    );
    h.exec();
    expect(order).toEqual([2, 1]);
  });

  it('add/remove が効く', () => {
    const h = new Handler();
    const f = (): void => {};
    h.add(f);
    expect(h.isEmpty).toBe(false);
    h.remove(f);
    expect(h.isEmpty).toBe(true);
  });
});

describe('Emitter', () => {
  it('on/emit で購読者に届く', () => {
    const emitter = new Emitter();
    const received: unknown[][] = [];
    emitter.on('greet', (...args) => {
      received.push(args);
    });
    emitter.emit('greet', 'hello', 1);
    expect(received).toEqual([['hello', 1]]);
  });

  it('イベント名の大文字小文字を区別しない', () => {
    const emitter = new Emitter();
    let count = 0;
    emitter.on('Click', () => count++);
    emitter.emit('click');
    emitter.emit('CLICK');
    expect(count).toBe(2);
  });

  it('off で解除できる', () => {
    const emitter = new Emitter();
    let count = 0;
    const f = (): void => {
      count++;
    };
    emitter.on('x', f);
    emitter.off('x', f);
    emitter.emit('x');
    expect(count).toBe(0);
  });

  it('once は一度だけ発火する', () => {
    const emitter = new Emitter();
    let count = 0;
    emitter.once('x', () => count++);
    emitter.emit('x');
    emitter.emit('x');
    expect(count).toBe(1);
  });

  it('emitAsync は非同期に届く', async () => {
    const emitter = new Emitter();
    let count = 0;
    emitter.on('x', () => count++);
    emitter.emitAsync('x');
    expect(count).toBe(0);
    await sleep(10);
    expect(count).toBe(1);
  });

  it('promise/emitResolve で値を受渡しできる', async () => {
    const emitter = new Emitter();
    const p = emitter.promise('ready');
    let value: unknown;
    void p.then((v) => (value = v));
    void emitter.emitResolve('ready', 42);
    await sleep(10);
    expect(value).toBe(42);
  });
});
