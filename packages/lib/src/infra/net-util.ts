import $ from 'jquery';

interface AbortableFetchParams extends RequestInit {
  timeout?: number;
}

interface NetUtil {
  ajax: (params: JQuery.AjaxSettings) => unknown;
  abortableFetch: (url: string, params?: AbortableFetchParams) => Promise<unknown>;
  fetch: (url: string, params?: AbortableFetchParams) => Promise<unknown>;
  jsonp: (url: string, funcName?: string) => Promise<unknown>;
}

import { NicoVideoApi } from '../nico/nico-video-api';

//===BEGIN===
const netUtil: NetUtil = {
  ajax: (params) => {
    return $.ajax(params);
  },
  abortableFetch: (url, params = {}) => {
    const racers: Promise<unknown>[] = [];
    let timer: ReturnType<typeof setTimeout> | null | undefined;
    const timeout = typeof params.timeout === 'number' && !isNaN(params.timeout) ? params.timeout : 30 * 1000;
    if (timeout > 0) {
      racers.push(
        new Promise<void>((resolve, reject) => {
          // timeout 通知は {name, message} 形式のプロトコルのため Error 限定しない
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          timer = setTimeout(() => (timer ? reject({ name: 'timeout', message: 'timeout' }) : resolve()), timeout);
        })
      );
    }
    const controller = window.AbortController ? new AbortController() : null;
    if (controller) {
      params.signal = controller.signal;
    }
    racers.push(fetch(url, params));
    return Promise.race(racers)
      .catch((err: unknown) => {
        if ((err as { name?: unknown }).name === 'timeout') {
          if (controller) {
            controller.abort();
          }
        }
        // timeout 判定後の message 透過のため Error 限定しない
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject((err as { message?: unknown }).message || err);
      })
      .finally(() => (timer = null));
  },
  fetch(url, params) {
    if (location.host !== 'www.nicovideo.jp') {
      return NicoVideoApi.fetch(url, params);
    }
    return this.abortableFetch(url, params);
  },
  jsonp: (() => {
    let callbackId = 0;
    const getFuncName = (): string => `JsonpCallback${callbackId++}`;

    let cw: Window | null = null;
    const getFrame = (): Promise<Window> | Window => {
      if (cw) {
        return cw;
      }
      return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.srcdoc = `
          <html><head></head></html>
        `.trim();
        (iframe as unknown as { sandbox: unknown }).sandbox = 'allow-same-origin allow-scripts';
        Object.assign(iframe.style, {
          width: '32px',
          height: '32px',
          position: 'fixed',
          left: '-100vw',
          top: '-100vh',
          pointerEvents: 'none',
          overflow: 'hidden',
        });
        iframe.onload = () => {
          cw = iframe.contentWindow;
          resolve(cw as Window);
        };
        (document.body || document.documentElement).append(iframe);
      });
    };

    const createFunc = async (url: string, funcName: string): Promise<unknown> => {
      let timeoutTimer: number | null = null;
      const win = await getFrame();
      const doc = win.document;
      const script = doc.createElement('script');
      return new Promise((resolve, reject) => {
        (win as unknown as Record<string, unknown>)[funcName] = (result: unknown) => {
          win.clearTimeout(timeoutTimer!);
          timeoutTimer = null;
          script.remove();
          delete (win as unknown as Record<string, unknown>)[funcName];

          resolve(result);
        };
        timeoutTimer = win.setTimeout(() => {
          script.remove();
          delete (win as unknown as Record<string, unknown>)[funcName];
          if (timeoutTimer) {
            reject(new Error(`jsonp timeout ${url}`));
          }
        }, 30000);
        script.src = url;
        doc.head.append(script);
      });
    };

    return (url: string, funcName?: string): Promise<unknown> => {
      if (!funcName) {
        funcName = getFuncName();
      }
      url = `${url}${url.includes('?') ? '&' : '?'}callback=${funcName}`;
      return createFunc(url, funcName);
    };
  })(),
};

//===END===

export { netUtil };
export type { NetUtil, AbortableFetchParams };
