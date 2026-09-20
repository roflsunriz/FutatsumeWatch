interface GatePostOptions {
  type?: string | null;
  token?: string | null;
  sessionId?: string | null;
  origin?: string | null;
}

interface GatePostBody {
  command?: string;
  params?: unknown;
  status?: string;
  message?: string;
}

interface GatePostState {
  channel: MessageChannel | null;
  port: MessagePort | null;
  origin: string | null;
  token: string | null;
  type: string | null;
}

interface GateFetchParams {
  url: string;
  options?: RequestInit;
  timeout?: number;
  signal?: AbortSignal | null;
}

interface GateInitParams {
  prefix: string;
  type?: string;
}

const PRODUCT = 'FutatsumeWatch';

import { workerUtil } from '../infra/workerUtil';
/*
post = {
  id: 'PRODUCT',
  type: 'nicovideoApi',
  token: 22222,
  sessionId: 11111,
  url: location.href,
  body: {command: 'hello', params: {}, status: 'ok'},
}
*/
//===BEGIN===
const gate = () => {
  const post = function (
    this: GatePostState,
    body: GatePostBody,
    { type, token, sessionId, origin }: GatePostOptions = {}
  ) {
    sessionId = sessionId || '';
    origin = origin || '';
    this.origin = origin = origin || this.origin || document.referrer;
    this.token = token = token || this.token;
    this.type = type = type || this.type;
    if (!this.channel) {
      this.channel = new MessageChannel();
    }
    const url = location.href;
    const id = PRODUCT;
    try {
      const msg = { id, type, token, url, sessionId, body };
      if (!this.port) {
        // console.info(`%c2. port connect [${window.name.split('#')[0]} ${PRODUCT}]`, 'background: #039393; color: gold; font-size: 120%;');
        msg.body = { command: 'initialized', params: msg.body };
        parent.postMessage(msg, origin, [this.channel.port2]);
        this.port = this.channel.port1;
        this.port.start();
      } else {
        this.port.postMessage(msg);
      }
    } catch (e) {
      console.error('%cError: parent.postMessage - ', 'color: red; background: yellow', e);
    }
    return this.port;
  }.bind({ channel: null, port: null, origin: null, token: null, type: null });

  const parseUrl = (url?: string): HTMLAnchorElement => {
    url = url || 'https://unknown.example.com/';
    const a = document.createElement('a');
    a.href = url;
    return a;
  };

  const isNicoServiceHost = (url: string): boolean => {
    const host = parseUrl(url).hostname;
    return /(^[a-z0-9.-]*\.nicovideo\.jp$|^[a-z0-9.-]*\.nico(|:[0-9]+)$)/.test(host);
  };

  const isWhiteHost = (url: string): boolean => {
    const u = parseUrl(url);
    const host = u.hostname;
    if (['account.nicovideo.jp', 'point.nicovideo.jp'].includes(host)) {
      return false;
    }
    if (isNicoServiceHost(url)) {
      return true;
    }
    if (['localhost', '127.0.0.1'].includes(host)) {
      return true;
    }
    const whiteHost = (localStorage as unknown as Record<string, string | undefined>).FutatsumeWatch_whiteHost;
    if (whiteHost) {
      if (whiteHost.split(',').includes(host)) {
        return true;
      }
    }
    if (u.protocol !== 'https:') {
      return false;
    }
    return (
      [
        'google.com',
        'www.google.com',
        'www.google.co.jp',
        'www.bing.com',
        'twitter.com',
        'friends.nico',
        'feedly.com',
        'www.youtube.com',
      ].includes(host) || host.endsWith('.slack.com')
    );
  };

  const uFetch = (params: GateFetchParams): Promise<unknown> => {
    const { url, options } = params;
    if (!isWhiteHost(url) || !isNicoServiceHost(url)) {
      // 到達不能ホスト通知は {status, message} 形式のプロトコルのため Error 限定しない
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      return Promise.reject({ status: 'fail', message: 'network error' });
    }
    const racers: Promise<unknown>[] = [];
    let timer: ReturnType<typeof setTimeout> | null | undefined | void;
    const timeout = typeof params.timeout === 'number' && !isNaN(params.timeout) ? params.timeout : 30 * 1000;
    if (timeout > 0) {
      racers.push(
        new Promise<void>((resolve, reject) => {
          timer = setTimeout(() => {
            if (timer) {
              // timeout 通知は {name, message} 形式のプロトコルのため Error 限定しない
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
              reject({ name: 'timeout', message: 'timeout' });
            } else {
              resolve();
            }
          }, timeout);
        })
      );
    }

    const controller = AbortController ? new AbortController() : null;
    if (controller) {
      params.signal = controller.signal;
    }

    racers.push(fetch(url, options));
    return Promise.race(racers)
      .catch((err: unknown) => {
        let message = 'uFetch fail';
        if (err && (err as { name?: unknown }).name === 'timeout') {
          if (controller) {
            console.warn('request timeout');
            controller.abort();
          }
          message = 'timeout';
        }
        // 失敗理由は {status, message} 形式のプロトコルのため Error 限定しない
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject({ status: 'fail', message });
      })
      .finally(() => {
        if (timer) {
          clearTimeout(timer);
        }
      });
  };

  const xFetch = (params: GateFetchParams, sessionId: string | null = null): Promise<unknown> => {
    const command = 'fetch';
    return uFetch(params)
      .then(async (resp: unknown) => {
        const r = resp as Response;
        const buffer = await r.arrayBuffer();
        const init = ['type', 'url', 'redirected', 'status', 'ok', 'statusText'].reduce(
          (map: Record<string, unknown>, key: string) => {
            map[key] = (r as unknown as Record<string, unknown>)[key];
            return map;
          },
          {}
        );
        const headers = [...r.headers.entries()];
        return Promise.resolve({ buffer, init, headers });
      })
      .then(({ buffer, init, headers }) => {
        const result = { status: 'ok', command, params: { buffer, init, headers } };
        post(result, { sessionId });
        return result;
      })
      .catch(({ status, message }: { status?: unknown; message?: unknown }) => {
        post({ status, message, command } as GatePostBody, { sessionId });
      });
  };

  const init = ({
    prefix,
    type,
  }: GateInitParams): {
    port: MessagePort | null;
    TOKEN: string | null;
    origin: string;
    type: string | undefined;
    PID: string;
  } => {
    if (!window.name.startsWith(prefix)) {
      throw new Error(`unknown name "${window.name}"`);
    }
    const PID = `${(window && window.name) || 'self'}:${location.host}:${window.name}:${Date.now().toString(16).toUpperCase()}`;
    // console.info(`%c1. port open [${window.name.split('#')[0]} ${PRODUCT}]`, 'background: #039393; color: gold; font-size: 120%;');

    type = type || window.name.replace(new RegExp(`/(${PRODUCT}|)Loader$/`), '');
    const origin: string = document.referrer || (window.name.split('#')[1] as string);
    console.log(
      '%cCrossDomainPort: host:%s window:%s',
      'background: lightgreen;',
      location.host,
      window.name.split('#')[0]
    );

    if (!isWhiteHost(origin)) {
      throw new Error(`disable bridge "${origin}"`);
    }

    const TOKEN = location.hash ? location.hash.substring(1) : null;
    window.history.replaceState(null, '', location.pathname);
    const port = post({ status: 'ok', command: 'initialized' }, { type, token: TOKEN, origin });
    workerUtil.env({ TOKEN, PRODUCT });
    // console.info(`%c3. port init OK [${window.name.split('#')[0]} ${PRODUCT}]`, 'background: #039393; color: gold; font-size: 120%;');
    return { port, TOKEN, origin, type, PID };
  };

  return { post, parseUrl, isNicoServiceHost, isWhiteHost, uFetch, xFetch, init };
};

//===END===
export { gate };
export type { GatePostBody, GateFetchParams };
