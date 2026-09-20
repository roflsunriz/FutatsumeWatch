import type { NicoChatType } from '../packages/futatsume/src/commentLayer/nico-chat';
import type { CommentPostResult } from '../packages/lib/src/nico/thread-loader';

interface CommentPostOperation {
  createPreview(): NicoChatType;
  removePreview(chat: NicoChatType): void;
  send(signal: AbortSignal): Promise<CommentPostResult>;
  setPosting(value: boolean): void;
  success(result: CommentPostResult): void;
  failure(error: Error): void;
}

export function normalizeCommentCommands(command: string, isThreadkeyRequired: boolean): string {
  const values = command
    .trim()
    .split(/\s+/)
    .filter((value) => value && value !== '184');
  if (!isThreadkeyRequired) values.unshift('184');
  return values.join(' ');
}

// 一度の入力に対するプレビューと通信を同じ寿命で管理する。
export class CommentPostSession {
  private active: { controller: AbortController; cancel(): void } | null = null;

  reset(): void {
    const operation = this.active;
    this.active = null;
    operation?.controller.abort();
    operation?.cancel();
  }

  async post(operation: CommentPostOperation): Promise<CommentPostResult> {
    if (this.active) throw new Error('コメントを送信中です');
    const controller = new AbortController();
    const preview = operation.createPreview();
    const active = {
      controller,
      cancel: () => {
        operation.removePreview(preview);
        operation.setPosting(false);
      },
    };
    this.active = active;
    operation.setPosting(true);
    try {
      let result: CommentPostResult;
      try {
        result = await operation.send(controller.signal);
      } catch (error) {
        if (this.active === active) {
          operation.removePreview(preview);
          preview.isPostFail = true;
          preview.isUpdating = false;
          operation.failure(error instanceof Error ? error : new Error('コメント投稿に失敗しました'));
        }
        throw error;
      }
      if (this.active !== active) return result;
      preview.no = result.no;
      // idは描画用の内部IDなので受理IDは別のプロパティに保持する。
      if (result.id !== undefined) preview.props.serverId = result.id;
      preview.isUpdating = false;
      operation.success(result);
      return result;
    } finally {
      if (this.active === active) {
        this.active = null;
        operation.setPosting(false);
      }
    }
  }
}
