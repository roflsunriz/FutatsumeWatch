import { attach, attachBrowser, cleanupCdp, evaluate, listTargets } from './dev-cdp';
import { offlineSites } from './dev-offline';
import { clickVisible } from './dev-ui';
import { verifyMediaIdentity } from './verify-media-identity';
import { verificationDirectory } from './dev-verification-output';

export async function verifyWatchV4(source: string): Promise<string[]> {
  if (process.env.FUTATSUME_TEST_OFFLINE !== '1') throw new Error('watchV4検証はオフライン専用です');
  const labels: string[] = [];
  for (const name of ['v4-envelope', 'v4-flat', 'v4-html', 'v4-media', 'v4-external'] as const) {
    const format = name === 'v4-external' ? 'v4-envelope' : name;
    const browser = await attachBrowser();
    const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
    const page = await attach((await listTargets()).find((target) => target.id === targetId)!);
    const site = offlineSites.get(page)!;
    site.faults.watchFormat = format;
    if (name === 'v4-external')
      site.documents.set(
        'https://www.nicovideo.jp/robots.txt',
        '<!doctype html><html><head><link rel="icon" href="data:,"></head><body></body></html>'
      );
    const pageUrl =
      name === 'v4-external' ? 'https://anime.nicovideo.jp/watch-v4-fixture' : 'https://www.nicovideo.jp/watch/sm9';
    if (name === 'v4-external')
      site.documents.set(
        pageUrl,
        '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><main><a href="https://www.nicovideo.jp/watch/sm9">検証動画</a></main></body></html>'
      );
    const requests: string[] = [];
    page.onEvent((method, params) => {
      if (method === 'Network.requestWillBeSent') requests.push(String((params.request as { url: string }).url));
    });
    const check = async (expression: string, label: string, timeout = 15000) => {
      const deadline = Date.now() + timeout;
      while (!(await evaluate(page, expression))) {
        if (Date.now() >= deadline) throw new Error(`${name}: ${label}`);
        await Bun.sleep(100);
      }
      labels.push(`watchV4/${name}: ${label}`);
      console.log(`合格: ${labels.at(-1)}`);
    };
    const root = `document.querySelector('futatsume-setting-panel').shadowRoot`;
    const media = `document.querySelector('futatsume-video')`;
    const native = `${media}.shadowRoot.querySelector('video')`;
    const click = async (selector: string, within = 'document') => {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 180 });
      await clickVisible(page, selector, within);
    };
    const quality = async (index: number) => {
      const current = (await evaluate(page, `${root}.querySelector('[data-shell-quality]').selectedIndex`)) as number;
      await click('[data-shell-quality]', root);
      for (let i = 0; i < Math.abs(current - index); i++) {
        const key = index > current ? 'ArrowDown' : 'ArrowUp';
        for (const type of ['keyDown', 'keyUp'])
          await page.send('Input.dispatchKeyEvent', {
            type,
            key,
            code: key,
            windowsVirtualKeyCode: key === 'ArrowDown' ? 40 : 38,
          });
      }
      for (const type of ['keyDown', 'keyUp'])
        await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    };
    try {
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      await page.send('Network.enable');
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `document.addEventListener('DOMContentLoaded',()=>{${source}\n},{once:true});`,
      });
      await page.send('Page.navigate', { url: pageUrl });
      await page.send('Page.bringToFront');
      await check(
        `window.FutatsumeWatch?.ready&&document.body.classList.contains('is-watch')===${name !== 'v4-external'}`,
        '視聴ページとして初期化',
        30000
      );
      await click(name === 'v4-external' ? '[data-futatsume-video="sm9"]' : '[data-futatsume-open]');
      await check(`${media}?.currentTime>0.5`, '入口から初期HLSを再生', 30000);
      await verifyMediaIdentity(page, 'sm9', (_session, condition, label, timeout) => check(condition, label, timeout));
      await check(
        `(()=>{const debug=window.FutatsumeWatch.debug,r=debug.nicoCommentPlayer._view.renderer,c=r?.canvas;return debug.videoInfo.domandInfo.availableVideoIds.length===2&&r?.comments.length>0&&r.activeComments.size>0&&c?.width>0&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((value,index)=>index%4===3&&value>0)})()`,
        '全配信グループとコメント描画を接続'
      );
      await click('[data-shell-action="togglePlay"]');
      const pausedTime = (await evaluate(page, `${media}.currentTime`)) as number;
      await click('[data-shell-action="settings"]');
      await check(
        `JSON.stringify([...${root}.querySelector('[data-shell-quality]').options].map(option=>option.value))===JSON.stringify(['auto','360p','180p'])`,
        '利用可能な画質だけを表示'
      );
      await quality(2);
      await check(
        `${native}.readyState>=2&&${native}.videoHeight===180&&${media}.paused&&Math.abs(${media}.currentTime-${pausedTime})<1`,
        '低画質と停止状態・再生位置を保持',
        30000
      );
      await quality(1);
      await check(
        `${native}.readyState>=2&&${native}.videoHeight===360&&${media}.paused&&Math.abs(${media}.currentTime-${pausedTime})<1`,
        '高画質へ切り替えて停止状態・再生位置を保持',
        30000
      );
      await quality(0);
      await check(
        `${media}.hls?.currentLevel>=0&&${media}.hls.autoLevelCapping===1`,
        '自動画質を利用可能な解像度へ制限',
        30000
      );
      if (name === 'v4-media') {
        site.faults.watchHlsUrl = 'opaque-fixture';
        await click('[data-settings-action="reload"]', root);
        await check(
          `window.FutatsumeWatch.debug.dialog._state.isError&&window.FutatsumeWatch.debug.dialog._state.errorMessage.includes('watchV4')&&${native}.paused`,
          '不透明なHLS値を拒否して停止'
        );
        site.faults.watchHlsUrl = undefined;
        if (!(await evaluate(page, `${root}.querySelector('[data-fw-settings="general"]').open`)))
          await click('[data-shell-action="settings"]');
        await click('[data-settings-action="reload"]', root);
        await check(
          `!window.FutatsumeWatch.debug.dialog._state.isError&&${native}.readyState>=2`,
          '正常な初期HTMLの再取得で復帰',
          30000
        );
      } else {
        await click('[data-settings-close]', root);
      }
      if (
        site.deliveries.length ||
        requests.some((url) => url.includes('/access-rights/hls') || url.includes('/access-rights/storyboard'))
      )
        throw new Error('watchV4で旧配信権APIを要求しました');
      labels.push(`watchV4/${name}: 旧配信権APIを要求しない`);
      const shot = (await page.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
      await Bun.write(new URL(`watch-${name}.png`, verificationDirectory), Buffer.from(shot.data, 'base64'));
      await click('[data-shell-action="close"]');
    } catch (error) {
      await Bun.write(
        new URL(`watch-${name}-failure.json`, verificationDirectory),
        JSON.stringify({ name, labels, error: String(error) }, null, 2)
      );
      throw error;
    } finally {
      await cleanupCdp(
        () => page.close(),
        async () => {
          const { targetInfo } = (await browser.send('Target.getTargetInfo', { targetId })) as {
            targetInfo: { browserContextId: string };
          };
          await browser.send('Target.disposeBrowserContext', { browserContextId: targetInfo.browserContextId });
        },
        () => browser.close()
      );
    }
  }
  return labels;
}
