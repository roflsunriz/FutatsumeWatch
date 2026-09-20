import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { uQuery } from '../../packages/lib/src/u-query';

beforeEach(() => {
  Object.assign(globalThis, {
    Window: window.Window,
    HTMLCollection: window.HTMLCollection,
    NodeList: window.NodeList,
    Node: window.Node,
    Document: window.Document,
  });
});

// 旧 test/browser/utilTest.ts のイベント検証を通常のテスト実行へ移す。
describe('DOMイベントの名前空間', () => {
  it('異なるハンドラーを実行し、同じ登録は重複しない', () => {
    const element = document.createElement('span');
    const query = uQuery(element);
    const handlers = [mock(() => {}), mock(() => {}), mock(() => {})];
    handlers.forEach((handler, index) => {
      query.on(`change.${index}`, handler).on(`change.${index}`, handler);
    });
    element.dispatchEvent(new window.Event('change'));
    handlers.forEach((handler) => expect(handler).toHaveBeenCalledTimes(1));
  });

  it('イベント名で全名前空間を解除し、別イベントは残す', () => {
    const element = document.createElement('span');
    const query = uQuery(element);
    const removed = mock(() => {});
    const retained = mock(() => {});
    query.on('change.1', removed).on('change.2', removed).on('input.1', retained);
    query.off('change');
    element.dispatchEvent(new window.Event('change'));
    element.dispatchEvent(new window.Event('input'));
    expect(removed).not.toHaveBeenCalled();
    expect(retained).toHaveBeenCalledTimes(1);
  });

  it('名前空間で複数のハンドラーを解除する', () => {
    const element = document.createElement('span');
    const query = uQuery(element);
    const retained = mock(() => {});
    const removed = mock(() => {});
    const otherRemoved = mock(() => {});
    query.on('change.1', retained).on('change.2', removed).on('change.2', otherRemoved);
    query.off('.2');
    element.dispatchEvent(new window.Event('change'));
    expect(retained).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    expect(otherRemoved).not.toHaveBeenCalled();
  });

  it('同じハンドラーを別の名前空間に登録しても1回だけ呼ぶ', () => {
    const element = document.createElement('span');
    const handler = mock(() => {});
    uQuery(element).on('change.1', handler).on('change.3', handler);
    element.dispatchEvent(new window.Event('change'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('特定の名前空間とハンドラーの解除で別の登録を失わない', () => {
    const element = document.createElement('span');
    const query = uQuery(element);
    const handler = mock(() => {});
    query.on('change.1', handler).on('change.2', handler).on('change.3', handler);
    query.off('change.2', handler);
    element.dispatchEvent(new window.Event('change'));
    expect(handler).toHaveBeenCalledTimes(1);
    query.off('change');
    element.dispatchEvent(new window.Event('change'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('名前空間だけを解除しても同じハンドラーの別名登録を残す', () => {
    const element = document.createElement('span');
    const query = uQuery(element);
    const handler = mock(() => {});
    query.on('change.1', handler).on('change.2', handler);
    query.off('.2');
    element.dispatchEvent(new window.Event('change'));
    expect(handler).toHaveBeenCalledTimes(1);
    query.off();
    element.dispatchEvent(new window.Event('change'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('DOM配列の初期化', () => {
  it('Array.fromの空生成とネストしたfindで例外にならない', () => {
    const container = document.createElement('div');
    container.innerHTML = '<section><span></span><span></span></section>';
    expect(uQuery(container).find('section').find('span').length).toBe(2);
    expect(uQuery(container).find('article').length).toBe(0);
  });
});
