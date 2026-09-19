import { describe, expect, it } from 'bun:test';
import { uQuery } from '../../packages/lib/src/uQuery';

describe('DOM配列の初期化', () => {
  it('Array.fromの空生成とネストしたfindで例外にならない', () => {
    const w = window;
    Object.assign(globalThis, {
      Window: w.Window,
      HTMLCollection: w.HTMLCollection,
      NodeList: w.NodeList,
      Node: w.Node,
      Document: w.Document,
    });
    const container = document.createElement('div');
    container.innerHTML = '<section><span></span><span></span></section>';
    expect(uQuery(container).find('section').find('span').length).toBe(2);
    expect(uQuery(container).find('article').length).toBe(0);
  });
});
