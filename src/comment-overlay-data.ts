import type { Comment, CommentRenderer } from 'comment-overlay';
import { Config } from './Config';
import type { NicoChatType } from '../packages/futatsume/src/commentLayer/NicoChat';

export function overlayEntry(chat: NicoChatType): Parameters<CommentRenderer['addComments']>[0][number] {
  const commands = chat.cmd.split(/\s+/).filter(Boolean);
  // ニコスクリプト適用後の属性を元のコマンドより優先する。
  commands.push(chat.type, chat.size);
  if (chat.color) commands.push(chat.color);
  if (chat.fontCommand) commands.push(chat.fontCommand);
  if (chat.isInvisible) commands.push('invisible');
  return {
    text: chat.text,
    vposMs: chat.vpos * 10,
    commands,
    meta: { no: chat.no, fork: String(chat.fork), threadId: String(chat.threadId), source: chat.id },
  };
}

export interface OverlayPresentation {
  reverse: boolean;
  opacity: number;
  fontFamily: string;
  fontWeight: string | null;
  scale: number;
  duration: number | null;
  shadow: string;
  shadowColor: string;
  owner: boolean;
}
export function commentPresentation(chat: NicoChatType): OverlayPresentation {
  const forkOpacity =
    chat.fork === 2
      ? Number(Config.props['commentLayer.easyCommentOpacity'])
      : chat.fork === 3
        ? Number(Config.props['commentLayer.aiCommentOpacity'])
        : 1;
  const liveOpacity = chat.cmd.split(/\s+/).some((command) => command.toLowerCase() === '_live') ? 0.5 : 1;
  return {
    reverse: chat.isReverse,
    opacity: (chat.opacity / liveOpacity) * forkOpacity,
    fontFamily: chat.fontCommand ? '' : Config.props.baseFontFamily,
    fontWeight: chat.fontCommand ? null : Config.props.baseFontBolder ? 'bold' : 'normal',
    scale: Math.max(0.1, Number(Config.props.baseChatScale) || 1),
    duration: chat.hasDurationSet ? chat.duration * 1000 : null,
    shadow: Config.props['commentLayer.textShadowType'],
    shadowColor: chat.fork === 1 ? Config.props['commentLayer.ownerCommentShadowColor'] : '#000000',
    owner: chat.fork === 1,
  };
}

// 保存HTMLにも同じ表示設定を渡すため、外部変数を参照しない関数にする。
// 文字計測・配置・衝突判定・描画本体はすべてnpmエンジンへ委譲する。
export function decorateOverlayComment(
  comment: Comment,
  presentation: OverlayPresentation,
  renderer: CommentRenderer
): void {
  const prepare = comment.prepare.bind(comment);
  const sync = comment.syncWithSettings.bind(comment);
  const draw = comment.draw.bind(comment);
  comment.draw = (context, x) => {
    context.save();
    const color = presentation.shadowColor;
    if (presentation.shadow === 'shadow-dokaben') context.filter = `drop-shadow(3px 4px 0 ${color})`;
    else if (presentation.shadow === 'shadow-stroke')
      context.filter = `drop-shadow(1px 0 0 ${color}) drop-shadow(-1px 0 0 ${color})`;
    else if (presentation.shadow === 'shadow-type2' || presentation.owner)
      context.filter = `drop-shadow(0 0 1px ${color})`;
    draw(context, x);
    context.restore();
  };
  comment.syncWithSettings = (settings, version) => {
    sync({ ...settings, scrollDirection: presentation.reverse ? 'ltr' : settings.scrollDirection }, version);
    comment.opacity = comment.getEffectiveOpacity(settings.commentOpacity) * presentation.opacity;
  };
  comment.prepare = (context, width, height, options) => {
    if (presentation.fontFamily) comment.fontFamily = presentation.fontFamily;
    if (presentation.fontWeight !== null) comment.fontWeight = presentation.fontWeight;
    const duration = presentation.duration ?? renderer.settings.scrollVisibleDurationMs;
    prepare(
      context,
      width,
      height * presentation.scale,
      duration === null
        ? options
        : {
            ...options,
            minVisibleDurationMs: duration,
            maxVisibleDurationMs: duration,
          }
    );
  };
}
