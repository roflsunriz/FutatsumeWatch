// CDP記録再生のネットワーク方針（オフライン優先）。
// 不要な外部通信は遮断し、必要な通信は test/fixtures/cdp/scenes/*.json に固定して解決する。
// 秘密情報（Cookie/Authorization/CSRF/トークン類）はフィクスチャに保存しない。

export interface NetworkPolicy {
  allowHosts: string[];
  blockHosts: string[];
  blockPaths: RegExp[];
}

const ALLOW_HOSTS = [
  'www.nicovideo.jp',
  'ext.nicovideo.jp',
  'api.search.nicovideo.jp',
  'nvapi.nicovideo.jp',
  'public.nvcomment.nicovideo.jp',
  'nmsg.nicovideo.jp',
  'dmc.nico',
  'smilevideo.jp',
  'tn.smilevideo.jp',
  'secure-dcdn-latest.nicovideo.jp',
  'delivery.domand.nicovideo.jp',
];

const BLOCK_HOSTS = [
  'ads.nicovideo.jp',
  'uad.nicovideo.jp',
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'facebook.com',
  'twitter.com',
  'x.com',
];

const BLOCK_PATHS: RegExp[] = [/\/watch\/[^/]+\?edit=/, /favicon\.ico/, /robots\.txt/];

export const networkPolicy: NetworkPolicy = {
  allowHosts: ALLOW_HOSTS,
  blockHosts: BLOCK_HOSTS,
  blockPaths: BLOCK_PATHS,
};

export function isBlockedUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }
  const host = url.hostname.toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    return true;
  }
  if (BLOCK_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) {
    return true;
  }
  const path = `${url.pathname}${url.search}`;
  if (/^\/watch\/[^/]+$/.test(url.pathname) && url.searchParams.has('edit')) {
    return true;
  }
  if (BLOCK_PATHS.some((re) => re.test(path) || re.test(rawUrl))) {
    return true;
  }
  return !ALLOW_HOSTS.some((a) => host === a || host.endsWith(`.${a}`));
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitive = ['cookie', 'authorization', 'x-csrf-token', 'x-niconico-auth', 'set-cookie'];
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = sensitive.includes(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return out;
}

export function redactBodyText(text: string): string {
  // トークンらしい長い英数記号列をマスクする（動画ID sm/so/lv 形式は残す）
  return text.replace(/(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{32,})(?![A-Za-z0-9_-])/g, (m) =>
    /^(sm|so|lv|co|ch|ar|im|mg|bk)\d+$/i.test(m) ? m : '[TOKEN]'
  );
}
