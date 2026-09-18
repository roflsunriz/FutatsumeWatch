// bun:test 用オフライン解決層。製品コードを変えず fetch/XHR を差し替える。
// 未登録の外部通信は例外にしてテストを失敗させ、不要通信の混入を検出する。

import { isBlockedUrl } from './network-policy';
import { getResponseBodyText, matchFixture } from './scene';
import type { CdpResponseFixture, CdpScene } from './scene';

export interface OfflineSession {
  scene: CdpScene;
  restore: () => void;
  fetchLog: Array<{ method: string; url: string; fromFixture: boolean }>;
}

function toFixtureResponse(res: CdpResponseFixture, url: string): Response {
  const body = getResponseBodyText(res);
  return new Response(body, {
    status: res.status,
    headers: {
      ...(res.headers ?? {}),
      'x-futatsume-fixture': '1',
      'x-futatsume-fixture-url': url,
    },
  });
}

export function installOfflineScene(scene: CdpScene): OfflineSession {
  const g = globalThis as unknown as Record<string, unknown>;
  const originalFetch = g['fetch'] as typeof fetch | undefined;
  const fetchLog: OfflineSession['fetchLog'] = [];

  const offlineFetch = (input: unknown, init?: unknown): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : String((input as { url?: string }).url ?? 'unknown-url');
    let method = 'GET';
    if (typeof init === 'object' && init !== null && 'method' in init) {
      const rawMethod = (init as { method?: string }).method;
      if (typeof rawMethod === 'string' && rawMethod.length > 0) {
        method = rawMethod;
      }
    }
    if (isBlockedUrl(url)) {
      fetchLog.push({ method, url, fromFixture: false });
      throw new Error(`[offline-fixture] blocked external url: ${method} ${url}`);
    }
    const hit = matchFixture(scene, method, url);
    if (hit !== null) {
      fetchLog.push({ method, url, fromFixture: true });
      return Promise.resolve(toFixtureResponse(hit, url));
    }
    fetchLog.push({ method, url, fromFixture: false });
    return Promise.reject(
      new Error(`[offline-fixture] no fixture for: ${method} ${url} (scene=${scene.name})`),
    );
  };

  g['fetch'] = offlineFetch;

  // XHR 経由（旧ローダー系）の最低限の横取り。open/send 時に照合し、なければ例外にする。
  const OriginalXHR = g['XMLHttpRequest'] as (new () => XMLHttpRequest) | undefined;
  if (typeof OriginalXHR === 'function') {
    class OfflineXHR extends OriginalXHR {
      private _method = 'GET';
      private _url = '';
      override open(method: string, url: string, ...rest: unknown[]): void {
        this._method = method;
        this._url = url;
        super.open(method, url, ...(rest as []));
      }
      override send(...args: Array<unknown>): void {
        void args;
        const hit = matchFixture(scene, this._method, this._url);
        if (hit === null || isBlockedUrl(this._url)) {
          throw new Error(`[offline-fixture] no fixture for XHR: ${this._method} ${this._url}`);
        }
        // 非同期の onload 契約を保つため、実送信せず擬似応答イベントを発火させる。
        const body = getResponseBodyText(hit);
        queueMicrotask(() => {
          Object.defineProperties(this, {
            status: { value: hit.status },
            responseText: { value: body },
            response: { value: body },
            readyState: { value: 4 },
          });
          this.dispatchEvent(new Event('readystatechange'));
          this.dispatchEvent(new Event('load'));
          this.dispatchEvent(new Event('loadend'));
        });
      }
    }
    g['XMLHttpRequest'] = OfflineXHR;
  }

  return {
    scene,
    fetchLog,
    restore: () => {
      if (originalFetch !== undefined) {
        g['fetch'] = originalFetch;
      } else {
        delete g['fetch'];
      }
      if (OriginalXHR !== undefined) {
        g['XMLHttpRequest'] = OriginalXHR;
      }
    },
  };
}
