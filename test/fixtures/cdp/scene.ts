// CDPシーン型とオフラインマッチャー。
// scripts/cdp-capture.ts が実ページから採取し、bun:test がオフラインで再生する共通契約。

import { isDeepStrictEqual } from 'node:util';

export interface CdpRequestFixture {
  method: string;
  url: string;
  // 追加の検証条件。正確なURL照合を広げるためには使わない。
  urlPattern?: string;
  headers?: Record<string, string>;
  postData?: string;
  // 除外はシーンごとの明示指定に限定する。t/ts は再生時刻を表す場合がある。
  ignoreQueryParameters?: string[];
}

export interface CdpResponseFixture {
  status: number;
  headers?: Record<string, string>;
  mimeType?: string;
  bodyText?: string;
  bodyBase64?: string;
  fromFixture: true;
}

export interface CdpScene {
  format: 'futatsume-cdp-scene/v1';
  name: string;
  targetUrl: string;
  capturedAt: string;
  watchId?: string;
  notes?: string;
  domSnapshot?: {
    title?: string;
    watchId?: string;
    hasVideo?: boolean;
    commentCount?: number;
  };
  network: Array<{
    request: CdpRequestFixture;
    response: CdpResponseFixture;
  }>;
}

export function normalizeUrl(rawUrl: string, ignoreQueryParameters: readonly string[] = []): string {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    for (const key of ignoreQueryParameters) {
      u.searchParams.delete(key);
    }
    // 同じキーの複数値は順序を保ち、異なるキーの順番だけ正規化する。
    u.searchParams.sort();
    return u.toString();
  } catch {
    return rawUrl;
  }
}

export interface FixtureRequestDetails {
  postData?: string;
  headers?: Record<string, string>;
}

function contentType(headers: Record<string, string> = {}): string {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1];
  return value?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function matchesBody(expected: CdpRequestFixture, actual: FixtureRequestDetails): boolean {
  const expectedBody = expected.postData ?? '';
  const actualBody = actual.postData ?? '';
  if (expectedBody === '' || actualBody === '') {
    return expectedBody === actualBody;
  }
  const type = contentType(expected.headers);
  if (actual.headers !== undefined && contentType(actual.headers) !== type) {
    return false;
  }
  if (type === 'application/json' || type.endsWith('+json')) {
    try {
      const expectedJson: unknown = JSON.parse(expectedBody);
      const actualJson: unknown = JSON.parse(actualBody);
      return isDeepStrictEqual(expectedJson, actualJson);
    } catch {
      return false;
    }
  }
  if (type === 'application/x-www-form-urlencoded') {
    const a = new URLSearchParams(expectedBody);
    const b = new URLSearchParams(actualBody);
    a.sort();
    b.sort();
    return a.toString() === b.toString();
  }
  return expectedBody === actualBody;
}

export function matchFixture(
  scene: CdpScene,
  method: string,
  rawUrl: string,
  details: FixtureRequestDetails = {}
): CdpResponseFixture | null {
  const m = method.toUpperCase();
  for (const entry of scene.network) {
    if (entry.request.method.toUpperCase() !== m || !matchesBody(entry.request, details)) {
      continue;
    }
    const want = normalizeUrl(rawUrl, entry.request.ignoreQueryParameters);
    const expected = normalizeUrl(entry.request.url, entry.request.ignoreQueryParameters);
    if (expected !== want) {
      continue;
    }
    if (entry.request.urlPattern !== undefined && entry.request.urlPattern.length > 0) {
      // URL未記録の古い雛形は一致不能。不正パターンも通常一致へ緩和しない。
      try {
        if (new RegExp(`^(?:${entry.request.urlPattern})$`).test(want)) {
          return entry.response;
        }
      } catch {
        /* 不正パターンは一致しない。 */
      }
      continue;
    }
    return entry.response;
  }
  return null;
}

export function getResponseBodyBytes(res: CdpResponseFixture): Uint8Array<ArrayBuffer> {
  if (res.bodyText !== undefined) {
    return new TextEncoder().encode(res.bodyText);
  }
  return Uint8Array.from(Buffer.from(res.bodyBase64 ?? '', 'base64'));
}

export function getResponseBodyText(res: CdpResponseFixture): string {
  if (res.bodyText !== undefined) {
    return res.bodyText;
  }
  if (res.bodyBase64 !== undefined && res.bodyBase64.length > 0) {
    return Buffer.from(res.bodyBase64, 'base64').toString('utf-8');
  }
  return '';
}
