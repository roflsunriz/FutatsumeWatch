import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { isNvCommentApiUrl, netUtil } from '../../packages/lib/src/infra/net-util';

interface FakeRequestState {
  body?: Document | XMLHttpRequestBodyInit | null;
  headers: Record<string, string>;
  method?: string;
  url?: string;
  withCredentials?: boolean;
}

const original = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
let state: FakeRequestState;

class FakeXMLHttpRequest {
  response = new TextEncoder().encode('{"meta":{"status":200},"data":{"threads":[]}}').buffer;
  responseType: XMLHttpRequestResponseType = '';
  status = 200;
  statusText = 'OK';
  timeout = 0;
  withCredentials = false;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  abort(): void {
    this.onabort?.();
  }
  getAllResponseHeaders(): string {
    return 'content-type: application/json\r\n';
  }
  open(method: string, url: string): void {
    state.method = method;
    state.url = url;
  }
  send(body?: Document | XMLHttpRequestBodyInit | null): void {
    state.body = body;
    state.withCredentials = this.withCredentials;
    queueMicrotask(() => this.onload?.());
  }
  setRequestHeader(name: string, value: string): void {
    state.headers[name.toLowerCase()] = value;
  }
}

beforeEach(() => {
  state = { headers: {} };
  Object.defineProperty(globalThis, 'XMLHttpRequest', {
    configurable: true,
    writable: true,
    value: FakeXMLHttpRequest,
  });
});

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'XMLHttpRequest', original);
  else Reflect.deleteProperty(globalThis, 'XMLHttpRequest');
});

describe('nv-commentの直接XMLHttpRequest', () => {
  it('信頼済みHTTPSホストだけを直接通信対象にする', () => {
    expect(isNvCommentApiUrl('https://public.nvcomment.nicovideo.jp/v1/threads')).toBe(true);
    for (const url of [
      'http://public.nvcomment.nicovideo.jp/v1/threads',
      'https://public.nvcomment.nicovideo.jp.evil.test/v1/threads',
      'https://u:p@public.nvcomment.nicovideo.jp/v1/threads',
      'https://public.nvcomment.nicovideo.jp:444/v1/threads',
    ])
      expect(isNvCommentApiUrl(url)).toBe(false);
  });

  it('外部ホストでもiframeを使わずXHRへmethod・headers・bodyを渡す', async () => {
    const response = (await netUtil.fetch('https://public.nvcomment.nicovideo.jp/v1/threads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Os-Type': 'others',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
      },
      body: '{"params":{},"threadKey":"fixture"}',
    })) as Response;
    expect(state).toMatchObject({
      method: 'POST',
      url: 'https://public.nvcomment.nicovideo.jp/v1/threads',
      withCredentials: false,
      body: '{"params":{},"threadKey":"fixture"}',
      headers: {
        'content-type': 'application/json',
        'x-client-os-type': 'others',
        'x-frontend-id': '6',
        'x-frontend-version': '0',
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ meta: { status: 200 }, data: { threads: [] } });
  });
});
