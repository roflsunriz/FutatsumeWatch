import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import type { MenuCheck } from './verify-menu-actions';
import { verifyMediaIdentity } from './verify-media-identity';

interface DescriptionHooks {
  check: MenuCheck;
  click: (session: CdpSession, selector: string, within?: string, hoverOnly?: boolean) => Promise<void>;
  screenshot: (session: CdpSession, name: string) => Promise<void>;
}

export async function verifyDescription(session: CdpSession, hooks: DescriptionHooks): Promise<void> {
  const { check, click, screenshot } = hooks;
  const description = `document.querySelector('.videoDescription')`;
  const card = (id: string) => `${description}.querySelector('futatsume-video-item[data-video-id="${id}"]')`;
  const debug = 'window.FutatsumeWatch.debug';
  await click(session, 'futatsume-video-item', description, true);
  await check(
    session,
    `['sm2057168','sm100','sm9'].every(id=>{const item=${description}.querySelector('futatsume-video-item[data-video-id="'+id+'"]'),root=item?.shadowRoot;return item?.dataset.watchId===id&&root?.querySelector('.videoLink')?.textContent.trim()==='検証動画 '+id&&root.querySelector('.thumbnail')?.getAttribute('src')==='https://fixture.invalid/poster.svg'&&!!root.querySelector('.duration')&&root.querySelector('.postedAt')?.textContent.includes('2026')&&root.querySelector('.viewCount')?.textContent==='10'&&root.querySelector('.commentCount')?.textContent==='128'&&root.querySelector('.mylistCount')?.textContent==='2'})`,
    'P3-03 説明文の動画ID・タイトル付きリンクに取得したメタデータを表示',
    30000
  );
  await screenshot(session, 'description-1280');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click(session, 'futatsume-video-item', description, true);
  await check(
    session,
    `(()=>{const item=${card('sm2057168')},r=item.getBoundingClientRect(),title=item.shadowRoot.querySelector('.videoLink').getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&title.width>0&&title.right<=innerWidth})()`,
    'P3-03 390px幅で説明文カードのタイトルを画面内に表示'
  );
  await screenshot(session, 'description-390');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click(session, '[data-command="seek"]', description);
  await check(
    session,
    `Math.abs(document.querySelector('futatsume-video').currentTime-10)<1`,
    'P3-03 説明文の時刻リンクを実クリックしてシーク'
  );
  await click(session, '.thumbnail', `${card('sm100')}.shadowRoot`, true);
  await click(session, '[data-command="playlistAppend"]', `${card('sm100')}.shadowRoot`);
  await check(
    session,
    `${debug}.playlist.model.items.some(item=>item.watchId==='sm100')`,
    'P3-03 説明文カードからプレイリストに追加'
  );
  await click(session, 'a[href="/watch/sm2057168"]', description);
  await check(session, `${debug}.videoInfo.watchId==='sm2057168'`, 'P3-03 元の動画IDリンクから再生', 30000);
  await verifyMediaIdentity(session, 'sm2057168', check);
  await click(session, '.videoLink', `${card('sm100')}.shadowRoot`);
  await check(session, `${debug}.videoInfo.watchId==='sm100'`, 'P3-03 取得済みタイトルから再生', 30000);
  await verifyMediaIdentity(session, 'sm100', check);
  await click(session, '.thumbnail', `${card('sm9')}.shadowRoot`);
  await check(session, `${debug}.videoInfo.watchId==='sm9'`, 'P3-03 説明文カードから元の動画へ復帰', 30000);
  await verifyMediaIdentity(session, 'sm9', check);
  await click(session, '.fw-backdrop');
  if (await evaluate(session, `!document.querySelector('futatsume-video').paused`)) {
    await click(session, '[data-shell-action="togglePlay"]');
  }
  await click(session, '[data-shell-action="details"]');
  await click(session, '[data-shell-tab="videoInfoTab"]');
}
