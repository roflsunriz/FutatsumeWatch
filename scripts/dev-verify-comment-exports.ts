import { cleanupCdp } from './dev-cdp';
import { verificationDirectory } from './dev-verification-output';
import { attach, attachBrowser, evaluate, evaluateAsync, listTargets } from './dev-cdp';
import type { CdpSession } from './dev-cdp';

export interface CommentPng {
  width: number;
  height: number;
  mime: string;
  fileName: string;
  pngBase64: string;
  changedPixels: number;
  downloads: number;
}

/** ダウンロード直前の境界だけ捕捉し、呼出側から実クリックを渡せる。 */
export async function captureCommentPng(session: CdpSession, activate: () => Promise<void>): Promise<CommentPng> {
  await evaluate(
    session,
    `(()=>{
    if(window.__fwPngCapture)throw Error('PNG capture already active');
    const original=HTMLAnchorElement.prototype.click;
    let resolve,reject;
    const wait=new Promise((yes,no)=>{resolve=yes;reject=no;});
    // 呼出側がクリック待機中でも期限切れの拒否を未処理にしない。
    wait.catch(()=>{});
    const state=window.__fwPngCapture={original,wait,downloads:0,timer:setTimeout(()=>reject(Error('PNG保存が開始されませんでした')),8000)};
    HTMLAnchorElement.prototype.click=function(){
      if(!this.download.endsWith('.png'))return original.call(this);
      state.downloads++;
      const href=this.href,fileName=this.download;
      void (async()=>{
        const blob=await fetch(href).then(response=>response.blob());
        const image=await createImageBitmap(blob);
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const context=canvas.getContext('2d');context.drawImage(image,0,0);
        const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
        const native=document.querySelector('futatsume-video')?.shadowRoot?.querySelector('video');
        let changedPixels=0;
        if(native){context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(native,0,0,canvas.width,canvas.height);const plain=context.getImageData(0,0,canvas.width,canvas.height).data;for(let i=0;i<pixels.length;i+=4){if(pixels[i]!==plain[i]||pixels[i+1]!==plain[i+1]||pixels[i+2]!==plain[i+2])changedPixels++;}}
        const data=await new Promise((yes,no)=>{const reader=new FileReader();reader.onload=()=>yes(reader.result);reader.onerror=()=>no(reader.error);reader.readAsDataURL(blob);});
        image.close();clearTimeout(state.timer);
        resolve({width:canvas.width,height:canvas.height,mime:blob.type,fileName,pngBase64:data.split(',')[1],changedPixels});
      })().catch(error=>{clearTimeout(state.timer);reject(error);});
    };
  })()`
  );
  try {
    await activate();
    const capture = (await evaluateAsync(
      session,
      `window.__fwPngCapture.wait.then(result=>({...result,downloads:window.__fwPngCapture.downloads}))`
    )) as CommentPng;
    if (
      capture.mime !== 'image/png' ||
      capture.width <= 0 ||
      capture.height <= 0 ||
      !capture.pngBase64 ||
      capture.downloads !== 1
    )
      throw new Error('コメント付きPNGの生成・保存導線に失敗しました');
    return capture;
  } finally {
    await evaluate(
      session,
      `(()=>{const state=window.__fwPngCapture;if(state){clearTimeout(state.timer);HTMLAnchorElement.prototype.click=state.original;delete window.__fwPngCapture;}})()`
    );
  }
}

export async function verifyCommentExports(session: CdpSession): Promise<string[]> {
  const root = 'window.FutatsumeWatch.debug.nicoVideoPlayer';
  await captureCommentPng(session, async () => {
    await evaluateAsync(session, `${root}.getScreenShotWithComment()`);
  });
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
  await Bun.write(new URL('comment-export.html', verificationDirectory), html);
  const browser = await attachBrowser();
  const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
  const { targetInfo } = (await browser.send('Target.getTargetInfo', { targetId })) as {
    targetInfo: { browserContextId?: string };
  };
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
    const paintDeadline = Date.now() + 5000;
    while (!(await evaluate(page, pixels)) && Date.now() < paintDeadline) await Bun.sleep(50);
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
    await cleanupCdp(
      () => page.close(),
      () =>
        process.env.FUTATSUME_TEST_OFFLINE === '1' && targetInfo.browserContextId
          ? browser.send('Target.disposeBrowserContext', { browserContextId: targetInfo.browserContextId })
          : browser.send('Target.closeTarget', { targetId }),
      () => browser.close(),
      () => session.send('Page.bringToFront')
    );
  }
  const checks = [
    'コメント付きPNGの生成と保存導線（ダウンロードは捕捉）',
    '保存HTMLの通信遮断・描画・シーク・再生・停止',
  ];
  for (const check of checks) console.log(`合格: ${check}`);
  return checks;
}
