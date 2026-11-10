import type captured from './watch-response.json';

// 2026-11-10採取の公式HTMLのフィールド構造。値は既存の人工フィクスチャに置換する。
export function currentWatchV4Data(data: typeof captured.data.response, directHls = false) {
  return {
    responseType: 'normal',
    client: data.client,
    comment: {
      nvComment: data.comment.nvComment,
      threads: data.comment.threads.map(thread => ({
        id: thread.id, fork: thread.fork, forkLabel: thread.forkLabel,
        isPostTarget: thread.isDefaultPostTarget, isOwnerThread: thread.isOwnerThread,
      })),
      layers: data.comment.layers.map(layer => ({
        index: layer.index, isTranslucent: layer.isTranslucent,
        components: layer.threadIds.map(thread => ({ threadId: thread.id, fork: thread.fork, forkLabel: thread.forkLabel })),
      })),
      ng: { owner: data.comment.ng.owner, viewer: null },
    },
    media: {
      contents: { videos: data.media.domand.videos, audios: data.media.domand.audios },
      accessRightKey: data.media.domand.accessRightKey,
      isStoryboardAvailable: data.media.domand.isStoryboardAvailable,
      hls: directHls ? { url: `https://delivery.domand.nicovideo.jp/fixtures/${data.video.id}/master.m3u8` } : null,
    },
    video: {
      id: data.video.id, title: data.video.title, description: data.video.description,
      count: data.video.count, duration: data.video.duration, registeredAt: data.video.registeredAt,
      thumbnail: { normal: data.video.thumbnail.url, large: data.video.thumbnail.largeUrl, player: data.video.thumbnail.player },
      isLikedByViewer: data.video.viewer.like.isLiked,
    },
    tags: data.tag,
    genre: data.genre,
    payment: {
      ppv: { isEnabled: data.payment.video.isPpv },
      admission: { isEnabled: data.payment.video.isAdmission },
      premium: { isEnabled: data.payment.video.isPremium },
    },
    player: data.player,
    viewer: data.viewer,
    metadata: { jsonLd: { owner: { type: 'user', id: String(data.owner.id), name: data.owner.nickname, iconUrl: data.owner.iconUrl } } },
    lazy: { authKey: 'fixture-lazy-key' },
    okReason: 'PURELY',
  };
}

export function currentWatchV4Lazy(data: typeof captured.data.response) {
  return { meta: { status: 200 }, data: {
    owner: { visibility: 'visible', type: 'user', id: data.owner.id, nickname: data.owner.nickname, icon: { url: data.owner.iconUrl } },
    series: data.series,
  } };
}

export function watchHtml(response: object): string {
  const content = JSON.stringify(response).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return `<!doctype html><html><head><meta name="server-response" content="${content}"></head><body></body></html>`;
}
