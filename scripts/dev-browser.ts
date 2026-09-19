// 開発用Chromeの起動・停止・状態確認。
// chrome-debug.ps1（9222）とは競合しないよう、独自プロファイルとポート9333を使う。
// Tampermonkey（dev-extensions/tampermonkey）を --load-extension で事前導入する。
// 操作して確かめる用途のため既定は headed で起動し、無人実行時のみ --headless を付ける。
//
//   bun scripts/dev-browser.ts start [--headless]
//   bun scripts/dev-browser.ts status
//   bun scripts/dev-browser.ts stop

const CHROME_PATH = `${import.meta.dir}/../dev-assets/chrome-win64/chrome.exe`;
const PORT = 9333;
const DATA_ROOT = `${process.env['USERPROFILE'] as string}\\Documents\\.browser-debug`;
const PROFILE = `${DATA_ROOT}\\ChromeDev`;
// chrome-debug.ps1 の chrome-debug-state.json とは別名にし、誤停止を防ぐ。
const STATE_PATH = `${DATA_ROOT}\\chrome-dev-browser-state.json`;
const EXT_DIR = `${import.meta.dir}/../dev-extensions/tampermonkey`;

interface State {
  pid: number;
  port: number;
}

async function isReady(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    const data = (await res.json()) as { webSocketDebuggerUrl?: string };
    return typeof data.webSocketDebuggerUrl === 'string' && data.webSocketDebuggerUrl.length > 0;
  } catch {
    return false;
  }
}

async function waitReady(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReady()) {
      return true;
    }
    await Bun.sleep(250);
  }
  return false;
}

async function readState(): Promise<State | null> {
  try {
    const text = await Bun.file(STATE_PATH).text();
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const pid = (parsed as { pid?: unknown }).pid;
    if (typeof pid !== 'number') {
      return null;
    }
    return { pid, port: PORT };
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function start(headed: boolean): Promise<void> {
  if (await isReady()) {
    console.log(`起動済みです: http://127.0.0.1:${PORT}`);
    return;
  }
  if (!(await Bun.file(`${EXT_DIR}/manifest.json`).exists())) {
    throw new Error('拡張機能が展開されていません。先に bun run dev:setup を実行してください');
  }
  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--remote-allow-origins=*',
    `--load-extension=${EXT_DIR}`,
    '--mute-audio',
  ];
  if (!headed) {
    args.push('--headless=new', '--disable-gpu');
  }
  args.push('about:blank');
  // Bun.spawn の子は親終了に追従するため、Start-Process で切り離して起動する。
  // -ArgumentList の要素は PowerShell がダブルクォートを剥がして1引数ずつ渡す。
  const psArgs = args.map((a) => `"${a.replace(/"/g, '`"')}"`).join(',');
  const launch = Bun.spawnSync([
    'powershell',
    '-NoProfile',
    '-Command',
    `$p = Start-Process -FilePath "${CHROME_PATH}" -ArgumentList @(${psArgs}) ${headed ? '' : '-WindowStyle Hidden'} -PassThru; $p.Id`,
  ]);
  if (launch.exitCode !== 0) {
    throw new Error(`Chrome の起動に失敗しました: ${launch.stderr.toString().slice(0, 300)}`);
  }
  const pid = Number(launch.stdout.toString().trim());
  if (!Number.isInteger(pid)) {
    throw new Error('Chrome のプロセスIDを取得できませんでした');
  }
  await Bun.write(STATE_PATH, `${JSON.stringify({ pid, port: PORT })}\n`);
  if (!(await waitReady(15000))) {
    throw new Error(`DevTools エンドポイントが準備できませんでした (port ${PORT})`);
  }
  console.log(`起動しました: http://127.0.0.1:${PORT} (pid ${pid}, ${headed ? 'headed' : 'headless'})`);
}

async function stop(): Promise<void> {
  const state = await readState();
  if (state === null) {
    console.log('起動していません');
    return;
  }
  if (isPidAlive(state.pid)) {
    Bun.spawnSync(['taskkill', '/PID', String(state.pid), '/T', '/F']);
  }
  Bun.spawnSync([
    'powershell',
    '-NoProfile',
    '-Command',
    `Remove-Item -LiteralPath '${STATE_PATH}' -Force -ErrorAction SilentlyContinue`,
  ]);
  console.log('停止しました');
}

async function main(): Promise<void> {
  const action = Bun.argv[2] ?? 'status';
  if (action === 'start') {
    await start(!Bun.argv.includes('--headless'));
  } else if (action === 'stop') {
    await stop();
  } else if (action === 'status') {
    console.log((await isReady()) ? `起動中: http://127.0.0.1:${PORT}` : '停止中');
  } else {
    throw new Error(`不明な操作です: ${action}（start/stop/status）`);
  }
}

void main();
