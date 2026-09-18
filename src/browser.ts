// import jsdom from 'jsdom';
// import * as $ from 'jquery';
// import {Emitter} from './baselib';

interface BrowserTestDom {
  defaultView: Record<string, unknown> | null;
}

interface BrowserJsdom {
  JSDOM: new (html: string, config: { url: string }) => BrowserTestDom;
}

interface BrowserShape {
  Node?: unknown;
  NodeList?: unknown;
  document?: unknown;
  window?: unknown;
}

// 利用箇所に合う最小の module-local な宣言。ランタイムは変えない。
// コメントアウトされた import は外さない。
declare const jsdom: BrowserJsdom;

const html = `
<!doctype html><html><body>
</body></html>
`;
const config = {
  url: 'http://localhost.nicovideo.jp',
};

const browser: BrowserShape = {};
const noop = (): void => {};

if (typeof window !== 'object') {
  const document = new jsdom.JSDOM(html, config);
  const window: Record<string, unknown> = document.defaultView || {};

  Object.assign(window, {
    navigator: { userAgent: 'Mozilla' },
    location: { href: config.url, host: 'http://localhost.nicovideo.jp', protocol: 'http:' },
    addEventListener: noop,
    removeEventListener: noop,
    console: console,
    jQuery: ($ as unknown as { default: unknown }).default,
    MylistPocket: { isReady: true },
    localStorage: {},
    sessionStorage: {},
    history: {},
  });
  window.top = window;

  browser.Node = jsdom.JSDOM;
  browser.NodeList = jsdom.JSDOM;
  browser.document = document;
  browser.window = window;
} else {
  browser.document = window.document;
  browser.window = window;
}

export { browser };
