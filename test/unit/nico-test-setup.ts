// packages/lib nico 波の bun:test 用 DOM 担保ヘルパー。
// bun には window / document / DOMParser がないため jsdom で補う。
// nicoUtil はモジュール評価時に window / document を参照するため、
// 動的 import() の前に setupNicoDom() を呼ぶこと。

import { JSDOM } from 'jsdom';

export function setupNicoDom(url = 'https://www.nicovideo.jp/watch/sm9'): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g['DOMParser'] !== 'undefined' && typeof g['document'] !== 'undefined') {
    return;
  }
  const dom = new JSDOM('', { url });
  const w = dom.window;
  if (typeof w['decodeURIComponent'] === 'undefined') {
    w['decodeURIComponent'] = decodeURIComponent;
  }
  if (typeof w['encodeURIComponent'] === 'undefined') {
    w['encodeURIComponent'] = encodeURIComponent;
  }
  g['window'] = dom.window;
  g['document'] = dom.window.document;
  g['navigator'] = dom.window.navigator;
  g['DOMParser'] = dom.window.DOMParser;
  for (const c of [console, dom.window.console]) {
    const rec = c as Record<string, unknown>;
    // 製品では _template.ts が console.nicoru を事前注入する。util.ts は
    // window.console 経由で参照するため、jsdom 側の console にも同等品を用意する。
    if (typeof rec['nicoru'] !== 'function') {
      rec['nicoru'] = (...args: unknown[]): void => {
        (console.log as (...args: unknown[]) => void)(...args);
      };
    }
  }
}
