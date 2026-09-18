import { beforeEach, describe, expect, it } from 'bun:test';
import { Emitter, Handler } from '../../src/baselib';

let called: Record<string, number | undefined> = {};
let count = 0;
const recordCall = (key: string, v: unknown): void => {
  if (typeof v !== 'number') {
    throw new Error(`想定外の値: ${String(v)}`);
  }
  called[key] = v;
  count++;
};
const a = (v: unknown): void => {
  recordCall('a', v);
};
const b = (v: unknown): void => {
  recordCall('b', v);
};
const c = (v: unknown): void => {
  recordCall('c', v);
};

describe('Handler', () => {
  beforeEach(() => {
    called = {};
    count = 0;
  });

  it('add', () => {
    const handler = new Handler(a);
    const r = Math.random();
    handler.add(b);
    handler.add(c);

    handler.exec(r);
    expect(called.a).toBe(r);
    expect(called.b).toBe(r);
    expect(called.c).toBe(r);
    expect(count).toBe(3);
  });

  it('重複登録はされない', () => {
    const handler = new Handler(a);
    const r = Math.random();

    handler.add(a);
    handler.add(a);
    handler.add(a);
    handler.add(b);

    handler.exec(r);
    expect(called.a).toBe(r);
    expect(called.b).toBe(r);
    expect(called.c).toBeUndefined();
    expect(count).toBe(2);
    expect(handler.length).toBe(2);
  });

  it('removeしたものは呼ばれない', () => {
    const handler = new Handler(a);
    const r = Math.random();

    handler.add(b);
    handler.add(c);
    handler.remove(b);

    handler.exec(r);
    expect(called.a).toBe(r);
    expect(called.b).toBeUndefined();
    expect(called.c).toBe(r);

    expect(count).toBe(2);
    expect(handler._list.includes(a)).toBe(true);
    expect(handler._list.includes(b)).toBe(false);
    expect(handler._list.includes(c)).toBe(true);
  });

  it('clear', () => {
    const handler = new Handler(a);
    const r = Math.random();

    handler.add(b);
    handler.add(c);

    handler.clear();
    handler.exec(r);
    expect(called.a).toBeUndefined();
    expect(called.b).toBeUndefined();
    expect(called.c).toBeUndefined();
    expect(count).toBe(0);
    expect(handler.isEmpty).toBe(true);
  });
});

describe('Emitter', () => {
  beforeEach(() => {
    called = {};
    count = 0;
  });

  it('on', () => {
    const emitter = new Emitter();
    let r = Math.random();

    emitter.on('foo', a);
    emitter.on('foo', b);
    emitter.on('foo', c);

    emitter.emit('foo', r);
    expect(called.a).toBe(r);
    expect(called.b).toBe(r);
    expect(called.c).toBe(r);
    expect(count).toBe(3);

    r = Math.random();
    emitter.emit('foo', r);
    expect(called.a).toBe(r);
    expect(called.b).toBe(r);
    expect(called.c).toBe(r);
    expect(count).toBe(6);
  });

  it('once', () => {
    const emitter = new Emitter();
    let r = Math.random();

    emitter.on('foo', a);
    emitter.once('foo', b);
    emitter.on('foo', c);

    emitter.emit('foo', r);
    expect(called.a).toBe(r);
    expect(called.b).toBe(r);
    expect(called.c).toBe(r);
    expect(count).toBe(3);

    called = {};
    r = Math.random();
    emitter.emit('foo', r);
    expect(called.a).toBe(r);
    expect(called.b).toBeUndefined();
    expect(called.c).toBe(r);
    expect(count).toBe(5);
  });
});
