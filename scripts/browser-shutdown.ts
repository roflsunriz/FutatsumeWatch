import { realpathSync } from 'node:fs';

interface ShutdownOperations {
  pids: readonly number[];
  isAlive(pid: number): boolean;
  close(): Promise<void>;
  kill(): string | undefined;
  sleep(): Promise<void>;
}

export interface BrowserProcess {
  pid: number;
  parentPid: number;
  started: string;
}

export async function shutdownBrowser(operations: ShutdownOperations): Promise<void> {
  const remaining = () => operations.pids.filter((pid) => operations.isAlive(pid));
  const wait = async () => {
    for (let i = 0; i < 30 && remaining().length; i++) await operations.sleep();
    return remaining();
  };
  let closeError: string | undefined;
  try {
    await operations.close();
  } catch (error) {
    closeError = String(error);
  }
  if (!(await wait()).length) return;
  const killError = operations.kill();
  const alive = await wait();
  // 強制終了の結果だけで判定せず、採取した各プロセスの終了を確認する。
  if (alive.length)
    throw new Error(
      `専用ブラウザを停止できませんでした: 残存PID ${alive.join(', ')}; ${killError ?? closeError ?? '停止確認がタイムアウトしました'}`
    );
}

// Windows の親 PID は再利用される。親より古いプロセスは子として採取しない。
export function browserProcessTree(rows: readonly BrowserProcess[], rootPid: number): BrowserProcess[] {
  const root = rows.find((row) => row.pid === rootPid);
  if (!root) throw new Error('専用ブラウザの親プロセスを確認できません');
  const selected = new Map([[root.pid, root]]);
  let changed: boolean;
  do {
    changed = false;
    for (const row of rows) {
      const parent = selected.get(row.parentPid);
      if (parent && !selected.has(row.pid) && row.started >= parent.started) {
        selected.set(row.pid, row);
        changed = true;
      }
    }
  } while (changed);
  return [...selected.values()];
}

// PID が再利用されても、作成時刻が異なる別プロセスを残存対象に含めない。
export function remainingBrowserPids(
  expected: readonly BrowserProcess[],
  current: readonly BrowserProcess[]
): number[] {
  const currentByPid = new Map(current.map((row) => [row.pid, row.started]));
  return expected.filter((row) => currentByPid.get(row.pid) === row.started).map((row) => row.pid);
}

function browserPaths(chromePath: string): string[] {
  return [...new Set([chromePath, realpathSync(chromePath)])];
}

function processSnapshot(chromePath: string, port?: number): { rows: BrowserProcess[]; listeners: number[] } {
  const result = Bun.spawnSync({
    cmd: [
      'powershell',
      '-NoProfile',
      '-Command',
      `
      $ErrorActionPreference='Stop'
      $paths=ConvertFrom-Json -InputObject $env:FUTATSUME_BROWSER_PATHS
      $rows=@(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'chrome.exe' -and $_.ExecutablePath -and $_.CreationDate -and $paths -contains $_.ExecutablePath
      } | ForEach-Object {
        @{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;started=$_.CreationDate.ToUniversalTime().ToString('O')}
      })
      $listeners=@()
      if ($env:FUTATSUME_BROWSER_PORT) {
        $listeners=@(Get-NetTCPConnection -LocalPort ([int]$env:FUTATSUME_BROWSER_PORT) -State Listen -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.OwningProcess })
      }
      @{rows=$rows;listeners=$listeners} | ConvertTo-Json -Compress -Depth 4
    `,
    ],
    env: {
      ...process.env,
      FUTATSUME_BROWSER_PATHS: JSON.stringify(browserPaths(chromePath)),
      FUTATSUME_BROWSER_PORT: port === undefined ? '' : String(port),
    },
  });
  if (result.exitCode !== 0) throw new Error(`専用ブラウザのプロセスを確認できません: ${result.stderr.toString()}`);
  const parsed: unknown = JSON.parse(result.stdout.toString());
  if (typeof parsed !== 'object' || parsed === null || !('rows' in parsed) || !('listeners' in parsed))
    throw new Error('専用ブラウザのプロセス一覧が不正です');
  const { rows, listeners } = parsed;
  if (
    !Array.isArray(rows) ||
    !rows.every(
      (row: unknown) =>
        typeof row === 'object' &&
        row !== null &&
        'pid' in row &&
        typeof row.pid === 'number' &&
        Number.isInteger(row.pid) &&
        row.pid > 0 &&
        'parentPid' in row &&
        typeof row.parentPid === 'number' &&
        Number.isInteger(row.parentPid) &&
        row.parentPid >= 0 &&
        'started' in row &&
        typeof row.started === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.test(row.started)
    ) ||
    !Array.isArray(listeners) ||
    !listeners.every((pid: unknown) => typeof pid === 'number' && Number.isInteger(pid) && pid > 0)
  )
    throw new Error('専用ブラウザのプロセス一覧が不正です');
  return { rows: rows as BrowserProcess[], listeners: listeners as number[] };
}

export function browserProcessSnapshot(
  rootPid: number,
  port: number,
  chromePath: string
): {
  processes: BrowserProcess[];
  ownsPort: boolean;
} {
  const { rows, listeners } = processSnapshot(chromePath, port);
  const processes = browserProcessTree(rows, rootPid);
  return { processes, ownsPort: listeners.some((pid) => processes.some((row) => row.pid === pid)) };
}

export function browserProcessMonitor(
  expected: readonly BrowserProcess[],
  chromePath: string
): (pid: number) => boolean {
  let checkedAt = 0;
  let alive = new Set<number>();
  return (pid) => {
    if (Date.now() - checkedAt >= 400) {
      alive = new Set(remainingBrowserPids(expected, processSnapshot(chromePath).rows));
      checkedAt = Date.now();
    }
    return alive.has(pid);
  };
}

export function stopBrowserProcesses(expected: readonly BrowserProcess[], chromePath: string): string | undefined {
  const result = Bun.spawnSync({
    cmd: [
      'powershell',
      '-NoProfile',
      '-Command',
      `
      $ErrorActionPreference='Stop'
      $paths=ConvertFrom-Json -InputObject $env:FUTATSUME_BROWSER_PATHS
      $targets=ConvertFrom-Json -InputObject $env:FUTATSUME_BROWSER_TARGETS
      foreach ($target in $targets) {
        $row=@(Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f [int]$target.pid) | Where-Object {
          $_.ExecutablePath -and $paths -contains $_.ExecutablePath -and
          $_.CreationDate -and $_.CreationDate.ToUniversalTime().ToString('O') -eq $target.started
        })
        if ($row.Count -eq 1) { Stop-Process -Id $target.pid -Force -ErrorAction Stop }
      }
    `,
    ],
    env: {
      ...process.env,
      FUTATSUME_BROWSER_PATHS: JSON.stringify(browserPaths(chromePath)),
      FUTATSUME_BROWSER_TARGETS: JSON.stringify(expected),
    },
  });
  return result.exitCode === 0 ? undefined : result.stderr.toString();
}
