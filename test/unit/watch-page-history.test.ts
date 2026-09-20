import { expect, it } from 'bun:test';
import { WatchPageHistory } from '../../packages/futatsume/src/init/watch-page-history';

it('戻る操作ではプレイヤーを閉じ、遷移先URLとサイトのhistory.stateを保持する', async () => {
  const descriptors = new Map(
    ['history', 'location'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  const oldUrl = window.location.href,
    oldState: unknown = window.history.state;
  Object.assign(globalThis, { history: window.history, location: window.location });
  const callbacks = new Map<string, (...args: unknown[]) => unknown>();
  let closed = 0;
  try {
    history.replaceState({ router: 'search' }, '', '/search/test');
    WatchPageHistory.initialize({
      on: (name, callback) => callbacks.set(name, callback),
      close: () => {
        closed++;
        callbacks.get('close')?.();
      },
    });
    callbacks.get('open')?.();
    callbacks.get('loadVideoInfo')?.({ watchId: 'sm9', title: 'fixture', owner: { name: 'fixture' } });
    await Bun.sleep(20);
    expect(window.location.pathname).toBe('/watch/sm9');
    expect(history.state as unknown).toEqual({ router: 'search' });
    history.pushState({ router: 'tag' }, '', '/tag/test');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    expect(closed).toBe(1);
    expect(window.location.pathname).toBe('/tag/test');
    expect(history.state as unknown).toEqual({ router: 'tag' });
  } finally {
    history.replaceState(oldState, '', oldUrl);
    for (const [key, value] of descriptors) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
