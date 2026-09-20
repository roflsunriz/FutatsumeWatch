import { describe, expect, test } from 'bun:test';
import { DataStorage } from '../../packages/lib/src/infra/data-storage';

describe('設定保存失敗', () => {
  for (const rollbackFails of [false, true]) {
    test(`初期化の削除失敗: ${rollbackFails ? '復元失敗も通知する' : '元へ戻して再試行できる'}`, async () => {
      const backing = window.localStorage;
      const prefix = `settings-clear-${rollbackFails}`;
      for (const [key, value] of Object.entries({ a: '10', b: '20', ignored: '"keep"' }))
        backing.setItem(`${prefix}_${key}`, value);
      let fail = true;
      const storage = new Proxy(backing, {
        get(target, name) {
          if (name === 'removeItem')
            return (key: string) => {
              if (fail && key === `${prefix}_b`) throw new DOMException('fixture denied', 'SecurityError');
              target.removeItem(key);
            };
          if (name === 'setItem')
            return (key: string, value: string) => {
              if (fail && rollbackFails) throw new DOMException('fixture quota', 'QuotaExceededError');
              target.setItem(key, value);
            };
          const value = Reflect.get(target, name, target) as
            string | number | ((...args: string[]) => string | void) | null;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const config = DataStorage.create(
        { a: 1, b: 2, ignored: '' },
        { prefix, storage, ignoreExportKeys: ['ignored'] }
      );
      await config.promise('restore');
      const notifications: Error[] = [];
      config.on('reset-error', (error) => {
        if (error instanceof Error) notifications.push(error);
      });
      config.silently = true;
      try {
        expect(() => config.clearConfig()).toThrow(rollbackFails ? AggregateError : Error);
        expect(config.getValue('a')).toBe(10);
        expect(config.getValue('b')).toBe(20);
        expect(backing.getItem(`${prefix}_a`)).toBe(rollbackFails ? null : '10');
        expect(backing.getItem(`${prefix}_b`)).toBe('20');
        expect(backing.getItem(`${prefix}_ignored`)).toBe('"keep"');
        expect(config.getValue('ignored')).toBe('keep');
        expect(config._changed.size).toBe(0);
        expect(config.silently).toBe(true);
        expect(notifications).toHaveLength(1);
        expect(notifications[0]?.message).toContain(rollbackFails ? '復元に失敗' : '変更前の設定へ戻しました');
        fail = false;
        config.clearConfig();
        expect(config.getValue('a')).toBe(1);
        expect(config.getValue('b')).toBe(2);
        expect(backing.getItem(`${prefix}_a`)).toBeNull();
        expect(backing.getItem(`${prefix}_b`)).toBeNull();
        expect(backing.getItem(`${prefix}_ignored`)).toBe('"keep"');
        expect(config.getValue('ignored')).toBe('keep');
        expect(config.silently).toBe(true);
      } finally {
        for (const key of ['a', 'b', 'ignored']) backing.removeItem(`${prefix}_${key}`);
      }
    });
  }
  test('readonly初期化は保存領域へ触れず、メモリの対象キーだけ戻す', async () => {
    const storage = new Proxy(window.localStorage, {
      get(target, name) {
        if (name === 'removeItem' || name === 'setItem')
          return () => {
            throw Error('readonly storage was mutated');
          };
        const value = Reflect.get(target, name, target) as
          string | number | ((...args: string[]) => string | void) | null;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const config = DataStorage.create(
      { value: 1, ignored: 'keep' },
      { prefix: 'settings-clear-readonly', storage, readonly: true, ignoreExportKeys: ['ignored'] }
    );
    await config.promise('restore');
    config.setValue('value', 9);
    config.setValue('ignored', 'retained');
    expect(() => config.clearConfig()).not.toThrow();
    expect(config.getValue('value')).toBe(1);
    expect(config.getValue('ignored')).toBe('retained');
    expect(config.silently).toBe(false);
    expect(config._changed.has('value')).toBe(false);
    expect(config._changed.get('ignored')).toBe('retained');
  });
  test('不正JSON・配列・プリミティブを拒否し、既存設定を維持する', async () => {
    const storage = window.localStorage;
    storage.setItem('settings-import-invalid_value', '9');
    const config = DataStorage.create({ value: 1 }, { prefix: 'settings-import-invalid', storage });
    await config.promise('restore');
    try {
      for (const json of ['{broken', '[]', 'null', '"text"', '3', 'true']) {
        expect(() => config.importJson(json)).toThrow();
        expect(config.getValue('value')).toBe(9);
        expect(storage.getItem('settings-import-invalid_value')).toBe('9');
      }
      config.importJson('{"value":4}');
      expect(config.getValue('value')).toBe(4);
      expect(storage.getItem('settings-import-invalid_value')).toBe('4');
      config.importJson('{}');
      expect(config.getValue('value')).toBe(1);
      expect(storage.getItem('settings-import-invalid_value')).toBe('1');
    } finally {
      storage.removeItem('settings-import-invalid_value');
    }
  });
  for (const rollbackFails of [false, true]) {
    test(`読込の途中で保存失敗: ${rollbackFails ? '復元失敗も明示する' : '全保存値を戻して再試行できる'}`, async () => {
      const backing = window.localStorage;
      const prefix = `settings-import-${rollbackFails}`;
      backing.setItem(`${prefix}_a`, '10');
      backing.setItem(`${prefix}_b`, '20');
      let failed = false;
      let fail = true;
      const storage = new Proxy(backing, {
        set(target, name, value: string) {
          if (fail && (String(name).endsWith('_b') || (rollbackFails && failed))) {
            failed = true;
            throw new DOMException('fixture quota', 'QuotaExceededError');
          }
          target.setItem(String(name), value);
          return true;
        },
        get(target, name) {
          const value = Reflect.get(target, name, target) as
            string | number | ((...args: string[]) => string | void) | null;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const config = DataStorage.create({ a: 1, b: 2 }, { prefix, storage });
      await config.promise('restore');
      let notifications = 0;
      config.on('change', () => notifications++);
      try {
        if (rollbackFails) expect(() => config.importJson('{"a":100,"b":200}')).toThrow(AggregateError);
        else expect(() => config.importJson('{"a":100,"b":200}')).toThrow('変更前の設定へ戻しました');
        expect(config.getValue('a')).toBe(10);
        expect(config.getValue('b')).toBe(20);
        expect(backing.getItem(`${prefix}_a`)).toBe(rollbackFails ? '100' : '10');
        expect(backing.getItem(`${prefix}_b`)).toBe('20');
        expect(notifications).toBe(0);
        expect(config.silently).toBe(false);
        fail = false;
        config.importJson('{"a":100,"b":200}');
        expect(config.getValue('a')).toBe(100);
        expect(config.getValue('b')).toBe(200);
        expect(backing.getItem(`${prefix}_a`)).toBe('100');
        expect(backing.getItem(`${prefix}_b`)).toBe('200');
        // Successful import must preserve registered listeners too.
        const changed = new Promise<void>((resolve) => config.once('change', () => resolve()));
        config.setValue('a', 99);
        await changed;
        expect(notifications).toBe(1);
      } finally {
        backing.removeItem(`${prefix}_a`);
        backing.removeItem(`${prefix}_b`);
      }
    });
  }
  test('容量不足で以前の値と別キーを維持し、失敗を通知して再試行できる', async () => {
    const backing = window.localStorage;
    const prefix = 'settings-failure-test';
    backing.setItem(`${prefix}_value`, '1');
    backing.setItem(`${prefix}_other`, '"keep"');
    let fail = true;
    const storage = new Proxy(backing, {
      set(target, name, value: string) {
        if (fail) throw new DOMException('fixture quota', 'QuotaExceededError');
        target.setItem(String(name), value);
        return true;
      },
      get(target, name) {
        const value = Reflect.get(target, name, target) as
          string | number | ((...args: string[]) => string | void) | null;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const config = DataStorage.create({ value: 0, other: '' }, { prefix, storage });
    await config.promise('restore');
    const failures: string[] = [];
    config.on('save-error', (failure) => failures.push((failure as { key: string }).key));
    try {
      config.setValue('value', 2);
      expect(config.getValue('value')).toBe(1);
      expect(backing.getItem(`${prefix}_value`)).toBe('1');
      expect(backing.getItem(`${prefix}_other`)).toBe('"keep"');
      expect(config._changed.size).toBe(0);
      expect(failures).toEqual(['value']);
      fail = false;
      config.setValue('value', 2);
      expect(config.getValue('value')).toBe(2);
      expect(backing.getItem(`${prefix}_value`)).toBe('2');
    } finally {
      backing.removeItem(`${prefix}_value`);
      backing.removeItem(`${prefix}_other`);
    }
  });
  test('破損JSONだけを既定値へ戻し、無関係な保存値を消さない', async () => {
    const storage = window.localStorage;
    storage.setItem('settings-corrupt_value', '{broken');
    storage.setItem('settings-corrupt_other', '"keep"');
    const config = DataStorage.create({ value: 7, other: '' }, { prefix: 'settings-corrupt', storage });
    await config.promise('restore');
    expect(config.getValue('value')).toBe(7);
    expect(config.getValue('other')).toBe('keep');
    expect(storage.getItem('settings-corrupt_value')).toBeNull();
    expect(storage.getItem('settings-corrupt_other')).toBe('"keep"');
    storage.removeItem('settings-corrupt_other');
  });
});
