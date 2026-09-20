import { attach, attachBrowser, evaluate, evaluateAsync, listTargets } from './dev-cdp';
import { clickVisible } from './dev-ui';
import { offlineSites } from './dev-offline';
import { verificationDirectory } from './dev-verification-output';
import { verifyMenuActions } from './verify-menu-actions';
import { verifySeekDrag, verifyPlaybackDenial } from './verify-playback-interactions';
import { verifyAuthentication } from './verify-authentication';
import { verifyMediaIdentity } from './verify-media-identity';
import { verifyDelayedMediaSwitch } from './verify-media-switch';

if (process.env.FUTATSUME_TEST_OFFLINE !== '1') throw new Error('投稿を含む機能検証はオフライン専用です');
const browser = await attachBrowser();
const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
const { targetInfo } = (await browser.send('Target.getTargetInfo', { targetId })) as {
  targetInfo: { browserContextId: string };
};
const page = await attach((await listTargets()).find((target) => target.id === targetId)!);
const site = offlineSites.get(page)!;
const sample = site.comments[0]!;
site.comments.splice(
  0,
  site.comments.length,
  ...[2000, 25000, 25020, 25040, 55000, 55020].map((vposMs, index) => ({
    ...sample,
    id: `density-${index}`,
    no: index + 1,
    body: `密度検証 ${index}`,
    vposMs,
  }))
);
const cases: Array<{ id: string; label: string }> = [];
const v = `document.querySelector('futatsume-video')`;
const native = `${v}.shadowRoot.querySelector('video')`;
const report: { cases: typeof cases; completed: boolean; error?: string } = { cases, completed: false };
async function check(id: string, label: string, condition: string, timeout = 10000) {
  const end = Date.now() + timeout;
  do {
    if (await evaluate(page, condition)) {
      cases.push({ id, label });
      console.log(`合格: ${id} ${label}`);
      return;
    }
    await Bun.sleep(100);
  } while (Date.now() < end);
  throw new Error(`${id} ${label}`);
}
async function key(key: string, code = key, windowsVirtualKeyCode?: number) {
  for (const type of ['keyDown', 'keyUp'])
    await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode });
}
async function click(selector: string) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 180 });
  await clickVisible(page, selector);
}
async function select(selector: string, index: number) {
  const current = (await evaluate(page, `document.querySelector(${JSON.stringify(selector)}).selectedIndex`)) as number;
  await click(selector);
  for (let i = 0; i < Math.abs(index - current); i++)
    await key(
      index > current ? 'ArrowDown' : 'ArrowUp',
      index > current ? 'ArrowDown' : 'ArrowUp',
      index > current ? 40 : 38
    );
  await key('Enter', 'Enter', 13);
}
async function seek(fraction: number) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 180 });
  const point = (await evaluate(
    page,
    `(()=>{const e=document.querySelector('.seekBar'),r=e.getBoundingClientRect();const x=r.left+r.width*${fraction},y=r.top+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('Seek covered');return{x,y}})()`
  )) as { x: number; y: number };
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...point });
}
async function selectQuality(index: number, variant: string) {
  const previous = site.deliveries.length;
  await select('[data-shell-quality]', index);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (site.deliveries.length > previous && site.deliveries.at(-1)?.variant === variant) {
      cases.push({ id: 'P2-01', label: `選択画質の配信要求 ${variant}` });
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error(`P2-01 選択したvariantの配信要求がありません: ${variant}`);
}
async function finish() {
  const cleanup: unknown[] = [];
  try {
    await page.close();
  } catch (error) {
    cleanup.push(error);
  }
  try {
    await browser.send('Target.disposeBrowserContext', { browserContextId: targetInfo.browserContextId });
  } catch (error) {
    cleanup.push(error);
  }
  try {
    await browser.close();
  } catch (error) {
    cleanup.push(error);
  }
  if (cleanup.length) {
    report.completed = false;
    report.error = [report.error, ...cleanup.map(String)].filter(Boolean).join('\n');
  }
  await Bun.write(new URL('functionality-report.json', verificationDirectory), JSON.stringify(report, null, 2));
  if (cleanup.length) throw new AggregateError(cleanup, report.error);
}
try {
  await page.send('Page.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const source = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `document.addEventListener('DOMContentLoaded',()=>{${source}\n},{once:true})`,
  });
  await page.send('Page.navigate', { url: 'https://www.nicovideo.jp/watch/sm9' });
  await page.send('Page.bringToFront');
  await check('P1-01', '起動導線の準備', `document.querySelector('[data-futatsume-open]')?.disabled===false`);
  await evaluate(page, `window.FutatsumeWatch.emitter.on('heatMapUpdate',value=>{window.__observedHeat=value;})`);
  await click('[data-futatsume-open]');
  await check(
    'P1-03',
    '実HLSフレームをデコードして時間進行',
    `${native}?.videoWidth>0 && ${v}.currentTime>1 && !${v}.paused`,
    30000
  );
  await click('[data-shell-action="togglePlay"]');
  await verifyMediaIdentity(page, 'sm9', (_session, expression, label, timeout) =>
    check('P1-04', label, expression, timeout)
  );
  const stopped = (await evaluate(page, `${v}.currentTime`)) as number;
  await Bun.sleep(400);
  await check('P1-03', '停止中に時計を保持', `${v}.paused && Math.abs(${v}.currentTime-${stopped})<0.05`);
  await verifySeekDrag(page, check);
  await verifyPlaybackDenial(page, check);
  await check(
    'P1-11',
    '既知のコメント密度のピークと可視ヒートマップ',
    `(()=>{const h=window.__observedHeat,c=document.querySelector('canvas.heatMap');if(!h||!c)return false;const peak=h.map.indexOf(Math.max(...h.map)),r=c.getBoundingClientRect();return Math.abs(peak/h.map.length*h.duration-25)<2&&h.map.filter(x=>x>0).length===3&&h.dataURL.startsWith('data:image/png')&&r.width>0&&r.height>0;})()`
  );
  const speeds = (await evaluate(
    page,
    `[...document.querySelector('[data-shell-speed]').options].map(option=>Number(option.value))`
  )) as number[];
  for (const [index, speed] of speeds.entries()) {
    await select('[data-shell-speed]', index);
    await check(
      'P1-07',
      `速度${speed}を実mediaとコメントへ反映`,
      `${native}.playbackRate===${speed} && window.FutatsumeWatch.debug.nicoCommentPlayer._view.renderer.playbackRate===${speed}`
    );
  }
  for (const speed of [0.5, 1, 2]) {
    await select('[data-shell-speed]', speeds.indexOf(speed));
    await click('[data-shell-action="togglePlay"]');
    await check('P1-07', `速度${speed}で再生を開始`, `${native}.paused===false`);
    const timing = (await evaluateAsync(
      page,
      `new Promise(resolve=>{const video=${native},time=video.currentTime,start=performance.now();setTimeout(()=>resolve({delta:video.currentTime-time,elapsed:(performance.now()-start)/1000}),900);})`
    )) as { delta: number; elapsed: number };
    const expected = timing.elapsed * speed;
    if (timing.delta < expected * 0.75 || timing.delta > expected * 1.25 + 0.1)
      throw new Error(`P1-07 実時間進行が速度${speed}と不一致: ${JSON.stringify(timing)}`);
    await check(
      'P1-07',
      `速度${speed}のコメント時計を実mediaへ同期`,
      `Math.abs(window.FutatsumeWatch.debug.nicoCommentPlayer._view.renderer.currentTime-${native}.currentTime*1000)<300`
    );
    await click('[data-shell-action="togglePlay"]');
    await check('P1-07', `速度${speed}から一時停止へ復帰`, `${native}.paused`);
  }
  await select('[data-shell-speed]', speeds.indexOf(1));
  for (const [command, expected] of [
    ['Home', 0],
    ['End', 1],
  ] as const) {
    await click('[data-shell-volume]');
    await key(command, command, command === 'Home' ? 36 : 35);
    await check(
      'P1-08',
      `音量端点${expected}を実mediaへ反映`,
      `${native}.volume===${expected} && Number(document.querySelector('[data-shell-volume]').value)===${expected}`
    );
  }
  await seek(0.02);
  await check('P1-09', '停止中の先頭近くへの実シーク', `${v}.currentTime<3 && ${v}.paused`);
  await seek(0.75);
  await check('P1-09', '停止中の後半への実シーク', `Math.abs(${v}.currentTime-48)<1 && ${v}.paused`);
  await check(
    'P1-10',
    '表示時刻と実media時刻が一致',
    `(()=>{const parts=document.querySelector('.fw-time').textContent.match(/[0-9]+/g).map(Number);return parts[0]*60+parts[1]===Math.floor(${v}.currentTime)&&parts[2]*60+parts[3]===Math.floor(${v}.duration)})()`
  );
  await click('[data-shell-action="settings"]');
  await check(
    'P2-01',
    '利用可能な画質だけを提示',
    `JSON.stringify([...document.querySelector('[data-shell-quality]').options].map(x=>x.value))===JSON.stringify(['auto','360p','180p'])`
  );
  await selectQuality(2, 'low');
  await check('P2-01', '低画質をデコード映像に反映', `${native}.videoHeight===180`, 30000);
  await selectQuality(1, 'high');
  await check('P2-01', '高画質の選択値を設定へ反映', `document.querySelector('[data-shell-quality]').value==='360p'`);
  await check('P2-01', '高画質をデコード映像に反映', `${native}.videoHeight===360`, 30000);
  await check('P2-01', '画質変更前の停止状態と時刻を保持', `${v}.paused && Math.abs(${v}.currentTime-48)<1`);
  await select('[data-shell-quality]', 0);
  await click('[data-shell-action="dismiss"]');
  await seek(0.4);
  await check(
    'P1-09',
    '画質再読み込み中の新しいシーク位置を保持',
    `!window.FutatsumeWatch.debug.dialog._state.isLoading && Math.abs(${v}.currentTime-25.6)<1`
  );
  const menuChecks = await verifyMenuActions(page, (_session, condition, label, timeout) =>
    check(/^P\d-\d{2}/.exec(label)?.[0] ?? 'P2-03', label, condition, timeout)
  );
  for (const label of menuChecks)
    if (!cases.some((item) => item.label === label)) cases.push({ id: label.slice(0, 5), label });
  // アプリ内部の投稿関数を置き換えず、API通信だけ固定サーバーへ向ける。
  await check('P4-05', 'ログイン済みフォームを操作可能', `!document.querySelector('.commentInput').disabled`);
  await click('.commentInput');
  await page.send('Input.insertText', { text: '一度だけの実経路投稿' });
  await key('Enter', 'Enter', 13);
  await check(
    'P4-07',
    '実API受理後に本文を消す',
    `document.querySelector('.commentInput').value==='' && !document.querySelector('.commentInput').disabled`,
    15000
  );
  if (site.writes.length !== 1 || site.comments.filter((c) => c.body === '一度だけの実経路投稿').length !== 1)
    throw new Error('P4-08 投稿要求または受理が重複');
  cases.push({ id: 'P4-08', label: '1操作1要求1受理' });
  const accepted = site.comments.find((comment) => comment.body === '一度だけの実経路投稿')!;
  await check(
    'P4-07',
    '受理IDと番号を1件のプレビューへ反映',
    `Object.values(window.FutatsumeWatch.debug.dialog.nonFilteredChatList).flat().filter(chat=>chat.props.serverId===${JSON.stringify(accepted.id)} && chat.no===${accepted.no} && !chat.isUpdating).length===1`
  );
  const received = await evaluateAsync(
    page,
    `fetch('https://public.nvcomment.nicovideo.jp/v1/threads',{method:'POST',body:JSON.stringify({threadKey:'fixture-thread-key',params:{targets:[{id:'1173108780',fork:'main'}],language:'ja-jp'},additionals:{}})}).then(r=>r.json()).then(r=>r.data.threads.flatMap(t=>t.comments).filter(c=>c.id===${JSON.stringify(accepted.id)}&&c.no===${accepted.no}&&c.body==='一度だけの実経路投稿').length)`
  );
  if (received !== 1) throw new Error('P4-09 投稿の再取得結果が不一致');
  cases.push({ id: 'P4-09', label: '通信境界から再取得して1件を確認' });
  site.faults.postStatus = 403;
  await click('.commentInput');
  await page.send('Input.insertText', { text: '失敗を保持' });
  await key('Enter', 'Enter', 13);
  await check(
    'P4-10',
    '拒否時は本文と理由を保持',
    `document.querySelector('.commentInput').value==='失敗を保持' && document.querySelector('.commentPostStatus').dataset.state==='error' && !document.querySelector('.commentInput').disabled`
  );
  site.faults.postStatus = 200;
  site.faults.postDelayMs = 700;
  await click('.commentSubmit');
  await key('Enter', 'Enter', 13);
  await check(
    'P4-08',
    '遅延中の重複操作後に一度だけ成功',
    `document.querySelector('.commentInput').value==='' && !document.querySelector('.commentInput').disabled`
  );
  if (Number(site.writes.length) !== 3 || site.comments.filter((c) => c.body === '失敗を保持').length !== 1)
    throw new Error('P4-08 再試行が二重受理された');
  site.faults.postDelayMs = 0;
  await click('[data-shell-action="toggle-loop"]');
  await seek(0.98);
  if (await evaluate(page, `${v}.paused`)) await click('[data-shell-action="togglePlay"]');
  await check(
    'P1-05',
    '実終端から同一動画の先頭へリピート',
    `${v}.currentTime<3 && !${v}.paused && window.FutatsumeWatch.debug.videoInfo.watchId==='sm9'`,
    8000
  );
  await click('[data-shell-action="toggle-loop"]');
  await click('[data-shell-action="close"]');
  await check(
    'P1-02',
    '閉じた後の映像停止とページ復帰',
    `!document.body.classList.contains('showNicoVideoPlayerDialog') && (!${native} || ${native}.paused)`
  );
  await click('[data-futatsume-open]');
  await check('P1-02', '同じ入口から再生復帰', `${v}.currentTime>0.5 && !${v}.paused`, 15000);
  site.faults.watchDelayMs = 800;
  await click('[data-shell-action="settings"]');
  if (!(await evaluate(page, `document.querySelector('.fw-settings>details').open`)))
    await click('.fw-settings>details>summary');
  await click('[data-shell-action="reload"]');
  await check('P1-02', '再読込を遅延させた読み込み中状態', `window.FutatsumeWatch.debug.dialog._state.isLoading`);
  await click('[data-shell-action="close"]');
  await Bun.sleep(1200);
  await check(
    'P1-02',
    '終了後の遅延応答で映像・コメントを復活させない',
    `!document.body.classList.contains('showNicoVideoPlayerDialog') && ${native}.paused && window.FutatsumeWatch.debug.nicoCommentPlayer._view.renderer===null`
  );
  site.faults.watchDelayMs = 0;
  await click('[data-futatsume-open]');
  await check('P1-02', '遅延終了後も同じ入口から復帰', `${v}.currentTime>0.5 && !${v}.paused`, 15000);
  site.faults.hlsStatus = 503;
  site.faults.hlsBodyStatus = 201;
  await click('[data-shell-action="settings"]');
  if (!(await evaluate(page, `document.querySelector('.fw-settings>details').open`)))
    await click('.fw-settings>details>summary');
  await click('[data-shell-action="reload"]');
  await check(
    'P1-03',
    'HTTP失敗を成功metaで隠さず再生エラーを表示',
    `window.FutatsumeWatch.debug.dialog._state.isError && window.FutatsumeWatch.debug.dialog._state.errorMessage.includes('503') && ${native}.paused`
  );
  site.faults.hlsStatus = 200;
  site.faults.hlsBodyStatus = undefined;
  await click('[data-shell-action="settings"]');
  if (!(await evaluate(page, `document.querySelector('.fw-settings>details').open`)))
    await click('.fw-settings>details>summary');
  await click('[data-shell-action="reload"]');
  await check(
    'P1-03',
    '配信API回復後に同じ再読込導線で復帰',
    `!window.FutatsumeWatch.debug.dialog._state.isError && ${native}.readyState>=2`,
    15000
  );
  await verifyDelayedMediaSwitch(page, (_session, expression, label, timeout) =>
    check('P1-04', label, expression, timeout)
  );
  for (const label of await verifyAuthentication(source)) cases.push({ id: 'P4-05', label });
  report.completed = true;
} catch (error) {
  report.error = String(error);
  const shot = (await page.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
  await Bun.write(new URL('functionality-failure.png', verificationDirectory), Buffer.from(shot.data, 'base64'));
  throw error;
} finally {
  await finish();
}
