// 開発用Chromeの起動・停止・状態確認。
// chrome-debug.ps1（9222）とは競合しないよう、独自プロファイルとポート9333を使う。
// Tampermonkey（dev-extensions/tampermonkey）を --load-extension で事前導入する。
// 手動用はheaded、自動テスト用(--test)は別ポート・別プロファイルのheadless。
//
//   bun scripts/dev-browser.ts start [--test]
//   bun scripts/dev-browser.ts status
//   bun scripts/dev-browser.ts stop

import { resolve } from 'node:path';
import { unlink } from 'node:fs/promises';

export function browserEnvironment(testing: boolean) {
  const dataRoot = testing
    ? resolve(import.meta.dir, '../dev-assets/browser-tests')
    : resolve(process.env.USERPROFILE ?? '', 'Documents/.browser-debug');
  return {
    port: testing ? 9334 : 9333,
    profile: resolve(dataRoot, testing ? 'profile' : 'ChromeDev'),
    statePath: resolve(dataRoot, testing ? 'state.json' : 'chrome-dev-browser-state.json'),
    chromePath: resolve(import.meta.dir, '../dev-assets/chrome-win64/chrome.exe'),
    extensionDir: resolve(import.meta.dir, '../dev-extensions/tampermonkey'),
    headed: !testing,
  };
}

const TESTING = Bun.argv.includes('--test');
const {
  chromePath: CHROME_PATH,
  port: PORT,
  profile: PROFILE,
  statePath: STATE_PATH,
  extensionDir: EXT_DIR,
  headed,
} = browserEnvironment(TESTING);

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
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0 || (parsed as { port?: unknown }).port !== PORT) {
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
    if (TESTING) throw new Error('自動テスト用ブラウザは使用中です。実行中のテストが終了してから再実行してください。');
    const info = (await fetch(`http://127.0.0.1:${PORT}/json/version`).then((res) => res.json())) as {
      'User-Agent'?: string;
    };
    if (info['User-Agent']?.includes('HeadlessChrome')) {
      throw new Error(
        '手動検証用ポートでheadlessブラウザが起動中です。bun run dev:stop の後、bun run dev を実行してください。'
      );
    }
    console.log(`起動済みです: http://127.0.0.1:${PORT}`);
    return;
  }
  if (!TESTING && !(await Bun.file(`${EXT_DIR}/manifest.json`).exists())) {
    throw new Error('拡張機能が展開されていません。先に bun run dev:setup を実行してください');
  }
  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--remote-allow-origins=*',
  ];
  if (!TESTING) args.push(`--load-extension=${EXT_DIR}`);
  if (TESTING && process.env.FUTATSUME_TEST_OFFLINE === '1') {
    // 未捕捉のWorker/タブも外部へ送信させない。応答はCDP側で明示的に供給する。
    args.push('--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>', '--disable-quic');
  }
  if (!headed) {
    args.push('--headless=new', '--disable-gpu', '--mute-audio');
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
    await stop();
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
    const killed = Bun.spawnSync(['taskkill', '/PID', String(state.pid), '/T', '/F']);
    if (killed.exitCode !== 0) throw new Error(`専用ブラウザを停止できませんでした: ${killed.stderr.toString()}`);
  }
  await unlink(STATE_PATH);
  console.log('停止しました');
}

async function main(): Promise<void> {
  const action = Bun.argv[2] ?? 'status';
  if (Bun.argv.includes('--headless')) throw new Error('無人検証は bun run test:browser を使ってください。');
  if (action === 'start') {
    await start(headed);
  } else if (action === 'stop') {
    await stop();
  } else if (action === 'status') {
    console.log((await isReady()) ? `起動中: http://127.0.0.1:${PORT}` : '停止中');
  } else {
    throw new Error(`不明な操作です: ${action}（start/stop/status）`);
  }
}

if (import.meta.main) await main();
