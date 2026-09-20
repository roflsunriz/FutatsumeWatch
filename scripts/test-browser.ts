import { resolve } from 'node:path';
import { browserEnvironment } from './dev-browser';

const suites: Readonly<Record<string, readonly string[]>> = {
  entry: ['scripts/dev-verify-entry.ts', '--bundle'],
  player: ['scripts/dev-verify.ts', '--bundle'],
  ui: ['scripts/dev-verify-shell.ts'],
  settings: ['scripts/dev-verify-settings.ts'],
  migration: ['scripts/dev-verify-migration.ts'],
  addons: ['scripts/dev-verify-addons.ts'],
};

const requested = Bun.argv[2] ?? 'all';
const selected = requested === 'all' ? Object.keys(suites) : [requested];
for (const name of selected) {
  if (!Object.hasOwn(suites, name)) throw new Error(`不明なテスト: ${name}（all, ${Object.keys(suites).join(', ')}）`);
}
const env = { ...process.env, FUTATSUME_DEV_PORT: String(browserEnvironment(true).port) };
async function run(args: readonly string[]): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: resolve(import.meta.dir, '..'),
    env,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await child.exited) !== 0) throw new Error(`自動テストの処理に失敗しました: ${args.join(' ')}`);
}

await run(['scripts/dev-setup.ts', '--if-missing', '--chrome-only']);
await run(['scripts/dev-browser.ts', 'start', '--test']);
try {
  // 使用中ならビルドより先に停止し、ほかの実行が読むdistを上書きしない。
  await run(['scripts/build.ts']);
  for (const name of selected) {
    console.log(`自動テスト: ${name}`);
    await run([...suites[name]!, ...Bun.argv.slice(3)]);
  }
} finally {
  await run(['scripts/dev-browser.ts', 'stop', '--test']);
}
