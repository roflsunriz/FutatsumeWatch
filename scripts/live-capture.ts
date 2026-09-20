import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CdpSession } from './dev-cdp';
import { LiveReadGate, safeUrl, scrub, scrubText, isProductSession } from './live-capture-policy';
import type { NetworkInitiator } from './live-capture-policy';

interface Request {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
}
interface Response {
  url: string;
  status: number;
  headers: Record<string, string>;
  mimeType: string;
}
export async function monitorLiveRead(browser: CdpSession, contextId: string, directory: string, localOrigin?: string) {
  mkdirSync(directory, { recursive: true });
  const gate = new LiveReadGate(localOrigin);
  const sessions = new Map<string, { targetId: string; type: string }>();
  const ready = new Map<string, Promise<void>>();
  const jobs = new Set<Promise<void>>();
  const errors: string[] = [];
  const requests = new Map<string, { request: Request; response?: Response; body?: string; failure?: string }>();
  const grants = new Map<string, string>();
  const owners = new Map<string, boolean>();
  let sequence = 0,
    allowed = 0,
    blocked = 0,
    bodyBytes = 0;
  const record = (kind: string, data: unknown): void =>
    appendFileSync(
      resolve(directory, 'network.jsonl'),
      JSON.stringify({ at: new Date().toISOString(), kind, data: scrub(data) }) + '\n'
    );
  const track = (promise: Promise<unknown>): void => {
    const job = promise
      .then(
        () => undefined,
        (error) => {
          errors.push(String(error));
          gate.closed = true;
          record('capture-error', String(error));
        }
      )
      .finally(() => jobs.delete(job));
    jobs.add(job);
  };
  const restriction = `(()=>{navigator.sendBeacon=()=>false;if(navigator.serviceWorker)navigator.serviceWorker.register=()=>Promise.reject(new Error('single-operation capture: Service Worker registration blocked'));window.WebSocket=class {constructor(){throw new Error('single-operation capture: WebSocket blocked')}};})();`;
  const initialize = async (sid: string, type: string): Promise<void> => {
    const sends = [
      browser.send('Runtime.enable', {}, sid),
      browser.send('Network.enable', { maxTotalBufferSize: 80000000, maxResourceBufferSize: 8000000 }, sid),
    ];
    if (type === 'page' || type === 'iframe') {
      sends.push(browser.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sid));
      sends.push(browser.send('Network.setBypassServiceWorker', { bypass: true }, sid));
      sends.push(browser.send('Page.enable', {}, sid));
      sends.push(browser.send('Page.addScriptToEvaluateOnNewDocument', { source: restriction }, sid));
      sends.push(
        browser.send(
          'Target.setAutoAttach',
          {
            autoAttach: true,
            waitForDebuggerOnStart: true,
            flatten: true,
            filter: [{ type: 'worker' }, { type: 'iframe' }, { exclude: true }],
          },
          sid
        )
      );
    }
    sends.push(browser.send('Runtime.runIfWaitingForDebugger', {}, sid));
    await Promise.all(sends);
  };
  browser.onEvent((method, params, sid) => {
    if (method === 'Target.attachedToTarget') {
      const child = params as {
        sessionId: string;
        targetInfo: { targetId: string; type: string; browserContextId?: string };
      };
      if (child.targetInfo.browserContextId !== contextId && !(sid && sessions.has(sid))) {
        track(browser.send('Target.detachFromTarget', { sessionId: child.sessionId }));
        return;
      }
      sessions.set(child.sessionId, { targetId: child.targetInfo.targetId, type: child.targetInfo.type });
      const setup = initialize(child.sessionId, child.targetInfo.type);
      ready.set(child.targetInfo.targetId, setup);
      track(setup);
      return;
    }
    if (!sid || !sessions.has(sid)) return;
    const key = `${sid}:${String(params.requestId)}`;
    if (method === 'Fetch.requestPaused') {
      const request = params.request as Request;
      const networkId = typeof params.networkId === 'string' ? params.networkId : key;
      const range = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'range')?.[1] ?? '';
      const already = grants.get(networkId) === request.url;
      const reason = already
        ? null
        : gate.decide(request.method, request.url, request.postData, range, owners.get(networkId) === true);
      if (reason) {
        blocked++;
        record('blocked', { reason, networkId, request });
        track(browser.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'BlockedByClient' }, sid));
      } else {
        if (!already) {
          allowed++;
          grants.set(networkId, request.url);
          record('allowed', { networkId, request });
        }
        track(browser.send('Fetch.continueRequest', { requestId: params.requestId }, sid));
      }
    }
    if (method === 'Network.requestWillBeSent') {
      const request = params.request as Request;
      owners.set(String(params.requestId), isProductSession(params.initiator as NetworkInitiator, owners));
      requests.set(key, { request });
      record('request', { captureId: key, request, initiator: params.initiator, redirect: params.redirectResponse });
    }
    if (method === 'Network.responseReceived') {
      const response = params.response as Response;
      const entry = requests.get(key);
      if (entry) entry.response = response;
      record('response', { captureId: key, response });
      if (response.status >= 400 && /\/watch\/sm9|\/access-rights\/hls|\/v1\/threads|\.m3u8(?:\?|$)/.test(response.url))
        gate.closed = true;
    }
    if (method === 'Network.loadingFailed') {
      const failure = String(params.errorText);
      const entry = requests.get(key);
      if (entry) entry.failure = failure;
      record('failure', { captureId: key, ...params });
      if (grants.has(String(params.requestId)) && !failure.includes('ERR_BLOCKED_BY_CLIENT')) gate.closed = true;
      // A refused request is never permitted again; do not perform recovery here.
    }
    if (method === 'Network.loadingFinished') {
      const entry = requests.get(key);
      if (!entry?.response) return;
      const index = ++sequence;
      track(
        (async () => {
          if (Number(params.encodedDataLength) > 8000000 || bodyBytes > 80000000) {
            record('body-omitted', { captureId: key, reason: 'capture-size-limit' });
            return;
          }
          try {
            const result = (await browser.send('Network.getResponseBody', { requestId: params.requestId }, sid)) as {
              body: string;
              base64Encoded: boolean;
            };
            const bytes = result.base64Encoded ? Buffer.from(result.body, 'base64') : Buffer.from(result.body);
            if (bytes.length > 8000000 || bodyBytes + bytes.length > 80000000) {
              record('body-omitted', { captureId: key, reason: 'decoded-size-limit', bytes: bytes.length });
              return;
            }
            bodyBytes += bytes.length;
            const text =
              /json|text|javascript|xml|mpegurl/i.test(entry.response!.mimeType) ||
              /\.(?:m3u8|js|css)(?:\?|$)/.test(entry.request.url);
            const name = `body-${index}.${text ? 'txt' : 'bin'}`;
            writeFileSync(resolve(directory, name), text ? scrubText(bytes.toString('utf8')) : bytes);
            entry.body = name;
            record('body', { captureId: key, file: name, bytes: bytes.length, sanitized: text });
          } catch (error) {
            record('body-unavailable', { captureId: key, reason: String(error) });
          }
        })()
      );
    }
    if (method === 'Runtime.exceptionThrown' || method === 'Log.entryAdded') record('runtime', { sid, method, params });
  });
  await browser.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
    filter: [{ type: 'page' }, { exclude: true }],
  });
  return {
    async page(targetId: string): Promise<CdpSession> {
      const deadline = Date.now() + 10000;
      while (!ready.has(targetId) && Date.now() < deadline) await Bun.sleep(20);
      const setup = ready.get(targetId);
      if (!setup) throw Error('採取対象の監視が準備できません');
      await setup;
      const sid = [...sessions].find(([, value]) => value.targetId === targetId)?.[0];
      if (!sid) throw Error('採取対象sessionなし');
      return {
        send: (method, params) => browser.send(method, params, sid),
        onEvent: (handler) =>
          browser.onEvent((method, params, source) => {
            if (source === sid) handler(method, params);
          }),
        close: () => Promise.resolve(),
      };
    },
    seal() {
      gate.closed = true;
    },
    async flush() {
      while (jobs.size) await Promise.all([...jobs]);
    },
    summary() {
      return {
        allowed,
        blocked,
        errors,
        bodyBytes,
        requests: [...requests].map(([key, value]) => ({ key, ...(scrub(value) as object) })),
        retryPolicy: 'each method+canonical URL+body+range at most once',
        transport: 'native Chrome network; captured before requests; dedicated context',
        targetUrl: safeUrl('https://www.nicovideo.jp/watch/sm9'),
      };
    },
  };
}
