import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';
import { offlineSites } from './dev-offline';

export interface LibraryActions {
  requests: ReadonlyArray<{ url: string; method: string; postData?: string }>;
  check(this: void, session: CdpSession, expression: string, label: string, timeout?: number): Promise<void>;
  click(this: void, session: CdpSession, selector: string, within?: string, hoverOnly?: boolean): Promise<void>;
  input(this: void, session: CdpSession, selector: string, text: string, within?: string): Promise<void>;
  find(this: void, selector: string, within?: string): string;
}

type DateTimeInputSegment = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'dayPeriod';

export function getDateTimeInputKeys(
  value: string,
  segments: readonly DateTimeInputSegment[],
  hour12: boolean
): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`日時入力値の形式が不正です: ${value}`);
  const [, year, month, day, rawHour, minute, second] = match;
  const hour = Number(rawHour);
  const values: Record<DateTimeInputSegment, string> = {
    year: year!,
    month: month!,
    day: day!,
    hour: hour12 ? String(hour % 12 || 12).padStart(2, '0') : rawHour!,
    minute: minute!,
    second: second!,
    dayPeriod: hour < 12 ? 'a' : 'p',
  };
  return segments.map((segment) => values[segment]);
}

export async function verifyLibraryComments(session: CdpSession, actions: LibraryActions): Promise<void> {
  const { check, click, input, find } = actions;
  const root = `document.querySelector('#fw-tab-comment')`;
  const model = 'window.FutatsumeWatch.debug.commentPanel._model';
  const site = offlineSites.get(session);
  if (!site) throw Error('コメント検証の隔離フィクスチャがありません');
  const current = () => site.commentsByVideo.get('sm9')!;
  const count = current().length;
  const writesBefore = site.writes.length;
  const threadLoads = () =>
    actions.requests.filter((request) => request.method === 'POST' && new URL(request.url).pathname === '/v1/threads');
  const dateInput = async (value: string) => {
    await click(session, '.dateTimeInput', root);
    const layout = (await evaluate(
      session,
      `(()=>{const f=new Intl.DateTimeFormat(navigator.language,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});const supported=new Set(['year','month','day','hour','minute','second','dayPeriod']);return {segments:f.formatToParts(new Date(2001,10,22,13,44,55)).map(p=>p.type).filter(type=>supported.has(type)),hour12:f.resolvedOptions().hour12};})()`
    )) as { segments: DateTimeInputSegment[]; hour12: boolean };
    const key = async (key: string, text?: string) => {
      await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text });
      await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
    };
    for (let i = 0; i < 8; i++) await key('ArrowLeft');
    for (const part of getDateTimeInputKeys(value, layout.segments, layout.hour12))
      for (const character of part) await key(character, character);
  };
  const openRow = async (no: number) => {
    if (await evaluate(session, `${model}._currentSortKey!=='vpos'`)) {
      await clickVisible(session, '.commentPanel-menu-toggle');
      await clickVisible(session, '.commentPanel-menu [data-command="sortBy"][data-param="vpos"]');
    }
    await check(
      session,
      `${find('.commentListItem[data-top="0"]', root)}?.dataset.itemId===String(${model}._items[0].itemId)`,
      'P3-08-row-order コメント行の表示順を確定'
    );
    await click(session, `.commentListItem[data-no="${no}"] .text`, root);
    await check(
      session,
      `${find('.listMenu', root)}?.classList.contains('show')`,
      'P3-08-row-open 対象の行メニューを開く'
    );
  };
  const threads = () => site.writes.filter((request) => new URL(request.url).pathname.endsWith('/comments')).length;
  // Clipboard APIの境界だけ捕捉する。OSの共有クリップボードは変更しない。
  await evaluate(
    session,
    `(()=>{window.__libraryClipboardWrite=navigator.clipboard.writeText;navigator.clipboard.writeText=text=>{window.__libraryCopied=text;return Promise.resolve()};})()`
  );
  try {
    await openRow(1);
    await click(session, '[data-command="clipBoard"]', root);
    await check(
      session,
      `window.__libraryCopied==='検証コメント 0'`,
      'P3-08-copy 行から選んだ本文だけをコピーAPIへ渡す'
    );
  } finally {
    await evaluate(
      session,
      `navigator.clipboard.writeText=window.__libraryClipboardWrite;delete window.__libraryClipboardWrite;delete window.__libraryCopied;`
    );
  }

  const beforeCount = current().find((comment) => comment.no === 1)!.nicoruCount;
  site.faults.nicoruStatus = 403;
  try {
    await click(session, '.commentListItem[data-no="1"]', root, true);
    await click(session, '.commentListItem[data-no="1"] .nicoru-icon', root);
    await check(
      session,
      `[...document.querySelectorAll('.futatsumePopupMessage.alert')].some(e=>e.textContent.includes('ニコ'))`,
      'P3-08-nicoru-denied 拒否理由を表示'
    );
    await check(
      session,
      `(()=>{const item=${model}._items.find(item=>item.no===1);return !item.nicotta&&item.nicoru===${beforeCount}})()`,
      'P3-08-nicoru-rollback 拒否されたニコるを件数へ反映しない'
    );
    if (current().find((comment) => comment.no === 1)!.nicoruCount !== beforeCount)
      throw Error('拒否でサーバーのニコるが変更されました');
  } finally {
    site.faults.nicoruStatus = 200;
  }
  await click(session, '.commentListItem[data-no="1"]', root, true);
  await click(session, '.commentListItem[data-no="1"] .nicoru-icon', root);
  await check(
    session,
    `(()=>{const item=${model}._items.find(item=>item.no===1);return item.nicotta&&item.nicoru===${beforeCount + 1}})()`,
    'P3-08-nicoru-success 受理後の件数を一覧へ反映'
  );
  if (current().find((comment) => comment.no === 1)!.nicoruCount !== beforeCount + 1)
    throw Error('ニコるの受理結果が不一致');
  const beforeNicoruReload = await evaluate(session, `${model}._items.find(item=>item.no===1).itemId`);
  await click(session, '.reloadButton[data-command="reloadComment"]', root);
  await check(
    session,
    `(()=>{const item=${model}._items.find(item=>item.no===1);return item?.itemId!==${JSON.stringify(beforeNicoruReload)}&&item?.nicoru===${beforeCount + 1}})()`,
    'P3-08-nicoru-reload 再取得でも受理件数を保持'
  );

  const clearFilter = async (key: 'wordRegFilter' | 'userIdFilter') => {
    await clickVisible(session, '.fw-backdrop');
    await clickVisible(session, '[data-shell-action="settings"]');
    await clickVisible(session, '[data-shell-action="general"]');
    await check(session, `!!${find('[data-fw-settings="general"]')}?.open`, 'P3-08-ng-settings 設定からNGを復元する');
    const general = find('[data-fw-settings="general"]');
    await click(session, '[data-settings-tab="filters"]', general);
    await input(session, `[data-setting-name="${key}"]`, '', general);
    await click(session, '[data-settings-close]', general);
    await clickVisible(session, '[data-shell-action="details"]');
    await clickVisible(session, '[data-shell-tab="comment"]');
    await check(session, `${model}._items.length===${count}`, 'P3-08-ng-restore NG解除で全件を復元');
  };
  await openRow(1);
  await click(session, '[data-command="addWordFilter"]', root);
  await check(
    session,
    `${model}._items.length===${count - 1}&&!${model}._items.some(item=>item.text==='検証コメント 0')&&window.FutatsumeWatch.config.props.wordRegFilter.includes('/検証コメント 0/i')`,
    'P3-08-ng-word 選んだ本文をリテラル正規表現へ追加して除外'
  );
  if (current().length !== count) throw Error('NG操作がサーバーのコメントを削除しました');
  await clearFilter('wordRegFilter');
  await openRow(1);
  await click(session, '[data-command="addUserIdFilter"]', root);
  await check(session, `${model}._items.length===0`, 'P3-08-ng-user 同じユーザーのコメントを除外');
  if (current().length !== count) throw Error('ユーザーNGでサーバーのコメントが変化しました');
  await clearFilter('userIdFilter');

  // 日付入力はネイティブdatetime-localへ実キー入力する。
  await click(session, '.TimeMachine .dateTime', root);
  await click(session, '.dateTimeCancel', root);
  await check(
    session,
    `!${find('.TimeMachine', root)}.classList.contains('is-Selecting')`,
    'P3-07-date-cancel 日時指定を取り消す'
  );
  await click(session, '.TimeMachine .dateTime', root);
  const beforeInvalidDate = threadLoads().length;
  await dateInput('2099-01-01T00:00:00');
  await check(
    session,
    `${find('.dateTimeInput', root)}.value.startsWith('2099-01-01T00:00')`,
    'P3-07-date-input 未来日時を実入力する'
  );
  await click(session, '.dateTimeSubmit', root);
  await check(
    session,
    `!${find('.dateTimeInput', root)}.validity.valid&&${find('.TimeMachine', root)}.classList.contains('is-Selecting')`,
    'P3-07-date-invalid 未来日時を要求へ送らない'
  );
  if (threadLoads().length !== beforeInvalidDate) throw Error('無効な未来日時がAPIへ送信されました');
  await click(session, '.dateTimeCancel', root);
  // 生成コメントは2026-09-20 00:00:00〜59 JST。過去ログ境界は30秒。
  await click(session, '.TimeMachine .dateTime', root);
  await dateInput('2026-09-20T00:00:30');
  await check(
    session,
    `${find('.dateTimeInput', root)}.value==='2026-09-20T00:00:30'`,
    'P3-07-date-valid 境界日時を実入力する'
  );
  await click(session, '.dateTimeSubmit', root);
  const expected = current().filter(
    (comment) => new Date(comment.postedAt).getTime() <= Date.parse('2026-09-20T00:00:30+09:00')
  ).length;
  await check(
    session,
    `window.FutatsumeWatch.debug.dialog._state.isWaybackMode&&${model}._items.length===${expected}`,
    'P3-07-date-fetch 指定日時以前のコメントだけを表示'
  );
  const dated: unknown = JSON.parse(threadLoads().at(-1)?.postData ?? 'null');
  if (
    typeof dated !== 'object' ||
    dated === null ||
    !('additionals' in dated) ||
    typeof dated.additionals !== 'object' ||
    dated.additionals === null ||
    !('when' in dated.additionals) ||
    dated.additionals.when !== Date.parse('2026-09-20T00:00:30+09:00') / 1000
  )
    throw Error('指定日時がコメント取得要求に反映されませんでした');
  await check(session, `document.querySelector('.commentInput').disabled`, 'P3-07-date-post 過去ログ中の投稿を禁止');
  await check(
    session,
    `(()=>{const button=${find('.backToTheFuture', root)},r=button.getBoundingClientRect(),s=getComputedStyle(button);return window.FutatsumeWatch.debug.timeMachineView._state.isWaybackMode&&r.width>0&&r.height>0&&s.display!=='none'&&s.visibility==='visible'})()`,
    'P3-07-date-back-visible 通常表示へ戻るボタンの描画完了'
  );
  await click(session, '.backToTheFuture', root);
  await check(
    session,
    `!window.FutatsumeWatch.debug.dialog._state.isWaybackMode&&${model}._items.length===${count}`,
    'P3-07-date-return 現在のコメントへ復帰'
  );

  await clickVisible(session, '.fw-backdrop');
  await clickVisible(session, '.commentInput');
  await session.send('Input.insertText', { text: '機能検証の削除対象' });
  const postedBefore = threads();
  await clickVisible(session, '.commentSubmit');
  await check(
    session,
    `document.querySelector('.commentInput').value===''`,
    'P3-08-delete-setup 削除対象の本人コメントを受理'
  );
  if (threads() !== postedBefore + 1) throw Error('削除対象コメントの投稿が重複しました');
  const posted = current().find((comment) => comment.body === '機能検証の削除対象');
  if (!posted) throw Error('削除対象がフィクスチャに保存されませんでした');
  await clickVisible(session, '[data-shell-action="details"]');
  await clickVisible(session, '[data-shell-tab="comment"]');
  await check(session, `${model}._items.length===${count + 1}`, 'P3-08-delete-own 本人コメントを一覧へ追加');
  site.faults.deleteStatus = 403;
  try {
    await openRow(posted.no);
    await click(session, '[data-command="removeComment"]', root);
    await check(
      session,
      `[...document.querySelectorAll('.futatsumePopupMessage.alert')].some(e=>e.textContent.includes('削除'))`,
      'P3-08-delete-denied コメント削除の拒否を表示'
    );
    await check(
      session,
      `${model}._items.some(item=>item.no===${posted.no})`,
      'P3-08-delete-retain 拒否された削除で行を消さない'
    );
    if (!current().some((comment) => comment.no === posted.no))
      throw Error('拒否されたコメントをサーバーから削除しました');
  } finally {
    site.faults.deleteStatus = 200;
  }
  await openRow(posted.no);
  await click(session, '[data-command="removeComment"]', root);
  await check(
    session,
    `!${model}._items.some(item=>item.no===${posted.no})`,
    'P3-08-delete-success 受理後だけ本人の行を削除'
  );
  const beforeDeleteReload = await evaluate(session, `${model}._items[0].itemId`);
  await click(session, '.reloadButton[data-command="reloadComment"]', root);
  await check(
    session,
    `${model}._items[0]?.itemId!==${JSON.stringify(beforeDeleteReload)}&&${model}._items.length===${count}&&!${model}._items.some(item=>item.text==='機能検証の削除対象')`,
    'P3-08-delete-reload 再取得でも削除を確認'
  );
  if (current().some((comment) => comment.no === posted.no)) throw Error('削除結果がサーバー状態へ未反映');
  if (site.writes.length <= writesBefore) throw Error('行操作の書込要求がありません');
}
