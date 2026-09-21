import { describe, expect, test } from 'bun:test';
import { DataStorage } from '../../packages/lib/src/infra/data-storage';

Object.assign(globalThis, { HTMLElement: window.HTMLElement, customElements: window.customElements });
const { SettingPanelElement } = await import('../../packages/components/src/element/setting-panel-element');
type SettingPanelType = InstanceType<typeof SettingPanelElement>;

function change(input: HTMLInputElement | HTMLTextAreaElement, initial: number | string | string[]): unknown {
  const props: Record<string, unknown> = { value: initial };
  const receiver = { config: { props } } as unknown as SettingPanelType;
  input.dataset.settingName = 'value';
  const event = new window.Event('change', { bubbles: true });
  Object.defineProperty(event, 'target', { value: input });
  SettingPanelElement.prototype.onChange.call(receiver, event);
  return props.value;
}

describe('一般設定の入力境界', () => {
  test('空・範囲外・step違反の数値を保存せず、有効値で回復できる', () => {
    const input = document.createElement('input');
    Object.assign(input, { type: 'number', min: '0.5', max: '2', step: '0.1' });
    input.dataset.type = 'number';
    for (const invalid of ['', '0.4', '2.1', '0.55']) {
      input.value = invalid;
      expect(change(input, 1)).toBe(1);
    }
    for (const valid of ['0.5', '1.2', '2']) {
      input.value = valid;
      expect(change(input, 1)).toBe(Number(valid));
    }
  });
  test('色のpattern違反を保存せず、正しい色を保存する', () => {
    const input = document.createElement('input');
    input.pattern = '(#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{6}|[a-zA-Z]+)';
    input.value = '#xyz';
    expect(change(input, '#000')).toBe('#000');
    input.value = '#123456';
    expect(change(input, '#000')).toBe('#123456');
  });
  test('複数行のNG入力を配列で保存する', () => {
    const input = document.createElement('textarea');
    input.dataset.type = 'array';
    input.value = 'first\nsecond';
    expect(change(input, [])).toEqual(['first', 'second']);
  });
  test('NG・フィルターの統合入力だけから正規表現とフラグを保存する', () => {
    const input = document.createElement('textarea');
    input.dataset.settingName = 'wordRegFilter';
    input.dataset.ngRegexpInput = '';
    const props: Record<string, unknown> = { wordRegFilter: ['/before/i'] };
    const receiver = { config: { props } } as unknown as SettingPanelType;
    const event = new window.Event('change', { bubbles: true });
    Object.defineProperty(event, 'target', { value: input });

    input.value = '/[/i';
    SettingPanelElement.prototype.onChange.call(receiver, event);
    expect(props).toEqual({ wordRegFilter: ['/before/i'] });
    expect(input.validationMessage).not.toBe('');

    input.value = '/foo\\/bar/gi\n/^second$/i';
    SettingPanelElement.prototype.onChange.call(receiver, event);
    expect(props).toEqual({ wordRegFilter: ['/foo\\/bar/gi', '/^second$/i'] });
    expect(input.value).toBe('/foo\\/bar/gi\n/^second$/i');
    expect(input.validationMessage).toBe('');
  });
  test('保存層が拒否したチェックを以前の値へ戻す', () => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.dataset.settingName = 'value';
    const props = Object.defineProperty({}, 'value', { get: () => false, set: () => {} });
    const event = new window.Event('change');
    Object.defineProperty(event, 'target', { value: input });
    SettingPanelElement.prototype.onChange.call({ config: { props } } as unknown as SettingPanelType, event);
    expect(input.checked).toBe(false);
  });
  test('ファイル選択の取消で例外やインポートを起こさない', () => {
    const input = document.createElement('input');
    input.type = 'file';
    const event = new window.Event('change');
    Object.defineProperty(event, 'target', { value: input });
    expect(() => SettingPanelElement.prototype.onImportFileSelect.call({} as SettingPanelType, event)).not.toThrow();
  });
  test('不正な設定ファイルは理由を通知し、設定を保持して再選択可能にする', async () => {
    const config = DataStorage.create({ value: 1 }, { prefix: 'settings-invalid-file' });
    await config.promise('restore');
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [new window.File(['[]'], 'invalid.config.json')] });
    const event = new window.Event('change');
    Object.defineProperty(event, 'target', { value: input });
    const original = { alert: globalThis.alert, confirm: globalThis.confirm, FileReader: globalThis.FileReader };
    const messages: string[] = [];
    let notified: () => void = () => {};
    const notification = new Promise<void>((resolve) => {
      notified = resolve;
    });
    globalThis.alert = (message?: unknown) => {
      messages.push(String(message));
      notified();
    };
    globalThis.confirm = () => true;
    globalThis.FileReader = window.FileReader;
    try {
      SettingPanelElement.prototype.onImportFileSelect.call({ config } as unknown as SettingPanelType, event);
      await notification;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('オブジェクト');
      expect(config.getValue('value')).toBe(1);
      expect(input.value).toBe('');
    } finally {
      Object.assign(globalThis, original);
    }
  });
});
