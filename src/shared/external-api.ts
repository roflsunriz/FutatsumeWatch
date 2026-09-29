/**
 * FutatsumeWatch から利用する外部サービスAPIの公開窓口。
 * 実装と通信契約は packages/lib の各クライアントに置き、src 内の呼び出し元はここから参照する。
 */
export { GateAPI } from '../../packages/lib/src/nico/gate-api';
export { LikeApi } from '../../packages/lib/src/nico/like-api';
export { getNicodicArticleExists } from '../../packages/lib/src/nico/nico-dic-api';
export * as loaders from '../../packages/lib/src/nico/loader';
export { CacheStorage } from '../../packages/lib/src/nico/loader';
export { CrossDomainGate } from '../../packages/lib/src/infra/cross-domain-gate';
export {
  CommonsTreeLoader,
  MatrixRankingLoader,
  MylistApiLoader,
  NicoRssLoader,
  NicoVideoApi,
  PlaybackPosition,
  PlaylistApiLoader,
  RecommendAPILoader,
  ThumbInfoLoader,
  VideoInfoLoader,
} from '../../packages/lib/src/nico/loader';
export { NicoSearchApiV2Loader } from '../../packages/lib/src/nico/video-search';
export { StoryboardInfoLoader } from '../../packages/lib/src/nico/storyboard-info-loader';
export { ThreadLoader } from '../../packages/lib/src/nico/thread-loader';
export type { CommentPostResult } from '../../packages/lib/src/nico/thread-loader';
export { VideoSessionWorker } from '../../packages/lib/src/nico/video-session-worker';
export type { SearchQueryParams } from '../../packages/lib/src/nico/video-search';
export { parseThumbInfo } from '../../packages/lib/src/nico/parse-thumb-info';
export type { ThumbInfoData, ThumbInfoOk, ThumbOwnerInfo } from '../../packages/lib/src/nico/parse-thumb-info';

export function fetchMylistTokenPage(): Promise<string> {
  return fetch('https://www.nicovideo.jp/mylist_add/video/sm9', {
    credentials: 'include',
    _format: 'text',
  } as RequestInit).then((response) => response.text());
}
