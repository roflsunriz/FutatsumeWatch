import { resolve } from 'node:path';
import { browserEnvironment } from './dev-browser';
import { browserTestOptions } from './browser-test-options';
import type { BrowserSuite } from './browser-test-options';
import { createHash, randomUUID } from 'node:crypto';
import { assertBrowserCoverage } from './browser-test-coverage';

const reportNames: Record<BrowserSuite, string> = {
  entry: 'entry-report.json',
  player: 'report.json',
  ui: 'shell-report.json',
  settings: 'settings-report.json',
  migration: 'migration-report.json',
  addons: 'addons.json',
  functionality: 'functionality-report.json',
  library: 'library-report.json',
  guard: 'offline-guard-report.json',
};

const suites: Readonly<Record<BrowserSuite, readonly string[]>> = {
  entry: ['scripts/dev-verify-entry.ts', '--bundle'],
  player: ['scripts/dev-verify.ts', '--bundle'],
  ui: ['scripts/dev-verify-shell.ts'],
  settings: ['scripts/dev-verify-settings.ts'],
  migration: ['scripts/dev-verify-migration.ts'],
  addons: ['scripts/dev-verify-addons.ts'],
  functionality: ['scripts/dev-verify-functionality.ts'],
  library: ['scripts/dev-verify-library.ts'],
  guard: ['scripts/dev-verify-offline-guard.ts'],
};

const { selected, mode, url } = browserTestOptions(Bun.argv.slice(2));
const output = resolve(
  import.meta.dir,
  '../dev-assets/verification',
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}-${randomUUID().slice(0, 8)}`
);
const env = {
  ...process.env,
  FUTATSUME_DEV_PORT: String(browserEnvironment(true).port),
  FUTATSUME_TEST_OFFLINE: mode === 'offline' ? '1' : '0',
  FUTATSUME_TEST_OUTPUT: output,
};
async function run(args: readonly string[], suite?: BrowserSuite): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: resolve(import.meta.dir, '..'),
    env: {
      ...env,
      FUTATSUME_TEST_OUTPUT: suite ? resolve(output, suite) : output,
      ...(suite === 'addons' ? { FUTATSUME_TEST_OFFLINE: '1' } : {}),
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await child.exited) !== 0) throw new Error(`自動テストの処理に失敗しました: ${args.join(' ')}`);
}

await run(['scripts/dev-setup.ts', '--if-missing', '--chrome-only']);
await run(['scripts/dev-browser.ts', 'start', '--test']);
const errors: unknown[] = [];
const results: Array<{
  suite: BrowserSuite;
  checks: number;
  durationMs: number;
  coverage: { parents: string[]; settings: number };
}> = [];
let bundleSha256: string | undefined;
let browserVersion: unknown;
try {
  // 使用中ならビルドより先に停止し、ほかの実行が読むdistを上書きしない。
  await run(['scripts/build.ts']);
  bundleSha256 = createHash('sha256')
    .update(new Uint8Array(await Bun.file(resolve(import.meta.dir, '../dist/FutatsumeWatch.user.js')).arrayBuffer()))
    .digest('hex');
  browserVersion = await fetch(`http://127.0.0.1:${env.FUTATSUME_DEV_PORT}/json/version`).then((response) =>
    response.json()
  );
  for (const name of selected) {
    const started = Date.now();
    console.log(`自動テスト: ${name}`);
    await run([...suites[name], ...(url ? ['--url', url] : [])], name);
    const result: unknown = await Bun.file(resolve(output, name, reportNames[name])).json();
    const coverage = assertBrowserCoverage(name, result);
    results.push({
      suite: name,
      checks: coverage.count,
      durationMs: Date.now() - started,
      coverage: { parents: coverage.parents, settings: coverage.settings },
    });
  }
} catch (error) {
  errors.push(error);
} finally {
  try {
    await run(['scripts/dev-browser.ts', 'stop', '--test']);
  } catch (error) {
    errors.push(error);
  }
  await Bun.write(
    resolve(output, 'run.json'),
    JSON.stringify(
      {
        mode,
        selected,
        results,
        bundleSha256,
        browserVersion,
        platform: process.platform,
        commit: Bun.spawnSync(['git', 'rev-parse', 'HEAD']).stdout.toString().trim(),
        changedFiles: Bun.spawnSync(['git', 'status', '--porcelain=v1', '--untracked-files=all'])
          .stdout.toString()
          .trim()
          .split(/\r?\n/)
          .filter(Boolean),
        completed: errors.length === 0 && results.length === selected.length,
        errors: errors.map(String),
      },
      null,
      2
    )
  );
}
if (errors.length) throw new AggregateError(errors, `ブラウザ検証に失敗しました: ${output}`);
console.log(`ブラウザ検証成功: ${output}`);
