// dev系スクリプト共通の raw CDP ヘルパー。

export const DEV_PORT = Number(process.env.FUTATSUME_DEV_PORT ?? 9333);

export interface CdpTarget {
  type: string;
  url: string;
  title: string;
  id: string;
  webSocketDebuggerUrl: string;
}

export async function listTargets(): Promise<CdpTarget[]> {
  const res = await fetch(`http://127.0.0.1:${DEV_PORT}/json/list`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`ターゲット一覧の取得失敗: HTTP ${res.status}`);
  return (await res.json()) as CdpTarget[];
}

export interface CdpSession {
  send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<unknown>;
  close: () => Promise<void>;
  onEvent: (handler: (method: string, params: Record<string, unknown>, sessionId?: string) => void) => void;
}

export async function attach(target: CdpTarget): Promise<CdpSession> {
  const offline = process.env.FUTATSUME_TEST_OFFLINE === '1' ? await import('./dev-offline') : undefined;
  const observed = offline?.offlineTargetSessions.get(target.id);
  if (observed) return observed;
  const ws = await connectSocket(target.webSocketDebuggerUrl);
  const session = fromSocket(ws);
  if (offline) await offline.installOffline(session, target.id);
  return session;
}

async function connectSocket(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('CDP WebSocket接続がタイムアウトしました'));
    }, 15000);
    ws.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
    ws.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        ws.close();
        reject(new Error('CDP WebSocket接続に失敗しました'));
      },
      { once: true }
    );
  });
  return ws;
}

function fromSocket(ws: WebSocket): CdpSession {
  let id = 0;
  let closePromise: Promise<void> | undefined;
  const pending = new Map<
    number,
    {
      method: string;
      resolve: (v: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const handlers = new Set<(method: string, params: Record<string, unknown>, sessionId?: string) => void>();
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<unknown> => {
    if (ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error(`CDP接続は終了しています: ${method}`));
    id += 1;
    const cur = id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(cur);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      pending.set(cur, { method, resolve, reject, timer });
      ws.send(JSON.stringify({ id: cur, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  };
  ws.addEventListener('message', (ev: MessageEvent) => {
    const msg = JSON.parse(String(ev.data)) as {
      id?: number;
      result?: unknown;
      method?: string;
      params?: Record<string, unknown>;
      error?: { message: string };
      sessionId?: string;
    };
    if (msg.id !== undefined) {
      const request = pending.get(msg.id);
      if (request) {
        clearTimeout(request.timer);
        if (msg.error) request.reject(new Error(`${request.method}: ${msg.error.message}`));
        else request.resolve(msg.result);
      }
      pending.delete(msg.id);
      return;
    }
    if (msg.method !== undefined) {
      for (const h of handlers) {
        h(msg.method, msg.params ?? {}, msg.sessionId);
      }
    }
  });
  ws.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(`CDP connection closed: ${request.method}`));
    }
    pending.clear();
  });
  return {
    send,
    close: () =>
      (closePromise ??= new Promise<void>((resolve, reject) => {
        if (ws.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }
        const timer = setTimeout(() => reject(new Error('CDP WebSocket close timeout')), 5000);
        ws.addEventListener(
          'close',
          () => {
            clearTimeout(timer);
            handlers.clear();
            resolve();
          },
          { once: true }
        );
        ws.close();
      })),
    onEvent: (handler) => {
      handlers.add(handler);
    },
  };
}

export async function cleanupCdp(...steps: Array<() => Promise<unknown> | undefined>): Promise<void> {
  const failures: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'ブラウザ検証の後始末に失敗しました');
}

export async function attachBrowser(options: { offlineLoopbackOrigin?: string } = {}): Promise<CdpSession> {
  let proxyBypassList = '<-loopback>';
  if (options.offlineLoopbackOrigin) {
    const origin = new URL(options.offlineLoopbackOrigin);
    if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.pathname !== '/')
      throw new Error('通信遮断検証の例外は専用127.0.0.1ポートに限定します');
    proxyBypassList += `;${origin.host}`;
  }
  const res = await fetch(`http://127.0.0.1:${DEV_PORT}/json/version`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`ブラウザ情報の取得失敗: HTTP ${res.status}`);
  const data = (await res.json()) as { webSocketDebuggerUrl?: string };
  if (typeof data.webSocketDebuggerUrl !== 'string') {
    throw new Error('ブラウザターゲットを取得できませんでした');
  }
  const ws = await connectSocket(data.webSocketDebuggerUrl);
  const session = fromSocket(ws);
  if (process.env.FUTATSUME_TEST_OFFLINE === '1') {
    const send = session.send;
    session.send = async (method, params = {}, sessionId) => {
      if (sessionId) return send(method, params, sessionId);
      if (method === 'Target.createBrowserContext')
        return send(method, { ...params, proxyServer: 'http://127.0.0.1:9', proxyBypassList });
      if (method === 'Target.createTarget' && !params.browserContextId) {
        const context = (await send('Target.createBrowserContext', {
          proxyServer: 'http://127.0.0.1:9',
          proxyBypassList,
        })) as { browserContextId: string };
        return send(method, { ...params, browserContextId: context.browserContextId });
      }
      return send(method, params);
    };
  }
  return session;
}

export async function evaluate(session: CdpSession, expression: string): Promise<unknown> {
  const res = (await session.send('Runtime.evaluate', { expression, returnByValue: true })) as {
    result?: { value?: unknown };
    exceptionDetails?: { text: string; exception?: { description?: string } };
  };
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  return res.result?.value;
}

export async function evaluateAsync(session: CdpSession, expression: string): Promise<unknown> {
  const res = (await session.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
    result?: { value?: unknown };
    exceptionDetails?: { text: string; exception?: { description?: string } };
  };
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  return res.result?.value;
}

export async function waitFor(
  predicate: () => Promise<CdpTarget | null>,
  timeoutMs: number,
  label: string
): Promise<CdpTarget> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = await predicate();
    if (hit !== null) {
      return hit;
    }
    await Bun.sleep(500);
  }
  throw new Error(`待機がタイムアウトしました: ${label}`);
}
