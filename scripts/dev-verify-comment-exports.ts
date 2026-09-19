import { attach, attachBrowser, evaluate, evaluateAsync, listTargets } from './dev-cdp';
import type { CdpSession } from './dev-cdp';

export async function verifyCommentExports(session: CdpSession): Promise<string[]> {
  const root = 'window.FutatsumeWatch.debug.nicoVideoPlayer';
  const screenshot = await evaluateAsync(
    session,
    `(async()=>{
    const original=HTMLAnchorElement.prototype.click;let saved=null;
    HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.png'))saved=this.href;else original.call(this);};
    try{await ${root}.getScreenShotWithComment();if(!saved)return false;const blob=await fetch(saved).then(r=>r.blob());const image=await createImageBitmap(blob);return image.width>0&&image.height>0&&blob.type==='image/png';}
    finally{HTMLAnchorElement.prototype.click=original;}
  })()`
  );
  if (!screenshot) throw new Error('コメント付き画像の生成・保存導線に失敗しました');
  // 実動画によって30秒にコメントがない場合もあるため、保存対象を明示する。
  await evaluate(
    session,
    `window.__fwExportChat=${root}._commentPlayer.addChat('保存テスト', 'ue big cyan', 3000, {no:987654323,thread:987654321});void 0;`
  );
  let html: unknown;
  try {
    html = await evaluate(session, `${root}.getMymemory()`);
  } finally {
    await evaluate(session, `${root}._commentPlayer.removeChat(window.__fwExportChat);delete window.__fwExportChat;`);
  }
  if (typeof html !== 'string') throw new Error('保存HTMLを取得できません');
  await Bun.write(new URL('../dev-assets/verification/comment-export.html', import.meta.url), html);
  const browser = await attachBrowser();
  const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
  const target = (await listTargets()).find((target) => target.id === targetId)!;
  const page = await attach(target);
  const errors: string[] = [];
  page.onEvent((method, params) => {
    if (method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(params));
  });
  try {
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    await page.send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
    await page.send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
    await page.send('Page.bringToFront');
    const deadline = Date.now() + 5000;
    while (!(await evaluate(page, `!!document.querySelector('canvas')`)) && Date.now() < deadline) await Bun.sleep(100);
    await evaluate(
      page,
      `document.querySelector('#seek').value='30';document.querySelector('#seek').dispatchEvent(new Event('input'));`
    );
    const pixels = `(()=>{const c=document.querySelector('canvas');return c?.width>0&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);})()`;
    if (!(await evaluate(page, pixels))) throw new Error('保存HTMLの停止・シーク後にコメントを描画できません');
    await evaluate(page, `document.querySelector('#play').click()`);
    await Bun.sleep(300);
    if (!(await evaluate(page, `Number(document.querySelector('#seek').value)>30`)))
      throw new Error('保存HTMLの再生時間が進みません');
    await evaluate(page, `document.querySelector('#play').click()`);
    const time = await evaluate(page, `document.querySelector('#seek').value`);
    await Bun.sleep(100);
    if ((await evaluate(page, `document.querySelector('#seek').value`)) !== time)
      throw new Error('保存HTMLを停止できません');
    if (errors.length) throw new Error(`保存HTMLの例外: ${errors.join('\n')}`);
  } finally {
    page.close();
    await browser.send('Target.closeTarget', { targetId });
    browser.close();
    await session.send('Page.bringToFront');
  }
  const checks = [
    'コメント付きPNGの生成と保存導線（ダウンロードは捕捉）',
    '保存HTMLの通信遮断・描画・シーク・再生・停止',
  ];
  for (const check of checks) console.log(`合格: ${check}`);
  return checks;
}
