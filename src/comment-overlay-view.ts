import { CommentRenderer, cloneDefaultSettings } from 'comment-overlay';
import type { Comment, RendererSettings } from 'comment-overlay';
import { installCommentDurations } from './comment-overlay-timing';
import { Config } from './config';
import type { NicoComment } from '../packages/futatsume/src/commentLayer/nico-comment';
import { overlayEntry, decorateOverlayComment, commentPresentation } from './comment-overlay-data';
import { exportCommentHtml, exportCommentXml } from './comment-overlay-export';

export interface CommentMedia {
  readonly currentTime: number;
  readonly duration: number;
  readonly playbackRate: number;
  readonly paused: boolean;
}
interface ViewOptions {
  media?: CommentMedia;
  showComment?: boolean;
  playbackRate?: number;
  commentOpacity?: number;
}

export class CommentOverlayView {
  renderer: CommentRenderer | null = null;
  readonly element = document.createElement('div');
  private readonly surface = document.createElement('div');
  private readonly clock = document.createElement('video');
  private readonly media: CommentMedia;
  private attached = false;
  private closed = true;
  private durations = new Map<Comment, number>();
  private ratio = 16 / 9;
  _isShow: boolean;
  playbackRate: number;

  constructor(
    private readonly model: NicoComment,
    options: ViewOptions
  ) {
    this._isShow = options.showComment ?? true;
    this.playbackRate = options.playbackRate ?? 1;
    this.media = options.media ?? {
      get currentTime() {
        return model.currentTime;
      },
      duration: 0,
      playbackRate: this.playbackRate,
      paused: true,
    };
    this.element.className = 'commentLayerFrame futatsume-comment-overlay';
    this.element.dataset.commentEngine = 'comment-overlay';
    Object.assign(this.element.style, {
      position: 'absolute',
      inset: '0',
      margin: 'auto',
      overflow: 'hidden',
      pointerEvents: 'none',
      containerType: 'size',
    });
    Object.assign(this.surface.style, { position: 'absolute', inset: '0', margin: 'auto', overflow: 'hidden' });
    this.element.append(this.surface);
    // 実videoがshadow DOM内にあり、YouTubeでは別の時計になるため、
    // 動画を再生しないHTMLVideoElementでプレイヤー共通の時刻とイベントを渡す。
    for (const key of ['currentTime', 'duration', 'playbackRate', 'paused'] as const) {
      Object.defineProperty(this.clock, key, { get: () => this.media[key] });
    }
    this.clock.getBoundingClientRect = () => this.surface.getBoundingClientRect();
    for (const key of [
      'commentLayerOpacity',
      'commentSpeedRate',
      'autoCommentSpeedRate',
      'playbackRate',
      'baseFontFamily',
      'baseFontBolder',
      'baseChatScale',
      'backComment',
      'commentLayer.textShadowType',
      'commentLayer.easyCommentOpacity',
      'commentLayer.aiCommentOpacity',
      'commentLayer.ownerCommentShadowColor',
    ] as const)
      Config.onkey(key, () => this.refresh());
  }
  private settings(): RendererSettings {
    const settings = cloneDefaultSettings();
    settings.isCommentVisible = this._isShow;
    settings.useContainerResizeObserver = true;
    settings.commentOpacity = Number(Config.props.commentLayerOpacity);
    const rate =
      Math.max(0.1, Number(Config.props.commentSpeedRate)) /
      (Config.props.autoCommentSpeedRate ? Math.max(this.media.playbackRate, 1) : 1);
    settings.scrollVisibleDurationMs = rate === 1 ? null : 4000 / rate;
    const shadow = Config.props['commentLayer.textShadowType'];
    settings.shadowIntensity = shadow === 'shadow-type3' ? 'strong' : 'medium';
    settings.renderStyle = 'classic';
    return settings;
  }
  appendTo(node: HTMLElement): void {
    node.append(this.element);
    this.attached = true;
    this.resize();
    if (!this.closed) this.refresh();
  }
  private initialize(): void {
    if (!this.attached || this.renderer) return;
    const renderer = new CommentRenderer(this.settings(), { loggerNamespace: 'FutatsumeWatch' });
    // 全画面への移動は親プレイヤーが担当する。分離した時計を根拠に
    // npm側がCanvasを全画面要素全体へ拡張しないよう、描画面の寸法に従わせる。
    renderer.getFullscreenElement = () => null;
    this.renderer = renderer;
    this.durations = installCommentDurations(renderer);
    try {
      renderer.initialize({ video: this.clock, container: this.surface });
      if (!renderer.canvas) throw new Error('コメントCanvasを作成できませんでした');
      renderer.canvas.dataset.futatsumeCommentCanvas = '';
      renderer.canvas.style.zIndex = '0';
      this.resize();
    } catch (error) {
      renderer.destroy();
      this.renderer = null;
      throw error;
    }
  }
  refresh(): void {
    if (this.closed) return;
    this.initialize();
    const renderer = this.renderer;
    if (!renderer) return;
    // 重なりと裏流しは既存の .commentLayerFrame スタイルに従う。
    // 透明度はCanvas側で一度だけ適用する。
    this.element.style.opacity = '1';
    renderer.settings = this.settings();
    renderer.clearComments();
    this.durations.clear();
    const chats = Object.values(this.model.chatList).flat();
    const entries = chats.filter((chat) => !chat.isInvisible && !chat.isDeleted).map(overlayEntry);
    const sources = new Map(chats.map((chat) => [chat.id, chat]));
    for (const comment of renderer.addComments(entries)) {
      const source = sources.get(comment.meta?.source ?? '');
      if (source) {
        const presentation = commentPresentation(source);
        decorateOverlayComment(comment, presentation, renderer);
        if (presentation.duration !== null) this.durations.set(comment, presentation.duration);
      }
    }
    renderer.syncVideoState(this.clock);
    renderer.performInitialSync();
    renderer.draw();
    if (!this._isShow || document.hidden) renderer.stopAnimation();
    else renderer.startAnimation();
  }
  open(): void {
    this.closed = false;
    this.initialize();
  }
  mediaEvent(name: string): void {
    if (!this.renderer || this.closed) return;
    this.clock.dispatchEvent(new Event(name));
    if (name === 'seeked') {
      this.renderer.performInitialSync();
      this.renderer.draw();
    }
    if (name === 'ratechange') this.refresh();
  }
  setVisibility(visible: boolean): void {
    this._isShow = visible;
    this.renderer?.setCommentVisibility(visible);
    if (!visible) this.renderer?.stopAnimation();
  }
  setAspectRatio(ratio: number): void {
    // VideoPlayer の通知は height / width。
    if (Number.isFinite(ratio) && ratio > 0) this.ratio = 1 / ratio;
    this.resize();
  }
  private resize(): void {
    // container query単位により動画の比率を維持し、全画面・縦長にも追従する。
    this.surface.style.width = `min(100%, ${this.ratio * 100}cqh)`;
    this.surface.style.height = `min(100%, ${100 / this.ratio}cqw)`;
    this.renderer?.resize();
  }
  close(): void {
    this.closed = true;
    this.renderer?.destroy();
    this.renderer = null;
    this.durations.clear();
  }
  export(): string {
    return exportCommentHtml(Object.values(this.model.chatList).flat(), this.settings(), this.media.duration);
  }
  exportXml(): string {
    return exportCommentXml(Object.values(this.model.nonFilteredChatList).flat());
  }
  getCurrentScreenHtml(): string {
    const image = this.renderer?.canvas?.toDataURL('image/png') ?? '';
    return `<html xmlns="http://www.w3.org/1999/xhtml"><body style="margin:0;width:100%;height:100%"><img src="${image}" style="width:100%;height:100%" /></body></html>`;
  }
}
