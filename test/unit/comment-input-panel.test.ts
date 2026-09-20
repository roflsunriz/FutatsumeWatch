import { afterEach, expect, test } from 'bun:test';
import { CommentInputPanel } from '../../src/comment-input-panel';
import { commentFormText } from '../../src/comment-input-view';

Object.assign(globalThis, { HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node });
const containers: HTMLElement[] = [];
function create(loggedIn = true, premium = false) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const listeners = new Map<string, () => void>();
  const state = {
    isRegularUser: !premium,
    isOpen: true,
    isLoading: false,
    isCommentReady: true,
    isWaybackMode: false,
    isMymemory: false,
    isError: false,
    onkey: (key: string, listener: () => void) => listeners.set(key, listener),
  };
  const config = {
    props: { autoPauseCommentInput: true },
    onkey: (key: string, listener: () => void) => listeners.set(key, listener),
  };
  const panel = new CommentInputPanel({
    playerContainer: container,
    playerConfig: config,
    playerState: state,
    isLoggedIn: loggedIn,
  });
  const input = container.querySelector<HTMLTextAreaElement>('.commentInput')!;
  const commands = container.querySelector<HTMLInputElement>('.commandInput')!;
  const status = container.querySelector<HTMLElement>('.commentPostStatus')!;
  const click = (selector: string) => container.querySelector<HTMLButtonElement>(selector)!.click();
  const posts: { body: string; commands: string; resolve(): void; reject(error: Error): void }[] = [];
  panel.on('post', (result, body, commands) => {
    if (
      typeof result !== 'object' ||
      result === null ||
      !('resolve' in result) ||
      !('reject' in result) ||
      typeof result.resolve !== 'function' ||
      typeof result.reject !== 'function' ||
      typeof body !== 'string' ||
      typeof commands !== 'string'
    )
      throw new Error('Invalid post event');
    const { resolve, reject } = result as { resolve: () => void; reject: (error: Error) => void };
    posts.push({ body, commands, resolve: () => resolve(), reject: (error) => reject(error) });
  });
  return { panel, container, input, commands, status, posts, click, state, config, listeners };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

test('送信中の重複を防ぎ、成功後だけ本文を消しコマンドを保持する', async () => {
  const f = create();
  f.input.value = ' 本文\n次の行 ';
  f.commands.value = 'red big';
  const sent = f.panel.submit();
  await f.panel.submit();
  expect(f.posts).toHaveLength(1);
  expect(f.posts[0]!.body).toBe(' 本文\n次の行 ');
  expect(f.posts[0]!.commands).toBe('red big');
  expect(f.input.disabled).toBe(true);
  expect(f.input.value).toBe(' 本文\n次の行 ');
  f.posts[0]!.resolve();
  await sent;
  expect(f.input.value).toBe('');
  expect(f.commands.value).toBe('red big');
  expect(f.input.disabled).toBe(false);
});
test('失敗時に本文とコマンド・理由を保持し再送できる', async () => {
  const f = create();
  f.input.value = '再試行する本文';
  f.commands.value = 'ue';
  const sent = f.panel.submit();
  f.posts[0]!.reject(new Error('しばらく待ってから再試行してください。'));
  await sent;
  expect(f.input.value).toBe('再試行する本文');
  expect(f.commands.value).toBe('ue');
  expect(f.status.dataset.state).toBe('error');
  expect(f.status.textContent).toContain('しばらく');
  const retry = f.panel.submit();
  expect(f.posts).toHaveLength(2);
  f.posts[1]!.resolve();
  await retry;
});
test('空白と76文字を拒否し75文字は送信する', async () => {
  const f = create();
  for (const text of ['  \n', 'あ'.repeat(76)]) {
    f.input.value = text;
    await f.panel.submit();
    expect(f.status.dataset.state).toBe('error');
  }
  expect(f.posts).toHaveLength(0);
  f.input.value = 'あ'.repeat(75);
  f.input.dispatchEvent(new window.Event('input'));
  expect(f.container.querySelector('.commentCount')!.textContent).toBe('75/75');
  const sent = f.panel.submit();
  f.posts[0]!.resolve();
  await sent;
});
test('絵文字も既存maxlengthと同じUTF-16単位で75/76の境界を表示・検証する', async () => {
  const f = create();
  f.input.value = '😀'.repeat(38);
  f.input.dispatchEvent(new window.Event('input'));
  expect(f.container.querySelector('.commentCount')!.textContent).toBe('76/75');
  await f.panel.submit();
  expect(f.posts).toHaveLength(0);
  f.input.value = '😀'.repeat(37) + 'あ';
  f.input.dispatchEvent(new window.Event('input'));
  expect(f.container.querySelector('.commentCount')!.textContent).toBe('75/75');
  const sent = f.panel.submit();
  f.posts[0]!.resolve();
  await sent;
  expect(f.posts).toHaveLength(1);
});
test('IME確定とShift+Enterでは送らず通常Enterだけを送信する', async () => {
  const f = create();
  f.input.value = '日本語';
  const key = (options: KeyboardEventInit) =>
    f.input.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options })
    );
  key({ isComposing: true });
  key({ shiftKey: true });
  f.input.dispatchEvent(new window.CompositionEvent('compositionstart'));
  key({});
  expect(f.posts).toHaveLength(0);
  f.input.dispatchEvent(new window.CompositionEvent('compositionend'));
  key({});
  expect(f.posts).toHaveLength(1);
  f.posts[0]!.resolve();
  await flush();
});
test('submitイベントでページ遷移せず一度だけ送る', async () => {
  const f = create();
  f.input.value = 'ボタン投稿';
  const event = new window.Event('submit', { bubbles: true, cancelable: true });
  f.panel.element.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(f.posts).toHaveLength(1);
  f.posts[0]!.resolve();
  await flush();
});
test('パレットはカテゴリ内だけ置換し自由コマンドを残す・リセット・Escape', () => {
  const f = create();
  f.commands.value = '184 red small';
  f.click('[data-comment-palette]');
  f.click('[data-comment-command="blue"]');
  f.click('[data-comment-command="big"]');
  f.click('[data-comment-command="ue"]');
  expect(f.commands.value).toBe('184 blue big ue');
  expect(f.container.querySelector('[data-comment-command="blue"]')!.getAttribute('aria-pressed')).toBe('true');
  f.panel.element.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  );
  expect(f.container.querySelector<HTMLElement>('.commentCommandPalette')!.hidden).toBe(true);
  f.click('[data-comment-palette]');
  f.click('[data-comment-command="reset"]');
  expect(f.commands.value).toBe('');
  expect(f.container.querySelectorAll('[data-comment-command][aria-pressed="true"]').length).toBe(0);
});
test('一般会員のパレットにプレミアム色を表示しない', () => {
  expect(create().container.querySelector('[data-comment-command="red2"]')).toBeNull();
  expect(create(true, true).container.querySelector('[data-comment-command="red2"]')).not.toBeNull();
});
test('ゲスト・読み込み中・過去ログ・マイメモリーは送信せず理由を表示', async () => {
  const guest = create(false);
  guest.input.value = '投稿不可';
  await guest.panel.submit();
  expect(guest.input.disabled).toBe(true);
  expect(guest.status.textContent).toBe(commentFormText(navigator.language).login);
  expect(guest.posts).toHaveLength(0);
  for (const key of ['isLoading', 'isWaybackMode', 'isMymemory', 'isError'] as const) {
    const f = create();
    f.state[key] = true;
    f.listeners.get(key)!();
    f.input.value = '投稿不可';
    await f.panel.submit();
    expect(f.input.disabled).toBe(true);
    expect(f.posts).toHaveLength(0);
    f.state[key] = false;
    f.listeners.get(key)!();
    expect(f.input.disabled).toBe(false);
    expect(f.status.textContent).toBe('');
  }
});
test('動画切替後に古い投稿結果で新しい本文を消さずフォーカスを奪わない', async () => {
  const f = create();
  f.input.value = '旧動画';
  const sent = f.panel.submit();
  f.panel.reset();
  f.input.value = '新動画';
  f.posts[0]!.resolve();
  await sent;
  expect(f.input.value).toBe('新動画');
  expect(f.status.textContent).toBe('');
  expect(document.activeElement).not.toBe(f.input);
});
test('切替で旧投稿の待機を解除し、旧finallyが新しい投稿の重複防止を解除しない', async () => {
  for (const succeeds of [true, false]) {
    const f = create();
    f.input.value = '旧動画';
    const old = f.panel.submit();
    f.panel.reset();
    expect(f.input.disabled).toBe(false);
    f.input.value = '新動画';
    const current = f.panel.submit();
    expect(f.posts).toHaveLength(2);
    if (succeeds) f.posts[0]!.resolve();
    else f.posts[0]!.reject(new Error('古い拒否'));
    await old;
    expect(f.input.disabled).toBe(true);
    expect(f.panel.element.dataset.posting).toBe('true');
    expect(f.input.value).toBe('新動画');
    expect(f.status.dataset.state).toBe('info');
    await f.panel.submit();
    expect(f.posts).toHaveLength(2);
    f.posts[1]!.resolve();
    await current;
    expect(f.input.disabled).toBe(false);
    expect(f.input.value).toBe('');
  }
});
test('フォーム内の移動では一時停止・再開を繰り返さず設定を同期する', async () => {
  const f = create();
  const changes: string[] = [];
  f.panel.on('focus', () => changes.push('focus'));
  f.panel.on('blur', () => changes.push('blur'));
  f.panel.focus();
  f.container.querySelector<HTMLButtonElement>('[data-comment-palette]')!.focus();
  await flush();
  expect(changes).toEqual(['focus']);
  f.click('.autoPause');
  expect(f.config.props.autoPauseCommentInput).toBe(false);
  f.config.props.autoPauseCommentInput = true;
  f.listeners.get('autoPauseCommentInput')!();
  expect(f.container.querySelector<HTMLInputElement>('.autoPause')!.checked).toBe(true);
  f.panel.blur();
  await flush();
  expect(changes).toEqual(['focus', 'blur']);
});
test('文言は日本語と英語のフォールバックを持つ', () => {
  expect(commentFormText('ja-JP').submit).toBe('投稿');
  expect(commentFormText('fr').submit).toBe('Post');
});
