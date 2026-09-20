import { createHash } from 'node:crypto';
const scrubQuery = (value: string): string =>
  value.replace(
    /([?&](?:amp;)?(?:session|Policy|Signature|Key-Pair-Id|accessRightKey|token)=)[^&\s"'<>]+/gi,
    '$1[REDACTED]'
  );

const sensitive =
  /cookie|authorization|password|secret|token|(?:^|[-_])key|key$|signature|policy$|credential|session|csrf/i;
export function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()])
      if (sensitive.test(key) || /track/i.test(key)) url.searchParams.set(key, '[REDACTED]');
    return url.href;
  } catch {
    return raw;
  }
}
export function scrub(value: unknown, key = ''): unknown {
  // CDP also exposes the raw request body as base64; keep only the scrubbed postData.
  if (sensitive.test(key) || /^(?:postDataEntries|x-niconico-id)$/i.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => scrub(item));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, item]) => [name, scrub(item, name)])
    );
  if (typeof value === 'string')
    return ['postData', 'description', 'text', 'message'].includes(key)
      ? scrubText(value)
      : scrubQuery(value.replace(/https?:\/\/[^\s"'<>]+/g, safeUrl));
  return value;
}
export function scrubText(text: string): string {
  try {
    return JSON.stringify(scrub(JSON.parse(text)), null, 2);
  } catch {
    /* HTML, scripts and playlists are not JSON. */
  }
  return scrubQuery(
    text
      .replace(
        /((?:"|&quot;)(?:[\w-]*(?:token|secret|password|csrf|authKey|accessRightKey|threadKey|postKey|trackingId))[\w-]*(?:"|&quot;)\s*:\s*)("[^"\r\n]*"|&quot;.*?&quot;)/gi,
        '$1"[REDACTED]"'
      )
      .replace(/https?:\/\/[^\s"'<>]+/g, safeUrl)
  );
}

export interface NetworkInitiator {
  type?: string;
  requestId?: string;
  stack?: { callFrames?: Array<{ functionName?: string; url?: string }>; parent?: NetworkInitiator['stack'] };
}
export function isProductSession(initiator: NetworkInitiator, owners: ReadonlyMap<string, boolean>): boolean {
  if (initiator.type === 'preflight') return owners.get(initiator.requestId ?? '') === true;
  let stack = initiator.stack;
  while (stack) {
    if (stack.callFrames?.some((frame) => frame.functionName === '_createSession' && frame.url?.startsWith('blob:')))
      return true;
    stack = stack.parent;
  }
  return false;
}

export class LiveReadGate {
  private readonly seen = new Set<string>();
  private watchId = 'sm9';
  private readonly refreshes = new Map<string, number>();
  private readonly refreshPreflights = new Set<string>();
  closed = false;
  constructor(private readonly localOrigin?: string) {}
  setWatchId(watchId: string): void {
    if (!/^(?:sm|so)\d+$/.test(watchId)) throw Error('動画IDが不正です');
    this.watchId = watchId;
  }
  allowReadRefresh(raw: string): void {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.nicovideo.jp')) throw Error('再取得先が不正です');
    this.refreshes.set(url.href, (this.refreshes.get(url.href) ?? 0) + 1);
    this.refreshPreflights.add(url.href);
  }
  stopForFailure(raw: string, error: string): boolean {
    if (/ERR_BLOCKED_BY_CLIENT|ERR_ABORTED/.test(error)) return false;
    const url = new URL(raw);
    const critical =
      (url.hostname === 'www.nicovideo.jp' && url.pathname === `/watch/${this.watchId}`) ||
      (url.hostname === 'nvapi.nicovideo.jp' && url.pathname === `/v1/watch/${this.watchId}/access-rights/hls`) ||
      (url.hostname === 'public.nvcomment.nicovideo.jp' && url.pathname === '/v1/threads') ||
      url.hostname === 'delivery.domand.nicovideo.jp';
    if (critical) this.closed = true;
    return critical;
  }
  decide(method: string, raw: string, body = '', range = '', productSession = false): string | null {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (this.closed) return 'capture-closed';
    if (url.username || url.password) return 'credential-url';
    if (this.localOrigin) {
      if (url.origin !== this.localOrigin) return 'outside-preflight';
    } else {
      if (
        !['nicovideo.jp', 'nimg.jp', 'smilevideo.jp'].some(
          (host) => url.hostname === host || url.hostname.endsWith('.' + host)
        )
      )
        return 'unrelated-host';
      if (/(^|\.)(ads?|analytics|log|ads-api|uad)\./i.test(url.hostname)) return 'tracking';
    }
    const sessionPath = url.pathname === `/v1/watch/${this.watchId}/access-rights/hls`;
    if (sessionPath && !productSession) return 'host-playback-suppressed';
    const readPost =
      method === 'POST' &&
      (((url.hostname === 'nvapi.nicovideo.jp' || !!this.localOrigin) && sessionPath) ||
        (url.hostname === 'public.nvcomment.nicovideo.jp' && url.pathname === '/v1/threads'));
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !readPost) return 'write-not-authorized';
    // No cache-busting or fresh access key can turn a failed request into an allowed retry.
    const canonical = new URL(url);
    for (const key of [...canonical.searchParams.keys()])
      if (
        sensitive.test(key) ||
        /^(?:_|cachebuster|actionTrackId|trackingId|__retry|retry(?:Count|Attempt)?)$/i.test(key)
      )
        canonical.searchParams.delete(key);
    canonical.hash = '';
    if (canonical.pathname === `/watch/${this.watchId}`)
      for (const key of [...canonical.searchParams.keys()])
        if (key !== 'responseType') canonical.searchParams.delete(key);
    canonical.searchParams.sort();
    const canonicalBody = url.pathname.endsWith('/access-rights/hls') ? '' : body ? scrubText(body) : '';
    const identity = createHash('sha256')
      .update([method, canonical.href, canonicalBody, range].join('\n'))
      .digest('hex');
    const refresh = method === 'GET' ? (this.refreshes.get(url.href) ?? 0) : 0;
    const refreshPreflight =
      method === 'OPTIONS' && range.startsWith('GET:') && this.refreshPreflights.delete(url.href);
    if (refresh > 0) {
      this.refreshes.set(url.href, refresh - 1);
      this.refreshPreflights.delete(url.href);
    }
    if (this.seen.has(identity)) {
      if (refresh > 0 || refreshPreflight) return null;
      return 'repeat-blocked';
    }
    this.seen.add(identity);
    return null;
  }
}
