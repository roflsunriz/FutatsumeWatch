interface GateCommandBody {
  command: string;
  status?: string;
  params?: unknown;
}

interface GateMessageBody {
  command: string;
  params: unknown;
}

interface GateMessage {
  id?: string;
  type?: string;
  token?: unknown;
  sessionId?: string | null;
  body?: GateCommandBody & { params?: unknown };
}

interface GatePostBody {
  command: string;
  params: unknown;
}

interface GateFetchResult {
  buffer?: ArrayBuffer;
  init?: { status: number; statusText?: string };
  headers?: [string, string][];
}

interface GateFetchOptions extends RequestInit {
  _format?: string;
}

interface GateConfig {
  getKeys: () => string[];
  props: Record<string, unknown>;
  on: (name: string, callback: (...args: unknown[]) => unknown) => unknown;
}

interface GateInitializeParams {
  baseUrl: string;
  origin?: string;
  type: string;
  suffix?: string;
  name?: string;
}

import { Emitter, PromiseHandler } from '../emitter';
import type { AnyPromiseHandler } from '../emitter';
import { PRODUCT } from '../../../../src/futatsume-watch-index';
import { BroadcastEmitter } from '../message/message-util';

const TOKEN = 'ranbu';
//===BEGIN===

class CrossDomainGate extends Emitter {
  _baseUrl!: string;
  _origin!: string;
  _type!: string;
  _suffix!: string;
  name!: string;
  _sessions!: Record<string, AnyPromiseHandler>;
  _initializeStatus!: string;
  loaderFrame!: HTMLIFrameElement;
  _loaderWindow?: Window | null;
  port?: MessagePort | null;
  _config?: GateConfig;
  static get hostReg(): RegExp {
    return /^[a-z0-9]*\.nicovideo\.jp$/;
  }
  constructor(...args: [GateInitializeParams]) {
    super();
    this.initialize(...args);
  }
  initialize(params: GateInitializeParams): void {
    this._baseUrl = params.baseUrl;
    this._origin = params.origin || location.href;
    this._type = params.type;
    this._suffix = params.suffix || '';
    this.name = params.name || params.type;
    this._sessions = {};
    this._initializeStatus = 'none';
  }
  _initializeFrame(): AnyPromiseHandler {
    if (this._initializeStatus !== 'none') {
      return this.promise('initialize');
    }
    this._initializeStatus = 'initializing';
    const append = (): void => {
      if (!this.loaderFrame.parentNode) {
        console.warn('frame removed');
        this.port = null;
        this._initializeCrossDomainGate();
      }
    };
    setTimeout(append, 5 * 1000);
    setTimeout(append, 10 * 1000);
    setTimeout(append, 20 * 1000);
    setTimeout(append, 30 * 1000);
    setTimeout(() => {
      if (this._initializeStatus === 'done') {
        return;
      }
      void this.emitReject('initialize', {
        status: 'timeout',
        message: `CrossDomainGate初期化タイムアウト (type: ${this._type}, status: ${this._initializeStatus})`,
      });
      console.warn(`CrossDomainGate初期化タイムアウト (type: ${this._type}, status: ${this._initializeStatus})`);
    }, 60 * 1000);
    this._initializeCrossDomainGate();
    return this.promise('initialize');
  }
  _initializeCrossDomainGate(): void {
    // window.console.info(`%c1. CrossDomainGate open ${this.name} ${PRODUCT}`, 'background: orange; color: green; font-size: 120%');
    const loaderFrame = (this.loaderFrame = document.createElement('iframe'));
    loaderFrame.referrerPolicy = 'origin';
    loaderFrame.sandbox = 'allow-scripts allow-same-origin';
    loaderFrame.loading = 'eager';
    loaderFrame.name = `${this._type}${PRODUCT}Loader${this._suffix ? `#${this._suffix}` : ''}`;
    loaderFrame.className = `xDomainLoaderFrame ${this._type}`;
    loaderFrame.style.cssText = `
      position: fixed; left: -100vw; pointer-events: none;user-select: none; contain: strict;`;
    (document.body || document.documentElement).append(loaderFrame);

    this._loaderWindow = loaderFrame.contentWindow;
    const onInitialMessage = (event: MessageEvent): void => {
      if (event.source !== this._loaderWindow) {
        return;
      }
      // window.console.info(`%c2. CrossDomainGate onInitialMessage [${this.name} ${PRODUCT}]`, 'background: orange; color: green; font-size: 120%');
      window.removeEventListener('message', onInitialMessage as (e: Event) => void);
      this._onMessage(event);
    };
    window.addEventListener('message', onInitialMessage as (e: Event) => void, { capture: true });
    this._loaderWindow!.location.replace(this._baseUrl + '#' + TOKEN);
  }
  _onMessage(event: MessageEvent): void {
    const data = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as GateMessage;
    const { id, type, token, sessionId, body } = data;
    if (id !== PRODUCT || type !== this._type || token !== TOKEN) {
      console.warn('invalid token:', { id, PRODUCT, type, _type: this._type, token, TOKEN });
      return;
    }

    if (!this.port && body!.command === 'initialized') {
      const port = (this.port = event.ports[0]!);
      port.addEventListener('message', this._onMessage.bind(this));
      port.start();
      port.postMessage({ body: { command: 'ok' }, token: TOKEN });
      // window.console.info(`%c3. CrossDomainGate MessageChannel OK [${this.name} ${PRODUCT}]`, 'background: orange; color: green; font-size: 120%');
    }
    this._onCommand(body!, sessionId);
  }
  _onCommand({ command, status, params }: GateCommandBody, sessionId: string | null = null): unknown {
    switch (command) {
      case 'initialized':
        if (this._initializeStatus !== 'done') {
          this._initializeStatus = 'done';
          const originalBody = params as GateCommandBody;
          const result = this._onCommand(originalBody, sessionId);
          void this.emitResolve('initialize', { status: 'ok' });
          // window.console.info(`%c4. CrossDomainGate init OK [${this.name} ${PRODUCT}]`, 'background: orange; color: green; font-size: 120%');
          return result;
        }
        break;

      case 'message':
        BroadcastEmitter.emitAsync('message', params, 'broadcast', sessionId);
        break;

      default:
        {
          const session = this._sessions[sessionId as string];
          if (!session) {
            return;
          }
          if (status === 'ok') {
            void session.resolve(params);
          } else {
            // message 透過のため Error 限定しない
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            void session.reject({ message: status || 'fail' });
          }
          delete this._sessions[sessionId as string];
        }
        break;
    }
  }
  /**
   * @deprecated fetch使え
   * @param {string} url
   * @param {object} options
   */
  load(url: string, options?: unknown): Promise<AnyPromiseHandler> {
    return this._postMessage({ command: 'loadUrl', params: { url, options } });
  }
  videoCapture(src: string, sec: number): Promise<unknown> {
    return this._postMessage({ command: 'videoCapture', params: { src, sec } }).then((result: unknown) =>
      Promise.resolve((result as { dataUrl?: unknown }).dataUrl)
    );
  }
  _fetch(url: string, options?: GateFetchOptions): Promise<AnyPromiseHandler> {
    return this._postMessage({ command: 'fetch', params: { url, options } });
  }
  async fetch(resource: string | URL | Request, options: GateFetchOptions = {}): Promise<unknown> {
    let url: string = resource as string;
    if (resource instanceof URL) {
      url = resource.toString();
    } else if (resource instanceof Request) {
      url = resource.url;
      options.method ??= resource.method;
      options.headers ??= resource.headers;
      options.body ??= resource.body;
      options.credentials ??= resource.credentials;
      options.signal ??= resource.signal;
    }
    const result = (await this._fetch(url, options)) as GateFetchResult | string;
    if (typeof result === 'string' || !result.buffer || !result.init || !result.headers) {
      return result;
    }
    const { buffer, init, headers } = result;
    const _headers = new Headers();
    (headers || []).forEach((a) => _headers.append(...a));
    const _init = {
      status: init.status,
      statusText: init.statusText || '',
      headers: _headers,
    };
    if (options._format === 'arraybuffer') {
      return { buffer, init, headers };
    }
    return new Response(buffer, _init);
  }
  async configBridge(config: GateConfig): Promise<void> {
    const keys = config.getKeys();
    this._config = config;
    const configData = (await this._postMessage({
      command: 'dumpConfig',
      params: { keys, url: '', prefix: PRODUCT },
    })) as Record<string, unknown>;
    for (const key of Object.keys(configData)) {
      config.props[key] = configData[key];
    }
    if (!(this.constructor as typeof CrossDomainGate).hostReg.test(location.host) && !config.props.allowOtherDomain) {
      return;
    }
    config.on('update', (key, value) => {
      if (key === 'autoCloseFullScreen') {
        return;
      }

      void this._postMessage({ command: 'saveConfig', params: { key, value, prefix: PRODUCT } }, false);
    });
  }
  async _postMessage(body: GatePostBody, usePromise = true, sessionId = ''): Promise<AnyPromiseHandler> {
    await this._initializeFrame();
    sessionId = sessionId || `gate:${Math.random()}`;
    const { params } = body;
    return (this._sessions[sessionId] = new PromiseHandler((resolve, reject) => {
      try {
        this.port!.postMessage(
          { body, sessionId, token: TOKEN },
          (params as { transfer?: Transferable[] }).transfer as Transferable[]
        );
        if (!usePromise) {
          delete this._sessions[sessionId];
          resolve();
        }
      } catch (error) {
        delete this._sessions[sessionId];
        reject(error);
      }
    }));
  }
  postMessage(body: GatePostBody, promise = true): Promise<AnyPromiseHandler> {
    return this._postMessage(body, promise);
  }
  /**
   * @param {MessageBody} body
   * @param {boolean} usePromise
   * @param {string?} sessionId
   */
  sendMessage(body: GateMessageBody, usePromise = false, sessionId = ''): Promise<AnyPromiseHandler> {
    return this._postMessage({ command: 'message', params: body }, usePromise, sessionId);
  }
  pushHistory(path: string, title: string): Promise<AnyPromiseHandler> {
    return this._postMessage({ command: 'pushHistory', params: { path, title } }, false);
  }
  async bridgeDb({
    name,
    ver,
    stores,
  }: {
    name: string;
    ver?: number;
    stores: { name: string }[];
  }): Promise<Record<string, unknown>> {
    const worker = await this._postMessage({
      command: 'bridge-db',
      params: { command: 'open', params: { name, ver, stores } },
    });
    const post = (
      command: string,
      data: unknown,
      storeName: string,
      transfer?: unknown
    ): Promise<AnyPromiseHandler> => {
      const params = { data, storeName, transfer, name };
      return this._postMessage({ command: 'bridge-db', params: { command, params, transfer } });
    };
    const result: Record<string, unknown> = { worker };
    for (const meta of stores) {
      const storeName = meta.name;
      result[storeName] = ((storeName: string) => {
        return {
          close: (params: unknown) => post('close', params, storeName),
          put: (record: unknown, transfer?: unknown) => post('put', record, storeName, transfer),
          get: ({ key, index, timeout }: { key?: unknown; index?: string; timeout?: number }) =>
            post('get', { key, index, timeout }, storeName),
          updateTime: ({ key, index, timeout }: { key?: unknown; index?: string; timeout?: number }) =>
            post('updateTime', { key, index, timeout }, storeName),
          delete: ({ key, index, timeout }: { key?: unknown; index?: string; timeout?: number }) =>
            post('delete', { key, index, timeout }, storeName),
          gc: (expireTime = 30 * 24 * 60 * 60 * 1000, index = 'updatedAt') =>
            post('gc', { expireTime, index }, storeName),
        };
      })(storeName);
    }
    return result;
  }
}

//===END===

export { CrossDomainGate };
