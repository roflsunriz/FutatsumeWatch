export const isWatchRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// 2026-11-10の公式初期HTMLとwatch-v4 / PlayerCurrentTime資産で確認した構造。
// API発行のnvComment.params/threadKeyは加工せず、既存モデルとの境界だけを揃える。
export function normalizeWatchV4Data(
  data: Record<string, unknown>,
  lazy?: Record<string, unknown>
): Record<string, unknown> {
  if (!isWatchRecord(data.tags) || !isWatchRecord(data.video) || !isWatchRecord(data.comment)) return data;
  const video = data.video;
  const comment = data.comment;
  const thumbnail = isWatchRecord(video.thumbnail) ? video.thumbnail : {};
  const ng = isWatchRecord(comment.ng) ? comment.ng : {};
  const payment = isWatchRecord(data.payment) ? data.payment : {};
  const enabled = (key: string) => isWatchRecord(payment[key]) && payment[key].isEnabled === true;
  const media = isWatchRecord(data.media) ? data.media : {};
  const metadata = isWatchRecord(data.metadata) ? data.metadata : {};
  const jsonLd = isWatchRecord(metadata.jsonLd) ? metadata.jsonLd : {};
  const owner = lazy ? (isWatchRecord(lazy.owner) ? lazy.owner : {}) : isWatchRecord(jsonLd.owner) ? jsonLd.owner : {};
  const ownerIcon = isWatchRecord(owner.icon) ? owner.icon.url : owner.iconUrl;
  const visibleOwner =
    (lazy ? owner.visibility === 'visible' : true) && (typeof owner.id === 'string' || typeof owner.id === 'number');
  const threads = Array.isArray(comment.threads) ? comment.threads.filter(isWatchRecord) : [];
  const layers = Array.isArray(comment.layers) ? comment.layers.filter(isWatchRecord) : [];
  const contents = isWatchRecord(media.contents) ? media.contents : null;
  return {
    ...data,
    series: lazy && 'series' in lazy ? lazy.series : data.series,
    video: {
      ...video,
      thumbnail: {
        ...thumbnail,
        url: thumbnail.normal ?? thumbnail.url,
        largeUrl: thumbnail.large ?? thumbnail.largeUrl,
      },
      viewer: { like: { isLiked: video.isLikedByViewer === true } },
    },
    comment: {
      ...comment,
      keys: comment.keys ?? { userKey: '' },
      server: comment.server ?? { url: '' },
      ng: {
        ...ng,
        channel: Array.isArray(ng.channel) ? ng.channel : [],
        owner: Array.isArray(ng.owner) ? ng.owner : [],
      },
      threads: threads.map((thread) => ({
        ...thread,
        isDefaultPostTarget: thread.isPostTarget === true,
      })),
      layers: layers.map((layer) => ({
        ...layer,
        threadIds: Array.isArray(layer.components)
          ? layer.components.filter(isWatchRecord).map((component) => ({ ...component, id: component.threadId }))
          : layer.threadIds,
      })),
    },
    media: {
      ...media,
      ...(contents
        ? {
            domand: {
              ...contents,
              accessRightKey: media.accessRightKey,
              isStoryboardAvailable: media.isStoryboardAvailable,
            },
          }
        : {}),
    },
    tag: data.tags,
    external: data.external ?? { commons: { hasContentTree: false } },
    payment: {
      ...payment,
      video: payment.video ?? {
        isAdmission: enabled('admission'),
        isPpv: enabled('ppv'),
        isPremium: enabled('premium'),
      },
    },
    owner:
      visibleOwner && owner.type === 'user'
        ? { ...owner, nickname: owner.nickname ?? owner.name, iconUrl: ownerIcon }
        : null,
    channel: visibleOwner && owner.type === 'channel' ? { ...owner, thumbnail: { url: ownerIcon } } : null,
  };
}
