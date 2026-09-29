import type { Emitter } from '../../packages/lib/src/emitter';
import type { workerUtil } from '../../packages/lib/src/infra/worker-util';
import type { ThumbInfoData, ThumbOwnerInfo } from '../shared/external-api';

export interface ThumbOwnerWithLocale extends ThumbOwnerInfo {
  localeName?: string;
}
export type PocketThumbInfo = ThumbInfoData & { fromCache?: boolean };
export interface QueueInfoData {
  status?: unknown;
  code?: unknown;
  thumbnail?: string;
  title?: string;
  id?: string;
}
export interface NgItemCallbackData {
  watchId: string;
  info: QueueInfoData;
  isNg: boolean | undefined;
  isFav: boolean | undefined;
}
export type NgItemCallback = (item: HTMLElement, data: NgItemCallbackData) => unknown;
export interface NgObserveParams {
  query: string;
  container: Element | Element[] | null;
  closest?: string;
  subtree?: boolean;
  callback?: NgItemCallback;
}
export interface NgInitDomParams {
  intersectionObserver: IntersectionObserver;
  query: string;
  closest?: string | null;
  container?: Element | Element[] | null;
  subtree?: boolean;
}
export interface PocketConfigNamespace {
  props: Record<string, unknown>;
  on(event: string, listener: (...args: never[]) => void): unknown;
  onkey(key: string, listener: (value: unknown) => void): unknown;
  setValue(key: string, value: unknown): unknown;
  getValue(key: string): unknown;
  refresh(): unknown;
}
export interface PocketRootProps {
  mylist: { enableAutoComment: boolean };
  nicoad: { hide: boolean };
  responsive: { matrix: boolean };
  [key: string]: unknown;
}
export interface PocketDataStorage {
  props: PocketRootProps;
  namespace(name: string): PocketConfigNamespace;
  promise(name: string): Promise<unknown>;
  on(event: string, listener: (...args: never[]) => void): unknown;
  refresh(all?: boolean): unknown;
}
export interface PocketBroadcast {
  postMessage(...args: unknown[]): void;
}
export interface PocketUtil {
  mixin(self: Record<string, (...args: never[]) => unknown>, o: Record<string, (...args: never[]) => unknown>): void;
  attachShadowDom(params: { host: Element; tpl: HTMLTemplateElement; mode?: string }): ShadowRoot;
  httpLink(html: string): string;
  getSleepPromise(sleepTime: number, label?: string): (result: unknown) => Promise<unknown>;
  isFirefox(): boolean;
  getThumbnailUrlByVideoId(videoId: string): string | null;
  hasLargeThumbnail(videoId: string): boolean;
  escapeHtml(text: string): string;
  escapeRegs(text: string): string;
  emitter: InstanceType<typeof Emitter>;
  isLogin(): boolean;
  getWatchId(href: string): string | null;
  getPageLanguage(): string;
  addStyle(styles: string, option?: unknown): unknown;
  [key: string]: unknown;
}
export type PocketStorage = Storage & Record<string, string | undefined>;
export interface CacheItemData {
  expiredAt: unknown;
  data: unknown;
}
export interface FutatsumeExternalApi {
  sendOrExecCommand(name: string, param: unknown): unknown;
  execCommand(name: string, param: unknown): unknown;
  sendOrOpen(param: unknown): unknown;
  open(param: unknown): unknown;
  playlist: { insert(param: unknown): unknown; add(param: unknown): unknown };
  deflistAdd(params: unknown): unknown;
  deflistRemove(params: unknown): unknown;
}
export interface FutatsumeLike {
  emitter: InstanceType<typeof Emitter>;
  ready?: unknown;
  config: { getValue(key: string): unknown; setValue(key: string, value: unknown): void };
  external: FutatsumeExternalApi;
}
export interface PocketExternal {
  info(watchId: string): unknown;
  load(watchId: string): unknown;
  getFavStatus(watchId: string): unknown;
  observe(params: NgObserveParams): unknown;
  hide(): void;
}
export interface MylistPocketApi {
  debug: Record<string, unknown>;
  util: PocketUtil;
  emitter: InstanceType<typeof Emitter>;
  broadcast: PocketBroadcast | undefined;
  config: PocketDataStorage;
  external: PocketExternal;
  isReady?: boolean;
}
export interface PocketWindow {
  MylistPocket: MylistPocketApi;
  MylistPocketLib: { workerUtil: typeof workerUtil };
  FutatsumeWatch?: FutatsumeLike;
}
export interface GateApi {
  post(data: unknown, opts: { sessionId: unknown }): void;
  parseUrl(url: string): { hostname: string; pathname: string };
  uFetch(params: unknown, sessionId?: unknown): Promise<{ text(): Promise<string> }>;
  init(opts: { prefix: string; type: string }): { port: MessagePort; TOKEN: string | null };
}
export interface CrossDomainGateApi {
  fetch(resource: string, options?: unknown): Promise<ThumbInfoData>;
}
export interface ThumbGateOptions {
  expireTime?: number;
  credentials?: unknown;
  [key: string]: unknown;
}
export interface ThumbGateParams {
  url: string;
  options?: ThumbGateOptions;
}
export interface ThumbGateBody {
  command: string;
  params: ThumbGateParams;
}
export interface ThumbGateMessage {
  body: ThumbGateBody;
  sessionId: unknown;
  token: unknown;
}
export interface PocketWindowMessage {
  id?: unknown;
  body?: unknown;
  type?: unknown;
}
export interface PocketCommandResult {
  message?: string;
}
export type PocketDispatcher = (command: string, param: string | { value: string }, src?: unknown) => unknown;

export interface MatchCheckerInit {
  word?: string;
  tag?: string;
  owner?: string;
}

export interface MatchTargetData {
  tagList: (string | { text: string })[];
  owner: { type: string; id: string };
  title: string;
  description: string;
}

export interface PocketVideoOwner {
  type: string;
  id: string;
  linkId: string;
  name: string;
  icon: string;
}

export interface PocketVideoTag {
  text: string;
  isLocked: boolean;
}

export interface PocketVideoInfo {
  status: string;
  videoId: string;
  watchId: string;
  videoTitle: string | null;
  videoThumbnail: string;
  uploadDate: string | Date;
  duration: string;
  viewCounter: number;
  mylistCounter: number;
  commentCounter: number;
  description: string | null;
  lastResBody: string | null;
  isChannel: boolean;
  ownerId: string;
  ownerName: string;
  ownerIcon: string;
  tags: PocketVideoTag[];
  owner?: PocketVideoOwner;
}

export interface PocketMatchChecker {
  init(options: MatchCheckerInit): void;
  isMatch(data: MatchTargetData): boolean | undefined;
  isMatchTag(tag: string | { text: string }): boolean;
  isMatchOwner(owner: { type: string; id: string }): boolean;
}

export interface PocketNgChecker extends PocketMatchChecker {
  isNg(data: MatchTargetData): boolean | undefined;
}
