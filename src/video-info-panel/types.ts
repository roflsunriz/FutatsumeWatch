import type { Emitter } from '../../packages/lib/src/emitter';
import type { TagListTagData } from '../tags/tag-list-view';
export interface VideoOwnerInfo {
  icon: string;
  url: string;
  name: string;
  id: string;
}
export interface VideoSeriesItem {
  id: string;
}
export interface VideoSeriesVideo {
  prev: VideoSeriesItem | null;
  next: VideoSeriesItem | null;
}
export interface VideoSeriesInfo {
  title: string;
  thumbnailUrl?: string;
  video: VideoSeriesVideo;
  [key: string]: unknown;
}
export interface VideoCountInfo {
  comment?: number;
  view?: number;
  mylist?: number;
}
export interface VideoInfoModel {
  owner: VideoOwnerInfo;
  title: string;
  description: string;
  series: VideoSeriesInfo | null;
  tagList: TagListTagData[];
  watchId: string;
  videoId: string;
  csrfToken: string;
  isCommunityVideo: boolean;
  isMymemory: boolean;
  isChannel: boolean;
  hasParentVideo: boolean;
  postedAt: string | number;
  count: VideoCountInfo;
  getCurrentVideo: () => Promise<string>;
}
export interface VideoInfoPanelParams {
  dialog: InstanceType<typeof Emitter>;
  node?: Element | null;
}
export interface VideoSearchProps {
  ownerOnly: boolean;
  mode: unknown;
  word: string;
  sort: string;
  [key: string]: unknown;
}
export interface VideoSearchFormControls {
  ownerOnly: HTMLInputElement;
  mode: RadioNodeList | HTMLInputElement;
  word: HTMLInputElement;
  sort: HTMLSelectElement;
  [name: string]: HTMLInputElement | HTMLSelectElement | RadioNodeList;
}
export interface VideoSearchFormInit {
  parentNode?: Element | DocumentFragment | null;
}
export interface RelatedMenuParams {
  parentNode: Element | null;
  isHeader?: boolean;
}
export type RelatedMenuElm = {
  body: Element;
  summary: Element;
};
export type VideoMetaElm = {
  postedAt: Element | null;
  body: Element | null;
  viewCount: Element | null;
  commentCount: Element | null;
  mylistCount: Element | null;
};
export interface PocketApi {
  external: { info(param: unknown): void };
}
export interface RecommendVideoInfoLike {
  watchId: unknown;
  contextWatchId: unknown;
  title: unknown;
  duration: unknown;
  count: { comment: unknown; mylist: unknown; view: unknown };
  thumbnail: unknown;
  postedAt: unknown;
  owner: unknown;
}
export interface UqRafHandle {
  addClass(className: string): UqResult;
  removeClass(className: string): UqResult;
  css(name: string, value: string): UqResult;
}
export type UqAppendContent = string | Element | DocumentFragment | UqResult | null | undefined;
export interface UqResult<TElement extends Element = Element> {
  readonly length: number;
  [index: number]: TElement;
  [Symbol.iterator](): ArrayIterator<TElement>;
  find(selector: string): UqResult;
  query<TQuery extends Element = Element>(selector: string): UqResult<TQuery>;
  attr(name: string, value: string): UqResult<TElement>;
  text(): string;
  text(value: string): UqResult<TElement>;
  addClass(className: string): UqResult<TElement>;
  removeClass(className: string): UqResult<TElement>;
  append(content: UqAppendContent): UqResult<TElement>;
  appendTo(target: string | Element | null | undefined): UqResult<TElement>;
  on(name: string, callback: (event: Event) => void, options?: AddEventListenerOptions): UqResult<TElement>;
  html(): string;
  raf: UqRafHandle;
}
export interface UqStatic {
  (target: string | Element | null | undefined): UqResult;
  html(template: string): UqResult;
  ready(): Promise<void>;
}
