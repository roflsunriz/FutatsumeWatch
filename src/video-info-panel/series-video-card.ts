export interface SeriesVideoCardData {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  commentCount: number;
  mylistCount: number;
  viewCount: number;
  likeCount: number | null;
  postedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringValue = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const numberValue = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export function toSeriesVideoCardData(
  value: unknown,
  fallback: { id: string; title: string; thumbnail: string }
): SeriesVideoCardData {
  const entry = isRecord(value) ? value : {};
  const content = isRecord(entry.content) ? entry.content : entry;
  const count = isRecord(content.count) ? content.count : {};
  const thumbnail = isRecord(content.thumbnail) ? content.thumbnail : {};

  return {
    id: stringValue(entry.watchId, stringValue(content.id, fallback.id)),
    title: stringValue(content.title, fallback.title),
    thumbnail:
      ['url', 'listingUrl', 'largeUrl', 'nHdUrl']
        .map((key) => thumbnail[key])
        .find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0) ??
      fallback.thumbnail,
    duration: numberValue(content.duration),
    commentCount: numberValue(count.comment),
    mylistCount: numberValue(count.mylist),
    viewCount: numberValue(count.view),
    likeCount: typeof count.like === 'number' && Number.isFinite(count.like) ? count.like : null,
    postedAt: stringValue(content.registeredAt, ''),
  };
}
