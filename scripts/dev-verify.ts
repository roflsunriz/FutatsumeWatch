import { verificationDirectory } from './dev-verification-output';
import { attach, attachBrowser, cleanupCdp, evaluate, listTargets } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';
import { verifyCommentOverlay } from './dev-verify-comments';

const outputDir = verificationDirectory;
const urlIndex = Bun.argv.indexOf('--url');
const watchUrl = urlIndex >= 0 ? Bun.argv[urlIndex + 1]! : 'https://www.nicovideo.jp/watch/sm9';
const video = `document.querySelector('#futatsumeVideoPlayerDialog futatsume-video')`;
const root = 'window.FutatsumeWatch';
const checks: string[] = [];

async function until(session: CdpSession, expression: string, label: string, timeout = 30000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(session, expression)) {
      checks.push(label);
      console.log(`合格: ${label}`);
      return;
    }
    await Bun.sleep(250);
  }
  throw new Error(`検証失敗（${timeout / 1000}秒）: ${label}`);
}
async function click(session: CdpSession, command: string): Promise<void> {
  await evaluate(
    session,
    `(() => { const e = document.querySelector('#futatsumeVideoPlayerDialog [data-command="${command}"]'); if (!e) throw new Error('操作ボタンなし: ${command}'); e.click(); })()`
  );
}
async function exec(session: CdpSession, command: string, value?: string | number): Promise<void> {
  await evaluate(
    session,
    `${root}.external.execCommand(${JSON.stringify(command)}, ${JSON.stringify(value) ?? 'undefined'})`
  );
}

async function main(): Promise<void> {
  const browser = await attachBrowser();
  const created = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
  const { targetInfo } = (await browser.send('Target.getTargetInfo', { targetId: created.targetId })) as {
    targetInfo: { browserContextId?: string };
  };
  const browserContextId = targetInfo.browserContextId;
  const target = (await listTargets()).find((t) => t.id === created.targetId);
  if (!target) throw new Error('検証用タブがありません');
  const session = await attach(target);
  const failures: string[] = [];
  const ownWorkerMonitor = process.env.FUTATSUME_TEST_OFFLINE !== '1';
  const workerSubscriptions = new Set<Promise<unknown>>();
  let acceptWorkerSubscriptions = true;
  const report = { url: watchUrl, browserContextId, checks, failures, completed: false };
  session.onEvent((method, params) => {
    if (method === 'Runtime.exceptionThrown') {
      const detail = params.exceptionDetails as { exception?: { description?: string }; url?: string };
      const message = detail.exception?.description ?? '';
      if (/FutatsumeWatch|userscript.html|fw-probe|blob:/.test(message + (detail.url ?? '')))
        failures.push(message.slice(0, 800));
    }
    if (method === 'Target.attachedToTarget' && ownWorkerMonitor && acceptWorkerSubscriptions) {
      const subscription = session.send('Target.sendMessageToTarget', {
        sessionId: params.sessionId,
        message: JSON.stringify({ id: 1, method: 'Runtime.enable' }),
      });
      workerSubscriptions.add(subscription);
      void subscription
        .catch((error: unknown) => failures.push(String(error)))
        .finally(() => workerSubscriptions.delete(subscription));
    }
    if (method === 'Target.receivedMessageFromTarget' && ownWorkerMonitor) {
      const child = JSON.parse(String(params.message)) as {
        method?: string;
        params?: { exceptionDetails?: { exception?: { description?: string } } };
      };
      if (child.method === 'Runtime.exceptionThrown')
        failures.push(child.params?.exceptionDetails?.exception?.description ?? 'Worker例外');
    }
  });
  try {
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    if (Bun.argv.includes('--bundle')) {
      const source = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
      await session.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `document.addEventListener('DOMContentLoaded', () => { ${source}\n }, {once:true});`,
      });
    }
    if (ownWorkerMonitor)
      await session.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await session.send('Page.navigate', { url: watchUrl });
    await session.send('Page.bringToFront');
    await until(
      session,
      `!!${root}?.ready && !!document.querySelector('#futatsumeVideoPlayerDialog')`,
      `${Bun.argv.includes('--bundle') ? '配布物注入' : 'マネージャ経由'}の初期化・プレイヤー生成`
    );
    await until(session, `!!document.querySelector('[data-futatsume-open]')`, '動画ページの再生導線');
    await clickVisible(session, '[data-futatsume-open]');
    await until(
      session,
      `${video}?.readyState >= 3 && ${video}.currentTime > 0.5 && !${video}.paused && !${video}.error`,
      'HLS再生・時間進行'
    );
    await until(
      session,
      `(() => { const r=${root}.debug.nicoCommentPlayer?._view?.renderer; const c=r?.canvas; return r?.comments.length>0 && r.activeComments.size>0 && c?.width>0 && c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0); })()`,
      'コメント取得・解析・画面描画'
    );
    checks.push(...(await verifyCommentOverlay(session)));
    await click(session, 'togglePlay');
    await until(session, `${video}.paused`, '再生ボタンで一時停止', 5000);
    await exec(session, 'seek', 30);
    await until(session, `Math.abs(${video}.currentTime - 30) < 1`, '30秒へのシーク', 10000);
    const mute = await evaluate(session, `${video}.muted`);
    await click(session, 'toggle-mute');
    await until(session, `${video}.muted !== ${String(mute)}`, 'ミュート切替', 5000);
    await click(session, 'toggle-mute');
    await until(session, `${video}.muted === ${String(mute)}`, 'ミュート復帰', 5000);
    await click(session, 'togglePlay');
    await until(session, `!${video}.paused && ${video}.currentTime > 30.2`, 'シーク後の再生復帰', 10000);
    await click(session, 'toggle-showComment');
    await until(session, `!${root}.debug.nicoCommentPlayer._view._isShow`, 'コメント非表示', 5000);
    await click(session, 'toggle-showComment');
    await until(session, `${root}.debug.nicoCommentPlayer._view._isShow`, 'コメント再表示', 5000);
    await until(session, `!!window.MylistPocket?.isReady && !!window.uQuery`, 'マイリスト・DOM補助機能の初期化', 10000);
    await evaluate(
      session,
      `window.__fwQuery = function find(selector, root=document) { const found=root.querySelector(selector); if(found) return found; for(const element of root.querySelectorAll('*')) { if(element.shadowRoot) {const found=find(selector,element.shadowRoot);if(found)return found;} } return null; };`
    );
    await click(session, 'toggleAdvancedSettings');
    await until(session, `!!document.querySelector('.futatsumeAdvancedSettingPanel.show')`, '詳細設定を開く', 5000);
    const setting = 'enableFullScreenOnDoubleClick';
    const oldSetting = await evaluate(session, `${root}.config.getValue('${setting}')`);
    await evaluate(
      session,
      `document.querySelector('.futatsumeAdvancedSettingPanel [data-setting-name="${setting}"]').click()`
    );
    await until(
      session,
      `${root}.config.getValue('${setting}') !== ${String(oldSetting)} && JSON.parse(localStorage.getItem('FutatsumeWatch_${setting}')) !== ${String(oldSetting)}`,
      '詳細設定の変更と永続化',
      5000
    );
    await evaluate(
      session,
      `document.querySelector('.futatsumeAdvancedSettingPanel [data-setting-name="${setting}"]').click(); document.querySelector('.futatsumeAdvancedSetting-close').click()`
    );
    await until(
      session,
      `!document.querySelector('.futatsumeAdvancedSettingPanel.show') && ${root}.config.getValue('${setting}') === ${String(oldSetting)}`,
      '詳細設定を復元して閉じる',
      5000
    );
    const playlistEnabled = await evaluate(session, `${root}.debug.playlist.isEnable`);
    await evaluate(session, `window.MylistPocket.external.info('sm9')`);
    await until(
      session,
      `document.querySelector('#mylistPocket-popup')?.classList.contains('is-ok') && document.querySelector('#mylistPocket-popup').classList.contains('show')`,
      'MylistPocketの動画情報を取得して表示',
      10000
    );
    await until(
      session,
      `!window.__fwQuery('[data-command="deflist-add"],[data-command="mylist-window"],[data-command="open-mylist-open"],[data-command="twitter-hash-open"],[data-command="toggle-setting"]',document.querySelector('#mylistPocket-popup').shadowRoot)`,
      '動画詳細情報から不要な5ボタンを削除',
      5000
    );
    await evaluate(session, `window.MylistPocket.external.hide()`);
    await until(
      session,
      `!document.querySelector('#mylistPocket-popup').classList.contains('show')`,
      'MylistPocketの情報を閉じる',
      5000
    );
    await exec(session, 'togglePlaylist');
    await until(
      session,
      `${root}.debug.playlist.isEnable !== ${String(playlistEnabled)}`,
      'プレイリストの有効化切替',
      5000
    );
    await exec(session, 'togglePlaylist');
    await until(
      session,
      `${root}.debug.playlist.isEnable === ${String(playlistEnabled)}`,
      'プレイリストの状態復元',
      5000
    );
    await click(session, 'settingPanel');
    await until(session, `!!document.querySelector('futatsume-setting-panel')?.state.isOpen`, '本体設定を開く', 5000);
    await evaluate(session, `document.querySelector('futatsume-setting-panel').close()`);
    await until(session, `!document.querySelector('futatsume-setting-panel').state.isOpen`, '本体設定を閉じる', 5000);
    for (const [width, height] of [
      [640, 480],
      [390, 844],
      [1920, 1080],
    ]) {
      await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await until(
        session,
        `(()=>{const r=document.querySelector('#futatsumeVideoPlayerDialog').getBoundingClientRect();const p=document.querySelector('#futatsumeVideoPlayerDialog .futatsumePlayerContainer').getBoundingClientRect();return r.width>0 && r.left>=-1 && r.right<=innerWidth+1 && r.top>=-1 && r.bottom<=innerHeight+1 && p.left>=-1 && p.right<=innerWidth+1;})()`,
        `${width}×${height}でプレイヤーが画面内に収まる`,
        5000
      );
      const viewport = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
      await Bun.write(new URL(`viewport-${width}x${height}.png`, outputDir), Buffer.from(viewport.data, 'base64'));
    }
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await exec(session, 'close');
    await Bun.sleep(300);
    await until(
      session,
      `${root}.debug.nicoCommentPlayer._view.renderer === null && !document.querySelector('[data-futatsume-comment-canvas]')`,
      '閉じるとCanvasと描画処理を解放し、遅延通知でも再生成しない',
      5000
    );
    await until(
      session,
      `!document.body.classList.contains('showNicoVideoPlayerDialog') && getComputedStyle(document.querySelector('[data-futatsume-open]')).display !== 'none'`,
      'プレイヤーを閉じて再生導線に戻る',
      5000
    );
    await clickVisible(session, '[data-futatsume-open]');
    await until(session, `${video}?.readyState>=3 && !${video}.paused`, '閉じた後の再生復帰', 10000);
    const shot = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await Bun.write(new URL('player.png', outputDir), Buffer.from(shot.data, 'base64'));
    const oldTimeOrigin = await evaluate(session, 'performance.timeOrigin');
    let reloadLoaded = false;
    session.onEvent((method) => {
      if (method === 'Page.loadEventFired') reloadLoaded = true;
    });
    await session.send('Page.reload');
    const reloadDeadline = Date.now() + 30000;
    while (!reloadLoaded && Date.now() < reloadDeadline) await Bun.sleep(50);
    if (!reloadLoaded) throw Error('再読み込み後の文書が読み込まれませんでした');
    await until(
      session,
      `performance.timeOrigin!==${Number(oldTimeOrigin)} && !!${root}?.ready && ${root}.config.getValue('${setting}') === ${String(oldSetting)} && !!document.querySelector('[data-futatsume-open]')`,
      '再読み込み後の初期化と設定保持'
    );
    // Detaching first can invalidate an in-flight Runtime.enable request.
    acceptWorkerSubscriptions = false;
    await Promise.all(workerSubscriptions);
    if (ownWorkerMonitor)
      await session.send('Target.setAutoAttach', { autoAttach: false, waitForDebuggerOnStart: false, flatten: false });
    if (failures.length) throw new Error(`製品またはWorkerの未処理例外: ${failures.join('\n')}`);
    report.completed = true;
    console.log(`実測検証に合格しました（${checks.length}項目）`);
  } finally {
    await Bun.write(new URL('report.json', outputDir), JSON.stringify(report, null, 2) + '\n');
    await cleanupCdp(
      () => session.close(),
      // Disposing an owned context already closes all of its pages.
      () =>
        process.env.FUTATSUME_TEST_OFFLINE === '1' && browserContextId
          ? browser.send('Target.disposeBrowserContext', { browserContextId })
          : browser.send('Target.closeTarget', { targetId: created.targetId }),
      () => browser.close()
    );
  }
}
await main();
