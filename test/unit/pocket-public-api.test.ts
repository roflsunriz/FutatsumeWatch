import { expect, test } from 'bun:test';

interface PocketConfigNamespace {
  setValue(key: string, value: unknown): void;
}

interface PocketApi {
  config: { namespace(name: string): PocketConfigNamespace };
  debug: { sessionCache: { setItem(key: string, value: unknown, expireTime?: number): void } };
  external: {
    info(watchId: string): unknown;
    load(watchId: string): unknown;
    getFavStatus(watchId: string): unknown;
    observe(params: { query: string; container: Element | null }): unknown;
    hide(): void;
  };
  util: { httpLink(text: string): string };
  isReady?: boolean;
}

test('MylistPocket API retains info, NG/favorite display, storage and hide behavior', async () => {
  const { workerUtil } = await import('../../packages/lib/src/infra/worker-util');
  const domWindow = window as unknown as {
    Event: typeof Event;
    CustomEvent: typeof CustomEvent;
    HTMLElement: typeof HTMLElement;
    Element: typeof Element;
  };
  const browserWindow = window as unknown as Window & {
    MylistPocketLib?: { workerUtil: typeof workerUtil };
    MylistPocket?: PocketApi;
  };
  const globals = globalThis as unknown as Record<string, unknown>;
  Object.assign(globals, {
    self: browserWindow,
    top: browserWindow,
    Event: domWindow.Event,
    CustomEvent: domWindow.CustomEvent,
    HTMLElement: domWindow.HTMLElement,
    Element: domWindow.Element,
  });
  browserWindow.MylistPocketLib = { workerUtil };

  const localStorageProperties = localStorage as unknown as Record<string, string | undefined>;
  localStorageProperties['MylistPocket_config_ng.owner'] = JSON.stringify('1234');
  localStorageProperties['MylistPocket_config_fav.owner'] = JSON.stringify('1234');

  let resolveInitialized!: () => void;
  const initialized = new Promise<void>((resolve) => {
    resolveInitialized = resolve;
  });
  document.body.addEventListener('MylistPocketInitialized', resolveInitialized, { once: true });

  try {
    await import('../../src/pocket');
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      initialized,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('MylistPocketの初期化イベントが届きません')), 5000);
      }),
    ]);
    if (timeoutId !== undefined) clearTimeout(timeoutId);

    const pocket = browserWindow.MylistPocket;
    expect(pocket?.isReady).toBe(true);
    expect(typeof pocket?.external.info).toBe('function');
    expect(typeof pocket?.external.load).toBe('function');
    expect(typeof pocket?.external.getFavStatus).toBe('function');
    expect(typeof pocket?.external.observe).toBe('function');
    expect(pocket?.util.httpLink('sm123')).toContain('https://www.nicovideo.jp/watch/sm123');

    const thumbInfo = {
      status: 'ok',
      _format: 'thumbInfo',
      v: 'sm9',
      id: 'sm9',
      videoId: 'sm9',
      watchId: 'sm9',
      originalVideoId: '',
      isChannel: false,
      title: 'favorite title',
      description: '',
      thumbnail: 'https://example.test/sm9.jpg',
      movieType: 'mp4',
      lastResBody: '',
      duration: 120,
      postedAt: '2026/01/01 00:00:00',
      mylistCount: 1,
      viewCount: 2,
      commentCount: 3,
      tagList: [],
      owner: {
        type: 'user',
        id: '1234',
        linkId: 'user/1234',
        name: 'test owner',
        url: 'https://www.nicovideo.jp/user/1234',
        icon: 'https://example.test/icon.jpg',
      },
    };
    pocket!.debug.sessionCache.setItem('thumbInfo_sm9', thumbInfo, 60_000);
    await pocket!.external.info('sm9');

    const popup = document.querySelector('#mylistPocket-popup');
    const ownerInfo = popup?.shadowRoot?.querySelector('.owner-info');
    expect(popup?.classList.contains('show')).toBe(true);
    expect(ownerInfo?.classList.contains('is-ng')).toBe(true);
    expect(ownerInfo?.classList.contains('is-favorited')).toBe(true);

    pocket!.config.namespace('ng').setValue('owner', '5678');
    expect(localStorageProperties['MylistPocket_config_ng.owner']).toBe(JSON.stringify('5678'));

    pocket!.external.hide();
    expect(popup?.classList.contains('show')).toBe(false);
  } finally {
    document.body.replaceChildren();
    localStorage.removeItem('MylistPocket_config_ng.owner');
    localStorage.removeItem('MylistPocket_config_fav.word');
    delete localStorageProperties['MylistPocket_config_ng.owner'];
    delete localStorageProperties['MylistPocket_config_fav.owner'];
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('MylistPocket_cache_')) sessionStorage.removeItem(key);
    }
  }
});
