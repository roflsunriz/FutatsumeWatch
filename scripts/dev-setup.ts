// 開発用ブラウザの初回セットアップ。
// Tampermonkey の CRX を公式アップデートサービスから取得し、
// 署名検証用ヘッダを除去して dev-extensions/tampermonkey/ へ展開する。
// 取得物は Git 管理外（.gitignore 参照）。再実行時は .meta.json が一致すれば何もしない。

import { createHash } from 'node:crypto';

const TM_UPDATE_URL =
  'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=153.0&acceptformat=crx2,crx3&x=id%3Ddhdgffkkebhmkfjojejmpbldmpobfkfo%26installsource%3Dondemand%26uc';
const EXT_DIR = `${import.meta.dir}/../dev-extensions/tampermonkey`;
const META_PATH = `${import.meta.dir}/../dev-extensions/.meta.json`;
// Google Chrome ブランドでは --load-extension が無視されるため、
// 自動化用の公式バイナリ（Chrome for Testing、同版 153.0.8010.52）を使う。
// https://googlechromelabs.github.io/chrome-for-testing/
const CFT_VERSION = '153.0.8010.52';
const CFT_URL = `https://storage.googleapis.com/chrome-for-testing-public/${CFT_VERSION}/win64/chrome-win64.zip`;
const CFT_DIR = `${import.meta.dir}/../dev-assets/chrome-win64`;
const CFT_META_PATH = `${import.meta.dir}/../dev-assets/.meta.json`;

interface Meta {
  source: string;
  sha256: string;
  bytes: number;
  extractedAt: string;
}

async function setupExtension(): Promise<void> {
  const res = await fetch(TM_UPDATE_URL, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`CRX の取得に失敗しました: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 4).toString('ascii') !== 'Cr24') {
    throw new Error('CRX のマジックを確認できませんでした');
  }
  const version = buf.readUInt32LE(4);
  if (version !== 2 && version !== 3) {
    throw new Error(`未対応の CRX バージョンです: ${version}`);
  }
  const headerLen = buf.readUInt32LE(8);
  const zipStart = 12 + headerLen;
  const zipData = buf.subarray(zipStart);
  if (zipData[0] !== 0x50 || zipData[1] !== 0x4b) {
    throw new Error('ZIP 本体を確認できませんでした');
  }
  const sha256 = createHash('sha256').update(zipData).digest('hex');
  const metaFile = Bun.file(META_PATH);
  if (await metaFile.exists()) {
    const prev = (await metaFile.json()) as Meta;
    if (prev.sha256 === sha256 && (await Bun.file(`${EXT_DIR}/manifest.json`).exists())) {
      console.log(`展開済みのため何もしませんでした (sha256 ${sha256.slice(0, 16)}…)`);
      return;
    }
  }
  const tmpZip = `${import.meta.dir}/../dev-extensions/.tm.zip`;
  await Bun.write(tmpZip, zipData);
  const proc = Bun.spawnSync([
    'powershell',
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${tmpZip}' -DestinationPath '${EXT_DIR}' -Force`,
  ]);
  if (proc.exitCode !== 0) {
    throw new Error(`展開に失敗しました: ${proc.stderr.toString().slice(0, 500)}`);
  }
  await Bun.write(
    META_PATH,
    `${JSON.stringify({ source: TM_UPDATE_URL, sha256, bytes: zipData.length, extractedAt: new Date().toISOString() } satisfies Meta, null, 2)}\n`
  );
  const rmProc = Bun.spawnSync(['powershell', '-NoProfile', '-Command', `Remove-Item -LiteralPath '${tmpZip}' -Force`]);
  if (rmProc.exitCode !== 0) {
    throw new Error(`一時ファイルの削除に失敗しました: ${rmProc.stderr.toString().slice(0, 200)}`);
  }
  console.log(`展開しました: ${EXT_DIR} (sha256 ${sha256.slice(0, 16)}…, ${zipData.length} bytes)`);
}

async function setupChromeForTesting(): Promise<void> {
  const metaFile = Bun.file(CFT_META_PATH);
  if ((await metaFile.exists()) && (await Bun.file(`${CFT_DIR}/chrome.exe`).exists())) {
    const prev = (await metaFile.json()) as { version?: unknown };
    if (prev.version === CFT_VERSION) {
      console.log(`Chrome for Testing は展開済みです (${CFT_VERSION})`);
      return;
    }
  }
  console.log(`Chrome for Testing を取得します (${CFT_VERSION}、約170MB)…`);
  const res = await fetch(CFT_URL, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Chrome for Testing の取得に失敗しました: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error('ZIP を確認できませんでした');
  }
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const tmpZip = `${import.meta.dir}/../dev-assets/.cft.zip`;
  await Bun.write(tmpZip, buf);
  const proc = Bun.spawnSync([
    'powershell',
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${tmpZip}' -DestinationPath '${import.meta.dir}/../dev-assets' -Force`,
  ]);
  if (proc.exitCode !== 0) {
    throw new Error(`展開に失敗しました: ${proc.stderr.toString().slice(0, 500)}`);
  }
  await Bun.write(
    CFT_META_PATH,
    `${JSON.stringify({ source: CFT_URL, version: CFT_VERSION, sha256, bytes: buf.length, extractedAt: new Date().toISOString() }, null, 2)}\n`
  );
  Bun.spawnSync(['powershell', '-NoProfile', '-Command', `Remove-Item -LiteralPath '${tmpZip}' -Force`]);
  console.log(`展開しました: ${CFT_DIR} (sha256 ${sha256.slice(0, 16)}…, ${buf.length} bytes)`);
}

async function main(): Promise<void> {
  const onlyMissing = Bun.argv.includes('--if-missing');
  if (!Bun.argv.includes('--chrome-only') && (!onlyMissing || !(await Bun.file(`${EXT_DIR}/manifest.json`).exists()))) {
    await setupExtension();
  }
  if (!onlyMissing || !(await Bun.file(`${CFT_DIR}/chrome.exe`).exists())) await setupChromeForTesting();
}

await main();
