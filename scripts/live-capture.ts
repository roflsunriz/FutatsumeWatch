import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CdpSession } from './dev-cdp';
import { LiveReadGate, safeUrl, scrub, scrubText, isProductSession } from './live-capture-policy';
import type { NetworkInitiator } from './live-capture-policy';
import type { LiveWritePermitGuard } from './live-write-permit';

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
  let closing = false;
  let targetWatchId = 'sm9';
  const capturePart = crypto.randomUUID().slice(0, 8);
  let writeGuard: LiveWritePermitGuard | undefined;
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
          if (
            closing &&
            /Fetch\.(?:failRequest|continueRequest).*(?:No session with given id|Session with given id not found|Invalid InterceptionId)/.test(
              String(error)
            )
          )
            return;
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
    if (method === 'Page.javascriptDialogOpening' || method === 'Page.javascriptDialogClosed')
      record('dialog', { event: method, targetId: sessions.get(sid)?.targetId, ...params });
    const key = `${sid}:${String(params.requestId)}`;
    if (method === 'Fetch.requestPaused') {
      const request = params.request as Request;
      const networkId = typeof params.networkId === 'string' ? params.networkId : key;
      const range = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'range')?.[1] ?? '';
      const header = (key: string) =>
        Object.entries(request.headers).find(([name]) => name.toLowerCase() === key)?.[1] ?? '';
      const variant =
        request.method === 'OPTIONS'
          ? [
              header('access-control-request-method'),
              header('access-control-request-headers')
                .toLowerCase()
                .split(',')
                .map((s) => s.trim())
                .sort()
                .join(','),
            ].join(':')
          : range;
      const already = grants.get(networkId) === request.url;
      let reason = already
        ? null
        : gate.decide(request.method, request.url, request.postData, variant, owners.get(networkId) === true);
      if (reason === 'write-not-authorized' && writeGuard) {
        const decision = writeGuard.decide({
          method: request.method,
          url: request.url,
          postData: request.postData,
          contentType: header('content-type'),
        });
        record('write-decision', decision);
        if (decision.action === 'allow-write') reason = null;
        else if (decision.action === 'deny') reason = 'write-' + decision.reason;
      }
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
      if (response.status >= 400 && gate.stopForFailure(response.url, `HTTP ${response.status}`))
        record('capture-sealed', { cause: 'critical-http-failure', url: response.url, status: response.status });
    }
    if (method === 'Network.loadingFailed') {
      const failure = String(params.errorText);
      const entry = requests.get(key);
      if (entry) entry.failure = failure;
      record('failure', { captureId: key, ...params });
      if (grants.has(String(params.requestId)) && entry && gate.stopForFailure(entry.request.url, failure))
        record('capture-sealed', { cause: 'critical-network-failure', url: entry.request.url, error: failure });
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
            const name = `body-${capturePart}-${index}.${text ? 'txt' : 'bin'}`;
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
    restoreReadHistory(history: Request[]) {
      for (const request of history) {
        const header = (key: string) =>
          Object.entries(request.headers ?? {}).find(([name]) => name.toLowerCase() === key)?.[1] ?? '';
        const variant =
          request.method === 'OPTIONS'
            ? [
                header('access-control-request-method'),
                header('access-control-request-headers')
                  .toLowerCase()
                  .split(',')
                  .map((s) => s.trim())
                  .sort()
                  .join(','),
              ].join(':')
            : header('range');
        const reason = gate.decide(request.method, request.url, request.postData, variant, true);
        if (reason === 'write-not-authorized') throw Error('書込み済みsessionはこの復帰経路で再開できません');
      }
      record('read-history-restored', { observations: history.length });
    },
    configureWrites(guard: LiveWritePermitGuard) {
      if (writeGuard) throw Error('書込みguardは置換できません');
      writeGuard = guard;
      record('write-guard-configured', {});
    },
    setWatchId(watchId: string) {
      gate.setWatchId(watchId);
      targetWatchId = watchId;
      record('target-watch', { watchId });
    },
    allowReadRefresh(url: string) {
      gate.allowReadRefresh(url);
      record('verification-read', { url });
    },
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
    async close() {
      closing = true;
      gate.closed = true;
      const failures: string[] = [];
      try {
        await browser.send('Target.setAutoAttach', {
          autoAttach: false,
          waitForDebuggerOnStart: false,
          flatten: true,
        });
      } catch (error) {
        failures.push(String(error));
      }
      await this.flush();
      if (failures.length) throw new AggregateError(failures, '単発採取の監視終了に失敗しました');
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
        writes: writeGuard?.status() ?? [],
        requests: [...requests].map(([key, value]) => ({ key, ...(scrub(value) as object) })),
        retryPolicy: 'each method+canonical URL+body+range at most once',
        transport: 'native Chrome network; captured before requests; dedicated context',
        targetUrl: safeUrl(`https://www.nicovideo.jp/watch/${targetWatchId}`),
      };
    },
  };
}
