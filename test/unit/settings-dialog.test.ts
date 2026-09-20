import { afterEach, describe, expect, test } from 'bun:test';
import { SettingsDialog } from '../../packages/components/src/settings-dialog';

Object.assign(globalThis, { ShadowRoot: window.ShadowRoot });
const dialogs: SettingsDialog[] = [];
function create(name: 'general' | 'hls' = 'general'): {
  modal: SettingsDialog;
  root: HTMLDialogElement;
  closes: () => number;
} {
  let closed = 0;
  const root = document.createElement('dialog');
  root.innerHTML = '<label><input type="checkbox">setting</label>';
  document.body.append(root);
  // jsdom has no top layer; native focus and backdrop hit tests run in Chrome.
  root.showModal = () => root.setAttribute('open', '');
  root.close = () => {
    root.removeAttribute('open');
    root.dispatchEvent(new window.Event('close'));
  };
  const modal = new SettingsDialog(root, name, () => {
    closed += 1;
  });
  dialogs.push(modal);
  return { modal, root, closes: () => closed };
}
function pointerClick(target: Element): void {
  target.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
  target.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}
afterEach(() => {
  for (const dialog of dialogs.splice(0)) {
    dialog.close();
    dialog.element.remove();
  }
});

describe('設定サイドバー', () => {
  test('一般設定のタブは一つだけ表示し、入力した値とDOMを保持する', () => {
    const { modal, root } = create();
    const body = root.querySelector('.fw-modal-body')!;
    body.innerHTML =
      '<section data-settings-section="player"><input value="draft"></section><section data-settings-section="comments"><input value="comment"></section><section data-settings-section="filters"></section><section data-settings-section="data"></section>';
    modal.open();
    const input = root.querySelector<HTMLInputElement>('[data-settings-section="player"] input')!;
    input.value = '入力中';
    root.querySelector<HTMLButtonElement>('[data-settings-tab="comments"]')!.click();
    expect(root.querySelector<HTMLElement>('[data-settings-section="player"]')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-settings-section="comments"]')!.hidden).toBe(false);
    expect(root.querySelectorAll('[role="tab"][aria-selected="true"]').length).toBe(1);
    root.querySelector<HTMLButtonElement>('[data-settings-tab="player"]')!.click();
    expect(root.querySelector('[data-settings-section="player"] input')).toBe(input);
    expect(input.value).toBe('入力中');
    expect(root.open).toBe(true);
  });
  test('上下キーで一般設定のカテゴリを切り替える', () => {
    const { modal, root } = create();
    modal.open();
    const player = root.querySelector<HTMLButtonElement>('[data-settings-tab="player"]')!;
    player.click();
    player.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(root.querySelector('[data-settings-tab="comments"]')!.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('[data-settings-tab="comments"]')!.getAttribute('tabindex')).toBe('0');
    root.querySelector<HTMLButtonElement>('[data-settings-tab="player"]')!.click();
  });
});
describe('共通設定ダイアログ', () => {
  test('入力と内容のクリックを保ち、背景で一度だけ閉じる', () => {
    const { modal, root, closes } = create();
    modal.open();
    root.querySelector('input')!.click();
    expect(root.querySelector('input')!.checked).toBe(true);
    expect(root.open).toBe(true);
    pointerClick(modal.content);
    expect(root.open).toBe(true);
    pointerClick(root);
    expect(root.open).toBe(false);
    expect(closes()).toBe(1);
    modal.close();
    expect(closes()).toBe(1);
  });
  test('内側から背景へドラッグしても閉じない', () => {
    const { modal, root } = create();
    modal.open();
    modal.content.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    root.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
    root.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(root.open).toBe(true);
  });
  test('背景から内側へのドラッグやキャンセルでも閉じない', () => {
    const { modal, root } = create();
    modal.open();
    root.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    modal.content.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
    root.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(root.open).toBe(true);
    root.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    root.dispatchEvent(new window.MouseEvent('pointercancel', { bubbles: true }));
    root.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(root.open).toBe(true);
  });
  test('Escapeのcancelで状態を同期し、直後に再表示できる', () => {
    const { modal, root, closes } = create();
    modal.open();
    const event = new window.Event('cancel', { bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(root.open).toBe(false);
    expect(closes()).toBe(1);
    modal.open();
    root.dispatchEvent(new window.Event('close'));
    expect(root.open).toBe(true);
    expect(closes()).toBe(1);
  });
  test('別の設定を開いたときに先の設定を閉じる', () => {
    const first = create();
    const second = create('hls');
    first.modal.open();
    second.modal.open();
    expect(first.root.open).toBe(false);
    expect(first.closes()).toBe(1);
    expect(second.root.open).toBe(true);
  });
});
