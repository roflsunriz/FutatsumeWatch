import { describe, expect, test } from 'bun:test';
import { DataStorage } from '../../packages/lib/src/infra/data-storage';
import { BaseState } from '../../src/state';

class PlaybackState extends BaseState {
  declare rate: number;
  constructor() {
    super({ rate: 1 });
  }
}

describe('設定の遅延通知と新しい値', () => {
  test('状態updateの再入で新しい通知を消さず古いキー通知も流さない', async () => {
    const state = new PlaybackState();
    const delivered: { value: unknown; current: number }[] = [];
    state.on('update', (_key, value) => {
      if (value === 0.4) state.rate = 1;
    });
    state.onkey('rate', (value) => delivered.push({ value, current: state.rate }));
    state.rate = 0.4;
    await Bun.sleep(30);
    expect(state.rate).toBe(1);
    expect(delivered).toEqual([{ value: 1, current: 1 }]);
  });
  test('次taskで復元した設定へ古いupdateを配送しない', async () => {
    const config = DataStorage.create({ rate: 1 }, { prefix: 'settings-event-latest', readonly: true });
    await config.promise('restore');
    const delivered: { value: unknown; current: unknown }[] = [];
    config.on('update', (_key, value) => delivered.push({ value, current: config.getValue('rate') }));
    config.onkey('rate', (value) => delivered.push({ value, current: config.getValue('rate') }));
    config.setValue('rate', 0.4);
    setTimeout(() => config.setValue('rate', 1), 0);
    await Bun.sleep(30);
    expect(delivered.length).toBeGreaterThan(0);
    expect(delivered.every((entry) => entry.value === entry.current)).toBe(true);
    expect(delivered.at(-1)?.value).toBe(1);
  });
  test('update受信中の再入更新後に古いキー通知を送らない', async () => {
    const config = DataStorage.create({ rate: 1 }, { prefix: 'settings-event-reentrant', readonly: true });
    await config.promise('restore');
    const delivered: { value: unknown; current: unknown }[] = [];
    config.on('update', (_key, value) => {
      if (value === 0.4) config.setValue('rate', 1);
    });
    config.onkey('rate', (value) => delivered.push({ value, current: config.getValue('rate') }));
    config.setValue('rate', 0.4);
    await Bun.sleep(30);
    expect(delivered.length).toBeGreaterThan(0);
    expect(delivered.every((entry) => entry.value === entry.current)).toBe(true);
    expect(delivered.at(-1)?.value).toBe(1);
  });
});
