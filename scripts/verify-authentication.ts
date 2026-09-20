import { attach, attachBrowser, cleanupCdp, evaluate, listTargets } from './dev-cdp';
import { offlineSites } from './dev-offline';
import { clickVisible } from './dev-ui';

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
    site.auth.postKeyStatus = 401;
    await openDocument();
    await check(`!document.querySelector('.commentInput').disabled`, 'ログイン情報の新文書で投稿入力を有効化');
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
    return checks;
  } finally {
    await cleanupCdp(
      () => page.close(),
      () => browser.send('Target.disposeBrowserContext', { browserContextId: targetInfo.browserContextId }),
      () => browser.close()
    );
  }
}
