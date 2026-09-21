export interface CommentLanguageInfo {
  language?: string;
  nvComment: { params: { language?: unknown } };
}

export function applyApiCommentLanguage(info: CommentLanguageInfo, fallback: string): string {
  const apiLanguage = info.nvComment.params.language;
  const language = typeof apiLanguage === 'string' && apiLanguage ? apiLanguage : fallback;
  info.language = language;
  return language;
}
