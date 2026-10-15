import { describe, expect, it } from 'bun:test';
import { shutdownBrowser } from '../../scripts/browser-shutdown';

describe('専用ブラウザの停止確認', () => {
  it('通常終了で親と子が消えた場合は強制終了しない', async () => {
    const alive = new Set([10, 11]);
    let killed = false;
    await shutdownBrowser({
      pids: [10, 11],
      isAlive: (pid) => alive.has(pid),
      close() {
        alive.clear();
        return Promise.resolve();
      },
      kill() {
        killed = true;
        return undefined;
      },
      sleep: () => Promise.resolve(),
    });
    expect(killed).toBe(false);
  });

  it('taskkillが子の終了競合を報告しても、全PIDの消滅を確認した場合は成功する', async () => {
    const alive = new Set([10, 11]);
    let killed = false;
    await shutdownBrowser({
      pids: [10, 11],
      isAlive: (pid) => alive.has(pid),
      close() {
        return Promise.reject(new Error('接続なし'));
      },
      kill() {
        killed = true;
        alive.delete(10);
        return 'child operation not supported';
      },
      sleep() {
        if (killed) alive.delete(11);
        return Promise.resolve();
      },
    });
    expect(killed).toBe(true);
    expect(alive.size).toBe(0);
  });

  for (const killError of [undefined, 'child operation not supported']) {
    it(`親だけ終了して子が残れば、taskkillの成功/失敗にかかわらず拒否する (${killError ?? 'exit 0'})`, async () => {
      const alive = new Set([10, 11]);
      const failure = await shutdownBrowser({
        pids: [10, 11],
        isAlive: (pid) => alive.has(pid),
        close() {
          alive.delete(10);
          return Promise.resolve();
        },
        kill() {
          return killError;
        },
        sleep: () => Promise.resolve(),
      }).then(
        () => '',
        (error: unknown) => String(error)
      );
      expect(failure).toContain('残存PID 11');
    });
  }
});
