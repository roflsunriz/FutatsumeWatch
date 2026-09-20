const ja = {
  comment: '投稿するコメント',
  placeholder: 'コメントを入力',
  commands: 'コメントコマンド',
  palette: 'コメントの色・サイズ・位置',
  size: 'サイズ',
  position: '位置',
  color: 'カラー',
  big: '大',
  medium: '中',
  small: '小',
  ue: '上',
  naka: '中',
  shita: '下',
  reset: 'リセット',
  submit: '投稿',
  autoPause: '入力時に一時停止',
  empty: '投稿するコメントを入力してください。',
  tooLong: 'コメントは75文字以内で入力してください。',
  posting: '投稿中…',
  success: 'コメントを投稿しました。',
  failure: '投稿に失敗しました。本文を確認して再試行してください。',
  login: 'ニコニコ動画へログインすると投稿できます。',
  notReady: 'コメントの読み込み完了後に投稿できます。',
  readOnly: '過去ログ・マイメモリーには投稿できません。',
};
const en: typeof ja = {
  comment: 'Comment to post',
  placeholder: 'Write a comment',
  commands: 'Comment commands',
  palette: 'Comment color, size and position',
  size: 'Size',
  position: 'Position',
  color: 'Color',
  big: 'Large',
  medium: 'Medium',
  small: 'Small',
  ue: 'Top',
  naka: 'Middle',
  shita: 'Bottom',
  reset: 'Reset',
  submit: 'Post',
  autoPause: 'Pause while typing',
  empty: 'Enter a comment to post.',
  tooLong: 'Use at most 75 characters.',
  posting: 'Posting…',
  success: 'Comment posted.',
  failure: 'Posting failed. Check your comment and try again.',
  login: 'Log in to niconico to post comments.',
  notReady: 'Wait for comments to finish loading.',
  readOnly: 'Posting is unavailable in past logs and My Memory.',
};
export const commentFormText = (language: string): typeof ja => (language.startsWith('ja') ? ja : en);
export const commandGroups = {
  size: [
    ['big', 'big'],
    ['medium', 'medium'],
    ['small', 'small'],
  ],
  position: [
    ['ue', 'ue'],
    ['naka', 'naka'],
    ['shita', 'shita'],
  ],
  color: [
    ['white', '#ffffff'],
    ['red', '#ff0000'],
    ['pink', '#ff8080'],
    ['orange', '#ffc000'],
    ['yellow', '#ffff00'],
    ['green', '#00ff00'],
    ['cyan', '#00ffff'],
    ['blue', '#0000ff'],
    ['purple', '#c000ff'],
    ['black', '#000000'],
    ['white2', '#cccc99'],
    ['red2', '#cc0033'],
    ['pink2', '#ff33cc'],
    ['orange2', '#ff6600'],
    ['yellow2', '#999900'],
    ['green2', '#00cc66'],
    ['cyan2', '#00cccc'],
    ['blue2', '#3399ff'],
    ['purple2', '#6633cc'],
    ['black2', '#666666'],
  ],
} as const;
export function commentFormTemplate(t: typeof ja, premium: boolean): string {
  const groups = (['size', 'position'] as const)
    .map(
      (group) =>
        `<fieldset><legend>${t[group]}</legend><div class="commentCommandOptions">${commandGroups[group].map(([command, label]) => `<button type="button" data-comment-command="${command}" aria-pressed="false">${t[label]}</button>`).join('')}</div></fieldset>`
    )
    .join('');
  const colors = commandGroups.color
    .filter(([command]) => premium || !command.endsWith('2'))
    .map(
      ([command, color]) =>
        `<button type="button" data-comment-command="${command}" aria-label="${command}" title="${command}" aria-pressed="false"><span style="background:${color}"></span></button>`
    )
    .join('');
  return `<div class="commentInputOuter">
    <button type="button" data-comment-palette aria-label="${t.palette}" title="${t.palette}" aria-expanded="false" aria-controls="fw-comment-palette"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-4-5-6-9-6Z"/><circle cx="7" cy="10" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="7" r="1"/></svg></button>
    <div class="commentTextControl"><textarea class="commentInput" name="chat" aria-label="${t.comment}" placeholder="${t.placeholder}" maxlength="75" rows="1" autocomplete="off"></textarea><span class="commentCount" aria-hidden="true">0/75</span></div>
    <button type="submit" class="commentSubmit">${t.submit}</button>
    </div>
    <section class="commentCommandPalette" id="fw-comment-palette" aria-label="${t.palette}" hidden>
      ${groups}<fieldset><legend>${t.color}</legend><div class="commentColorOptions">${colors}</div></fieldset>
      <label>${t.commands}<input type="text" class="commandInput" name="mail" maxlength="128" autocomplete="off" aria-label="${t.commands}"></label>
      <div class="commentPaletteFoot"><label class="autoPauseLabel"><input type="checkbox" class="autoPause">${t.autoPause}</label><button type="button" data-comment-command="reset">${t.reset}</button></div>
    </section>
    <p class="commentPostStatus" role="status" aria-live="polite"></p>`;
}
