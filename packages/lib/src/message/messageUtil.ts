interface CommandBody {
  command: string;
  status?: string;
  params?: unknown;
  [key: string]: unknown;
}

interface MessageBody {
  command: string;
  params?: unknown;
}

interface MessageEventData {
  id?: string;
  type?: string;
  body?: MessageBody & { params: CommandBody };
  sessionId?: string | null;
}

interface BroadcastEmitterShape {
  on: (name: string, callback: (...args: unknown[]) => unknown) => unknown;
  off: (name: string, callback?: (...args: unknown[]) => unknown) => unknown;
  emit: (name: string, ...args: unknown[]) => unknown;
  emitAsync: (...args: unknown[]) => unknown;
  promise: (name: string, callback?: PromiseHandlerCallback) => unknown;
  emitResolve: (name: string, ...args: unknown[]) => unknown;
  emitReject: (name: string, ...args: unknown[]) => unknown;
  resetPromise: (name: string) => void;
  windowId: string;
  sendExecCommand: (body: CommandBody) => unknown;
  sendMessage: (body: MessageBody, sessionId?: string | null) => unknown;
  sendMessagePromise: (body: MessageBody, timeout?: number) => Promise<unknown>;
  pong: (result: unknown) => unknown;
  hello: (message?: string) => Promise<unknown>;
  ping: (options?: { timeout?: number; force?: unknown }) => Promise<unknown>;
  sendOpen: (watchId: string, params: unknown) => void;
  notifyClose: () => unknown;
  notifyOpen: (playerId: unknown) => unknown;
}

interface WindowMessageEmitterShape {
  on: (name: string, callback: (...args: unknown[]) => unknown) => unknown;
  emit: (name: string, ...args: unknown[]) => unknown;
  addKnownSource: (win: Window) => number;
}

interface GlobalLike {
  config: { props: Record<string, unknown> };
  debug: { hello: unknown; ping: unknown };
  external: {
    sendOrExecCommand: (command: string, watchId: unknown) => unknown;
    execCommand: (command: string, watchId: unknown) => unknown;
  };
}

import { Emitter } from '../Emitter';
import type { PromiseHandlerCallback } from '../Emitter';
import { global, PRODUCT } from '../../../../src/ZenzaWatchIndex';
import { Config } from '../../../../src/Config';
import { NicoVideoApi } from '../nico/NicoVideoApi';

//===BEGIN===
const messageUtil: Record<string, unknown> = {};
// WindowMessageEmitter 親子ウィンドウ間
// BroadcastEmitter 複数ウィンドウ間. CrossDomainGate を経由してドメインの壁を超える
/**
 * @typedef MessageEvent
 * @type {Object}
 * @property {string} source
 * @property {string} origin
 * @property {MessageEventData|string} data
 */
/**
 * @typedef MessageEventData
 * @type {Object}
 * @property {string} id
 * @property {string} type
 * @property {MessageBody} body
 * @property {string?} sessionId
 */
/**
 * @typedef MessageBody
 * @type {Object}
 * @property {string} command
 * @property {CommandBody} params
 */
/**
 * @typedef CommandBody
 * @type {Object}
 * @property {string?} status
 * @property {string} command
 * @property {object|string|number|boolean} params
 */

const WindowMessageEmitter = (messageUtil.WindowMessageEmitter = ((safeOrigins: string[] = []) => {
  const emitter = new Emitter() as unknown as WindowMessageEmitterShape;
  const knownSource: unknown[] = [];

  /**
   * @param {MessageEvent} e
   */
  const onMessage = (e: MessageEvent) => {
    if (!knownSource.includes(e.source) && !safeOrigins.includes(e.origin)) {
      return;
    }
    try {
      const data = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as MessageEventData;
      const { id, type, body, sessionId } = data;
      if (id !== PRODUCT) {
        return;
      }
      const message = body!.params;
      if (type === 'blogParts') {
        // 互換のための対応
        const command = (global as unknown as GlobalLike).config.props.enableSingleton
          ? message.command === 'send'
            ? 'open'
            : 'send'
          : message.command;

        if (command === 'send') {
          (global as unknown as GlobalLike).external.sendOrExecCommand(
            'open',
            (message.params as { watchId?: unknown }).watchId
          );
        } else {
          (global as unknown as GlobalLike).external.execCommand(
            'open',
            (message.params as { watchId?: unknown }).watchId
          );
        }
        return;
      } else if (body!.command !== 'message' || !body!.params.command) {
        return;
      }
      emitter.emit('message', message, type, sessionId);
    } catch (err) {
      console.error('%cNicoCommentLayer.Error: window.onMessage  - ', 'color: red; background: yellow', err, e);
      console.error('%corigin: ', 'background: yellow;', e.origin);
      console.error('%cdata: ', 'background: yellow;', e.data);
      console.trace();
    }
  };

  emitter.addKnownSource = (win: Window) => knownSource.push(win);

  window.addEventListener('message', onMessage as (e: Event) => void);

  return emitter;
})(['http://ext.nicovideo.jp', 'https://ext.nicovideo.jp']));

const BroadcastEmitter = (messageUtil.BroadcastEmitter = (() => {
  const bcast = new Emitter() as unknown as BroadcastEmitterShape;
  bcast.windowId = `${PRODUCT}-${Math.random()}`;
  // const promises = bcast.promises = {};

  const channel: BroadcastChannel | null =
    self.BroadcastChannel && location.host === 'www.nicovideo.jp' ? new self.BroadcastChannel(PRODUCT) : null;

  /**
   * @param {StorageEvent} e
   */
  const onStorage = (e: StorageEvent) => {
    const command: string | null = e.key;
    if (e.type !== 'storage' || !command!.startsWith(`${PRODUCT}_`)) {
      return;
    }

    const name = command!.replace('ZenzaWatch_', '');
    const oldValue = e.oldValue;
    const newValue = e.newValue;
    if (oldValue === newValue) {
      return;
    }

    switch (name) {
      case 'message': {
        const { body } = JSON.parse(newValue as string) as { body: MessageBody };
        console.log('%cmessage', 'background: cyan;', body);
        bcast.emitAsync('message', body, 'broadcast');
        break;
      }
    }
  };

  /**
   * @param {MessageEvent} e
   */
  const onBroadcastMessage = (e: MessageEvent) => {
    console.log('%cbcast.onBroadcastMessage', 'background: cyan;', e.data);
    const data = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as {
      body: MessageBody & { params: CommandBody };
      sessionId?: string | null;
    };
    const { body, sessionId } = data;
    if (body.command !== 'message' || !body.params.command) {
      console.warn('unknown broadcast format', body);
      return;
    }
    return bcast.emitAsync('message', body.params, 'broadcast', sessionId);
  };

  /**
   * @params {CommandBody} body
   */
  bcast.sendExecCommand = (body: CommandBody) => bcast.sendMessagePromise({ command: 'sendExecCommand', params: body });

  /**
   * @params {MessageBody} body
   * @params {string|null} sessionId
   */
  bcast.sendMessage = (body: MessageBody, sessionId: string | null = null) => {
    const requestId = `request-${Math.random()}`;
    Object.assign(body, { requestId, windowId: bcast.windowId, now: Date.now() });
    const req = { id: PRODUCT, body: { command: 'message', params: body }, sessionId };
    if (channel) {
      channel.postMessage(req);
    } else if (location.host === 'www.nicovideo.jp') {
      Config.setValue('message', { body, sessionId });
    } else if (location.host !== 'www.nicovideo.jp' && NicoVideoApi && NicoVideoApi.sendMessage) {
      return NicoVideoApi.sendMessage(body, !!sessionId, sessionId);
    }
  };
  /**
   * @params {MessageBody} body
   * @params {number} timeout
   * @returns {Promise}
   */
  bcast.sendMessagePromise = (body: MessageBody, timeout = 60000): Promise<unknown> => {
    const sessionId = `sendMessage-${PRODUCT}-${Math.random()}`;
    let timer: ReturnType<typeof setTimeout> | null | void = null;
    return (
      bcast.promise(sessionId, async (resolve, reject) => {
        const result = bcast.sendMessage(body, sessionId);
        // window.console.log('bcast.sendMessagePromise', {body, result, sessionId});
        timer = setTimeout(() => {
          if (!timer) {
            return;
          }
          return reject(`timeout ${timeout}msec. command: ${body.command}`);
        }, timeout);
        if (result instanceof Promise) {
          return resolve(await result);
        }
      }) as Promise<unknown>
    )
      .catch((err: unknown) => bcast.emitReject(sessionId, err))
      .finally(() => {
        if (timer) {
          timer = clearTimeout(timer);
        }
        bcast.resetPromise(sessionId);
      });
  };

  /**
   * @params {Object} PingResult
   * @property {string} playerId
   */
  bcast.pong = (result: unknown) => bcast.sendMessage({ command: 'pong', params: result });

  bcast.hello = (message = 'こんにちはこんにちは！') =>
    bcast.sendMessagePromise({
      command: 'hello',
      params: {
        message,
        from: document.title,
        url: location.href,
        now: Date.now(),
        ssid: `hello-${Math.random()}`,
        windowId: bcast.windowId,
      },
    });

  bcast.ping = ({ timeout, force }: { timeout?: number; force?: unknown } = {}) => {
    timeout = timeout || 500;
    return new Promise((resolve, reject) => {
      void bcast.sendMessagePromise({ command: 'ping', params: { timeout, force, now: Date.now() } }).then(resolve);
      window.setTimeout(() => {
        // timeout 通知は文字列プロトコルのため Error 限定しない
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        reject(`timeout ${timeout}ms`);
      }, timeout);
    });
  };

  bcast.sendOpen = (watchId: string, params: unknown) => {
    bcast.sendMessage({
      command: 'openVideo',
      params: Object.assign({ watchId, eventType: 'click' }, params as Record<string, unknown>),
    });
  };

  bcast.notifyClose = () => bcast.sendMessage({ command: 'notifyClose' });
  bcast.notifyOpen = (playerId: unknown) => bcast.sendMessage({ command: 'notifyOpen', params: { playerId } });

  (global as unknown as GlobalLike).debug.hello = bcast.hello;
  (global as unknown as GlobalLike).debug.ping = ({ timeout, force }: { timeout?: number; force?: unknown } = {}) => {
    window.console.time('ping');
    return bcast
      .ping({ timeout, force })
      .then((result) => {
        window.console.timeEnd('ping');
        window.console.info('ping result: ok', result);
        return result;
      })
      .catch((result: unknown) => {
        window.console.timeEnd('ping');
        window.console.error('ping fail: ', result);
        return result;
      });
  };

  if (location.host === 'www.nicovideo.jp') {
    if (channel) {
      channel.addEventListener('message', onBroadcastMessage);
    } else {
      window.addEventListener('storage', onStorage as (e: Event) => void);
    }
  }

  return bcast;
})());

//===END===

export { messageUtil, BroadcastEmitter, WindowMessageEmitter };
export type { CommandBody, MessageBody };
