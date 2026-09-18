interface PromiseRecord {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

interface WorkerHost {
  sessionId: number;
  promises: Record<string, PromiseRecord>;
}

interface WorkerCommandParams {
  name?: string;
  basename?: string;
  url?: string;
  options?: unknown;
  timeout?: number;
  transfer?: unknown;
  ping?: unknown;
  command?: string;
  result?: unknown;
  now?: number;
  NAME?: string;
  PID?: string;
  message?: unknown;
  eventName?: string;
  data?: unknown;
  type?: string;
  config?: unknown;
  TOKEN?: unknown;
  PRODUCT?: unknown;
  CONSTANT?: unknown;
}

interface WorkerMessageBody {
  command: string;
  params: WorkerCommandParams;
  result?: unknown;
}

interface WorkerMessage {
  body: WorkerMessageBody;
  sessionId: string;
  status?: string;
}

interface PostOptions {
  transfer?: unknown;
  timeout?: number;
  name?: string;
}

interface WorkerProxy {
  name: string;
  onmessage: unknown;
  onconnect: unknown;
  postMessage: (message: unknown, transfer?: unknown) => void;
  addEventListener: (type: string, listener: (e: Event) => void, options?: unknown) => void;
  start?: () => void;
  post: (body: unknown, options?: PostOptions) => Promise<unknown>;
  emit: (eventName: string, data?: unknown) => void;
  notify: (message: unknown) => void;
  alert: (message: unknown) => void;
  ping: (options?: PostOptions) => Promise<unknown>;
  addPort: (port: unknown, options?: PostOptions) => Promise<unknown>;
  bridge: (worker: WorkerProxy, options?: { name?: string }) => Promise<void>;
  BroadcastChannel: (basename?: string) => string;
  oncommand?: (message: { command: string; params: unknown }) => unknown;
  xFetch?: (url: string, options?: RequestInit) => Promise<Response>;
  [key: string]: unknown;
}

interface WorkerScope extends WorkerProxy {
  xFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

interface WorkerCreateOptions {
  name?: string;
  type?: string;
  inject?: string;
}

interface WorkerEnvParams {
  config?: { export: (isAll?: boolean) => unknown };
  TOKEN?: string | number | null;
  PRODUCT?: string;
  netUtil?: { fetch: (url: string, options?: unknown) => Promise<unknown> };
  CONSTANT?: unknown;
  global?: {
    emitter?: { emitAsync: (...args: unknown[]) => unknown };
    notify?: (message: unknown) => void;
    alert?: (message: unknown) => void;
    config?: { export: (isAll?: boolean) => unknown };
    TOKEN?: string | number | null;
    PRODUCT?: string;
    CONSTANT?: unknown;
  } | null;
}

interface FetchResultPayload {
  buffer: ArrayBuffer;
  init: { status: number; statusText?: string };
  headers: [string, string][];
}

import { netUtil } from './netUtil';
// import {globalEmitter} from '../../../../src/FutatsumeWatchIndex';
import { Config } from '../../../../src/Config';
import { TOKEN, PRODUCT } from '../../../../src/FutatsumeWatchIndex';
import { PopupMessage } from '../ui/PopupMessage';
import { EmitterInitFunc } from '../Emitter';
const PID = 'PID';
const bcast: Record<string, BroadcastChannel> = {};
const portMap: Record<string, MessagePort> = {};
//===BEGIN===

const workerUtil = (() => {
  let config: { export: (isAll?: boolean) => unknown } | undefined;
  let TOKEN: string | number | null | undefined;
  let PRODUCT: string | undefined = 'ZenzaWatch?';
  let netUtil: { fetch: (url: string, options?: unknown) => Promise<unknown> } | undefined;
  let CONSTANT: unknown;
  const NAME = '';
  let global: WorkerEnvParams['global'] = null;
  const external: unknown = null;
  const isAvailable = !!(window.Blob && window.Worker && window.URL);

  const messageWrapper = function (this: unknown, self: WorkerScope) {
    const _onmessage = (self.onmessage as ((...args: unknown[]) => unknown) | null) || (() => {});
    const promises: Record<string, PromiseRecord> = {};
    const onMessage = async function (self: WorkerProxy, type: string, e: Event) {
      const { body, sessionId, status } = (e as MessageEvent).data as WorkerMessage;
      const { command, params } = body;
      // console.log('onMessage', sessionId, {body, status});
      try {
        let result: unknown;
        switch (command) {
          case 'commandResult':
            if (promises[sessionId]) {
              if (status === 'ok') {
                promises[sessionId].resolve(params.result);
              } else {
                promises[sessionId].reject(new Error(params.result as string));
              }
              delete promises[sessionId];
            }
            return;
          case 'ping':
            result = { now: Date.now(), NAME, PID, url: location.href };
            // console.log('PONG "%s" %sms', params.NAME, Date.now() - params.now);
            break;
          case 'port':
            {
              const port = (e as MessageEvent).ports[0] as MessagePort;
              portMap[params.name as string] = port;
              port.addEventListener('message', (ev) => {
                void onMessage(port as unknown as WorkerProxy, params.name as string, ev);
              });
              bindFunc(port as unknown as WorkerProxy, 'MessageChannel');
              if (params.ping) {
                console.time('ping:' + sessionId);
                (port as unknown as WorkerProxy)
                  .ping()
                  .then((result) => {
                    console.timeEnd('ping:' + sessionId);
                    console.log('ok %smec', Date.now() - Number(params.now), params);
                  })
                  .catch((err: unknown) => {
                    console.timeEnd('ping:' + sessionId);
                    const detail: { err: unknown; data: unknown } = { err, data: (e as MessageEvent).data };
                    console.warn('ping fail', detail);
                  });
              }
            }
            return;
          case 'broadcast':
            {
              if (!BroadcastChannel) {
                return;
              }
              const channel = new BroadcastChannel(`${params.name}`);
              channel.addEventListener('message', (ev) => {
                void onMessage(channel as unknown as WorkerProxy, 'BroadcastChannel', ev);
              });
              bindFunc(channel as unknown as WorkerProxy, 'BroadcastChannel');
              bcast[params.basename as string] = channel;
            }
            return;
          case 'env':
            ({ config, TOKEN, PRODUCT, CONSTANT } = params as unknown as {
              config: typeof config;
              TOKEN: typeof TOKEN;
              PRODUCT: typeof PRODUCT;
              CONSTANT: typeof CONSTANT;
            });
            return;
          default:
            result = await _onmessage({ command, params }, type, PID);
            break;
        }
        self.postMessage({
          body: { command: 'commandResult', params: { command, result } },
          sessionId,
          TYPE: type,
          PID,
          status: 'ok',
        });
      } catch (err) {
        const detail: Record<string, unknown> = {
          err,
          command,
          params,
          sessionId,
          TYPE: type,
          PID,
          data: (e as MessageEvent).data,
        };
        console.error('failed', detail);
        self.postMessage({
          body: {
            command: 'commandResult',
            params: { command, result: (err as { message?: unknown }).message || null },
          },
          sessionId,
          TYPE: type,
          PID,
          status: (err as { status?: string }).status || 'fail',
        });
      }
    };
    self.onmessage = onMessage.bind({}, self, (self as { name?: string }).name as string);

    self.onconnect = (e: MessageEvent) => {
      const port = e.ports[0] as MessagePort;
      port.onmessage = self.onmessage as ((e: MessageEvent) => unknown) | null;
      port.start();
    };

    const bindFunc = (self: WorkerProxy, type = 'Worker'): WorkerProxy => {
      const post = function (this: { sessionId: number }, self: WorkerProxy, body: unknown, options: PostOptions = {}) {
        const sessionId = `recv:${NAME}:${type}:${this.sessionId++}`;
        return new Promise((resolve, reject) => {
          promises[sessionId] = { resolve, reject };
          self.postMessage({ body, sessionId, PID }, options.transfer);
          if (typeof options.timeout === 'number') {
            setTimeout(() => {
              // timeout 通知は {status, message} 形式のプロトコルのため Error 限定しない
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
              reject({ status: 'fail', message: 'timeout' });
              delete promises[sessionId];
            }, options.timeout);
          }
        }).finally(() => {
          delete promises[sessionId];
        });
      };
      const emit = function (self: WorkerProxy, eventName: string, data: unknown = null) {
        void self.post({ command: 'emit', params: { eventName, data } });
      };
      const notify = function (self: WorkerProxy, message: unknown) {
        void self.post({ command: 'notify', params: { message } });
      };
      const alert = function (self: WorkerProxy, message: unknown) {
        void self.post({ command: 'alert', params: { message } });
      };
      const ping = async function (self: WorkerProxy, options: PostOptions = {}) {
        const timekey = `PING "${self.name}"`;
        console.log(timekey);
        let result: unknown;
        options.timeout = options.timeout || 10000;
        try {
          console.time(timekey);
          result = await self.post(
            { command: 'ping', params: { now: Date.now(), NAME, PID, url: location.href } },
            options
          );
          console.timeEnd(timekey);
        } catch (e) {
          console.timeEnd(timekey);
          console.warn('ping fail', e);
        }
        return result;

        // return self.post({command: 'ping', params: {now: Date.now(), NAME, PID, url: location.href}}, options);
      };
      self.post = post.bind({ sessionId: 0 }, (this as { port?: WorkerScope }).port || self);
      self.emit = emit.bind({}, self);
      self.notify = notify.bind({}, self);
      self.alert = alert.bind({}, self);
      self.ping = ping.bind({}, self);
      return self;
    };
    bindFunc(self);

    /**
     * @param {string} url
     * @param {object} options
     * @returns {Promise}
     */
    self.xFetch = async (url: string, options: RequestInit = {}) => {
      options = { ...options, ...{ signal: null } }; // remove AbortController
      if (url.startsWith(location.origin)) {
        return fetch(url, options);
      }
      const result = (await self.post({ command: 'fetch', params: { url, options } })) as FetchResultPayload;
      const { buffer, init, headers } = result;
      const _headers = new Headers();
      (headers || []).forEach((a) => _headers.append(...a));
      const _init = {
        status: init.status,
        statusText: init.statusText || '',
        headers: _headers,
      };
      return new Response(buffer, _init);
    };
  };

  const workerUtil = {
    isAvailable,
    js: (q: TemplateStringsArray, ...args: unknown[]) => {
      const strargs = args.map((a) => (typeof a === 'string' ? a : (a as { toString: () => string }).toString));
      return String.raw(q, ...strargs);
    },
    env: (params: WorkerEnvParams): void => {
      ({ config, TOKEN, PRODUCT, netUtil, CONSTANT, global } = Object.assign(
        { config, TOKEN, PRODUCT, netUtil, CONSTANT, global },
        params
      ));

      if (global) {
        ({ config, TOKEN, PRODUCT, CONSTANT } = global);
      }
    },
    create: function (
      this: { urlMap: Map<unknown, string>; workerMap: Map<unknown, SharedWorker> },
      func: { toString: () => string } | string,
      options: WorkerCreateOptions = {}
    ) {
      let cache = this.urlMap.get(func);
      const name = options.name || 'Worker';
      if (!cache) {
        const src = `
        const PID = '${(window && window.name) || 'self'}:${location.href.replace(/'/g, "\\'")}:${name}:${Date.now().toString(16).toUpperCase()}';
        console.log('%cinit %s %s', 'font-weight: bold;', self.name || '', '${PRODUCT}', location.origin);
        (${func.toString()})(self);
        `;
        const blob = new Blob([src], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        this.urlMap.set(func, url);
        cache = url;
      }

      if (options.type === 'SharedWorker') {
        const w = this.workerMap.get(func) || new SharedWorker(cache);
        this.workerMap.set(func, w);
        return w;
      }
      return new Worker(cache, options as WorkerOptions);
    }.bind({ urlMap: new Map(), workerMap: new Map() }),

    /**
     * Promiseでやり取りできるworkerを生成する
     */
    createCrossMessageWorker: function (
      this: WorkerHost,
      func: { toString: () => string } | string,
      options: WorkerCreateOptions = {}
    ) {
      const promises = this.promises;
      const name = options.name || 'Worker';
      const PID = `${(window && window.name) || 'self'}:${location.host}:${name}:${Date.now().toString(16).toUpperCase()}`;

      const _func = `
      function (self) {
      let config = {}, PRODUCT, TOKEN, CONSTANT, NAME = decodeURI('${encodeURI(name)}'), bcast = {}, portMap = {};
      const {Handler, PromiseHandler, Emitter} = (${EmitterInitFunc.toString()})();
      ${options.inject ?? ''}
      (${func.toString()})(self);
      //===================================
      (${messageWrapper.toString()})(self);
      }
      `;
      const worker = workerUtil.create(_func, options);
      const self = (options.type === 'SharedWorker' ? (worker as SharedWorker).port : worker) as unknown as WorkerProxy;
      self.name = name;
      const onMessage = async function (self: WorkerProxy, e: unknown) {
        const { body, sessionId, status } = (e as MessageEvent).data as WorkerMessage;
        const { command, params } = body;
        try {
          let result: unknown = 'ok';
          let transfer: Transferable[] | null = null;
          switch (command) {
            case 'commandResult':
              if (promises[sessionId]) {
                if (status === 'ok') {
                  promises[sessionId].resolve(params.result);
                } else {
                  promises[sessionId].reject(new Error(params.result as string));
                }
                delete promises[sessionId];
              }
              return;
            case 'ping':
              result = { now: Date.now(), NAME, PID, url: location.href };
              if (console.timeLog) {
                console.timeLog(params.NAME, 'PONG');
              }
              // console.log('pong!: %sms', Date.now() - params.now, params);
              break;
            case 'emit':
              if (global) {
                global.emitter!.emitAsync(params.eventName, params.data);
              }
              break;
            case 'fetch':
              result = await (
                (netUtil || window).fetch as (url: string, options?: unknown) => Promise<{ buffer: ArrayBuffer }>
              )(params.url as string, Object.assign({}, params.options || {}, { _format: 'arraybuffer' }));
              transfer = [(result as { buffer: ArrayBuffer }).buffer];
              break;
            case 'notify':
              if (global) {
                global.notify!(params.message);
              }
              break;
            case 'alert':
              if (global) {
                global.alert!(params.message);
              }
              break;
            default:
              if (self.oncommand) {
                result = await self.oncommand({ command, params });
              }
              break;
          }
          self.postMessage(
            { body: { command: 'commandResult', params: { command, result } }, sessionId, status: 'ok' },
            transfer
          );
        } catch (err) {
          console.error('failed', { err, command, params, sessionId });
          self.postMessage({
            body: {
              command: 'commandResult',
              params: { command, result: (err as { message?: unknown }).message || null },
            },
            sessionId,
            status: (err as { status?: string }).status || 'fail',
          });
        }
      };

      const bindFunc = (self: WorkerProxy, type: unknown = 'Worker'): void => {
        const post = function (
          this: { sessionId: number },
          self: WorkerProxy,
          body: unknown,
          options: PostOptions = {}
        ) {
          const sessionId = `send:${name}:${type as string}:${this.sessionId++}`;
          return new Promise((resolve, reject) => {
            promises[sessionId] = { resolve, reject };
            self.postMessage({ body, sessionId, TYPE: type, PID }, options.transfer);
            if (typeof options.timeout === 'number') {
              setTimeout(() => {
                // timeout 通知は {status, message} 形式のプロトコルのため Error 限定しない
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                reject({ status: 'fail', message: 'timeout' });
                delete promises[sessionId];
              }, options.timeout);
            }
          }).finally(() => {
            delete promises[sessionId];
          });
        };
        const ping = async function (self: WorkerProxy, options: PostOptions = {}) {
          const timekey = `PING "${self.name}" total time`;
          window.console.log(`PING "${self.name}"...`);
          let result: unknown;
          options.timeout = options.timeout || 10000;
          try {
            window.console.time(timekey);
            result = await self.post(
              { command: 'ping', params: { now: Date.now(), NAME: self.name, PID, url: location.href } },
              options
            );
            window.console.timeEnd(timekey);
          } catch (e) {
            console.timeEnd(timekey);
            console.warn('ping fail', e);
          }
          return result;
        };
        self.post = post.bind({ sessionId: 0 }, self);
        self.ping = ping.bind({}, self);
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        self.addEventListener('message', onMessage.bind({ sessionId: 0 }, self));
        self.start?.();
      };
      bindFunc(self);

      if (config) {
        void self.post({
          command: 'env',
          params: { config: config.export(true), TOKEN, PRODUCT, CONSTANT },
        });
      }

      self.addPort = (port: unknown, options: PostOptions = {}) => {
        const name = options.name || 'MessageChannel';
        return self.post({ command: 'port', params: { port, name } }, { transfer: [port] });
      };
      const channel = new MessageChannel();
      void self.addPort(channel.port2);
      bindFunc(channel.port1 as unknown as WorkerProxy, { name: 'MessageChannel' });

      /**
       * Worker同士を繋げる
       * TODO: CrossDomainGate も対象にする
       */
      self.bridge = async (worker: WorkerProxy, options: { name?: string } = {}) => {
        const name = options.name || 'MessageChannelBridge';
        const channel = new MessageChannel();
        await self.addPort(channel.port1, { name: worker.name || name });
        await worker.addPort(channel.port2, { name: self.name || name });
        console.log('ping self -> other', await (channel.port1 as unknown as WorkerProxy).ping());
        console.log('ping other -> self', await (channel.port2 as unknown as WorkerProxy).ping());
      };

      self.BroadcastChannel = (basename?: string) => {
        const name = `${basename || 'Broadcast'}${TOKEN || Date.now().toString(16)}`;
        void self.post({ command: 'broadcast', params: { basename, name } });
        const channel = new BroadcastChannel(name);
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        channel.addEventListener('message', onMessage.bind({}, channel as unknown as WorkerProxy, 'BroadcastChannel'));
        bindFunc(channel as unknown as WorkerProxy, 'BroadcastChannel');

        return name;
      };

      self.ping().catch((result) => console.warn('FAIL', result));

      return self;
    }.bind({
      sessionId: 0,
      promises: {},
    }),
  };
  return workerUtil;
})();
//===END===

export { workerUtil };
