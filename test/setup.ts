// bun:test 用の最小環境担保（旧 test/setup.js の Bun 版）。
// 製品コードは CDN 由来の `_` とブラウザーの localStorage/location を前提とするため、
// テスト実行前に同等の最小実装を与える。jsdom が要る箇所は各テストで setupNicoDom を使う。

import * as lodash from 'lodash';

interface MemoryStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  readonly length: number;
  key(index: number): string | null;
}

const createMemoryStorage = (): MemoryStorageLike => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string): string | null => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string): void => {
      store.set(key, String(value));
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    clear: (): void => {
      store.clear();
    },
    get length(): number {
      return store.size;
    },
    key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
  };
};

const g = globalThis as unknown as Record<string, unknown>;
if (typeof g['localStorage'] === 'undefined') {
  g['localStorage'] = createMemoryStorage();
}
if (typeof g['sessionStorage'] === 'undefined') {
  g['sessionStorage'] = createMemoryStorage();
}
if (typeof g['location'] === 'undefined') {
  g['location'] = { protocol: 'https:', host: 'www.nicovideo.jp', href: 'https://www.nicovideo.jp/' };
}
if (typeof g['_'] === 'undefined') {
  g['_'] = lodash;
}
if (typeof g['CSS'] === 'undefined') {
  // ブラウザーは CSS Typed OM を提供する。css.ts の全使用箇所は
  // フォールバック付き（`typedCSS.px ? ... : ...`）のため、空オブジェクトで足りる。
  g['CSS'] = {};
}
{
  // 製品では main.ts が初期化順序の保証で console.nicoru を事前注入する。
  // util.ts はその存在を前提とするため、テスト環境でも同等品を用意する。
  const c = console as unknown as Record<string, unknown>;
  if (typeof c['nicoru'] !== 'function') {
    c['nicoru'] = (...args: unknown[]): void => {
      (console.log as (...args: unknown[]) => void)(...args);
    };
  }
}

// 各テストの実行順に依存せず、製品のDOM依存を読み込む前に用意する。
const { setupNicoDom } = await import('./unit/nico-test-setup');
setupNicoDom();
