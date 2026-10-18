import { attach, attachBrowser, cleanupCdp, evaluate, listTargets } from './dev-cdp';
import { offlineSites } from './dev-offline';
import { clickVisible } from './dev-ui';
import { verificationDirectory } from './dev-verification-output';

/** Each authentication state starts in a new document, as the real bootstrap does. */
export async function verifyAuthentication(source: string): Promise<string[]> {
  const browser = await attachBrowser();
  const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
  const { targetInfo } = (await browser.send('Target.getTargetInfo', { targetId })) as {
    targetInfo: { browserContextId: string };
  };
  const page = await attach((await listTargets()).find((target) => target.id === targetId)!);
  const site = offlineSites.get(page)!;
  const checks: string[] = [];
  async function check(expression: string, label: string): Promise<void> {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await evaluate(page, expression)) {
        checks.push(label);
        console.log(`合格: P4-05 ${label}`);
        return;
      }
      await Bun.sleep(100);
    }
    throw Error(`P4-05 ${label}`);
  }
  async function openDocument(): Promise<void> {
    const before = Number(await evaluate(page, 'performance.timeOrigin'));
    await page.send('Page.navigate', { url: 'https://www.nicovideo.jp/watch/sm9' });
    await page.send('Page.bringToFront');
    await check(
      `performance.timeOrigin!==${before} && !!window.FutatsumeWatch?.ready && document.querySelector('[data-futatsume-open]')?.disabled===false`,
      '認証シーンの新文書を初期化'
    );
    await clickVisible(page, '[data-futatsume-open]');
    await check(`document.querySelector('futatsume-video')?.currentTime>.1`, '認証シーンでも実映像を再生');
  }
  try {
    await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `document.addEventListener('DOMContentLoaded',()=>{${source}\n},{once:true})`,
    });
    site.auth.isLogin = false;
    await openDocument();
    await check(
      `document.querySelector('.commentInput').disabled && document.querySelector('.commentSubmit').disabled && document.querySelector('.commentPostStatus').dataset.state==='unavailable' && !!document.querySelector('.commentPostStatus').textContent`,
      'ゲスト情報から投稿入力を無効にし理由を表示'
    );
    if (site.writes.length) throw Error('ゲスト表示だけで書込み要求が発生しました');
    site.auth.isLogin = true;
    site.auth.pageMetadata = false;
    site.auth.postKeyStatus = 401;
    await openDocument();
    await check(`!document.querySelector('.commentInput').disabled`, 'ログイン情報の新文書で投稿入力を有効化');
    await check(
      `!document.querySelector('#CommonHeader,meta[name="server-response"]') && !document.querySelector('#futatsumeVideoPlayerDialog').classList.contains('is-guest') && window.FutatsumeWatch.util.isLogin() && !window.FutatsumeWatch.util.isPremium()`,
      'ヘッダー不在でも取得した一般会員viewerを入力・guest表示へ反映'
    );
    await clickVisible(page, '.commentInput');
    await page.send('Input.insertText', { text: '認証拒否からの復帰' });
    for (const type of ['keyDown', 'keyUp'])
      await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await check(
      `document.querySelector('.commentInput').value==='認証拒否からの復帰' && document.querySelector('.commentPostStatus').dataset.state==='error' && !document.querySelector('.commentInput').disabled`,
      '投稿キー401を成功扱いせず本文と理由を保持'
    );
    if (site.writes.length) throw Error('投稿キー拒否後に投稿本文を送信しました');
    site.auth.postKeyStatus = 200;
    await clickVisible(page, '.commentSubmit');
    await check(
      `document.querySelector('.commentInput').value==='' && !document.querySelector('.commentInput').disabled && document.querySelector('.commentPostStatus').dataset.state!=='error'`,
      '認証回復後の再送が成功して本文を消す'
    );
    if (site.writes.length !== 1 || site.comments.filter((c) => c.body === '認証拒否からの復帰').length !== 1)
      throw Error('認証回復後の投稿が1要求1受理になりませんでした');
    checks.push('認証拒否は0投稿、回復後は1要求1受理');
    site.auth.isLogin = false;
    site.faults.watchLoginRequired = true;
    const externalUrl = 'https://dic.nicovideo.jp/a/watch-login-fixture';
    site.documents.set(
      'https://www.nicovideo.jp/robots.txt',
      '<!doctype html><html><head><link rel="icon" href="data:,"></head><body></body></html>'
    );
    site.documents.set(
      externalUrl,
      '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><a href="https://nico.ms/sm9">制限動画</a></body></html>'
    );
    let deniedRequests = 0;
    page.onEvent((method, params) => {
      if (
        method === 'Network.requestWillBeSent' &&
        String((params.request as { url: string }).url).includes('/watch/sm9?responseType=json')
      )
        deniedRequests++;
    });
    await page.send('Page.navigate', { url: externalUrl });
    await page.send('Page.bringToFront');
    await check(
      `window.FutatsumeWatch?.ready&&!!document.querySelector('[data-futatsume-video="sm9"]:not(:disabled)')`,
      '大百科相当ページに制限動画の起動ボタンを表示'
    );
    await clickVisible(page, '[data-futatsume-video="sm9"]');
    await check(
      `window.FutatsumeWatch.debug.dialog._state.isError&&/ログイン|Sign in/.test(document.querySelector('.errorMessageContainer').textContent)&&document.querySelector('futatsume-video').paused`,
      '未ログインの制限動画をHTTP400だけでなくログイン案内で停止'
    );
    await Bun.sleep(700);
    if (deniedRequests !== 1) throw Error('ログイン拒否を自動再送しました');
    checks.push('ログイン拒否の動画情報要求は1回だけ');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 700,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await check(
      `(()=>{const r=document.querySelector('.onErrorMenu').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.height>=44})()`,
      '狭幅でもログイン案内の公式ページボタンを画面内に配置'
    );
    const deniedImage = (await page.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await Bun.write(
      new URL('watch-login-required-390.png', verificationDirectory),
      Buffer.from(deniedImage.data, 'base64')
    );
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const before = (await browser.send('Target.getTargets')) as { targetInfos: Array<{ targetId: string }> };
    await clickVisible(page, '.onErrorMenu [data-command="openGinza"]');
    let opened: { targetId: string; url: string } | undefined;
    const until = Date.now() + 10000;
    while (!opened && Date.now() < until) {
      const targets = (await browser.send('Target.getTargets')) as {
        targetInfos: Array<{ targetId: string; url: string }>;
      };
      opened = targets.targetInfos.find(
        (t) =>
          !before.targetInfos.some((previous) => previous.targetId === t.targetId) &&
          t.url === 'https://www.nicovideo.jp/watch/sm9'
      );
      if (!opened) await Bun.sleep(100);
    }
    if (!opened) throw Error('ログイン用の公式視聴ページが開きません');
    checks.push('ログイン案内から対象動画の公式視聴ページを開く');
    await browser.send('Target.closeTarget', { targetId: opened.targetId });
    site.auth.isLogin = true;
    await clickVisible(page, '.onErrorMenu [data-command="reload"]');
    await check(
      `!window.FutatsumeWatch.debug.dialog._state.isError&&document.querySelector('futatsume-video').readyState>=3`,
      'ログイン後の明示的な再読込で映像へ復帰'
    );
    return checks;
  } finally {
    await cleanupCdp(
      () => page.close(),
      () => browser.send('Target.disposeBrowserContext', { browserContextId: targetInfo.browserContextId }),
      () => browser.close()
    );
  }
}
