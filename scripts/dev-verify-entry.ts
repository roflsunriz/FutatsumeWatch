import { cleanupCdp } from './dev-cdp';
import { verificationDirectory } from './dev-verification-output';
import { attach, attachBrowser, evaluate, listTargets } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';
import { VERSION } from '../src/version';

const checks: string[] = [];
const report: { checks: string[]; completed: boolean; error?: string } = { checks, completed: false };
const searchUrl =
  'https://www.nicovideo.jp/search/' + encodeURIComponent('レッツゴー！陰陽師') + '?sort=viewCount&order=desc';
const tagUrl =
  'https://www.nicovideo.jp/tag/' + encodeURIComponent('レッツゴー！陰陽師') + '?sort=viewCount&order=desc';
const out = verificationDirectory;
async function until(page: CdpSession, expression: string, label: string): Promise<void> {
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    if (await evaluate(page, expression)) {
      checks.push(label);
      console.log(`合格: ${label}`);
      return;
    }
    await Bun.sleep(200);
  }
  throw new Error(`導線の検証失敗: ${label}`);
}
async function shot(page: CdpSession, name: string): Promise<void> {
  const image = (await page.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
  await Bun.write(new URL(name, out), Buffer.from(image.data, 'base64'));
}
const browser = await attachBrowser();
const created = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
const page = await attach((await listTargets()).find((t) => t.id === created.targetId)!);
try {
  await page.send('Page.enable');
  if (Bun.argv.includes('--bundle')) {
    const source = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `document.addEventListener('DOMContentLoaded', () => { ${source}\n }, {once:true});`,
    });
  }
  await page.send('Page.navigate', { url: searchUrl });
  await page.send('Page.bringToFront');
  await until(
    page,
    `document.querySelector('[data-futatsume-entry]')?.dataset.futatsumeVersion===${JSON.stringify(VERSION)} && document.querySelector('[data-futatsume-entry]')?.dataset.state==='ready' && !!document.querySelector('[data-futatsume-video="sm9"]:not(:disabled)')`,
    'キーワード検索で版・準備完了・結果ボタンを表示'
  );
  await shot(page, 'entry-search.png');
  await until(
    page,
    `!document.body.querySelector('[data-futatsume-entry]') && [...document.querySelectorAll('[data-futatsume-video]')].every(b=>!b.textContent.trim() && !!b.querySelector('svg') && !!b.getAttribute('aria-label'))`,
    '検索結果はアイコンのみで右下ポップアップがない'
  );
  await clickVisible(page, '[data-futatsume-video="sm9"]');
  await until(
    page,
    `(()=>{const v=document.querySelector('#futatsumeVideoPlayerDialog futatsume-video');return document.body.classList.contains('showNicoVideoPlayerDialog')&&v?.readyState>=3&&v.currentTime>0.5&&!v.paused;})()`,
    '検索結果の見えるボタンをマウスで押して再生'
  );
  await page.send('Page.navigate', { url: tagUrl });
  await until(
    page,
    `document.querySelector('[data-futatsume-entry]')?.dataset.state==='ready' && !!document.querySelector('[data-futatsume-video="sm9"]:not(:disabled)')`,
    'タグ検索でも結果ボタンを表示'
  );
  const history = (await page.send('Page.getNavigationHistory')) as { currentIndex: number; entries: { id: number }[] };
  const searchEntry = history.entries[history.currentIndex]!;
  await evaluate(page, `window.__fwEntryDocument=performance.timeOrigin`);
  await clickVisible(
    page,
    'a:is([href="/watch/sm9"],[href^="/watch/sm9?"],[href="https://www.nicovideo.jp/watch/sm9"],[href^="https://www.nicovideo.jp/watch/sm9?"])'
  );
  await until(
    page,
    `location.pathname==='/watch/sm9' && !!document.querySelector('[data-futatsume-open]:not([hidden]):not(:disabled)')`,
    '通常の動画リンクから視聴ページへ移っても起動ボタンを表示'
  );
  await until(page, `window.__fwEntryDocument===performance.timeOrigin`, '再読み込みしないページ内遷移を確認');
  await until(
    page,
    `(()=>{const b=document.querySelector('[data-futatsume-open]');return !b.textContent.trim() && !!b.querySelector('svg') && !!b.parentElement.querySelector('h1') && !!b.nextElementSibling?.querySelector('a[data-anchor-area="video_information"]') && !document.body.querySelector('[data-futatsume-entry]');})()`,
    '視聴アイコンはタイトルと投稿者の間にありポップアップがない'
  );
  await evaluate(page, `document.querySelector('[data-futatsume-open]').scrollIntoView({block:'center'})`);
  await shot(page, 'entry-watch.png');
  await clickVisible(page, '[data-futatsume-open]');
  await until(
    page,
    `(()=>{const v=document.querySelector('#futatsumeVideoPlayerDialog futatsume-video');return document.body.classList.contains('showNicoVideoPlayerDialog')&&v?.readyState>=3&&v.currentTime>0.5&&!v.paused;})()`,
    '視聴ページの見えるボタンをマウスで押して再生'
  );
  await page.send('Page.navigateToHistoryEntry', { entryId: searchEntry.id });
  await until(
    page,
    `location.pathname.startsWith('/tag/') && !!document.querySelector('[data-futatsume-video="sm9"]:not(:disabled)') && !document.querySelector('[data-futatsume-open]')`,
    '戻る操作で検索ページの導線を復元'
  );
  await clickVisible(page, '[data-futatsume-video="sm9"]');
  await until(
    page,
    `(()=>{const v=document.querySelector('#futatsumeVideoPlayerDialog futatsume-video');return document.body.classList.contains('showNicoVideoPlayerDialog')&&v?.readyState>=3&&v.currentTime>0.5&&!v.paused;})()`,
    '戻った検索ページのボタンから再び再生'
  );
  if (process.env.FUTATSUME_TEST_OFFLINE === '1') {
    const { offlineSites } = await import('./dev-offline');
    const site = offlineSites.get(page);
    if (!site) throw new Error('外部起動経路の固定応答を取得できません');
    site.documents.set(
      'https://www.nicovideo.jp/robots.txt',
      '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body></body></html>'
    );
    site.documents.set(
      'https://anime.nicovideo.jp/',
      '<!doctype html><html lang="ja"><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>[hidden]{display:none}body{margin:0;padding:32px}a{display:inline-block;padding:20px}</style></head><body><main><div hidden><a id="hidden-anime" href="https://www.nicovideo.jp/watch/sm9">隠れた主動画</a></div><a id="visible-anime" href="https://www.nicovideo.jp/watch/sm9">表示中の主動画</a><a href="https://www.nicovideo.jp/watch/sm9"><img alt="主動画サムネイル"></a></main></body></html>'
    );
    await page.send('Page.navigate', { url: 'https://anime.nicovideo.jp/' });
    await until(
      page,
      `window.FutatsumeWatch?.ready&&document.querySelectorAll('[data-futatsume-video="sm9"]').length===1&&document.querySelector('#visible-anime')?.nextElementSibling?.dataset.futatsumeVideo==='sm9'`,
      'Nアニメ相当ページは表示中の同一IDリンクへ1個だけ起動ボタンを表示'
    );
    await clickVisible(page, '[data-futatsume-video="sm9"]');
    await until(
      page,
      `(()=>{const v=document.querySelector('futatsume-video')?.shadowRoot.querySelector('video'),r=window.FutatsumeWatch.debug.nicoCommentPlayer?._view.renderer;return v?.currentTime>0.5&&!v.paused&&r?.comments.length>0})()`,
      'Nアニメ相当の外部ホストから映像とコメントを取得'
    );
  }
  report.completed = true;
  console.log(`導線の実操作検証に合格しました（${checks.length}項目）`);
} catch (error) {
  report.error = error instanceof Error ? error.message : '導線の検証に失敗しました';
  await shot(page, 'entry-failure.png');
  throw error;
} finally {
  await Bun.write(new URL('entry-report.json', out), JSON.stringify(report, null, 2) + '\n');
  await cleanupCdp(
    () => page.close(),
    async () => {
      const { targetInfo } = (await browser.send('Target.getTargetInfo', { targetId: created.targetId })) as {
        targetInfo: { browserContextId?: string };
      };
      return process.env.FUTATSUME_TEST_OFFLINE === '1' && targetInfo.browserContextId
        ? browser.send('Target.disposeBrowserContext', { browserContextId: targetInfo.browserContextId })
        : browser.send('Target.closeTarget', { targetId: created.targetId });
    },
    () => browser.close()
  );
}
