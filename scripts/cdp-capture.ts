// raw CDP による実ページフィクスチャ採取。
// 使い方: chrome-debug.ps1 で Chrome を起動後に次を実行する。
//   bun scripts/cdp-capture.ts --url https://www.nicovideo.jp/watch/sm9 --out test/fixtures/cdp/scenes/watch-sm9.json --seconds 20
// 取得物は Cookie/認証を除去して保存し、不要ホスト（広告・計測）は記録しない。

import { isBlockedUrl, redactBodyText, redactHeaders } from '../test/fixtures/cdp/network-policy';
import type { CdpScene } from '../test/fixtures/cdp/scene';

interface CliOptions {
  url: string;
  out: string;
  seconds: number;
  endpoint: string;
}

function parseArgs(argv: string[]): CliOptions {
  const get = (name: string, fallback = ''): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && i + 1 < argv.length ? (argv[i + 1] as string) : fallback;
  };
  const url = get('url');
  if (url.length === 0) {
    throw new Error('--url が必要です');
  }
  return {
    url,
    out: get('out', 'test/fixtures/cdp/scenes/captured.json'),
    seconds: Number(get('seconds', '20')),
    endpoint: get('endpoint', 'http://127.0.0.1:9222'),
  };
}

interface CdpTarget {
  webSocketDebuggerUrl: string;
  type: string;
}

async function findPageTarget(endpoint: string): Promise<string> {
  const res = await fetch(`${endpoint}/json/list`);
  const targets = (await res.json()) as CdpTarget[];
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl.length > 0);
  if (page === undefined) {
    throw new Error('page target が見つかりません。chrome-debug.ps1 で Chrome を起動してください');
  }
  return page.webSocketDebuggerUrl;
}

interface RecordedEntry {
  request: { method: string; url: string; headers: Record<string, string> };
  response: {
    status: number;
    headers: Record<string, string>;
    mimeType: string;
    bodyText: string;
    fromFixture: true;
  };
}

async function capture(options: CliOptions): Promise<void> {
  const wsUrl = await findPageTarget(options.endpoint);
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket error')), { once: true });
  });

  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  const send = (method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
    id += 1;
    const cur = id;
    return new Promise((resolve) => {
      pending.set(cur, resolve);
      ws.send(JSON.stringify({ id: cur, method, params }));
    });
  };
  const responsesByRequest = new Map<string, { status: number; headers: Record<string, string>; mime: string }>();
  const entries: RecordedEntry[] = [];

  ws.addEventListener('message', (ev: MessageEvent) => {
    const msg = JSON.parse(String(ev.data)) as {
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
      result?: unknown;
    };
    if (msg.id !== undefined) {
      pending.get(msg.id)?.(msg.result);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Network.responseReceived' && msg.params !== undefined) {
      const rawId = msg.params['requestId'];
      const reqId = typeof rawId === 'string' ? rawId : '';
      const res = msg.params['response'] as {
        status: number;
        headers: Record<string, string>;
        mimeType: string;
        url: string;
      };
      if (!isBlockedUrl(res.url)) {
        responsesByRequest.set(reqId, {
          status: res.status,
          headers: redactHeaders(res.headers ?? {}),
          mime: res.mimeType ?? '',
        });
      }
    }
    if (msg.method === 'Network.loadingFinished' && msg.params !== undefined) {
      const rawFinishedId = msg.params['requestId'];
      const reqId = typeof rawFinishedId === 'string' ? rawFinishedId : '';
      const meta = responsesByRequest.get(reqId);
      if (meta !== undefined) {
        void (async () => {
          try {
            const body = (await send('Network.getResponseBody', { requestId: reqId })) as {
              body: string;
              base64Encoded: boolean;
            };
            const text = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf-8') : body.body;
            // リクエスト側の詳細は requestWillBeSent ではなく履歴から復元できないため、
            // ここでは GET として URL のみ固定する。POST 系は手動で postData を追記する運用にする。
            entries.push({
              request: { method: 'GET', url: '[URL_FROM_HISTORY]', headers: {} },
              response: {
                status: meta.status,
                headers: meta.headers,
                mimeType: meta.mime,
                bodyText: redactBodyText(text).slice(0, 200000),
                fromFixture: true,
              },
            });
          } catch {
            // 取得できないボディ（ストリーム等）は記録対象外にする
          }
        })();
      }
    }
  });

  await send('Network.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: options.url });
  await new Promise((r) => setTimeout(r, options.seconds * 1000));

  const title = (await send('Runtime.evaluate', { expression: 'document.title' })) as {
    result?: { value?: string };
  };
  const scene: CdpScene = {
    format: 'futatsume-cdp-scene/v1',
    name: options.url,
    targetUrl: options.url,
    capturedAt: new Date().toISOString(),
    domSnapshot: { title: title.result?.value ?? '' },
    network: entries
      .filter((e) => e.request.url !== '[URL_FROM_HISTORY]')
      .map((e) => ({ request: e.request, response: e.response })),
  };
  // URL 解決は Network.requestWillBeSent を購読する完全版で補う想定のため、
  // 本スクリプトは雛形として保存し、URL 手動補完が必要な旨を残す。
  await Bun.write(options.out, `${JSON.stringify(scene, null, 2)}\n`);
  ws.close();
  console.log(`captured skeleton -> ${options.out} (entries=${scene.network.length})`);
}

try {
  await capture(parseArgs(Bun.argv.slice(2)));
} catch (e) {
  console.error(`採取失敗: ${(e as Error).message}`);
  process.exit(1);
}
