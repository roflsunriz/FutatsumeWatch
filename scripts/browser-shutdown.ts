interface ShutdownOperations {
  pids: readonly number[];
  isAlive(pid: number): boolean;
  close(): Promise<void>;
  kill(): string | undefined;
  sleep(): Promise<void>;
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
  // taskkillの終了コードだけで判定しない。親・採取済みの全子PIDが消えた場合だけ成功。
  if (alive.length)
    throw new Error(
      `専用ブラウザを停止できませんでした: 残存PID ${alive.join(', ')}; ${killError ?? closeError ?? '停止確認がタイムアウトしました'}`
    );
}

export function browserProcessSnapshot(rootPid: number, port: number): { pids: number[]; ownsPort: boolean } {
  const result = Bun.spawnSync([
    'powershell',
    '-NoProfile',
    '-Command',
    `
    $ErrorActionPreference='Stop'
    $processRows=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)
    $ownedIds=[System.Collections.Generic.HashSet[int]]::new()
    [void]$ownedIds.Add(${rootPid})
    do {
      $addedChild=$false
      foreach($row in $processRows) {
        if($ownedIds.Contains([int]$row.ParentProcessId) -and $ownedIds.Add([int]$row.ProcessId)) { $addedChild=$true }
      }
    } while($addedChild)
    $listeners=@(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue)
    $ownsListener=@($listeners | Where-Object { $ownedIds.Contains([int]$_.OwningProcess) }).Count -gt 0
    @{pids=@($ownedIds);ownsPort=$ownsListener} | ConvertTo-Json -Compress
  `,
  ]);
  if (result.exitCode !== 0) throw new Error(`専用ブラウザのプロセスを確認できません: ${result.stderr.toString()}`);
  const parsed: unknown = JSON.parse(result.stdout.toString());
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('pids' in parsed) ||
    !('ownsPort' in parsed) ||
    !Array.isArray(parsed.pids) ||
    !parsed.pids.every((pid: unknown) => typeof pid === 'number' && Number.isInteger(pid) && pid > 0) ||
    !parsed.pids.includes(rootPid) ||
    typeof parsed.ownsPort !== 'boolean'
  )
    throw new Error('専用ブラウザのプロセス一覧が不正です');
  return { pids: parsed.pids as number[], ownsPort: parsed.ownsPort };
}
