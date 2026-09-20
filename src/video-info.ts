import _ from 'lodash';
import { PromiseHandler } from '../packages/lib/src/emitter';
import type { AnyPromiseHandler } from '../packages/lib/src/emitter';

//===BEGIN===
interface DomandQualityItem {
  id: string;
  qualityLevel: number;
  isAvailable: boolean;
}

interface DomandVideoItem extends DomandQualityItem {
  height: number;
  label?: string;
}

interface DmcAudioItem {
  id: string;
  isAvailable: boolean;
  metadata: { levelIndex: number };
}

interface DmcVideoItem {
  id: string;
  isAvailable: boolean;
  metadata: { levelIndex: number; resolution: { height: number } };
}

interface DmcSession {
  urls: { url: string }[];
  signature: string;
  token: string;
  serviceUserId: string;
  contentId: string;
  playerId: string;
  recipeId: string;
  protocols?: string[];
  contentKeyTimeout?: number;
  priority: number;
  authTypes: string[];
  transferPresets?: string[];
  heartbeatLifetime?: number;
}

interface DmcMovieData {
  movie: {
    session: DmcSession;
    audios: DmcAudioItem[];
    videos: DmcVideoItem[];
  };
  storyboard?: { session: StoryboardSessionData };
  import_version?: number;
  trackingId?: string;
  encryption?: string | null;
}

interface StoryboardSessionData {
  [key: string]: unknown;
}

interface DomandRawData {
  accessRightKey?: string;
  audios: DomandQualityItem[];
  videos: DomandVideoItem[];
  isStoryboardAvailable: boolean;
}

interface LinkedChannelVideo {
  linkedVideoId: string;
}

interface VideoDetail {
  id: string;
  v: string;
  title: string;
  title_original?: string;
  description?: string;
  description_original?: string;
  postedAt: string;
  thumbnail: string;
  largeThumbnnail?: string;
  tagList: { name?: string }[];
  tagEdit: unknown;
  width: string | number;
  height: string | number;
  length: number;
  commentCount: number;
  mylistCount: number;
  viewCount: number;
  likeCount?: number;
  channelId?: string | number | null;
  isMymemory?: boolean | null;
  communityId?: string | number | null;
  isLiked?: boolean;
  commons_tree_exists?: boolean;
}

interface WatchApiData {
  videoDetail: VideoDetail;
  viewerInfo?: unknown;
  channelInfo?: ChannelOrUploaderInfo;
  uploaderInfo?: ChannelOrUploaderInfo;
  clientTrackId: string;
}

interface ChannelOrUploaderInfo {
  iconUrl?: string;
  id?: string | number;
  linkId?: string;
  name?: string;
}

interface MessageInfo {
  threadId: string | number;
}

interface NgFilterItem {
  source?: string;
  destination?: string;
}

interface ResumeCacheEntry {
  now: string | number;
  time: number;
}

interface RelatedVideoItem {
  id: string;
  [key: string]: unknown;
}

interface SeriesVideoSummary {
  id?: string;
  title?: string;
}

interface SeriesData {
  id: string;
  thumbnailUrl?: string;
  video: {
    first?: SeriesVideoSummary | null;
    prev?: SeriesVideoSummary | null;
    next?: SeriesVideoSummary | null;
  };
}

interface RawVideoInfoData {
  watchApiData: WatchApiData;
  viewerInfo: unknown;
  ngFilters: NgFilterItem[];
  msgInfo: MessageInfo;
  dmcInfo?: (Omit<Partial<DmcMovieData>, 'movie'> & { movie?: Partial<DmcMovieData['movie']> }) | null;
  domandInfo?: DomandRawData;
  linkedChannelVideo?: LinkedChannelVideo | null;
  playlist: { playlist?: RelatedVideoItem[] };
  playlistToken: string;
  watchAuthKey: string;
  seekToken: string;
  resumeInfo?: { initialPlaybackPosition?: number };
  thumbnail: string;
  series?: SeriesData;
  community?: { id?: string; name?: string };
  csrfToken?: string;
  isDomand: boolean;
  isDmc: boolean;
}
//
class JSONable {
  toJSON(): Record<string, unknown> {
    const data: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const proto: object = Object.getPrototypeOf(this) as object;

    for (const prop of Object.getOwnPropertyNames(proto)) {
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (typeof desc?.get !== 'function') continue;

      const self = this as unknown as Record<string, unknown>;
      const value: unknown = (data[prop] = self[prop]);
      if (value === null || value === undefined) continue;

      const toJSON = (value as { toJSON?: unknown }).toJSON;
      if (typeof toJSON !== 'function') continue;

      data[prop] = toJSON.call(value);
    }

    return data;
  }
}

class DomandInfo extends JSONable {
  private readonly _rawData: DomandRawData;
  private readonly _videoDetail: VideoDetail;
  private readonly _linkedChannelVideo: LinkedChannelVideo | null | undefined;
  constructor(rawData: DomandRawData, videoDetail: VideoDetail, linkedChannelVideo?: LinkedChannelVideo | null) {
    super();
    this._rawData = rawData;
    this._videoDetail = videoDetail;
    this._linkedChannelVideo = linkedChannelVideo;
  }

  get videoId(): string {
    return this._linkedChannelVideo != null ? this._linkedChannelVideo.linkedVideoId : this._videoDetail.id;
  }

  get accessRightKey(): string {
    return this._rawData.accessRightKey || '';
  }

  get audios(): DomandQualityItem[] {
    // 履歴的経緯: 真偽値を返す比較（1/0のみ）。順序は現行通り温存する。
    return this._rawData.audios.toSorted((a, b) => (b.qualityLevel > a.qualityLevel ? 1 : 0));
  }

  get availableAudios(): DomandQualityItem[] {
    return this.audios.filter((a) => a.isAvailable);
  }

  get availableAudioIds(): string[] {
    return this.availableAudios.map((a) => a.id);
  }

  get videos(): DomandVideoItem[] {
    return this._rawData.videos
      .toSorted((a, b) => b.qualityLevel - a.qualityLevel)
      .map((video) => ({ ...video, label: video.label ?? `${video.height}p` }));
  }

  get availableVideos(): DomandVideoItem[] {
    return this.videos.filter((v) => v.isAvailable);
  }

  get availableVideoIds(): string[] {
    return this.availableVideos.map((v) => v.id);
  }

  get isStoryboardAvailable(): boolean {
    return this._rawData.isStoryboardAvailable;
  }
}

class DmcInfo extends JSONable {
  private readonly _rawData: DmcMovieData;
  private readonly _session: DmcSession;
  constructor(rawData: DmcMovieData) {
    super();
    this._rawData = rawData;
    this._session = rawData.movie.session;
  }

  get apiUrl(): string {
    return this._session.urls[0]!.url;
  }

  get urls(): { url: string }[] {
    return this._session.urls;
  }

  get audios(): DmcAudioItem[] {
    // 履歴的経緯: 真偽値を返す比較（1/0のみ）。順序は現行通り温存する。
    return this._rawData.movie.audios.toSorted((a, b) => (b.metadata.levelIndex > a.metadata.levelIndex ? 1 : 0));
  }

  get availableAudios(): DmcAudioItem[] {
    return this.audios.filter((a) => a.isAvailable);
  }

  get availableAudioIds(): string[] {
    return this.availableAudios.map((a) => a.id);
  }

  get videos(): DmcVideoItem[] {
    // 履歴的経緯: 真偽値を返す比較（1/0のみ）。順序は現行通り温存する。
    return this._rawData.movie.videos.toSorted((a, b) => (b.metadata.levelIndex > a.metadata.levelIndex ? 1 : 0));
  }

  get availableVideos(): DmcVideoItem[] {
    return this.videos.filter((v) => v.isAvailable);
  }

  get availableVideoIds(): string[] {
    return this.availableVideos.map((v) => v.id);
  }

  get signature(): string {
    return this._session.signature;
  }

  get token(): string {
    return this._session.token;
  }

  get serviceUserId(): string {
    return this._session.serviceUserId;
  }

  get contentId(): string {
    return this._session.contentId;
  }

  get playerId(): string {
    return this._session.playerId;
  }

  get recipeId(): string {
    return this._session.recipeId;
  }

  get protocols(): string[] {
    return this._session.protocols ?? [];
  }

  get isHLSRequired(): boolean {
    return !this.protocols.includes('http');
  }

  get contentKeyTimeout(): number {
    // 重複定義の後勝ち（フォールバック付き）が現行動作のため、こちらに一本化する。
    return this._session.contentKeyTimeout || 600 * 1000;
  }

  get priority(): number {
    return this._session.priority;
  }

  get authTypes(): string[] {
    return this._session.authTypes;
  }

  get videoFormatList(): DmcVideoItem[] {
    return (this.videos || []).concat();
  }

  get hasStoryboard(): boolean {
    return !!this._rawData.storyboard;
  }

  get storyboardInfo(): StoryboardSessionData | null {
    const storyboard = this._rawData.storyboard;
    return storyboard == null ? null : storyboard.session;
  }

  get transferPreset(): string {
    return (this._session.transferPresets || [''])[0] || '';
  }

  get heartbeatLifetime(): number {
    return this._session.heartbeatLifetime || 120 * 1000;
  }

  get importVersion(): number {
    return this._rawData.import_version || 0;
  }

  get trackingId(): string {
    return this._rawData.trackingId || '';
  }

  get encryption(): string | null {
    return this._rawData.encryption || null;
  }
}

class VideoFilter {
  private _ngOwner: string[] = [];
  private _ngTag: string[] = [];
  constructor(ngOwner: string | string[], ngTag: string | string[]) {
    this.ngOwner = ngOwner;
    this.ngTag = ngTag;
  }

  get ngOwner(): string[] {
    return this._ngOwner || [];
  }

  set ngOwner(owner: string | string[]) {
    const list: string[] = [];
    const owners: string[] = _.isArray(owner) ? owner : owner.toString().split(/[\r\n]/);
    owners.forEach((o) => {
      list.push(o.replace(/#.*$/, '').trim());
    });
    this._ngOwner = list;
  }

  get ngTag(): string[] {
    return this._ngTag || [];
  }

  set ngTag(tag: string | string[]) {
    const list: string[] = [];
    const tags: string[] = Array.isArray(tag) ? tag : tag.toString().split(/[\r\n]/);
    tags.forEach((t) => {
      list.push(t.toLowerCase().trim());
    });
    this._ngTag = list;
  }

  isNgVideo(videoInfo: { isChannel: boolean; tagList: { name?: string }[]; owner: { id?: string } }): boolean {
    let isNg = false;
    const ngTag = this.ngTag;

    videoInfo.tagList.forEach((tag) => {
      const text = (tag.name ?? '').toLowerCase();
      if (ngTag.includes(text)) {
        isNg = true;
      }
    });
    if (isNg) {
      return true;
    }

    const owner = videoInfo.owner;
    const ownerId = owner.id;
    if (ownerId !== undefined && ownerId !== '' && this.ngOwner.includes(ownerId)) {
      isNg = true;
    }

    return isNg;
  }
}

interface VideoOwner {
  type: 'channel' | 'user';
  url: string;
  icon: string;
  id?: string | number;
  linkId: string;
  name?: string;
}

interface VideoCount {
  comment: number;
  mylist: number;
  view: number;
  like?: number;
}

interface VideoSize {
  width: number | string;
  height: number | string;
}

class VideoInfoModel extends JSONable {
  private _rawData!: RawVideoInfoData;
  private _cacheData!: { resume?: ResumeCacheEntry[] };
  private _watchApiData!: WatchApiData;
  private _videoDetail!: VideoDetail;
  private _viewerInfo!: unknown;
  private _ngFilters!: NgFilterItem[];
  private _msgInfo!: MessageInfo;
  private _dmcInfo!: DmcInfo | null;
  private _domandInfo!: DomandInfo | null;
  private _relatedVideo!: { playlist?: RelatedVideoItem[] };
  private _playlistToken!: string;
  private _watchAuthKey!: string;
  private _seekToken!: string;
  private _resumeInfo!: { initialPlaybackPosition?: number };
  private _currentVideo!: unknown;
  private _currentVideoPromise!: AnyPromiseHandler | null;
  constructor(videoInfoData: RawVideoInfoData, localCacheData: { resume?: ResumeCacheEntry[] } = {}) {
    super();
    this._update(videoInfoData, localCacheData);
    this._currentVideoPromise = null;
  }

  update(videoInfoModel: VideoInfoModel): boolean {
    this._update(videoInfoModel._rawData);
    return true;
  }

  _update(info: RawVideoInfoData, localCacheData: { resume?: ResumeCacheEntry[] } = {}): boolean {
    this._rawData = info;
    this._cacheData = localCacheData;
    this._watchApiData = info.watchApiData;
    this._videoDetail = info.watchApiData.videoDetail;
    this._viewerInfo = info.viewerInfo; // 閲覧者(＝おまいら)の情報
    this._ngFilters = info.ngFilters;
    this._msgInfo = info.msgInfo;
    this._dmcInfo =
      info.dmcInfo != null && info.dmcInfo.movie?.session !== undefined
        ? new DmcInfo(info.dmcInfo as DmcMovieData)
        : null;
    this._domandInfo =
      info.domandInfo != null
        ? new DomandInfo(info.domandInfo, info.watchApiData.videoDetail, info.linkedChannelVideo)
        : null;
    this._relatedVideo = info.playlist; // playlistという名前だが実質は関連動画
    this._playlistToken = info.playlistToken;
    this._watchAuthKey = info.watchAuthKey;
    this._seekToken = info.seekToken;
    this._resumeInfo = info.resumeInfo ?? {};
    this._currentVideo = null;
    this._currentVideoPromise = null;
    return true;
  }

  get title(): string {
    return this._videoDetail.title_original || this._videoDetail.title;
  }

  get description(): string {
    return this._videoDetail.description || '';
  }

  /**
   * マイリスト等がリンクになっていない物
   */
  get descriptionOriginal(): string | undefined {
    return this._videoDetail.description_original;
  }

  get postedAt(): string {
    return this._videoDetail.postedAt;
  }

  get thumbnail(): string | undefined {
    return this._videoDetail.thumbnail;
  }

  /**
   * 大きいサムネがあればそっちを返す
   */
  get betterThumbnail(): string {
    return this._rawData.thumbnail;
  }

  get largeThumbnnail(): string | undefined {
    return this._videoDetail.largeThumbnnail;
  }

  /**
   * @return Promise
   */
  getCurrentVideo(): AnyPromiseHandler {
    if (this._currentVideoPromise !== null) {
      return this._currentVideoPromise;
    }
    const handler = new PromiseHandler();
    this._currentVideoPromise = handler;
    return handler;
  }

  setCurrentVideo(v: unknown): void {
    this._currentVideo = v;
    if (this._currentVideoPromise !== null) {
      void this._currentVideoPromise.resolve(v);
    }
  }

  get tagList(): { name?: string }[] {
    return this._videoDetail.tagList;
  }

  get tagEdit(): unknown {
    return this._videoDetail.tagEdit;
  }

  getVideoId(): string {
    // sm12345
    return this.videoId;
  }

  get videoId(): string {
    return this._videoDetail.id;
  }

  get originalVideoId(): string {
    return this.isMymemory || this.isCommunityVideo ? this.videoId : '';
  }

  getWatchId(): string {
    // sm12345だったりスレッドIDだったり
    return this.watchId;
  }

  get watchId(): string {
    if (this.videoId.substring(0, 2) === 'so') {
      return this.videoId;
    }
    return this._videoDetail.v;
  }

  get contextWatchId(): string {
    return this._videoDetail.v;
  }

  get watchUrl(): string {
    return `https://www.nicovideo.jp/watch/${this.watchId}`;
  }

  get threadId(): string | number {
    // watchIdと同一とは限らない
    return this._msgInfo.threadId;
  }

  get videoSize(): VideoSize {
    return {
      width: this._videoDetail.width,
      height: this._videoDetail.height,
    };
  }

  get duration(): number {
    return this._videoDetail.length;
  }

  get count(): VideoCount {
    const vd = this._videoDetail;
    return {
      comment: vd.commentCount,
      mylist: vd.mylistCount,
      view: vd.viewCount,
      like: vd.likeCount,
    };
  }

  get isChannel(): boolean {
    return !!this._videoDetail.channelId;
  }

  get isMymemory(): boolean {
    return !!this._videoDetail.isMymemory;
  }

  get isCommunityVideo(): boolean {
    return !!(!this.isChannel && this._videoDetail.communityId);
  }

  get isLiked(): boolean {
    return !!this._videoDetail.isLiked;
  }
  set isLiked(v: boolean) {
    this._videoDetail.isLiked = v;
  }

  get hasParentVideo(): boolean {
    return !!this._videoDetail.commons_tree_exists;
  }

  get isHLSRequired(): boolean {
    if (this.isDmcAvailable) {
      return this.dmcInfo!.isHLSRequired;
    } else {
      return this.isDomandAvailable;
    }
  }

  get actionTrackId(): string {
    return this._watchApiData.clientTrackId;
  }

  get isDomandAvailable(): boolean {
    return this._rawData.isDomand;
  }

  get isDmcAvailable(): boolean {
    return this._rawData.isDmc;
  }

  get domandInfo(): DomandInfo | null {
    return this._domandInfo;
  }

  get dmcInfo(): DmcInfo | null {
    return this._dmcInfo;
  }

  get msgInfo(): MessageInfo {
    return this._msgInfo;
  }

  get isDomandOnly(): boolean {
    return this.isDomandAvailable && !this.isDmcAvailable;
  }

  get isDmcOnly(): boolean {
    return this.isDmcAvailable && !this.isDomandAvailable;
  }

  get hasDomandStoryboard(): boolean {
    return this._domandInfo?.isStoryboardAvailable ?? false;
  }

  get hasDmcStoryboard(): boolean {
    return this._dmcInfo?.hasStoryboard ?? false;
  }

  get dmcStoryboardInfo(): StoryboardSessionData | null {
    return this.hasDmcStoryboard ? this._dmcInfo!.storyboardInfo : null;
  }

  get hasStoryboard(): boolean {
    return this.hasDomandStoryboard || this.hasDmcStoryboard;
  }

  /**
   * 投稿者の情報
   * チャンネル動画かどうかで分岐
   */
  get owner(): VideoOwner {
    if (this.isChannel) {
      const {
        iconUrl: icon = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
        id,
        linkId = '',
        name,
      } = { ...this._watchApiData.channelInfo };
      return {
        type: 'channel',
        url: `https://ch.nicovideo.jp/${linkId}`,
        icon,
        id,
        linkId,
        name,
      };
    } else {
      // 退会しているユーザーだと空になっている
      const {
        iconUrl: icon = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
        id,
        linkId = '',
        name = '(非公開ユーザー)',
      } = { ...this._watchApiData.uploaderInfo };
      return {
        type: 'user',
        url: id ? `https://www.nicovideo.jp/${linkId}` : '#',
        icon,
        id,
        linkId,
        name,
      };
    }
  }

  get series(): (SeriesData & { thumbnailUrl: string }) | null {
    const series = this._rawData.series;
    if (!series || !series.id) {
      return null;
    }
    const thumbnailUrl = series.thumbnailUrl || this.betterThumbnail;
    return Object.assign({}, series, { thumbnailUrl });
  }

  get firstVideo(): SeriesVideoSummary | null | undefined {
    return this.series ? this.series.video.first : null;
  }

  get prevVideo(): SeriesVideoSummary | null | undefined {
    return this.series ? this.series.video.prev : null;
  }

  get nextVideo(): SeriesVideoSummary | null | undefined {
    return this.series ? this.series.video.next : null;
  }

  get relatedVideoItems(): RelatedVideoItem[] {
    return this._relatedVideo.playlist ?? [];
  }

  get replacementWords(): Record<string, string> {
    return this._ngFilters.reduce<Record<string, string>>(
      (acc, ng) => {
        if (ng.source != null && ng.destination != null) {
          acc[ng.source] = ng.destination;
        }
        return acc;
      },
      Object.create({}) as Record<string, string>
    );
  }

  get playlistToken(): string {
    return this._playlistToken;
  }

  set playlistToken(v: string) {
    this._playlistToken = v;
  }

  get watchAuthKey(): string {
    return this._watchAuthKey;
  }

  set watchAuthKey(v: string) {
    this._watchAuthKey = v;
  }

  get seekToken(): string {
    return this._seekToken;
  }

  get width(): number {
    return parseInt(String(this._videoDetail.width), 10);
  }

  get height(): number {
    return parseInt(String(this._videoDetail.height), 10);
  }

  get initialPlaybackTime(): number {
    return this.resumePoints[0]?.time ?? 0;
  }

  get resumePoints(): { now: string; time: number }[] {
    const duration = this.duration;
    const MARGIN = 10;
    const resumePoints = (this._cacheData && this._cacheData.resume ? this._cacheData.resume : [])
      .filter(({ time }) => time > MARGIN && time < duration - MARGIN)
      .map(({ now, time }) => {
        return { now: new Date(now).toLocaleString(), time };
      });
    const lastResumePoint = this._resumeInfo ? this._resumeInfo.initialPlaybackPosition : 0;

    if (lastResumePoint) {
      resumePoints.unshift({ now: '前回', time: lastResumePoint });
    }
    return resumePoints;
  }

  get csrfToken(): string {
    return this._rawData.csrfToken || '';
  }

  get extension(): string {
    if (this.isDomandAvailable || this.isDmcAvailable) {
      return 'mp4';
    }
    return 'unknown';
  }

  get community(): { id?: string; name?: string } | null {
    return this._rawData.community ?? null;
  }

  get maybeBetterQualityServerType(): string {
    if (this.isDomandOnly) {
      return 'domand';
    }
    if (this.isDmcOnly) {
      return 'dmc';
    }
    if (!this.isDmcAvailable) {
      return 'domand';
    }
    if (!this.isDomandAvailable) {
      return 'dmc';
    }

    const highestDomand = Math.max(
      ...this.domandInfo!.availableVideos.map((v) => {
        return v.height;
      })
    );

    const highestDmc = Math.max(
      ...this.dmcInfo!.availableVideos.map((v) => {
        return v.metadata.resolution.height;
      })
    );

    // Domandのほうが高解像度を持っているなら恐らくDomand側が高画質
    if (highestDomand >= highestDmc) {
      return 'domand';
    }

    // それ以外はdmc
    return 'dmc';
  }
}

//===END===

export { DmcInfo, VideoInfoModel, VideoFilter };
export type { RawVideoInfoData, VideoDetail, MessageInfo, ResumeCacheEntry };
