import { createHash, randomUUID } from 'node:crypto';
import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { VERSION } from '../src/app/version';
import { readmeOptions } from './readme-options';
import type { CdpSession } from './dev-cdp';

const { live, attempt } = readmeOptions(Bun.argv.slice(2));

const id = live ? attempt! : `offline-${randomUUID()}`;
const directory = resolve(import.meta.dir, '../dev-assets/readme-capture', id);
await mkdir(directory, { recursive: true });
// 一度消費したIDは、失敗・中断でも再利用しない。ビルドや起動より前に確保する。
const { open } = await import('node:fs/promises');
const permit = await open(resolve(directory, 'attempt-started.json'), 'wx');
await permit.writeFile(
  JSON.stringify({ id, live, startedAt: new Date().toISOString(), maxNavigations: 1, maxOpenClicks: 1, retry: false })
);
await permit.close();
process.env.FUTATSUME_DEV_PORT = '9335';
process.env.FUTATSUME_SCREENSHOTS_ID = id;
process.env.FUTATSUME_TEST_OFFLINE = live ? '0' : '1';
process.env.FUTATSUME_TEST_OUTPUT = directory;
// dev-cdpは評価時にポートを確定するため、これらは環境設定後に読み込む。
const { attachBrowser, attach, listTargets, evaluate, cleanupCdp } = await import('./dev-cdp');
const { readmeImages, captureEntry, capturePlayer, preparePage, until } = await import('./readme-capture');
const { monitorLiveRead } = await import('./live-capture');
const { captureTampermonkey } = await import('./readme-tampermonkey');
const { clickVisible } = await import('./dev-ui');

async function run(command: string[]): Promise<void> {
  const child = Bun.spawn([process.execPath, ...command], {
    cwd: resolve(import.meta.dir, '..'),
    env: process.env,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (await child.exited) throw new Error(`処理に失敗しました: ${command.join(' ')}`);
}

let browser: CdpSession | undefined, page: CdpSession | undefined;
let contextId: string | undefined;
let owned = false;
let monitor: Awaited<ReturnType<typeof monitorLiveRead>> | undefined;
const failures: string[] = [];
const checks: string[] = [];
let bundleSha256: string | undefined;
try {
  await run(['scripts/dev-browser.ts', 'start', '--screenshots']);
  owned = true;
  await run(['scripts/build.ts']);
  const source = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
  bundleSha256 = createHash('sha256').update(source).digest('hex');
  browser = await attachBrowser();
  const launch = (await browser.send('Browser.getBrowserCommandLine')) as { arguments: string[] };
  if (
    live &&
    (!launch.arguments.includes('--no-proxy-server') ||
      launch.arguments.some((arg) => arg.startsWith('--proxy-server=')))
  )
    throw new Error('撮影ブラウザのプロキシ無効を確認できません');
  if (
    !live &&
    (!launch.arguments.includes('--proxy-server=http://127.0.0.1:9') ||
      launch.arguments.some((arg) => arg.startsWith('--load-extension=')))
  )
    throw new Error('予行の通信遮断と拡張機能なしの起動を確認できません');
  checks.push(live ? '専用Chromeをプロキシ無効で起動' : '予行の禁止プロキシ・拡張機能なしの起動');
  if (live) await captureTampermonkey(browser, directory);
  const context = (await browser.send('Target.createBrowserContext', { proxyServer: 'direct://' })) as {
    browserContextId: string;
  };
  contextId = context.browserContextId;
  if (live) monitor = await monitorLiveRead(browser, contextId, directory);
  const { targetId } = (await browser.send('Target.createTarget', {
    url: 'about:blank',
    browserContextId: contextId,
  })) as { targetId: string };
  if (monitor) page = await monitor.page(targetId);
  else {
    const target = (await listTargets()).find((t) => t.id === targetId);
    if (!target) throw new Error('撮影タブがありません');
    page = await attach(target);
  }
  await preparePage(page);
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `document.addEventListener('DOMContentLoaded',()=>{${source}\n},{once:true})`,
  });
  const nav = (await page.send('Page.navigate', { url: 'https://www.nicovideo.jp/watch/sm9' })) as {
    errorText?: string;
  };
  if (nav.errorText) throw new Error(`初回遷移失敗: ${nav.errorText}`);
  await page.send('Page.bringToFront');
  await captureEntry(page, directory);
  await clickVisible(page, '[data-futatsume-open]:not(:disabled)');
  await until(
    page,
    `(()=>{const v=document.querySelector('futatsume-video')?.shadowRoot?.querySelector('video');return v?.videoWidth>0&&v.currentTime>1&&!v.paused&&!v.error})()`,
    '映像のデコードと時間進行'
  );
  await until(
    page,
    `(()=>{const r=window.FutatsumeWatch.debug.nicoCommentPlayer?._view.renderer;return r?.comments.length>0&&r.canvas.getContext('2d').getImageData(0,0,r.canvas.width,r.canvas.height).data.some((v,i)=>i%4===3&&v>0)})()`,
    'コメントの実描画'
  );
  const before = Number(await evaluate(page, `document.querySelector('futatsume-video').currentTime`));
  await Bun.sleep(500);
  if (Number(await evaluate(page, `document.querySelector('futatsume-video').currentTime`)) <= before)
    throw new Error('再生時間が進んでいません');
  checks.push('起動ボタンの実クリック1回・映像デコード・時間進行・コメント画素');
  await capturePlayer(page, directory);
  checks.push('設定5カテゴリと右4タブの実クリック切替');
} catch (error) {
  failures.push(String(error));
  if (page) {
    try {
      const shot = (await page.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
      await Bun.write(resolve(directory, 'failure.png'), Buffer.from(shot.data, 'base64'));
    } catch (captureError) {
      failures.push(String(captureError));
    }
  }
} finally {
  monitor?.seal();
  try {
    await cleanupCdp(
      () => monitor?.close(),
      () => page?.close(),
      () => (contextId ? browser?.send('Target.disposeBrowserContext', { browserContextId: contextId }) : undefined),
      () => monitor?.flush(),
      () => browser?.close()
    );
  } catch (error) {
    failures.push(String(error));
  }
  try {
    if (owned) await run(['scripts/dev-browser.ts', 'stop', '--screenshots']);
  } catch (error) {
    failures.push(String(error));
  }
  try {
    await monitor?.flush();
  } catch (error) {
    failures.push(String(error));
  }
  if (monitor?.summary().errors.length) failures.push(...monitor.summary().errors);
}

const expected = live
  ? readmeImages
  : readmeImages.filter((name) => !['tampermonkey', 'install', 'update'].includes(name));
const images: Array<{ name: string; sha256: string; bytes: number }> = [];
for (const name of expected) {
  const file = Bun.file(resolve(directory, `${name}.png`));
  if (!(await file.exists())) {
    failures.push(`画像がありません: ${name}`);
    continue;
  }
  const data = new Uint8Array(await file.arrayBuffer());
  images.push({ name, sha256: createHash('sha256').update(data).digest('hex'), bytes: data.byteLength });
}
const manifest = {
  version: VERSION,
  source: live ? 'live-sm9' : 'offline-rehearsal',
  viewport: { width: 1440, height: 900 },
  proxy: live ? 'direct' : 'offline-blocked',
  bundleSha256,
  checks,
  images,
  completed: failures.length === 0,
};
await Bun.write(
  resolve(directory, 'report.json'),
  JSON.stringify({ ...manifest, failures, network: monitor?.summary() }, null, 2)
);
if (failures.length) throw new Error(`画像生成に失敗しました: ${directory}\n${failures.join('\n')}`);
if (live) {
  const destination = resolve(import.meta.dir, '../docs/images');
  await mkdir(destination, { recursive: true });
  for (const name of readmeImages)
    await copyFile(resolve(directory, `${name}.png`), resolve(destination, `${name}.png`));
  await Bun.write(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
console.log(`画像生成成功: ${live ? 'docs/images' : directory}`);
