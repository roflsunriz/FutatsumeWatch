import { resolve } from 'node:path';
import { evaluate, evaluateAsync } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';
import { settingsQuerySource } from './verify-settings-storage';

export const readmeImages = [
  'tampermonkey',
  'install',
  'update',
  'entry',
  'playback',
  'guide',
  'settings-player',
  'settings-comments',
  'settings-filters',
  'settings-data',
  'settings-advanced',
  'tab-info',
  'tab-related',
  'tab-comments',
  'tab-playlist',
] as const;
export type ReadmeImage = (typeof readmeImages)[number];

export async function until(session: CdpSession, expression: string, label: string, timeout = 30000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(session, expression)) return;
    await Bun.sleep(100);
  }
  throw new Error(`撮影条件を満たしません: ${label}（自動再試行しません）`);
}

export async function preparePage(session: CdpSession): Promise<void> {
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

export async function capture(
  session: CdpSession,
  directory: string,
  name: ReadmeImage,
  clip?: { x: number; y: number; width: number; height: number; scale: number }
): Promise<void> {
  await session.send('Page.bringToFront');
  await evaluateAsync(
    session,
    `document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))`
  );
  const shot = (await session.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) })) as {
    data: string;
  };
  await Bun.write(resolve(directory, `${name}.png`), Buffer.from(shot.data, 'base64'));
  console.log(`撮影: ${name}`);
}

// 製品DOMは変更せず、解説画像だけに重ねる注釈。座標は毎回実際の要素から求める。
export async function annotate(
  session: CdpSession,
  notes: ReadonlyArray<{ selector: string; text: string }>
): Promise<void> {
  await evaluate(
    session,
    `(()=>{
    document.querySelector('[data-readme-annotations]')?.remove();
    const overlay=document.createElement('div');overlay.dataset.readmeAnnotations='';
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:600 17px/1.5 sans-serif;color:#fff';
    for(const [i,note] of ${JSON.stringify(notes)}.entries()){
      const element=window.__settingsQuery?window.__settingsQuery(note.selector):document.querySelector(note.selector);
      if(!element)throw Error('解説の対象がありません: '+note.selector);
      const r=element.getBoundingClientRect();if(!r.width||!r.height)throw Error('解説の対象が非表示です');
      const border=document.createElement('div');border.style.cssText='position:absolute;border:3px solid #f8c440;border-radius:7px;box-sizing:border-box';
      Object.assign(border.style,{left:r.left-3+'px',top:r.top-3+'px',width:r.width+6+'px',height:r.height+6+'px'});
      const label=document.createElement('div');label.textContent=(i+1)+'  '+note.text;
      label.style.cssText='position:absolute;background:#132633;border:2px solid #f8c440;border-radius:7px;padding:7px 12px;max-width:370px;box-shadow:0 4px 16px #0008';
      label.style.left=Math.max(12,Math.min(innerWidth-400,r.left))+'px';
      label.style.top=(r.top>innerHeight/2?Math.max(12,r.top-58):Math.min(innerHeight-65,r.bottom+12))+'px';
      overlay.append(border,label);
    }
    document.body.append(overlay);
  })()`
  );
}

export async function clearAnnotations(session: CdpSession): Promise<void> {
  await evaluate(session, `document.querySelector('[data-readme-annotations]')?.remove()`);
}

async function reveal(session: CdpSession): Promise<void> {
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 90, y: 180 });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 180 });
  await until(session, `document.querySelector('.fw-player')?.dataset.controls==='visible'`, '操作バーの表示');
}

export async function captureEntry(session: CdpSession, directory: string): Promise<void> {
  await until(
    session,
    `window.FutatsumeWatch?.ready && !!document.querySelector('[data-futatsume-open]:not(:disabled)')`,
    'FW起動ボタン'
  );
  await evaluate(session, `document.querySelector('[data-futatsume-open]').scrollIntoView({block:'center'})`);
  await until(
    session,
    `!document.querySelector('[class*="ncnl-"],[id*="ncnl-"],.nl-cached,.cacheIcon,[class*="filter-matome"],[id*="filter-matome"]')`,
    'NicoCache等の追加要素がないこと',
    1000
  );
  await annotate(session, [{ selector: '[data-futatsume-open]', text: 'FWボタンをクリックして再生' }]);
  const clip = (await evaluate(
    session,
    `(()=>{const r=document.querySelector('[data-futatsume-open]').getBoundingClientRect(),y=Math.max(0,r.top-20);return{x:0,y,width:innerWidth,height:Math.min(240,innerHeight-y),scale:1}})()`
  )) as { x: number; y: number; width: number; height: number; scale: number };
  await capture(session, directory, 'entry', clip);
  await clearAnnotations(session);
}

export async function capturePlayer(session: CdpSession, directory: string): Promise<void> {
  await evaluate(session, settingsQuerySource);
  await evaluate(
    session,
    `window.__readmeFind=function find(selector,root){const own=root.querySelector(selector);if(own)return own;for(const node of root.querySelectorAll('*')){if(node.shadowRoot){const found=find(selector,node.shadowRoot);if(found)return found;}if(node.tagName==='IFRAME'&&node.contentDocument){const found=find(selector,node.contentDocument);if(found)return found;}}return null;}`
  );
  await reveal(session);
  await capture(session, directory, 'playback');
  await annotate(session, [
    { selector: '[data-shell-action="settings"]', text: '設定：再生・コメント・NGなど' },
    { selector: '[data-shell-action="details"]', text: '右タブ：動画情報・関連動画・コメント・プレイリスト' },
    { selector: '.seekBar', text: 'シークバーで再生位置を移動' },
  ]);
  await capture(session, directory, 'guide');
  await clearAnnotations(session);
  await reveal(session);
  await clickVisible(session, '[data-shell-action="settings"]');
  let current = 'general';
  for (const tab of ['player', 'comments', 'filters', 'data', 'advanced'] as const) {
    await until(session, `window.__settingsQuery('[data-fw-settings="${current}"]')?.open`, '設定画面');
    await clickVisible(
      session,
      `[data-settings-tab="${tab}"]`,
      `window.__settingsQuery('[data-fw-settings="${current}"]')`
    );
    current = tab === 'advanced' ? 'advanced' : 'general';
    await until(
      session,
      `window.__settingsQuery('[data-fw-settings="${current}"]')?.querySelector('[data-settings-tab="${tab}"]')?.getAttribute('aria-selected')==='true'`,
      '設定カテゴリの切替'
    );
    await capture(session, directory, `settings-${tab}`);
  }
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await until(session, `!window.__settingsQuery('[data-fw-settings="advanced"]')?.open`, '設定画面を閉じる');
  await reveal(session);
  await clickVisible(session, '[data-shell-action="details"]');
  await until(session, `document.querySelector('.fw-player')?.dataset.panel==='details'`, '右パネル');
  if (await evaluate(session, `document.querySelector('.fw-player').dataset.detailsLocked!=='true'`))
    await clickVisible(session, '[data-shell-action="details-lock"]');
  for (const [tab, image] of [
    ['videoInfoTab', 'tab-info'],
    ['relatedVideoTab', 'tab-related'],
    ['comment', 'tab-comments'],
    ['playlist', 'tab-playlist'],
  ] as const) {
    await clickVisible(session, `[data-shell-tab="${tab}"]`);
    await until(session, `document.querySelector('.tabs.${tab}')?.classList.contains('activeTab')`, '右タブの切替');
    if (tab !== 'videoInfoTab') {
      const row = tab === 'comment' ? '.commentListItem .text' : '.videoItem[data-watch-id]';
      await until(
        session,
        `!!window.__readmeFind(${JSON.stringify(row)},document.querySelector('#fw-tab-${tab}'))`,
        'iframe内の一覧描画'
      );
    }
    await capture(session, directory, image);
  }
}
