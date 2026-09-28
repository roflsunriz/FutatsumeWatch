import type { Comment, CommentRenderer } from 'comment-overlay';

// 投稿者の @秒 指定だけを補う。通常コメントの時刻・配置はnpmへ任せる。
// 保存HTMLへも埋め込むため、この関数は外部の変数に依存しない。
export function installCommentDurations(renderer: CommentRenderer): Map<Comment, number> {
  const durations = new Map<Comment, number>();
  const candidates = renderer.getCommentsInTimeWindow.bind(renderer);
  const shouldActivate = renderer.shouldActivateCommentAtTime.bind(renderer);
  const activate = renderer.activateComment.bind(renderer);
  const reserve = renderer.reserveStaticLane.bind(renderer);
  const update = renderer.updateComments.bind(renderer);
  renderer.getCommentsInTimeWindow = (time, window) => {
    const result = new Set(candidates(time, window));
    for (const [comment, duration] of durations) {
      const begin = renderer.getEffectiveCommentVpos(comment);
      if (!comment.isScrolling && begin <= time + window && begin + duration > time - window) result.add(comment);
    }
    return [...result];
  };
  renderer.shouldActivateCommentAtTime = (comment, time, preview) => {
    const duration = durations.get(comment);
    if (duration === undefined || comment.isScrolling) return shouldActivate(comment, time, preview);
    const begin = renderer.getEffectiveCommentVpos(comment);
    return (
      !comment.isInvisible && !comment.isActive && !comment.hasShown && begin <= time + 50 && time < begin + duration
    );
  };
  renderer.reserveStaticLane = (position, comment, lane, release) => {
    const duration = durations.get(comment);
    reserve(
      position,
      comment,
      lane,
      duration === undefined ? release : renderer.getEffectiveCommentVpos(comment) + duration
    );
  };
  renderer.activateComment = (comment, context, width, height, options, time) => {
    activate(comment, context, width, height, options, time);
    const duration = durations.get(comment);
    if (duration !== undefined && !comment.isScrolling) {
      comment.staticExpiryTimeMs = renderer.getEffectiveCommentVpos(comment) + duration;
      comment.visibleDurationMs = Math.max(0, comment.staticExpiryTimeMs - time);
    }
  };
  renderer.updateComments = (time) => {
    // npmの通常9秒窓による破棄から長時間固定だけを保護する。
    const extended = [...renderer.activeComments].filter((comment) => !comment.isScrolling && durations.has(comment));
    for (const comment of extended) renderer.activeComments.delete(comment);
    update(time);
    for (const comment of extended) {
      if (comment.isActive && !comment.hasStaticExpired(renderer.currentTime)) renderer.activeComments.add(comment);
    }
  };
  return durations;
}
