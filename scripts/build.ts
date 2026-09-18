// `bun run build` のエントリーポイント。
// 既存の build.js（//@require 連結方式）へ委譲し、生成物を検証する薄い TypeScript 層。

import { isDevUserscript, parseUserscriptVersion, resolveUserscriptOutFile } from '../src/version';

function hasFlag(flag: string): boolean {
  return Bun.argv.includes(flag);
}

function fail(message: string): never {
  console.error(`ビルド失敗: ${message}`);
  process.exit(1);
}

const forwardArgs = Bun.argv.slice(2);
const isDev = hasFlag('--dev');

const child = Bun.spawnSync(['bun', './build.js', ...forwardArgs], {
  cwd: import.meta.dir + '/..',
  stdout: 'inherit',
  stderr: 'inherit',
});

if (child.exitCode !== 0) {
  fail(`build.js が exit code ${child.exitCode} で終了しました。`);
}

const outFile = resolveUserscriptOutFile(isDev);
const outPath = `${import.meta.dir}/../${outFile}`;
const file = Bun.file(outPath);
if (!(await file.exists())) {
  fail(`生成物が見つかりません: ${outFile}`);
}

const header = await file.text();
if (!header.includes('==UserScript==')) {
  fail(`${outFile} に ==UserScript== ブロックがありません。`);
}
const version = parseUserscriptVersion(header);
if (version === null) {
  fail(`${outFile} から @version を検出できませんでした。`);
}
if (isDevUserscript(outFile) !== isDev) {
  fail(`dev 指定と生成物名が一致しません: ${outFile}`);
}

console.log(`ビルド成功: ${outFile} (@version ${version})`);
