// CDPシーン型とオフラインマッチャー。
// scripts/cdp-capture.ts が実ページから採取し、bun:test がオフラインで再生する共通契約。

export interface CdpRequestFixture {
  method: string;
  url: string;
  urlPattern?: string;
  headers?: Record<string, string>;
  postData?: string;
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

export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    // キャッシュバスターと時刻系クエリを除去して照合を安定させる
    for (const k of [...u.searchParams.keys()]) {
      if (/^(_|t|ts|_ts|rand|cache|cb)$/i.test(k)) {
        u.searchParams.delete(k);
      }
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

export function matchFixture(
  scene: CdpScene,
  method: string,
  rawUrl: string,
): CdpResponseFixture | null {
  const want = normalizeUrl(rawUrl).toLowerCase();
  const m = method.toUpperCase();
  for (const entry of scene.network) {
    if (entry.request.method.toUpperCase() !== m) {
      continue;
    }
    if (entry.request.urlPattern !== undefined && entry.request.urlPattern.length > 0) {
      try {
        if (new RegExp(entry.request.urlPattern, 'i').test(rawUrl)) {
          return entry.response;
        }
      } catch {
        // 不正パターンは無視して完全一致へフォールバックする
      }
    }
    if (normalizeUrl(entry.request.url).toLowerCase() === want) {
      return entry.response;
    }
  }
  // クエリ差異を吸収するためパス一致でも探す
  try {
    const w = new URL(rawUrl);
    for (const entry of scene.network) {
      try {
        const e = new URL(entry.request.url);
        if (
          entry.request.method.toUpperCase() === m &&
          e.hostname.toLowerCase() === w.hostname.toLowerCase() &&
          e.pathname === w.pathname
        ) {
          return entry.response;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }
  return null;
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
