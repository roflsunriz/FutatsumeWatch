import { describe, expect, it } from 'bun:test';
import { browserProcessTree, remainingBrowserPids, shutdownBrowser } from '../../scripts/browser-shutdown';

describe('専用ブラウザの停止確認', () => {
  it('親 PID が再利用された場合に、親より古い無関係な子孫を収集しない', () => {
    const rows = [
      { pid: 44, parentPid: 43, started: '2026-10-31T05:00:12.0000000Z' },
      { pid: 10, parentPid: 42, started: '2026-10-31T05:00:01.0000000Z' },
      { pid: 11, parentPid: 10, started: '2026-10-31T05:00:02.0000000Z' },
      { pid: 42, parentPid: 1, started: '2026-10-31T05:00:10.0000000Z' },
      { pid: 43, parentPid: 42, started: '2026-10-31T05:00:11.0000000Z' },
    ];
    expect(browserProcessTree(rows, 42).map((row) => row.pid)).toEqual([42, 43, 44]);
    expect(() => browserProcessTree(rows, 99)).toThrow('親プロセス');
  });

  it('停止後に PID が再利用された場合、新しいプロセスを残存対象に含めない', () => {
    const expected = [
      { pid: 42, parentPid: 1, started: '2026-10-31T05:00:10.0000000Z' },
      { pid: 43, parentPid: 42, started: '2026-10-31T05:00:11.0000000Z' },
    ];
    const current = [{ pid: 42, parentPid: 2, started: '2026-10-31T05:00:12.0000000Z' }, expected[1]!];
    expect(remainingBrowserPids(expected, current)).toEqual([43]);
    expect(remainingBrowserPids(expected, [])).toEqual([]);
  });

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

  it('強制終了が子の終了競合を報告しても、全PIDの消滅を確認した場合は成功する', async () => {
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
    it(`親だけ終了して子が残れば、強制終了の成功/失敗にかかわらず拒否する (${killError ?? 'exit 0'})`, async () => {
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
