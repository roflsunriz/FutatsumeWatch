import { netUtil } from '../infra/net-util';
import { isWatchRecord, normalizeWatchV4Data } from './watch-v4-normalize';
export { isWatchRecord } from './watch-v4-normalize';

export function watchLoginRequiredMessage(value: unknown, locale = navigator.language): string | null {
  if (!isWatchRecord(value) || !isWatchRecord(value.data)) return null;
  const { response, googleTagManager } = value.data;
  if (
    !isWatchRecord(response) ||
    response.errorCode !== 'FORBIDDEN' ||
    response.reasonCode !== 'HARMFUL_VIDEO' ||
    !isWatchRecord(googleTagManager) ||
    !isWatchRecord(googleTagManager.user) ||
    googleTagManager.user.login_status !== 'not_login'
  )
    return null;
  return locale.startsWith('ja')
    ? 'この動画の再生にはニコニコへのログインが必要です。公式視聴ページでログインしてから、もう一度再生してください。'
    : 'Sign in to Niconico on the official watch page, then try playing this video again.';
}

export function unwrapWatchResponse(value: unknown): Record<string, unknown> {
  if (!isWatchRecord(value) || !isWatchRecord(value.data)) throw new Error('動画情報の応答形式が不正です');
  const loginMessage = watchLoginRequiredMessage(value);
  if (loginMessage) throw new Error(loginMessage);
  if (
    isWatchRecord(value.meta) &&
    typeof value.meta.status === 'number' &&
    (value.meta.status < 200 || value.meta.status >= 300)
  )
    throw new Error(`動画情報の取得に失敗しました (API ${value.meta.status})`);
  const response = isWatchRecord(value.data.response) ? value.data.response : value.data;
  if ('$watchV4' in response) {
    if (!isWatchRecord(response.$watchV4) || !isWatchRecord(response.$watchV4.data)) {
      if (isWatchRecord(response.video) && isWatchRecord(response.media)) return response;
      throw new Error('watchV4の動画情報がありません');
    }
    // 世代によって外側に残るコメント・タグ等も保持し、v4のフィールドを優先する。
    return normalizeWatchV4Data({ ...response, ...response.$watchV4.data });
  }
  return normalizeWatchV4Data(response);
}

function parseWatchEnvelopeText(text: string): unknown {
  if (text.trimStart().startsWith('<')) {
    const document = new DOMParser().parseFromString(text, 'text/html');
    const json = document.querySelector('meta[name="server-response"]')?.getAttribute('content');
    if (!json) throw new Error('視聴ページに動画情報がありません');
    return JSON.parse(json) as unknown;
  }
  return JSON.parse(text) as unknown;
}

export function parseWatchResponseText(text: string): Record<string, unknown> {
  return unwrapWatchResponse(parseWatchEnvelopeText(text));
}

export function isWatchPageResponse(text: string): boolean {
  try {
    const data = unwrapWatchResponse(JSON.parse(text) as unknown);
    return (
      typeof data.okReason === 'string' ||
      (isWatchRecord(data.video) && typeof data.video.id === 'string' && isWatchRecord(data.media))
    );
  } catch {
    return false;
  }
}

export async function loadWatchPageData(watchId: string, economy = false): Promise<Record<string, unknown>> {
  const url = new URL(`https://www.nicovideo.jp/watch/${encodeURIComponent(watchId)}`);
  if (economy) url.searchParams.set('eco', '1');
  const read = async (endpoint: string) => {
    const response = (await netUtil
      .fetch(endpoint, { credentials: 'include', headers: { Accept: 'text/html' } })
      .catch(() => {
        throw new WatchPageNetworkError('通信エラー(network)');
      })) as Response;
    if (!response.ok) {
      let denied: unknown;
      try {
        denied = parseWatchEnvelopeText(await response.text());
      } catch {
        /* エラー本文がJSONでなくてもHTTP拒否を保持する。 */
      }
      throw new Error(watchLoginRequiredMessage(denied) ?? `動画情報の取得に失敗しました (HTTP ${response.status})`);
    }
    const text = await response.text().catch(() => {
      throw new WatchPageNetworkError('通信エラー(network)');
    });
    return parseWatchResponseText(text);
  };
  // responseType=jsonはnvpcClientVersionの一致が必須になった。通常HTMLを正本にし、
  // 公式資産の版番号へ依存せず、1回の取得で初期情報とアクセス権キーを得る。
  const data = await read(url.href);
  if (!isWatchRecord(data.video)) throw new Error('視聴ページの動画情報が不完全です');
  if (!isWatchRecord(data.lazy) || typeof data.lazy.authKey !== 'string' || !isWatchRecord(data.client)) return data;
  const response = (await netUtil.fetch(`https://nvapi.nicovideo.jp/v4/watch/lazy/${encodeURIComponent(watchId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json;charset=utf-8',
      'X-Request-With': 'https://www.nicovideo.jp',
      'X-Frontend-Id': '6',
      'X-Frontend-Version': '0',
    },
    body: JSON.stringify({ actionTrackId: data.client.watchTrackId, keyToken: data.lazy.authKey }),
  })) as Response;
  if (!response.ok) throw new Error(`動画詳細の取得に失敗しました (HTTP ${response.status})`);
  const details: unknown = await response.json();
  if (
    !isWatchRecord(details) ||
    !isWatchRecord(details.data) ||
    !isWatchRecord(details.meta) ||
    details.meta.status !== 200
  )
    throw new Error('動画詳細の応答形式が不正です');
  return normalizeWatchV4Data(data, details.data);
}

export class WatchPageNetworkError extends Error {}

export interface WatchQuality {
  id: string;
  isAvailable: boolean;
  qualityLevel: number;
  height: number;
  label: string;
}

export interface WatchV4Delivery {
  videos: WatchQuality[];
  audios: WatchQuality[];
  hlsUrl: string | null;
  isStoryboardAvailable: boolean;
}

export function normalizeWatchV4Media(media: Record<string, unknown>): WatchV4Delivery | null {
  const groups = Array.isArray(media.contents)
    ? (media.contents as unknown[])
    : isWatchRecord(media.contents)
      ? [media.contents]
      : null;
  if (!groups) return null;
  const collect = (kind: 'videos' | 'audios'): WatchQuality[] => {
    const qualities = new Map<string, WatchQuality>();
    for (const group of groups) {
      if (!isWatchRecord(group) || !Array.isArray(group[kind])) continue;
      for (const entry of group[kind] as unknown[]) {
        if (!isWatchRecord(entry) || typeof entry.id !== 'string' || !entry.id) continue;
        const metadata = isWatchRecord(entry.metadata) ? entry.metadata : {};
        const rawHeight = entry.height ?? metadata.height;
        const height =
          typeof rawHeight === 'number' && Number.isFinite(rawHeight) && rawHeight > 0
            ? rawHeight
            : Number(/-(\d+)p$/.exec(entry.id)?.[1] ?? 0);
        const rank = kind === 'videos' ? height : Number(/-(\d+)kbps$/.exec(entry.id)?.[1] ?? 0);
        const item = {
          id: entry.id,
          isAvailable: entry.isAvailable === true,
          qualityLevel: typeof entry.qualityLevel === 'number' ? entry.qualityLevel : rank,
          height,
          label: typeof entry.label === 'string' && entry.label ? entry.label : height ? `${height}p` : entry.id,
        };
        const previous = qualities.get(item.id);
        if (!previous || item.isAvailable)
          qualities.set(item.id, { ...item, isAvailable: item.isAvailable || previous?.isAvailable === true });
      }
    }
    return [...qualities.values()].sort((a, b) => b.qualityLevel - a.qualityLevel);
  };
  let hlsUrl: string | null = null;
  if (isWatchRecord(media.hls) && typeof media.hls.url === 'string') {
    try {
      const url = new URL(media.hls.url);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && /\.m3u8$/.test(url.pathname))
        hlsUrl = url.href;
    } catch {
      /* 不透明な更新値をURLとして扱わない。 */
    }
  }
  return { videos: collect('videos'), audios: collect('audios'), hlsUrl, isStoryboardAvailable: false };
}
