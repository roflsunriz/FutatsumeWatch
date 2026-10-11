import { netUtil } from '../infra/net-util';

export const isWatchRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function unwrapWatchResponse(value: unknown): Record<string, unknown> {
  if (!isWatchRecord(value) || !isWatchRecord(value.data)) throw new Error('動画情報の応答形式が不正です');
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
    return { ...response, ...response.$watchV4.data };
  }
  return response;
}

export function parseWatchResponseText(text: string): Record<string, unknown> {
  if (text.trimStart().startsWith('<')) {
    const document = new DOMParser().parseFromString(text, 'text/html');
    const json = document.querySelector('meta[name="server-response"]')?.getAttribute('content');
    if (!json) throw new Error('視聴ページに動画情報がありません');
    return unwrapWatchResponse(JSON.parse(json) as unknown);
  }
  return unwrapWatchResponse(JSON.parse(text) as unknown);
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
  url.searchParams.set('responseType', 'json');
  if (economy) url.searchParams.set('eco', '1');
  const queryUrl = url.href;
  url.searchParams.delete('responseType');
  const htmlUrl = url.href;
  const read = async (endpoint: string) => {
    const response = (await netUtil.fetch(endpoint, { credentials: 'include' }).catch(() => {
      throw new WatchPageNetworkError('通信エラー(network)');
    })) as Response;
    if (!response.ok) throw new Error(`動画情報の取得に失敗しました (HTTP ${response.status})`);
    const text = await response.text().catch(() => {
      throw new WatchPageNetworkError('通信エラー(network)');
    });
    return parseWatchResponseText(text);
  };
  const data = await read(queryUrl);
  if (!isWatchRecord(data.video) && isWatchRecord(data.media)) {
    // media更新は完全なwatch応答ではない。同じ動画のHTMLから一度だけ取得する。
    const complete = await read(htmlUrl);
    if (!isWatchRecord(complete.video)) throw new Error('視聴ページの動画情報が不完全です');
    return complete;
  }
  return data;
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
  if (!Array.isArray(media.contents)) return null;
  const collect = (kind: 'videos' | 'audios'): WatchQuality[] => {
    const qualities = new Map<string, WatchQuality>();
    for (const group of media.contents as unknown[]) {
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
