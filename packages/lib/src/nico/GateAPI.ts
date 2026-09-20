import { gate } from '../message/gate';
import { ThumbInfoCacheDb } from './ThumbInfoCacheDb';
import { parseThumbInfo } from './parseThumbInfo';
import { IndexedDbStorage } from '../infra/IndexedDbStorage';
import type { StoreMeta } from '../infra/IndexedDbStorage';

interface GateBridge {
  post: (body: unknown, options?: { sessionId?: string }) => void;
  parseUrl: (url: string) => URL;
  xFetch: (params: unknown, sessionId: string) => Promise<unknown>;
  uFetch: (params: unknown) => Promise<Response>;
  init: (options: { prefix: string; type: string }) => {
    port: MessagePort;
    TOKEN: string;
    type?: string;
    PID?: number;
  };
}

interface GateMessageParams {
  url?: string;
  options?: Record<string, unknown> & { credentials?: unknown; expireTime?: number };
  keys?: Array<string>;
  key?: string;
  value?: unknown;
  prefix?: string;
  path?: string;
  title?: string;
  src?: string;
  sec?: number;
  name?: string;
  ver?: number;
  stores?: StoreMeta[];
  command?: string;
  [key: string]: unknown;
}

interface GateMessageBody {
  command: string;
  params: GateMessageParams;
}

interface GateMessage {
  body: GateMessageBody;
  sessionId: string;
  token: string;
}

interface BridgeStoreApi {
  put: (data: unknown, transfer?: unknown) => Promise<unknown>;
  get: (params: unknown) => Promise<unknown>;
  updateTime: (params: unknown) => Promise<unknown>;
  delete: (params: unknown) => Promise<unknown>;
  close: () => Promise<unknown>;
  gc: (expireTime?: unknown, index?: unknown) => Promise<unknown>;
}

interface BridgeDbApi {
  [storeName: string]: BridgeStoreApi;
}

interface BridgeDbParams {
  command: string;
  params?: {
    name?: string;
    ver?: number;
    stores?: StoreMeta[];
    storeName?: string;
    transfer?: unknown;
    data?: { key?: string; index?: string; timeout?: number; expireTime?: number };
  };
}

const PRODUCT = 'FutatsumeWatch';
//===BEGIN===

const GateAPI = (() => {
  //@require gate
  const { post, parseUrl, xFetch, uFetch, init } = (gate as unknown as () => GateBridge)();
  //@require ThumbInfoCacheDb
  const thumbInfo = async () => {
    const { port, TOKEN } = init({ prefix: `thumbInfo${PRODUCT}Loader`, type: 'thumbInfo' });
    const db = await ThumbInfoCacheDb.open();

    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- 旧実装は非同期リスナーでPromiseを返却する運用のため維持する
    port.addEventListener('message', async (e) => {
      const rawData: unknown = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      const data = rawData as GateMessage;
      const { body, sessionId, token } = data;
      const { command, params } = body;
      if (command !== 'fetch') {
        return;
      }
      const p = parseUrl(params.url as string);
      if (TOKEN !== token || p.hostname !== location.host || !p.pathname.startsWith('/api/getthumbinfo/')) {
        console.log('invalid msg: ', { origin: e.origin, TOKEN, token, body });
        return;
      }
      params.options = params.options || {};

      const watchId = (params.url as string).split('/').reverse()[0]!;
      const expiresAt = Date.now() - (params.options.expireTime || 0);
      const cache = await db.get(watchId);
      if (cache && cache.thumbInfo.status === 'ok' && cache.updatedAt > expiresAt) {
        return post({ status: 'ok', command, params: cache.thumbInfo }, { sessionId });
      }

      delete params.options.credentials;
      // return xFetch(params, sessionId);
      return uFetch(params)
        .then((res) => res.text())
        .then((xmlText) => {
          let thumbInfo = parseThumbInfo(xmlText);
          if (thumbInfo.status === 'ok') {
            db.put(xmlText, thumbInfo);
          } else if (cache && cache.thumbInfo.status === 'ok') {
            thumbInfo = cache.thumbInfo;
          }
          const result = { status: 'ok', command, params: thumbInfo };
          post(result, { sessionId });
        })
        .catch(({ status, message }: { status?: unknown; message?: unknown }) => {
          if (cache && cache.thumbInfo.status === 'ok') {
            return post({ status: 'ok', command, params: cache.thumbInfo }, { sessionId });
          }
          return post({ status, message, command }, { sessionId });
        });
    });
  };

  const nicovideo = () => {
    const { port, type, TOKEN, PID } = init({ prefix: `nicovideoApi${PRODUCT}Loader`, type: 'nicovideoApi' });
    // if (!isWhiteHost(origin) &&
    //   localStorage.FutatsumeWatch_allowOtherDomain !== 'true') {
    //   console.log('disable bridge', origin);
    //   return;
    // }

    let isOk = false;

    const pushHistory = ({ path, title = '' }: { path: string; title?: string }) => {
      // ブラウザの既読リンクの色をつけるためにreplaceStateする
      // という目的だったのだが、iframeの中では効かないようだ。残念。
      window.history.replaceState(null, title, path);
      if (broadcastChannel) {
        broadcastChannel.postMessage({
          body: {
            command: 'message',
            params: { command: 'pushHistory', params: { path, title } },
          },
        });
      }
    };

    const PREFIX = PRODUCT;

    // const kvs = dimport('std:kv-storage')
    //   .then(({StorageArea}) => new StorageArea(PREFIX)).catch(() => null);
    const kvs: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => void } | null = null;

    const dumpConfig = (params: GateMessageParams, sessionId: string) => {
      const { keys, command } = params;
      if (!keys) {
        return;
      }
      const prefix = params.prefix || PREFIX;
      const config: Record<string, unknown> = {};
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- 旧実装はforEach内で非同期取得する運用のため維持する
      keys.forEach(async (key: string) => {
        if (kvs) {
          const value: unknown = await (kvs as unknown as { get: (key: string) => Promise<unknown> }).get(key);
          if (value !== undefined) {
            config[key] = value;
          }
          return;
        }
        const storageKey = `${prefix}_${key}`;
        if (Object.prototype.hasOwnProperty.call(localStorage, storageKey) || localStorage[storageKey] !== undefined) {
          try {
            config[key] = JSON.parse(String(localStorage.getItem(storageKey)));
          } catch (e) {
            window.console.error('config parse error key:"%s" value:"%s" ', key, localStorage.getItem(storageKey), e);
          }
        }
      });
      post({ status: 'ok', command, params: config }, { sessionId });
    };

    const saveConfig = (params: GateMessageParams) => {
      if (!params.key) {
        return;
      }
      if (kvs) {
        (kvs as unknown as { set: (key: string, value: unknown) => void }).set(params.key, params.value);
        return;
      }
      const prefix = params.prefix || PREFIX;
      const storageKey = `${prefix}_${params.key}`;
      const val = JSON.stringify(params.value);
      if (localStorage[storageKey] !== val) {
        // window.console.log('bridge save config: %s = %s', storageKey, params.value);
        localStorage.setItem(storageKey, val);
      }
    };

    const onStorage = (e: StorageEvent) => {
      let key = e.key || '';
      if (e.type !== 'storage' || key.indexOf(`${PREFIX}_`) !== 0) {
        return;
      }

      key = key.replace(`${PREFIX}_`, '');
      const { oldValue, newValue } = e;
      if (oldValue === newValue || !isOk) {
        return;
      }
      switch (key) {
        case 'message': {
          const { body } = JSON.parse(String(newValue)) as { body: GateMessageBody & { sessionId?: string } };
          return post({ status: 'ok', command: 'message', params: body }, { sessionId: body.sessionId || '' });
        }
        default:
          return post({ status: 'ok', command: 'configSync', params: { key, value: newValue } });
      }
    };

    const sendMessage = (body: GateMessageBody, sessionId: string) => {
      // window.console.info('onCommandPacket', message, isOk);
      if (!isOk || !broadcastChannel) {
        return;
      }
      broadcastChannel.postMessage({
        id: PRODUCT,
        status: 'ok',
        command: 'message',
        body,
        sessionId,
      });
    };

    const dbMap: Record<string, BridgeDbApi> = {};
    const bridgeDb = async (params: BridgeDbParams, sessionId: string) => {
      const { command } = params;
      if (command === 'open') {
        const { name, ver, stores } = params.params!;
        if (typeof name !== 'string' || !name) throw new Error('データベース名がありません');
        const opened: unknown = await IndexedDbStorage.open({ name, ver, stores });
        const db = dbMap[name] || (opened as BridgeDbApi);
        dbMap[name] = db;
        return post({ status: 'ok', command: 'bridge-db-result', params: { name, ver } }, { sessionId });
      }
      const { name, storeName, transfer, data } = params.params!;
      const { key, index, timeout, expireTime } = data!;
      const db = dbMap[name as string]![storeName as string]!;
      let result: unknown = 'ok';
      switch (command) {
        case 'close':
          await db.close();
          break;
        case 'put':
          await db.put(data, transfer);
          break;
        case 'get':
          result = await db.get({ key, index, timeout });
          break;
        case 'updateTime':
          result = await db.updateTime({ key, index, timeout });
          break;
        case 'delete':
          await db.delete({ key, index, timeout });
          break;
        case 'gc':
          await db.gc(expireTime, index);
          break;
      }
      return post({ status: 'ok', command: 'bridge-db-result', params: result }, { sessionId });
    };

    const onBroadcastMessage = (e: MessageEvent) => {
      if (!isOk) {
        return;
      }
      const rawData: unknown = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      const data = rawData as GateMessage;
      const { body, sessionId } = data;
      if (body.command !== 'message' || !body.params.command) {
        console.warn('unknown broadcast format', body);
        return;
      }
      // console.log('%cgate.onBroadcastMessage', 'background: cyan;', isOk, e.data);

      return post(body, { sessionId });
    };

    const broadcastChannel = window.BroadcastChannel ? new window.BroadcastChannel(PREFIX) : null;
    if (broadcastChannel) {
      broadcastChannel.addEventListener('message', onBroadcastMessage);
    } else {
      window.addEventListener('storage', onStorage);
    }

    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- 旧実装は非同期リスナーでPromiseを返却する運用のため維持する
    port.addEventListener('message', (e) => {
      const rawData: unknown = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      const data = rawData as GateMessage;
      const { body, sessionId, token } = data;
      const { command, params } = body;
      if (TOKEN !== token) {
        console.log('invalid msg: ', { origin: e.origin, TOKEN, token, body });
        return;
      }
      try {
        let result: unknown;
        switch (command) {
          case 'ok':
            window.console.info('%cCrossDomainGate initialize OK!', 'color: red;');
            isOk = true;
            break;
          case 'fetch':
            return xFetch(params, sessionId);
          case 'dumpConfig':
            return dumpConfig(params, sessionId);
          case 'saveConfig':
            return saveConfig(params);
          case 'pushHistory':
            return pushHistory(params as { path: string; title?: string });
          case 'bridge-db':
            return bridgeDb(params as unknown as BridgeDbParams, sessionId);
          case 'message':
            return sendMessage(body, sessionId);
          case 'ping':
            result = { now: Date.now(), NAME: window.name, PID, url: location.href };
            console.log('pong!: %smsec', Date.now() - (params.now as number), params);
            break;
        }
        post({ status: 'ok', command: 'commandResult', params: { command, result } }, { sessionId });
      } catch (e) {
        console.error('Exception', e);
        post({
          status: 'fail',
          command,
          params: { message: (e as { message?: unknown }).message || `${type} command fail` },
        });
      }
    });
  };

  const smile = () => {
    const { port, TOKEN } = init({
      prefix: `storyboard${PRODUCT}`,
      type: `storyboard${PRODUCT}_${location.host.split('.')[0]!.replace(/-/g, '_')}`,
    });

    const videoCapture = (src: string, sec: number) => {
      return new Promise<HTMLCanvasElement>((resolve, reject) => {
        const v = Object.assign(document.createElement('video'), {
          volume: 0,
          autoplay: false,
          controls: false,
        });

        v.addEventListener('loadedmetadata', () => (v.currentTime = sec));
        v.addEventListener('error', (err) => {
          v.remove();
          console.warn('capture fail', { src, sec, err, videoError: v.error });
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 旧実装はイベントオブジェクトでrejectする契約のため維持する
          reject(err);
        });

        const onSeeked = () => {
          const c = document.createElement('canvas');
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          const ctx = c.getContext('2d');
          ctx!.drawImage(v, 0, 0);
          v.remove();

          resolve(c);
        };

        v.addEventListener('seeked', onSeeked, { once: true });

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- DOMのnull可能性はtsc(strict)で検査するための非null表明であり、ランタイムは消去により同一
        document.body!.append(v);
        v.src = src;
        v.currentTime = sec;
      });
    };

    port.addEventListener('message', (e) => {
      const rawData: unknown = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      const data = rawData as GateMessage;
      const { body, sessionId, token } = data;
      const { command, params } = body;
      if (command !== 'videoCapture') {
        return;
      }
      if (TOKEN !== token) {
        window.console.log('invalid msg: ', { origin: e.origin, TOKEN, token, body });
        return;
      }

      void videoCapture(params.src as string, params.sec as number).then((canvas) => {
        const dataUrl = canvas.toDataURL('image/png');
        // console.info('video capture success', dataUrl.length);
        post({ status: 'ok', command, params: { dataUrl } }, { sessionId });
      });
    });
  };

  const search = () => {
    const { port, TOKEN } = init({ prefix: `searchApi${PRODUCT}Loader`, type: 'searchApi' });
    port.addEventListener('message', (e) => {
      const rawData: unknown = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      const data = rawData as GateMessage;
      const { body, sessionId, token } = data;
      const { command, params } = body;
      if (command !== 'fetch') {
        return;
      }
      const p = parseUrl(params.url as string);
      if (TOKEN !== token || p.hostname !== location.host) {
        console.log('invalid msg: ', { origin: e.origin, TOKEN, token, body });
        return;
      }
      params.options = params.options || {};
      delete params.options.credentials;

      void xFetch(params, sessionId);
    });
  };

  return { thumbInfo, nicovideo, smile, search };
})();

//===END===

export { GateAPI };
