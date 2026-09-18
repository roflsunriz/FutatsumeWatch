// `bun run build` のエントリーポイント。
// 既存の build.js（//@require 連結方式）へ委譲し、生成物を検証する薄い TypeScript 層。

import { readdirSync } from 'node:fs';
import { isDevUserscript, parseUserscriptVersion, resolveUserscriptOutFile } from '../src/version';

function hasFlag(flag: string): boolean {
  return Bun.argv.includes(flag);
}

function fail(message: string): never {
  console.error(`ビルド失敗: ${message}`);
  process.exit(1);
}

function checkClassicScriptSyntax(path: string): void {
  // 生成物は classic script として配信される。静的な import/export 宣言が
  // 混入すると実行時 SyntaxError になるため、node --check で構文検証する。
  // 動的 import()・メソッド呼び出し・テンプレート文字列中の断片は正常に通る。
  const result = Bun.spawnSync(['node', '--check', path], { stderr: 'pipe', stdout: 'pipe' });
  if (result.exitCode !== 0) {
    const detail = result.stderr.toString().trim().split('\n').slice(0, 3).join('\n');
    fail(`構文検証に失敗しました: ${path}\n${detail}`);
  }
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

const distDir = `${import.meta.dir}/../dist`;
for (const entry of readdirSync(distDir)) {
  if (entry.endsWith('.user.js')) {
    checkClassicScriptSyntax(`${distDir}/${entry}`);
  }
}

console.log(`ビルド成功: ${outFile} (@version ${version})`);
