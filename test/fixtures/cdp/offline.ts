// bun:test 用。ブラウザ全体の遮断は別途 CDP で行う。
import { isBlockedUrl } from './network-policy';
import { getResponseBodyBytes, getResponseBodyText, matchFixture } from './scene';
import type { CdpResponseFixture, CdpScene, FixtureRequestDetails } from './scene';

export interface OfflineSession {
  scene: CdpScene;
  restore: () => void;
  fetchLog: Array<{ method: string; url: string; fromFixture: boolean; transport: 'fetch' | 'xhr' }>;
}

function responseHeaders(res: CdpResponseFixture): Headers {
  const headers = new Headers(res.headers);
  if (!headers.has('content-type') && res.mimeType) headers.set('content-type', res.mimeType);
  headers.set('x-futatsume-fixture', '1');
  return headers;
}

function toFixtureResponse(res: CdpResponseFixture, url: string, method: string): Response {
  const headers = responseHeaders(res);
  headers.set('x-futatsume-fixture-url', url);
  return new Response(method === 'HEAD' || [204, 205, 304].includes(res.status) ? null : getResponseBodyBytes(res), {
    status: res.status,
    headers,
  });
}

export function installOfflineScene(scene: CdpScene): OfflineSession {
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const xhrDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
  const fetchLog: OfflineSession['fetchLog'] = [];
  let restored = false;
  const resolve = (
    method: string,
    url: string,
    details: FixtureRequestDetails,
    transport: 'fetch' | 'xhr'
  ): CdpResponseFixture => {
    const hit = isBlockedUrl(url) ? null : matchFixture(scene, method, url, details);
    fetchLog.push({ method, url, fromFixture: hit !== null, transport });
    if (!hit) {
      throw new Error(`[offline-fixture] no fixture for ${transport}: ${method} ${url} (scene=${scene.name})`);
    }
    return hit;
  };

  const offlineFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    if (request.signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
    const postData = await request.text();
    if (request.signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
    const hit = resolve(
      request.method,
      request.url,
      {
        postData,
        headers: Object.fromEntries(request.headers),
      },
      'fetch'
    );
    return toFixtureResponse(hit, request.url, request.method);
  };
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: offlineFetch });

  const OriginalXHR = globalThis.XMLHttpRequest;
  if (typeof OriginalXHR === 'function') {
    class OfflineXHR extends OriginalXHR {
      private fixtureMethod = 'GET';
      private fixtureUrl = '';
      private fixtureHeaders: Record<string, string> = {};
      private fixtureResponseHeaders = new Headers();
      private generation = 0;
      private pending = false;
      private asynchronous = true;

      override open(
        method: string,
        url: string | URL,
        async = true,
        username?: string | null,
        password?: string | null
      ): void {
        this.generation++;
        this.pending = false;
        this.asynchronous = async;
        this.fixtureMethod = method.toUpperCase();
        this.fixtureUrl = new URL(url, scene.targetUrl).href;
        this.fixtureHeaders = {};
        this.fixtureResponseHeaders = new Headers();
        // 前の擬似応答を除去し、再openでネイティブのOPENED状態へ戻す。
        for (const key of ['status', 'responseText', 'response', 'readyState', 'responseURL']) {
          Reflect.deleteProperty(this, key);
        }
        super.open(method, this.fixtureUrl, async, username, password);
      }

      override setRequestHeader(name: string, value: string): void {
        super.setRequestHeader(name, value);
        const key = name.toLowerCase();
        this.fixtureHeaders[key] =
          this.fixtureHeaders[key] === undefined ? value : `${this.fixtureHeaders[key]}, ${value}`;
      }

      override getResponseHeader(name: string): string | null {
        return this.fixtureResponseHeaders.get(name);
      }

      override getAllResponseHeaders(): string {
        return [...this.fixtureResponseHeaders].map(([key, value]) => `${key}: ${value}\r\n`).join('');
      }

      override abort(): void {
        const wasPending = this.pending;
        this.generation++;
        this.pending = false;
        for (const key of ['status', 'responseText', 'response', 'readyState', 'responseURL']) {
          Reflect.deleteProperty(this, key);
        }
        this.fixtureResponseHeaders = new Headers();
        super.abort();
        Object.defineProperty(this, 'readyState', { configurable: true, value: 0 });
        if (wasPending) {
          const EventClass = globalThis.document?.defaultView?.Event ?? Event;
          this.dispatchEvent(new EventClass('abort'));
          this.dispatchEvent(new EventClass('loadend'));
        }
      }

      override send(body?: Document | XMLHttpRequestBodyInit | null): void {
        if (this.readyState !== 1 || this.pending) throw new DOMException('XHR is not open', 'InvalidStateError');
        if (!['', 'text', 'arraybuffer', 'blob', 'json'].includes(this.responseType)) {
          throw new TypeError(`[offline-fixture] unsupported XHR responseType: ${this.responseType}`);
        }
        // 記録する契約はJSON/フォーム本文。非文字列の送信を黙って空本文にしない。
        if (body !== undefined && body !== null && typeof body !== 'string' && !(body instanceof URLSearchParams)) {
          throw new TypeError('[offline-fixture] XHR request body must be text or URLSearchParams');
        }
        const postData = body?.toString() ?? '';
        const headers = { ...this.fixtureHeaders };
        if (body instanceof URLSearchParams && !headers['content-type']) {
          headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
        }
        const hit = resolve(this.fixtureMethod, this.fixtureUrl, { postData, headers }, 'xhr');
        const generation = this.generation;
        this.pending = true;
        const deliver = (): void => {
          if (generation !== this.generation || restored) return;
          this.pending = false;
          const text = getResponseBodyText(hit);
          const bytes = getResponseBodyBytes(hit);
          let response: string | number | boolean | ArrayBuffer | Blob | object | null = text;
          if (this.responseType === 'arraybuffer') response = bytes.buffer;
          else if (this.responseType === 'blob') response = new Blob([bytes], { type: hit.mimeType });
          else if (this.responseType === 'json') {
            try {
              response = JSON.parse(text) as string | number | boolean | object | null;
            } catch {
              response = null;
            }
          }
          this.fixtureResponseHeaders = responseHeaders(hit);
          Object.defineProperties(this, {
            status: { configurable: true, value: hit.status },
            responseText: {
              configurable: true,
              get: () => {
                if (this.responseType !== '' && this.responseType !== 'text')
                  throw new DOMException('Not a text response', 'InvalidStateError');
                return text;
              },
            },
            response: { configurable: true, value: response },
            responseURL: { configurable: true, value: this.fixtureUrl },
            readyState: { configurable: true, value: 4 },
          });
          const EventClass = globalThis.document?.defaultView?.Event ?? Event;
          for (const type of ['readystatechange', 'load', 'loadend']) {
            if (generation !== this.generation || restored) break;
            this.dispatchEvent(new EventClass(type));
          }
        };
        if (this.asynchronous) queueMicrotask(deliver);
        else deliver();
      }
    }
    Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, writable: true, value: OfflineXHR });
  }

  return {
    scene,
    fetchLog,
    restore: () => {
      if (restored) return;
      restored = true;
      if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor);
      else Reflect.deleteProperty(globalThis, 'fetch');
      if (xhrDescriptor) Object.defineProperty(globalThis, 'XMLHttpRequest', xhrDescriptor);
      else Reflect.deleteProperty(globalThis, 'XMLHttpRequest');
    },
  };
}
