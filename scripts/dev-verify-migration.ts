import { cleanupCdp } from './dev-cdp';
import { verificationDirectory } from './dev-verification-output';
import { attach, attachBrowser, evaluate, listTargets } from './dev-cdp';
import fixture from '../test/fixtures/storage-migration.json';

const source = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
const browser = await attachBrowser();
const { browserContextId } = (await browser.send('Target.createBrowserContext')) as { browserContextId: string };
const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId })) as {
  targetId: string;
};
const target = (await listTargets()).find((item) => item.id === targetId);
if (!target) throw new Error('移行検証のタブを取得できません');
const page = await attach(target);
const checks: string[] = [];
const errors: string[] = [];
page.onEvent((method, params) => {
  if (method !== 'Runtime.exceptionThrown') return;
  const detail = params.exceptionDetails as { exception?: { description?: string } };
  errors.push(detail.exception?.description ?? 'ページ例外');
});
async function check(expression: string, label: string): Promise<void> {
  if (!(await evaluate(page, expression))) throw new Error(`移行検証失敗: ${label}`);
  checks.push(label);
  console.log(`合格: ${label}`);
}

try {
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `document.addEventListener('DOMContentLoaded', () => {
      const fixture = ${JSON.stringify(fixture)};
      for (const [key, value] of Object.entries(fixture.local)) localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(fixture.session)) sessionStorage.setItem(key, value);
      window.__migrationEvents = [];
      for (const name of ['BeforeFutatsumeWatchInitialize', 'FutatsumeWatchInitialize'])
        window.addEventListener(name, () => window.__migrationEvents.push(name));
      ${source}
    }, {once:true});`,
  });
  const navigation = (await page.send('Page.navigate', { url: 'https://www.nicovideo.jp/watch/sm9' })) as {
    errorText?: string;
  };
  if (navigation.errorText) throw new Error(`移行検証ページの読込失敗: ${navigation.errorText}`);
  await page.send('Page.bringToFront');
  const ready = `window.FutatsumeWatch?.ready && window.MylistPocket?.isReady`;
  const deadline = Date.now() + 30000;
  while (!(await evaluate(page, ready)) && Date.now() < deadline) await Bun.sleep(200);
  await check(ready, '現行名称で本体とマイリスト機能を初期化');
  await check(
    `JSON.stringify(window.__migrationEvents) === JSON.stringify(['BeforeFutatsumeWatchInitialize','FutatsumeWatchInitialize'])`,
    '新しい初期化イベントを各1回通知'
  );
  await check(
    `${JSON.stringify(fixture.absentGlobals)}.every(key => !Object.hasOwn(window, key))`,
    '旧グローバル別名を公開しない'
  );
  await check('window.FutatsumeWatch.config.props.volume === 0.42', '現行設定の音量を優先');
  await check(
    `window.FutatsumeWatch.config.props.mute === false && localStorage.getItem('FutatsumeWatch_mute') === null`,
    '移行済みの旧版でリセットした設定を復活させない'
  );
  await check(
    `JSON.stringify(window.FutatsumeWatch.config.props.wordRegFilter)===JSON.stringify(['/a\\\\.b/i','/slash\\\\/value/i','/^blocked$/gi']) && localStorage.getItem('FutatsumeWatch_wordFilter')===${JSON.stringify(fixture.local.FutatsumeWatch_wordFilter)}`,
    '旧NGワードと単一正規表現を1行1表現の一覧へ移行'
  );
  await check(
    `localStorage.getItem('MylistPocket_config_ng.syncFutatsume') === 'true'`,
    'MylistPocketの保存キーを移行'
  );
  await check(
    `JSON.stringify(JSON.parse(sessionStorage.getItem('FutatsumeWatchPlaylist'))) === JSON.stringify({items:[{watchId:'sm9'}]})`,
    'プレイリストを現行キーへ移行'
  );
  await check(
    `JSON.parse(sessionStorage.getItem('FutatsumeWatch_PlayingStatus')).currentTime === 12`,
    '前回の再生状態を現行キーへ移行'
  );
  await check(
    `Object.entries(${JSON.stringify(fixture.local)}).filter(([key])=>key!=='FutatsumeWatch_storageVersion').every(([key,value])=>localStorage.getItem(key)===value)`,
    '移行前の設定を復旧用に保持'
  );
  await check(
    `(()=>{
      const video=document.createElement('futatsume-video'); let count=0;
      video.addEventListener('error',()=>count++);
      for(const [type,code] of [['networkError',1002],['mediaError',1003],['otherError',1004]]){
        video._onHLSJSFatalError(null,{type,details:'fixture'});
        if(video.error.code!==code||video.error.message!=='fixture')return false;
      }
      video._isBufferCompleted=true;
      video._onHLSJSFatalError(null,{type:'networkError',details:'fixture'});
      return count===3;
    })()`,
    'HLSの通信・デコード・未知のエラーを区別し、取得済み映像の通信エラーは無視'
  );
  await Bun.write(
    new URL('migration-report.json', verificationDirectory),
    JSON.stringify({ checks, completed: true }, null, 2) + '\n'
  );
} catch (error) {
  console.error('移行検証のページ例外', errors);
  console.error(
    await evaluate(
      page,
      `({title:document.title,ready:window.FutatsumeWatch?.ready,pocket:window.MylistPocket?.isReady,entry:document.querySelector('[data-futatsume-entry]')?.outerHTML,wordRegFilter:window.FutatsumeWatch?.config?.props?.wordRegFilter,storageVersion:localStorage.getItem('FutatsumeWatch_storageVersion'),legacyWordFilter:localStorage.getItem('FutatsumeWatch_wordFilter')})`
    )
  );
  throw error;
} finally {
  await cleanupCdp(
    () => page.close(),
    () => browser.send('Target.disposeBrowserContext', { browserContextId }),
    () => browser.close()
  );
}
