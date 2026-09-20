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
  if (sensitive.test(key)) return '[REDACTED]';
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
  closed = false;
  constructor(private readonly localOrigin?: string) {}
  decide(method: string, raw: string, body = '', range = '', productSession = false): string | null {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return null;
    if (this.closed) return 'capture-closed';
    if (url.username || url.password) return 'credential-url';
    if (this.localOrigin) {
      if (url.origin !== this.localOrigin) return 'outside-preflight';
    } else {
      if (
        !['nicovideo.jp', 'nimg.jp', 'dmc.nico', 'smilevideo.jp'].some(
          (host) => url.hostname === host || url.hostname.endsWith('.' + host)
        )
      )
        return 'unrelated-host';
      if (/(^|\.)(ads?|analytics|log|ads-api|uad)\./i.test(url.hostname)) return 'tracking';
    }
    const sessionPath = url.pathname === '/v1/watch/sm9/access-rights/hls';
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
    if (canonical.pathname === '/watch/sm9')
      for (const key of [...canonical.searchParams.keys()])
        if (key !== 'responseType') canonical.searchParams.delete(key);
    canonical.searchParams.sort();
    const canonicalBody = url.pathname.endsWith('/access-rights/hls') ? '' : body ? scrubText(body) : '';
    const identity = createHash('sha256')
      .update([method, canonical.href, canonicalBody, range].join('\n'))
      .digest('hex');
    if (this.seen.has(identity)) return 'repeat-blocked';
    this.seen.add(identity);
    return null;
  }
}
