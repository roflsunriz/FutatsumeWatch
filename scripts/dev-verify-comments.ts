import type { CdpSession } from './dev-cdp';
import { evaluate } from './dev-cdp';
import { verifyCommentExports } from './dev-verify-comment-exports';

export async function verifyCommentOverlay(session: CdpSession): Promise<string[]> {
  const checks: string[] = [];
  async function check(expression: string, label: string): Promise<void> {
    if (!(await evaluate(session, expression))) throw new Error(`コメント移行検証失敗: ${label}`);
    checks.push(label);
    console.log(`合格: ${label}`);
  }
  const player = 'window.FutatsumeWatch.debug.nicoCommentPlayer';
  const view = `${player}._view`;
  const renderer = `${view}.renderer`;
  const video = 'document.querySelector("#futatsumeVideoPlayerDialog futatsume-video")';
  await evaluate(session, `${video}.pause(); ${video}.currentTime=30;`);
  await Bun.sleep(600);
  await evaluate(
    session,
    `window.__fwOverlayTestChat=${player}.addChat('移行検証コメント', 'ue big yellow', 3000, {no:987654321,thread:987654321}); void 0;`
  );
  await check(
    `(()=>{const r=${renderer};return [...r.activeComments].some(c=>c.text==='移行検証コメント') && r.canvas.getContext('2d').getImageData(0,0,r.canvas.width,r.canvas.height).data.some((v,i)=>i%4===3&&v>0);})()`,
    '停止中の投稿プレビューを実Canvasへ描画'
  );
  await check(
    `(()=>{const overlay=${view}.element;const movie=${video}.closest('.videoPlayer');return Number(getComputedStyle(overlay).zIndex)>Number(getComputedStyle(movie).zIndex)&&getComputedStyle(overlay).visibility==='visible'&&getComputedStyle(overlay).display!=='none';})()`,
    'コメントが動画より前面に表示される'
  );
  const config = 'window.FutatsumeWatch.config';
  const videoPlayer = 'window.FutatsumeWatch.debug.nicoVideoPlayer';
  const oldRate = await evaluate(session, `${video}.playbackRate`);
  const oldOpacity = await evaluate(session, `${config}.props.commentLayerOpacity`);
  const oldScale = await evaluate(session, `${config}.props.baseChatScale`);
  const originalSize = await evaluate(session, `${renderer}.comments.find(c=>c.text==='移行検証コメント').fontSize`);
  try {
    await evaluate(session, `${videoPlayer}.setPlaybackRate(2)`);
    await evaluate(session, `${config}.props.commentLayerOpacity=0.4; ${config}.props.baseChatScale=1.5;`);
    await Bun.sleep(200);
    await check(`${renderer}.playbackRate===2`, '再生速度変更をコメントの時計へ反映');
    await check(
      `${renderer}.comments.find(c=>c.text==='移行検証コメント').opacity===0.4 && getComputedStyle(${view}.element).opacity==='1'`,
      '透明度設定を二重適用せずに反映'
    );
    await check(
      `${renderer}.comments.find(c=>c.text==='移行検証コメント').fontSize>${Number(originalSize)}`,
      'フォント倍率の変更を再計測と描画へ反映'
    );
  } finally {
    await evaluate(session, `${videoPlayer}.setPlaybackRate(${JSON.stringify(oldRate)})`);
    await evaluate(
      session,
      `${config}.props.commentLayerOpacity=${JSON.stringify(oldOpacity)};${config}.props.baseChatScale=${JSON.stringify(oldScale)};`
    );
    await Bun.sleep(200);
  }
  const frozen = await evaluate(session, `${renderer}.canvas.toDataURL()`);
  await Bun.sleep(150);
  await check(`${renderer}.canvas.toDataURL()===${JSON.stringify(frozen)}`, '一時停止中のコメント位置と画素を保持');
  await evaluate(session, `${player}.hide()`);
  await check(
    `(()=>{const c=${renderer}.canvas;return !c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);})()`,
    '非表示操作でCanvasが透明になる'
  );
  await evaluate(session, `${player}.show()`);
  await Bun.sleep(100);
  await check(
    `(()=>{const c=${renderer}.canvas;return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);})()`,
    '停止中でも再表示で画素を復元'
  );
  const ng = await evaluate(session, `${player}.filter.wordFilterList`);
  await evaluate(session, `${player}.filter.addWordFilter('移行検証コメント')`);
  await Bun.sleep(500);
  await check(
    `!${renderer}.comments.some(c=>c.text==='移行検証コメント') && ${player}.nonFilteredChatList.top.some(c=>c.text==='移行検証コメント')`,
    'NG反映で描画から除外し元データを保持'
  );
  await evaluate(session, `${player}.filter.wordFilterList=${JSON.stringify(ng)}`);
  await Bun.sleep(500);
  await check(`${renderer}.comments.some(c=>c.text==='移行検証コメント')`, 'NG解除でコメントを復元');
  await evaluate(session, `${player}.removeChat(window.__fwOverlayTestChat); delete window.__fwOverlayTestChat`);
  await check(`!${renderer}.comments.some(c=>c.text==='移行検証コメント')`, '投稿取り消しでCanvasの登録から除外');
  await session.send('Runtime.evaluate', {
    expression: `document.querySelector('#futatsumeVideoPlayerDialog').requestFullscreen()`,
    userGesture: true,
    awaitPromise: true,
  });
  await Bun.sleep(300);
  await check(
    `!!document.fullscreenElement && (()=>{const c=${renderer}.canvas.getBoundingClientRect();const v=${video};return Math.abs(c.width/c.height-v.videoWidth/v.videoHeight)<.02&&document.fullscreenElement.contains(${renderer}.canvas);})()`,
    '全画面でも動画の比率とコメントの前面表示を保持'
  );
  await session.send('Runtime.evaluate', { expression: 'document.exitFullscreen()', awaitPromise: true });
  await Bun.sleep(200);
  checks.push(...(await verifyCommentExports(session)));
  await evaluate(
    session,
    `window.__fwLongChat=${player}.addChat('長時間固定', 'ue @15', 3000, {fork:1,no:987654322,thread:987654321}); ${video}.currentTime=40;void 0;`
  );
  await Bun.sleep(400);
  await check(
    `[...${renderer}.activeComments].some(c=>c.text==='長時間固定')`,
    '投稿者の秒数指定を9秒より先へのシークでも保持'
  );
  await evaluate(session, `${video}.currentTime=46;`);
  await Bun.sleep(400);
  await check(
    `![...${renderer}.activeComments].some(c=>c.text==='長時間固定')`,
    '投稿者の指定した表示期間後にコメントを消す'
  );
  await evaluate(
    session,
    `${player}.removeChat(window.__fwLongChat);delete window.__fwLongChat;${video}.currentTime=30;`
  );
  await Bun.sleep(200);
  for (const [width, height] of [
    [640, 480],
    [390, 844],
    [1920, 1080],
  ]) {
    await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await Bun.sleep(200);
    await check(
      `(()=>{const c=${renderer}.canvas.getBoundingClientRect();const media=${video};const v=media.getBoundingClientRect();const ratio=media.videoWidth/media.videoHeight;return c.width>0&&c.height>0&&Math.abs(c.width/c.height-ratio)<.02&&Math.abs(c.width-Math.min(v.width,v.height*ratio))<2&&c.left>=v.left-2&&c.right<=v.right+2&&c.top>=v.top-2&&c.bottom<=v.bottom+2;})()`,
      `${width}×${height}でコメント領域が動画に収まる`
    );
    const shot = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await Bun.write(
      new URL(`../dev-assets/verification/comments-${width}.png`, import.meta.url),
      Buffer.from(shot.data, 'base64')
    );
  }
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(session, `${video}.play()`);
  return checks;
}
