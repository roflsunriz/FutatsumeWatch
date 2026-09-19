// dev系スクリプト共通の raw CDP ヘルパー。

export const DEV_PORT = 9333;

export interface CdpTarget {
  type: string;
  url: string;
  title: string;
  id: string;
  webSocketDebuggerUrl: string;
}

export async function listTargets(): Promise<CdpTarget[]> {
  const res = await fetch(`http://127.0.0.1:${DEV_PORT}/json/list`);
  return (await res.json()) as CdpTarget[];
}

export interface CdpSession {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  close: () => void;
  onEvent: (handler: (method: string, params: Record<string, unknown>) => void) => void;
}

export async function attach(target: CdpTarget): Promise<CdpSession> {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket 接続に失敗しました')), { once: true });
  });
  return fromSocket(ws);
}

function fromSocket(ws: WebSocket): CdpSession {
  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  const handlers = new Set<(method: string, params: Record<string, unknown>) => void>();
  const send = (method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
    id += 1;
    const cur = id;
    return new Promise((resolve) => {
      pending.set(cur, resolve);
      ws.send(JSON.stringify({ id: cur, method, params }));
    });
  };
  ws.addEventListener('message', (ev: MessageEvent) => {
    const msg = JSON.parse(String(ev.data)) as {
      id?: number;
      result?: unknown;
      method?: string;
      params?: Record<string, unknown>;
    };
    if (msg.id !== undefined) {
      pending.get(msg.id)?.(msg.result);
      pending.delete(msg.id);
      return;
    }
    if (msg.method !== undefined) {
      for (const h of handlers) {
        h(msg.method, msg.params ?? {});
      }
    }
  });
  return {
    send,
    close: () => ws.close(),
    onEvent: (handler) => {
      handlers.add(handler);
    },
  };
}

export async function attachBrowser(): Promise<CdpSession> {
  const res = await fetch(`http://127.0.0.1:${DEV_PORT}/json/version`);
  const data = (await res.json()) as { webSocketDebuggerUrl?: string };
  if (typeof data.webSocketDebuggerUrl !== 'string') {
    throw new Error('ブラウザターゲットを取得できませんでした');
  }
  const ws = new WebSocket(data.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket 接続に失敗しました')), { once: true });
  });
  return fromSocket(ws);
}

export async function evaluate(session: CdpSession, expression: string): Promise<unknown> {
  const res = (await session.send('Runtime.evaluate', { expression, returnByValue: true })) as {
    result?: { value?: unknown };
  };
  return res.result?.value;
}

export async function evaluateAsync(session: CdpSession, expression: string): Promise<unknown> {
  const res = (await session.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
    result?: { value?: unknown };
  };
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
