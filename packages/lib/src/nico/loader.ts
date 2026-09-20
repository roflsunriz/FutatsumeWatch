import { CacheStorage } from '../infra/cache-storage';
import { NicoRssLoader } from './nico-rss-loader';
import { MatrixRankingLoader } from './matrix-ranking-loader';
import { UaaLoader } from './uaa-loader';
import { CommonsTreeLoader } from './commons-tree-loader';
import { CrossDomainGate } from '../infra/cross-domain-gate';
import { RecommendAPILoader } from './recommend-api-loader';
import { NVWatchCaller } from './nv-watch-caller';
import { PlaybackPosition } from './playback-position';
import { VideoInfoLoader } from './video-info-loader';
import { ThumbInfoLoader } from './thumb-info-loader';
import { MylistApiLoader } from './mylist-api-loader';
import { PlaylistApiLoader } from './playlist-api-loader';
import { NicoVideoApi } from './nico-video-api';

//===BEGIN===
//@require cache-storage
//@require video-info-loader
//@require thumb-info-loader
//@require playlist-api-loader
//@require mylist-api-loader
//@require nico-rss-loader
//@require matrix-ranking-loader
//@require commons-tree-loader
//@require uaa-loader
//@require recommend-api-loader
//@require nv-watch-caller
//@require playback-position
//@require cross-domain-gate
//@require nico-video-api

//===END===

export {
  VideoInfoLoader,
  ThumbInfoLoader,
  PlaylistApiLoader,
  MylistApiLoader,
  CacheStorage,
  CrossDomainGate,
  UaaLoader,
  PlaybackPosition,
  NicoVideoApi,
  RecommendAPILoader,
  NVWatchCaller,
  CommonsTreeLoader,
  NicoRssLoader,
  MatrixRankingLoader,
};
