import { attachBrowser } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { createOfflineSite } from './offline-site';
import type { FixtureRequest } from './offline-site';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const offlineSites = new WeakMap<CdpSession, ReturnType<typeof createOfflineSite>>();
// popupへ後から手動attachしても、初期ナビゲーションからの同じ監査sessionを使う。
export const offlineTargetSessions = new Map<string, Promise<CdpSession>>();
export const offlineReports = new WeakMap<
  CdpSession,
  {
    requests: ObservedRequest[];
    errors: string[];
    completed: boolean;
    reportPath: string;
  }
>();
interface ObservedRequest {
  requestId: string;
  method: string;
  url: string;
  sources: string[];
  intercepted: boolean;
  matched: boolean;
  failure?: string;
}

export async function installOffline(session: CdpSession, targetId?: string): Promise<void> {
  if (process.env.FUTATSUME_TEST_OFFLINE !== '1') return;
  const site = createOfflineSite();
  offlineSites.set(session, site);
  const errors: string[] = [];
  const observed = new Map<string, ObservedRequest>();
  const pending = new Set<Promise<void>>();
  const children = new Set<CdpSession>();
  const ownedTargets = new Set<string>();
  let browserMonitor: CdpSession | undefined;
  const directory = process.env.FUTATSUME_TEST_OUTPUT ?? resolve(import.meta.dir, '../dev-assets/verification');
  const reportPath = resolve(directory, `offline-${Date.now()}-${crypto.randomUUID()}.json`);
  mkdirSync(directory, { recursive: true });
  const originalSend = session.send;
  const originalClose = session.close;
  let closing = false;
  const isExpiredInterception = (error: unknown): boolean =>
    error instanceof Error && /^Fetch\.(?:fulfillRequest|failRequest): Invalid InterceptionId\.$/.test(error.message);
  const reportError = (error: unknown): void => {
    errors.push(String(error));
  };
  const track = (job: Promise<unknown>): void => {
    const tracked = job.then(() => undefined, reportError).finally(() => pending.delete(tracked));
    pending.add(tracked);
  };
  const drain = async (): Promise<void> => {
    const deadline = Date.now() + 15000;
    while (pending.size) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.all([...pending]),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error('オフライン通信の後始末がタイムアウトしました')),
              Math.max(1, deadline - Date.now())
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
  };
  const observe = (id: string, request: FixtureRequest, source: string): ObservedRequest | null => {
    if (!/^https?:|^wss?:/.test(request.url)) return null;
    // Network.requestId と Fetch.networkId はページ/Workerをまたいで同じ要求を指す。
    // リダイレクト時の同じIDはURLで分ける。
    const key = `${id} ${request.method} ${request.url}`;
    let value = observed.get(key);
    if (!value) {
      value = {
        requestId: id,
        method: request.method,
        url: request.url,
        sources: [],
        intercepted: false,
        matched: false,
      };
      observed.set(key, value);
    }
    if (!value.sources.includes(source)) value.sources.push(source);
    return value;
  };
  async function enable(channel: CdpSession, name: string, targetType = 'page'): Promise<void> {
    channel.onEvent((method, params) => {
      if (method === 'Network.requestWillBeSent') {
        observe(String(params.requestId), params.request as FixtureRequest, `${name}:network`);
      }
      if (method === 'Network.webSocketCreated') {
        observe(String(params.requestId), { url: String(params.url), method: 'WEBSOCKET' }, `${name}:network`);
      }
      if (method === 'Network.loadingFailed') {
        for (const request of observed.values()) {
          if (request.requestId === String(params.requestId)) request.failure = String(params.errorText);
        }
      }
      if (method === 'Fetch.requestPaused') {
        const request = params.request as FixtureRequest;
        const observation = observe(
          typeof params.networkId === 'string' ? params.networkId : `${name}:${String(params.requestId)}`,
          request,
          `${name}:fetch`
        );
        if (observation) observation.intercepted = true;
        track(
          (async () => {
            try {
              const reply = await site.reply(request);
              if (observation) observation.matched = reply !== null;
              if (!reply) {
                errors.push(`未登録通信: ${request.method} ${request.url}`);
                await channel.send('Fetch.failRequest', {
                  requestId: params.requestId,
                  errorReason: 'BlockedByClient',
                });
                return;
              }
              const origin = Object.entries(request.headers ?? {}).find(([key]) => key.toLowerCase() === 'origin')?.[1];
              await channel.send('Fetch.fulfillRequest', {
                requestId: params.requestId,
                responseCode: reply.status,
                responseHeaders: [
                  { name: 'Content-Type', value: reply.mime },
                  { name: 'Access-Control-Allow-Origin', value: origin ?? 'https://www.nicovideo.jp' },
                  { name: 'Access-Control-Allow-Credentials', value: 'true' },
                  { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
                  {
                    name: 'Access-Control-Allow-Headers',
                    value:
                      'Content-Type, X-Frontend-Id, X-Frontend-Version, X-Request-With, X-Access-Right-Key, X-Client-Os-Type, X-Tag-Edit-Key, X-Niconico-Language',
                  },
                ],
                body: Buffer.from(reply.body).toString('base64'),
              });
            } catch (error) {
              // パーサー・ファイル読込・CDPの失敗でもpaused要求を放置しない。
              // 登録済みと確定した要求の配送だけが期限切れになった場合は、要求自体の監査は終わっているため失敗にしない。
              // 文書切替でinterceptionが無効になる競合は監査実行中にも起きるため、厳密なInvalid InterceptionIdだけを許容する。
              if (isExpiredInterception(error) && (closing || observation?.matched === true)) return;
              reportError(error);
              try {
                await channel.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'Failed' });
              } catch (cleanupError) {
                if (!(isExpiredInterception(cleanupError) && (closing || observation?.matched === true)))
                  reportError(cleanupError);
              }
            }
          })()
        );
      }
      if (method === 'Runtime.exceptionThrown') {
        const detail = params.exceptionDetails as { exception?: { description?: string }; text?: string };
        errors.push(detail.exception?.description ?? detail.text ?? '例外');
      }
      if (method === 'Target.attachedToTarget') {
        const child = childChannel(channel, String(params.sessionId));
        children.add(child);
        track(enable(child, String(params.sessionId), String((params.targetInfo as { type: string }).type)));
      }
    });
    if (channel !== session && targetType === 'page') {
      // An anchor popup has no renderer context until resumed. Waiting for
      // Runtime/Network.enable here deadlocks startup. Queue interception and
      // exception subscriptions before resume, then await all acknowledgements.
      await Promise.all([
        channel.send('Runtime.enable'),
        channel.send('Network.enable'),
        channel.send('Network.setCacheDisabled', { cacheDisabled: true }),
        channel.send('Network.setBypassServiceWorker', { bypass: true }),
        channel.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }),
        channel.send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: true,
          flatten: false,
          filter: [{ type: 'service_worker', exclude: true }, { type: 'page', exclude: true }, {}],
        }),
        channel.send('Runtime.runIfWaitingForDebugger'),
      ]);
      return;
    }
    try {
      await channel.send('Runtime.enable');
      await channel.send('Network.enable');
      await channel.send('Network.setCacheDisabled', { cacheDisabled: true });
      await channel.send('Network.setBypassServiceWorker', { bypass: true });
      // 専用WorkerのFetchは所有ページ側で捕捉する。捕捉されないNetwork要求も必ず失敗にする。
      if (targetType === 'page' || targetType === 'iframe' || targetType === 'service_worker')
        await channel.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      // WorkerにはTarget domainがない。親ページが子の作成を監視し、子では通信と例外だけを有効にする。
      if (channel === session || targetType === 'page')
        await channel.send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: true,
          flatten: false,
          filter: [{ type: 'service_worker', exclude: true }, { type: 'page', exclude: true }, {}],
        });
    } finally {
      if (channel !== session) await channel.send('Runtime.runIfWaitingForDebugger');
    }
  }
  let closePromise: Promise<void> | undefined;
  session.close = () =>
    (closePromise ??= (async () => {
      closing = true;
      try {
        // close開始後も、開始済みの要求・子ターゲット設定・失敗を最後まで取り込む。
        await drain();
        if (browserMonitor)
          await browserMonitor.send('Target.setAutoAttach', {
            autoAttach: false,
            waitForDebuggerOnStart: false,
            flatten: true,
          });
        await originalSend('Target.setAutoAttach', {
          autoAttach: false,
          waitForDebuggerOnStart: false,
          flatten: false,
        });
        await drain();
      } catch (error) {
        reportError(error);
      } finally {
        for (const id of ownedTargets) offlineTargetSessions.delete(id);
        for (const child of children) {
          try {
            await child.close();
          } catch (error) {
            reportError(error);
          }
        }
        try {
          await originalClose();
        } catch (error) {
          reportError(error);
        }
        if (browserMonitor) {
          try {
            await browserMonitor.close();
          } catch (error) {
            reportError(error);
          }
        }
        try {
          await drain();
        } catch (error) {
          reportError(error);
        }
      }
      for (const request of observed.values()) {
        if (!request.intercepted)
          errors.push(`未捕捉通信: ${request.method} ${request.url}${request.failure ? ` (${request.failure})` : ''}`);
      }
      const result = {
        requests: [...observed.values()],
        errors,
        writes: [...site.writes, ...site.library.writes],
        completed: errors.length === 0,
        reportPath,
      };
      offlineReports.set(session, result);
      try {
        writeFileSync(reportPath, JSON.stringify(result, null, 2));
      } catch (error) {
        reportError(error);
        result.completed = false;
      }
      if (errors.length) throw new Error(`オフライン検証失敗 ${errors.length}件: ${reportPath}\n${errors.join('\n')}`);
    })());
  // 検証側が独自のWorker監視を終えても、最後の通信監査が終わるまで外さない。
  session.send = (method, params) =>
    originalSend(
      method,
      method === 'Target.setAutoAttach'
        ? { ...params, autoAttach: true, waitForDebuggerOnStart: true, flatten: false }
        : params
    );
  try {
    await enable(session, 'page');
    if (targetId) {
      const info = (await session.send('Target.getTargetInfo')) as { targetInfo: { browserContextId?: string } };
      const contextId = info.targetInfo.browserContextId;
      if (!contextId) throw new Error('オフライン監査には専用BrowserContextが必要です');
      const monitor = (browserMonitor = await attachBrowser());
      monitor.onEvent((method, params, sourceSession) => {
        if (method !== 'Target.attachedToTarget' || sourceSession !== undefined) return;
        const child = params as {
          sessionId: string;
          targetInfo: { targetId: string; type: string; url: string; browserContextId?: string };
        };
        if (child.targetInfo.browserContextId !== contextId || child.targetInfo.url.startsWith('chrome-extension:')) {
          track(monitor.send('Target.detachFromTarget', { sessionId: child.sessionId }));
          return;
        }
        if (child.targetInfo.targetId === targetId) return;
        const channel: CdpSession = {
          send: (method, parameters) => monitor.send(method, parameters, child.sessionId),
          onEvent: (handler) =>
            monitor.onEvent((method, parameters, source) => {
              if (source === child.sessionId) handler(method, parameters);
            }),
          // 親監査が通信・例外の処理後にまとめてdetach/closeする。
          close: () => Promise.resolve(),
        };
        children.add(channel);
        offlineSites.set(channel, site);
        const ready = enable(channel, child.targetInfo.targetId, child.targetInfo.type).then(() => channel);
        ownedTargets.add(child.targetInfo.targetId);
        offlineTargetSessions.set(child.targetInfo.targetId, ready);
        track(ready);
      });
      await monitor.send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: true,
        filter: [{ type: 'page' }, { type: 'service_worker' }, { exclude: true }],
      });
    }
  } catch (error) {
    reportError(error);
    await session.close();
    throw error;
  }
}

function childChannel(parent: CdpSession, sessionId: string): CdpSession {
  let nextId = 10000;
  const replies = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  const handlers: Array<(method: string, params: Record<string, unknown>) => void> = [];
  const finishDetachedReplies = (): void => {
    for (const reply of replies.values()) {
      clearTimeout(reply.timer);
      reply.resolve(undefined);
    }
    replies.clear();
  };
  parent.onEvent((method, params) => {
    if (method === 'Target.detachedFromTarget' && params.sessionId === sessionId) {
      finishDetachedReplies();
      return;
    }
    if (method !== 'Target.receivedMessageFromTarget' || params.sessionId !== sessionId) return;
    const message = JSON.parse(String(params.message)) as {
      id?: number;
      result?: unknown;
      error?: { message: string };
      method?: string;
      params?: Record<string, unknown>;
    };
    if (message.id !== undefined) {
      const reply = replies.get(message.id);
      if (reply) {
        clearTimeout(reply.timer);
        replies.delete(message.id);
        if (message.error) reply.reject(new Error(message.error.message));
        else reply.resolve(message.result);
      }
    } else if (message.method) for (const handler of handlers) handler(message.method, message.params ?? {});
  });
  return {
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          replies.delete(id);
          reject(new Error(`Worker CDP timeout: ${method}`));
        }, 15000);
        replies.set(id, { resolve, reject, timer });
        void parent
          .send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) })
          .catch((error: unknown) => {
            clearTimeout(timer);
            replies.delete(id);
            const message = error instanceof Error ? error.message : String(error);
            // Workerなどの短命な子ターゲットは購読開始中にも終了し得る。
            // 対象自体が消えた場合だけ正常終了とし、ほかのCDP失敗は隠さない。
            if (/^Target\.sendMessageToTarget: No session with given id$/.test(message)) resolve(undefined);
            else reject(error instanceof Error ? error : new Error(message));
          });
      });
    },
    onEvent(handler) {
      handlers.push(handler);
    },
    close() {
      finishDetachedReplies();
      return Promise.resolve();
    },
  };
}
