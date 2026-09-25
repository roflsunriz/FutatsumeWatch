import { describe, expect, test } from 'bun:test';
import { ABRepeat, PlayerShell } from '../../src/player-shell';
import { shellText } from '../../src/player-shell-view';
import { VideoListItem } from '../../packages/futatsume/src/Playlist/video-list-item';
import type { ConfigStore } from '../../src/config';
import type { PlayerState } from '../../src/state';

describe('AB repeat', () => {
  test('AとBを指定した区間だけを繰り返し、3回目で解除する', () => {
    const repeat = new ABRepeat();
    expect(repeat.seekTarget(30)).toBeNull();
    expect(repeat.advance(10)).toBe(true);
    expect(repeat.seekTarget(30)).toBeNull();
    expect(repeat.advance(20)).toBe(true);
    expect(repeat.seekTarget(19.9)).toBeNull();
    expect(repeat.seekTarget(20)).toBe(10);
    expect(repeat.seekTarget(100)).toBe(10);
    expect(repeat.advance(15)).toBe(true);
    expect(repeat.seekTarget(100)).toBeNull();
    expect(repeat.start).toBeNull();
  });
  test('BがA以前・短すぎる場合はAを保持して再選択できる', () => {
    const repeat = new ABRepeat();
    repeat.advance(10);
    for (const time of [0, 9, 10, 10.05]) expect(repeat.advance(time)).toBe(false);
    expect(repeat.start).toBe(10);
    expect(repeat.end).toBeNull();
    expect(repeat.advance(12)).toBe(true);
  });
  test('不正値から区間を生成しない', () => {
    const repeat = new ABRepeat();
    for (const time of [-1, NaN, Infinity]) expect(repeat.advance(time)).toBe(false);
    expect(repeat.start).toBeNull();
  });
  test('動画切替と終了時のclearは保留中のAも有効なABも消す', () => {
    const repeat = new ABRepeat();
    repeat.advance(0);
    repeat.clear();
    expect(repeat.start).toBeNull();
    repeat.advance(0);
    repeat.advance(8);
    expect(repeat.seekTarget(8)).toBe(0);
    repeat.clear();
    expect(repeat.seekTarget(8)).toBeNull();
  });
});
test('操作文言は日本語と英語フォールバックを提供する', () => {
  expect(shellText('ja-JP').play).toBe('再生');
  expect(shellText('en-US').play).toBe('Play');
  expect(shellText('de-DE').play).toBe('Play');
});
test('いいね数は一覧の保存・復元で失われず、未取得をゼロと扱わない', () => {
  const item = new VideoListItem({ id: 'sm9', title: 'video', like: 42, first_retrieve: '2007-03-06' });
  expect(new VideoListItem(item.serialize()).count.like).toBe(42);
  expect(new VideoListItem({ id: 'sm9', title: 'video' }).count.like).toBeUndefined();
});

describe('詳細ロックと設定', () => {
  const ensureGlobals = (): void => {
    const g = globalThis as unknown as Record<string, unknown>;
    const w = window as unknown as Record<string, unknown>;
    if (typeof g['Element'] === 'undefined') g['Element'] = w['Element'];
    if (typeof g['HTMLElement'] === 'undefined') g['HTMLElement'] = w['HTMLElement'];
    if (typeof g['MutationObserver'] === 'undefined') g['MutationObserver'] = w['MutationObserver'];
  };
  const createShell = (initialLocked = false) => {
    ensureGlobals();
    const container = document.createElement('div');
    container.innerHTML =
      '<div class="futatsumeWatchVideoInfoPanel"><div class="tabSelectContainer"></div></div>' +
      '<div class="commentInputPanel"></div>';
    document.body.append(container);
    let settingsOpened = 0;
    let layoutChanged = 0;
    const saved: Record<string, unknown> = {};
    const config = {
      props: { volume: 0.3, domandVideoQuality: 'auto', detailsLocked: initialLocked },
      onkey: () => undefined,
      setValue: (key: string, value: unknown): void => {
        saved[key] = value;
      },
    } as unknown as ConfigStore;
    const state = {
      isPlaying: false,
      isMute: false,
      isLoop: false,
      isShowComment: true,
      playbackRate: 1,
      currentTab: 'videoInfoTab',
      isOpen: true,
      onkey: () => undefined,
    } as unknown as PlayerState;
    const player = { currentTime: 0, duration: 100, volume: 0.3 };
    new PlayerShell(
      container,
      config,
      state,
      player,
      () => undefined,
      () => {
        settingsOpened++;
      },
      () => {
        layoutChanged++;
      }
    );
    const click = (action: string): void => {
      const button = container.querySelector(`[data-shell-action="${action}"]`);
      if (!button) throw new Error(`ボタンがありません: ${action}`);
      button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    };
    const lockPressed = (): string | null | undefined =>
      container.querySelector('[data-shell-action="details-lock"]')?.getAttribute('aria-pressed');
    return {
      container,
      click,
      lockPressed,
      settingsOpened: () => settingsOpened,
      layoutChanged: () => layoutChanged,
      saved,
      dispose: () => container.remove(),
    };
  };

  test('ロック中に設定を開いてもロックと詳細パネルを維持する', () => {
    const shell = createShell();
    try {
      shell.click('details-lock');
      expect(shell.container.dataset['detailsLocked']).toBe('true');
      expect(shell.lockPressed()).toBe('true');
      expect(shell.container.dataset['panel']).toBe('details');
      const layoutBefore = shell.layoutChanged();
      shell.click('settings');
      expect(shell.settingsOpened()).toBe(1);
      expect(shell.container.dataset['detailsLocked']).toBe('true');
      expect(shell.lockPressed()).toBe('true');
      expect(shell.container.dataset['panel']).toBe('details');
      expect(shell.layoutChanged()).toBe(layoutBefore);
    } finally {
      shell.dispose();
    }
  });

  test('ロックなしで設定を開くと詳細パネルを閉じる', () => {
    const shell = createShell();
    try {
      shell.click('details-lock');
      shell.click('details-lock');
      expect(shell.container.dataset['detailsLocked']).toBe('false');
      expect(shell.saved['detailsLocked']).toBe(false);
      const layoutBefore = shell.layoutChanged();
      shell.click('settings');
      expect(shell.settingsOpened()).toBe(1);
      expect(shell.container.dataset['panel']).toBe('');
      expect(shell.layoutChanged()).toBe(layoutBefore + 1);
    } finally {
      shell.dispose();
    }
  });

  test('ロック操作を保存し、次回は詳細パネルを開いた状態で復元する', () => {
    const first = createShell();
    try {
      first.click('details-lock');
      expect(first.saved['detailsLocked']).toBe(true);
    } finally {
      first.dispose();
    }
    const second = createShell(true);
    try {
      expect(second.container.dataset['detailsLocked']).toBe('true');
      expect(second.lockPressed()).toBe('true');
      expect(second.container.dataset['panel']).toBe('details');
    } finally {
      second.dispose();
    }
  });
});
