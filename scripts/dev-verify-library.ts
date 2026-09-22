import { cleanupCdp } from './dev-cdp';
import { attach, attachBrowser, evaluate, listTargets } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';
import { verificationDirectory } from './dev-verification-output';
import { verifyLibraryComments } from './dev-verify-library-comments';
import { verifyLibraryFiles } from './dev-verify-library-files';
import { openLink } from './verify-menu-actions';
import { verifyMediaIdentity } from './verify-media-identity';

const out = verificationDirectory;
const checks: string[] = [];
const state = 'window.FutatsumeWatch.debug';
const queryHelpers = `window.__libraryFind=(selector,root=document)=>{const own=root.querySelector(selector);if(own)return own;for(const node of root.querySelectorAll('*')){if(node.shadowRoot){const found=window.__libraryFind(selector,node.shadowRoot);if(found)return found;}if(node.tagName==='IFRAME'&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0){try{if(node.contentDocument){const found=window.__libraryFind(selector,node.contentDocument);if(found)return found;}}catch{}}}return null;};`;
async function check(session: CdpSession, expression: string, label: string, timeout = 10000): Promise<void> {
  const limit = Date.now() + timeout;
  do {
    if (await evaluate(session, expression)) {
      checks.push(label);
      console.log(`合格: ${label}`);
      return;
    }
    await Bun.sleep(100);
  } while (Date.now() < limit);
  throw new Error(`検証失敗: ${label}`);
}
const find = (selector: string, within = 'document') => `window.__libraryFind(${JSON.stringify(selector)},${within})`;
async function deepClick(session: CdpSession, selector: string, within = 'document', hoverOnly = false): Promise<void> {
  const locate = async () =>
    (await evaluate(
      session,
      `(()=>{
    const e=${find(selector, within)};if(!e)throw Error('操作対象なし: '+${JSON.stringify(selector)});
    e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();
    if(!r.width||!r.height||e.disabled||getComputedStyle(e).visibility!=='visible')throw Error('操作対象が非表示');
    let x=r.x+r.width/2,y=r.y+r.height/2,node=e,root=e.getRootNode();
    while(true){const hit=root.elementFromPoint(x,y);if(!hit||!(node===hit||node.contains(hit)))throw Error('操作対象が覆われています: '+node.tagName+'.'+node.className+' hit='+hit?.tagName+'.'+hit?.className+' rect='+JSON.stringify(r.toJSON())+' root='+root.nodeName+' frame='+root.defaultView?.frameElement?.outerHTML.slice(0,200));
      if(root.host){node=root.host;root=node.getRootNode();continue;}
      const frame=root.defaultView.frameElement;if(!frame)break;const fr=frame.getBoundingClientRect();x+=fr.x+frame.clientLeft;y+=fr.y+frame.clientTop;node=frame;root=frame.getRootNode();
    }
    if(x<0||y<0||x>=innerWidth||y>=innerHeight)throw Error('操作対象が画面外');return {x,y};
  })()`
    )) as { x: number; y: number };
  const point = await locate();
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await Bun.sleep(150);
  if (hoverOnly) return;
  const current = await locate();
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...current });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...current });
}
async function replaceInput(session: CdpSession, selector: string, text: string, within = 'document') {
  await deepClick(session, selector, within);
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    modifiers: 2,
  });
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    modifiers: 2,
  });
  if (text) await session.send('Input.insertText', { text });
  else {
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Backspace',
      code: 'Backspace',
      windowsVirtualKeyCode: 8,
    });
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Backspace',
      code: 'Backspace',
      windowsVirtualKeyCode: 8,
    });
  }
}
async function screenshot(session: CdpSession, name: string) {
  const result = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
  await Bun.write(new URL(`library-${name}.png`, out), Buffer.from(result.data, 'base64'));
}
async function main() {
  if (process.env.FUTATSUME_TEST_OFFLINE !== '1') throw Error('この検証はオフライン専用です');
  const browser = await attachBrowser();
  const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
  const target = (await listTargets()).find((target) => target.id === targetId);
  if (!target) throw Error('検証タブがありません');
  const session = await attach(target);
  const errors: string[] = [];
  const links: object[] = [];
  const requests: Array<{ url: string; method: string; postData?: string }> = [];
  session.onEvent((method, params) => {
    if (method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(params));
    if (method === 'Network.requestWillBeSent') {
      const request = params.request as { url: string; method: string; postData?: string };
      requests.push({ url: request.url, method: request.method, postData: request.postData });
    }
  });
  try {
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Network.enable');
    await session.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' });
    await session.send('Emulation.setLocaleOverride', { locale: 'ja-JP' });
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const bundle = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
    await session.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `document.addEventListener('DOMContentLoaded',()=>{${bundle}\n},{once:true});${queryHelpers}`,
    });
    await session.send('Page.navigate', { url: 'https://www.nicovideo.jp/watch/sm9' });
    await session.send('Page.bringToFront');
    await check(session, `window.FutatsumeWatch?.ready`, 'P1-01 ライブラリ検証の初期化', 30000);
    await clickVisible(session, '[data-futatsume-open]');
    await check(session, `document.querySelector('futatsume-video')?.currentTime>0`, 'P1-01 入口から実再生', 30000);
    await clickVisible(session, '[data-shell-action="togglePlay"]');
    await clickVisible(session, '[data-shell-action="details"]');
    await clickVisible(session, '[data-shell-tab="videoInfoTab"]');
    await check(
      session,
      `!!document.querySelector('.ownerPageLink[href="https://www.nicovideo.jp/user/4"]')&&!document.querySelector('[class*="Ichiba"],[class*="ichiba"]')`,
      'P3-02/03 投稿者リンクと市場撤去'
    );
    links.push(
      await openLink(
        session,
        '.videoOwnerInfoContainer .ownerPageLink > img.ownerIcon',
        'https://www.nicovideo.jp/user/4'
      )
    );
    checks.push('P3-02-profile-click プロフィール画像の実クリックで正しいURLの新規タブを開く');
    await check(
      session,
      `!!${find('futatsume-video-series-label')}?.shadowRoot?.querySelector('[data-command="playlistSetSeries"]')`,
      'P3-12 シリーズ全体追加の実操作入口を表示'
    );
    await deepClick(session, '.playButton');
    await check(
      session,
      `(()=>{const p=${state}.playlist,m=p.model;return JSON.stringify(m.items.map(i=>i.watchId))===JSON.stringify(['sm9','sm2057168','sm100'])&&m.activeIndex===0&&p.isEnable===false})()`,
      'P3-12 シリーズv2の全動画を順序どおりプレイリストへ追加'
    );
    const seriesRequests = requests.filter((request) => {
      const url = new URL(request.url);
      return request.method === 'GET' && url.pathname === '/v2/series/575910';
    });
    if (
      seriesRequests.length !== 1 ||
      new URL(seriesRequests[0]!.url).searchParams.toString() !== 'pageSize=100&page=1'
    )
      throw Error('シリーズv2の取得要求が一致しません');
    checks.push('P3-12 シリーズv2を1回だけ取得');
    await clickVisible(session, '[data-shell-tab="videoInfoTab"]');
    const tagRoot = `document.querySelector('.fw-tags')`;
    await check(
      session,
      `['陰陽師','レッツゴー！陰陽師'].every(name=>[...${find('.videoTagsInner', tagRoot)}.querySelectorAll('.tagItem')].find(item=>item.dataset.tagId===name)?.querySelector('futatsume-tag-item-menu').dataset.hasNicodic==='1')`,
      'P4-04-existing 公式記事照会で既存タグの誤falseを補正'
    );
    await deepClick(session, '[data-command="toggleInput"]', tagRoot);
    await check(
      session,
      `(()=>{const input=${find('.tagInputText', tagRoot)};return input&&!input.disabled&&input.getBoundingClientRect().height>0&&input.getRootNode().activeElement===input})()`,
      'P4-01-edit タグ編集入力を表示してフォーカスする'
    );
    await replaceInput(session, '.tagInputText', 'fixture-denied', tagRoot);
    await deepClick(session, 'button.submit', tagRoot);
    await check(
      session,
      `${find('[data-tag-status]', tagRoot)}.textContent.includes('403')&&${find('.tagInputText', tagRoot)}.value==='fixture-denied'`,
      'P4-02 拒否時に本文とエラーを保持'
    );
    const tag = 'FutatsumeWatch検証不存在20260920';
    await replaceInput(session, '.tagInputText', tag, tagRoot);
    await deepClick(session, 'button.submit', tagRoot);
    await check(
      session,
      `!!${find(`[data-tag-id="${tag}"]`, tagRoot)}&&${find('.tagInputText', tagRoot)}.value===''`,
      'P4-02 UIからタグ追加して一覧へ反映'
    );
    await deepClick(session, '[data-command="refresh"]', tagRoot);
    await check(
      session,
      `!!${find(`[data-tag-id="${tag}"]`, tagRoot)}&&!${find('.root', tagRoot)}.classList.contains('is-Updating')`,
      'P4-03 再取得して追加したタグを確認'
    );
    await check(
      session,
      `(()=>{const tag=${find(`[data-tag-id="${tag}"]`, tagRoot)};const menu=tag.querySelector('futatsume-tag-item-menu');return menu.dataset.hasNicodic==='0'&&!menu.shadowRoot.querySelector('.root').classList.contains('has-nicodic')&&tag.querySelector('a.nicodic').href===${JSON.stringify('https://dic.nicovideo.jp/a/' + encodeURIComponent(tag))}})()`,
      'P4-04 404を大百科なしアイコンへ反映'
    );
    await deepClick(session, '[data-command="toggleEdit"]', tagRoot);
    await deepClick(session, `[data-tag-id="${tag}"] [data-command="removeTag"]`, tagRoot);
    await check(session, `!${find(`[data-tag-id="${tag}"]`, tagRoot)}`, 'P4-02 タグ削除して一覧へ反映');
    await deepClick(session, '[data-command="refresh"]', tagRoot);
    await check(
      session,
      `!${find(`[data-tag-id="${tag}"]`, tagRoot)}&&!${find('.root', tagRoot)}.classList.contains('is-Updating')`,
      'P4-03 再取得して削除を確認'
    );
    const tagWrites = requests.filter(
      (request) => request.method === 'POST' && new URL(request.url).pathname === '/v2/videos/sm9/tags'
    );
    if (
      tagWrites.length !== 2 ||
      tagWrites.filter((request) => new URL(request.url).searchParams.get('tag') === tag).length !== 1
    )
      throw Error('タグ追加の要求回数が一致しません');
    if (
      requests.filter((request) => request.method === 'DELETE' && new URL(request.url).searchParams.get('tag') === tag)
        .length !== 1
    )
      throw Error('タグ削除の要求回数が一致しません');
    checks.push('P4-02 追加と削除が各1書込要求');
    await clickVisible(session, '[data-shell-tab="relatedVideoTab"]');
    const relatedRoot = `document.querySelector('#fw-tab-relatedVideoTab')`;
    await check(
      session,
      `!!${find('[data-watch-id="sm2057168"] .videoLink', relatedRoot)}`,
      'P3-05 関連動画のiframe行を表示'
    );
    await check(
      session,
      `!${find('[data-command="deflistAdd"],[data-command="mylistSelect"]', relatedRoot)}`,
      'P3-04 関連動画からマイリスト追加ボタンを削除'
    );
    await clickVisible(session, '[data-shell-tab="playlist"]');
    const playlistTabRoot = `document.querySelector('#fw-tab-playlist')`;
    await check(
      session,
      `!${find('[data-command="deflistAdd"],[data-command="mylistSelect"]', playlistTabRoot)}`,
      'P3-04 プレイリストからマイリスト追加ボタンを削除'
    );
    await clickVisible(session, '[data-shell-tab="comment"]');
    const commentRoot = `document.querySelector('#fw-tab-comment')`;
    await check(session, `!!${find('.commentListItem .text', commentRoot)}`, 'P3-06 コメント一覧をiframeへ表示');
    const autoScroll = await evaluate(session, `${state}.commentPanel.isAutoScroll`);
    await clickVisible(session, '.commentPanel-container [data-command="toggleScroll"]');
    await check(
      session,
      `${state}.commentPanel.isAutoScroll!==${JSON.stringify(autoScroll)}`,
      'P3-06 自動スクロールを実クリックで切替'
    );
    await check(
      session,
      `JSON.stringify([...document.querySelectorAll('.commentPanel-menu .commentPanel-command')].map(item=>[item.dataset.command,item.dataset.param,item.textContent.trim()]))===${JSON.stringify(
        JSON.stringify([
          ['sortBy', 'vpos', 'コメントを位置順に並べる'],
          ['sortBy', 'date:desc', '新しい順'],
          ['sortBy', 'nicoru:desc', 'ニコる数'],
        ])
      )}`,
      'P3-09 コメントメニューは並べ替え3項目だけを表示'
    );
    for (const key of ['vpos', 'date:desc', 'nicoru:desc']) {
      await clickVisible(session, '.commentPanel-menu-toggle');
      await clickVisible(session, `.commentPanel-menu [data-command="sortBy"][data-param="${key}"]`);
      await check(
        session,
        `${state}.commentPanel._model._currentSortKey===${JSON.stringify(key.split(':')[0])}&&${state}.commentPanel._model._items.length===128`,
        'P3-09 コメントの並び替え ' + key
      );
      await check(
        session,
        `${find('.commentListItem[data-top="0"]', commentRoot)}?.dataset.itemId===String(${state}.commentPanel._model._items[0].itemId)&&!document.querySelector('.commentPanel-container').classList.contains('updating')&&!${find('.commentListItem', commentRoot)}?.ownerDocument.body.classList.contains('updating')`,
        'P3-09 並び替えの描画完了 ' + key
      );
    }
    await deepClick(session, '.commentListItem .text', commentRoot);
    await check(
      session,
      `${find('.listMenu', commentRoot)}?.classList.contains('show')`,
      'P3-08 コメント行メニューを開く'
    );
    await check(
      session,
      `(()=>{const m=${find('.listMenu', commentRoot)};return [...m.querySelectorAll('[data-command]')].filter(e=>getComputedStyle(e).display!=='none').every(e=>e.getBoundingClientRect().height>=20&&Number(getComputedStyle(e).opacity)>0)})()`,
      'P3-08 全行メニュー項目に表示寸法がある'
    );
    await deepClick(session, '[data-command="itemDetailRequest"]', commentRoot);
    await check(
      session,
      `${find('.itemDetailContainer', commentRoot)}?.classList.contains('show')&&${find('.itemDetailContainer .text', commentRoot)}.textContent.startsWith('検証コメント ')`,
      'P3-08 対象コメントの詳細を表示'
    );
    await deepClick(session, '[data-command="hideItemDetail"]', commentRoot);
    await check(
      session,
      `!${find('.itemDetailContainer', commentRoot)}.classList.contains('show')`,
      'P3-08 コメント詳細を閉じる'
    );
    await verifyLibraryComments(session, { check, click: deepClick, input: replaceInput, find, requests });
    const beforeReload = requests.filter((request) => new URL(request.url).pathname === '/v1/threads').length;
    await deepClick(session, '.reloadButton[data-command="reloadComment"]', commentRoot);
    await check(session, `${state}.commentPanel._model._items.length===128`, 'P3-09 コメント再取得後も件数を保持');
    await Bun.sleep(800);
    if (requests.filter((request) => new URL(request.url).pathname === '/v1/threads').length <= beforeReload)
      throw Error('コメントリロードがAPIへ届きませんでした');
    await clickVisible(session, '[data-shell-tab="videoInfoTab"]');
    await clickVisible(session, '[data-command="ownerVideo"]');
    await check(session, `${state}.playlist.model.items.length===3`, 'P3-01 投稿者一覧をAPIから3件取得', 20000);
    await clickVisible(session, '[data-shell-tab="playlist"]');
    await check(
      session,
      `${state}.playlist.model.items.map(i=>i.watchId).join(',')==='sm9,sm2057168,sm100'`,
      'P3-01 投稿者一覧の順序・動画ID一致'
    );
    const playlistRoot = `document.querySelector('#fw-tab-playlist')`;
    const menu = async (command: string, param?: string) => {
      await clickVisible(session, '.playlist-count');
      await clickVisible(
        session,
        `.playlist-menu [data-command="${command}"]${param ? `[data-param="${param}"]` : ''}`
      );
    };
    for (const key of ['postedAt', 'view:desc', 'comment:desc', 'title', 'duration:desc', 'duration']) {
      const prop = {
        postedAt: 'postedAt',
        view: 'viewCount',
        comment: 'commentCount',
        title: 'sortTitle',
        duration: 'duration',
      }[key.split(':')[0]!]!;
      const expected = await evaluate(
        session,
        `(()=>{const items=[...${state}.playlist.model.items].sort((a,b)=>a.${prop}<b.${prop}? -1:a.${prop}>b.${prop}?1:0);${key.endsWith(':desc') ? 'items.reverse();' : ''}return items.map(i=>i.watchId).join(',')})()`
      );
      await menu('sortBy', key);
      await check(
        session,
        `${state}.playlist.length===3&&${state}.playlist.model.items.map(i=>i.watchId).join(',')===${JSON.stringify(expected)}`,
        'P3-11 並び替え ' + key
      );
      const known: Record<string, string> = { postedAt: 'sm9,sm2057168,sm100', title: 'sm9,sm2057168,sm100' };
      if (known[key])
        await check(
          session,
          `${state}.playlist.model.items.map(item=>item.watchId).join(',')===${JSON.stringify(known[key])}`,
          'P3-11-known 採取日時・固定タイトルの順序 ' + key
        );
    }
    const selected = await evaluate(session, `${state}.playlist._activeItem?.watchId`);
    await menu('reverse');
    await check(
      session,
      `${state}.playlist.model.items[${state}.playlist.getIndex()]?.watchId===${JSON.stringify(selected)}`,
      'P3-11 逆順で選択IDを保持'
    );
    await menu('shuffle');
    await check(
      session,
      `${state}.playlist.length===3&&${state}.playlist._activeItem?.watchId===${JSON.stringify(selected)}`,
      'P3-11 シャッフルで欠落・重複なし'
    );
    await clickVisible(session, '[data-command="toggleEnable"]');
    await check(
      session,
      `document.querySelector('.playlist-container').classList.contains('enable')===${state}.playlist.isEnable`,
      'P3-10 連続再生の状態を同期'
    );
    await clickVisible(session, '[data-command="toggleLoop"]');
    await check(
      session,
      `document.querySelector('.playlist-container').classList.contains('loop')===${state}.playlist.isLoop`,
      'P3-10 リストリピートの状態を同期'
    );
    await menu('resetPlayedItemFlag');
    await check(session, `${state}.playlist.model.items.every(i=>!i.isPlayed)`, 'P3-12 全行を未視聴にする');
    await deepClick(session, '[data-watch-id="sm100"] .videoLink', playlistRoot);
    await check(session, `${state}.videoInfo.watchId==='sm100'`, 'P3-12 iframe内の動画行を実クリックして再生', 30000);
    await verifyMediaIdentity(session, 'sm100', check);
    if (await evaluate(session, `document.querySelector('.fw-player').dataset.panel!=='details'`))
      await clickVisible(session, '[data-shell-action="details"]');
    await clickVisible(session, '[data-shell-tab="playlist"]');
    await deepClick(session, '.videoItem[data-watch-id="sm2057168"]', playlistRoot, true);
    await deepClick(session, '[data-watch-id="sm2057168"] [data-command="playlistRemove"]', playlistRoot);
    await check(session, `!${state}.playlist.findByWatchId('sm2057168')`, 'P3-12 iframe内の行削除');
    await menu('removePlayedItem');
    await check(
      session,
      `${state}.playlist.model.items.every(i=>i.isActive||!i.isPlayed)`,
      'P3-12 視聴済み削除で再生中を保持'
    );
    await menu('removeNonActiveItem');
    await check(
      session,
      `${state}.playlist.length===1&&${state}.playlist.model.items[0].watchId==='sm100'`,
      'P3-12 リスト消去で再生中だけ保持'
    );
    await check(
      session,
      `(()=>{const saved=JSON.parse(sessionStorage.getItem('FutatsumeWatchPlaylist'));return saved?.items.length===1&&saved.items[0].id==='sm100'})()`,
      'P3-12 操作結果をセッションへ保存',
      6000
    );
    await verifyLibraryFiles(session, browser, targetId, {
      check,
      click: deepClick,
      input: replaceInput,
      find,
      requests,
    });
    await screenshot(session, 'complete');
    if (errors.length) throw Error(errors.join('\n'));
    await Bun.write(
      new URL('library-report.json', out),
      JSON.stringify(
        {
          completed: true,
          checks,
          errors,
          links,
          requests: requests.filter((request) => request.url.includes('/tags') || request.url.includes('/playlist/')),
        },
        null,
        2
      )
    );
  } catch (error) {
    await screenshot(session, 'failure');
    const diagnostic = await evaluate(
      session,
      `({tagStatus:window.__libraryFind?.('[data-tag-status]',document.querySelector('.fw-tags'))?.textContent,tagInput:window.__libraryFind?.('.tagInputText',document.querySelector('.fw-tags'))?.value,panel:document.querySelector('.fw-player')?.dataset.panel,tab:window.FutatsumeWatch?.debug.dialog?._state.currentTab})`
    ).catch(() => null);
    await Bun.write(
      new URL('library-report.json', out),
      JSON.stringify(
        { completed: false, checks, errors, links, failure: String(error), diagnostic, requests: requests.slice(-30) },
        null,
        2
      )
    );
    throw error;
  } finally {
    await cleanupCdp(
      () => session.close(),
      async () => {
        const { targetInfo } = (await browser.send('Target.getTargetInfo', { targetId })) as {
          targetInfo: { browserContextId: string };
        };
        return browser.send('Target.disposeBrowserContext', { browserContextId: targetInfo.browserContextId });
      },
      () => browser.close()
    );
  }
}
await main();
