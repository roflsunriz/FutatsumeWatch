import { mkdir, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import type { LibraryActions } from './dev-verify-library-comments';
import { verificationDirectory } from './dev-verification-output';
import { clickVisible } from './dev-ui';

export async function verifyLibraryFiles(
  session: CdpSession,
  browser: CdpSession,
  targetId: string,
  actions: LibraryActions
): Promise<void> {
  const { check } = actions;
  const playlist = 'window.FutatsumeWatch.debug.playlist';
  const directory = fileURLToPath(new URL(`library-files-${randomUUID()}/`, verificationDirectory));
  await mkdir(directory, { recursive: true });
  const info = (await browser.send('Target.getTargetInfo', { targetId })) as {
    targetInfo: { browserContextId?: string };
  };
  await browser.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: directory,
    eventsEnabled: true,
    browserContextId: info.targetInfo.browserContextId,
  });
  const completed = new Set<string>();
  const downloads: Array<{ guid: string; suggestedFilename: string }> = [];
  browser.onEvent((method, params) => {
    if (method === 'Browser.downloadWillBegin') downloads.push(params as { guid: string; suggestedFilename: string });
    if (method === 'Browser.downloadProgress' && params.state === 'completed') completed.add(String(params.guid));
  });
  let promptAccept = false;
  let promptCount = 0;
  const prompts: Array<Promise<unknown>> = [];
  session.onEvent((method, params) => {
    if (method === 'Page.javascriptDialogOpening' && params.type === 'prompt') {
      promptCount++;
      prompts.push(
        session.send('Page.handleJavaScriptDialog', {
          accept: promptAccept,
          promptText: promptAccept ? 'library-export' : '',
        })
      );
    }
  });
  const menu = async (command: string) => {
    await clickVisible(session, '.playlist-count');
    await clickVisible(session, `.playlist-menu [data-command="${command}"]`);
  };
  const before = await evaluate(session, `JSON.stringify(${playlist}.serialize())`);
  const waitPrompt = async (expected: number) => {
    const deadline = Date.now() + 5000;
    while (promptCount < expected && Date.now() < deadline) await Bun.sleep(50);
    if (promptCount !== expected) throw Error('保存名の入力画面が開きません');
    await Promise.all(prompts.splice(0));
  };
  await menu('exportFile');
  await waitPrompt(1);
  if (downloads.length !== 0) throw Error('保存取消でファイルを生成しました');
  await check(
    session,
    `JSON.stringify(${playlist}.serialize())===${JSON.stringify(before)}`,
    'P3-12-export-cancel 保存取消で一覧を変更しない'
  );
  promptAccept = true;
  await menu('exportFile');
  await waitPrompt(2);
  const deadline = Date.now() + 10000;
  while ((!downloads.length || !completed.has(downloads[0]!.guid)) && Date.now() < deadline) await Bun.sleep(100);
  if (Number(downloads.length) !== 1 || !completed.has(downloads[0]!.guid))
    throw Error('プレイリストのダウンロードが完了しません');
  const exported = join(directory, downloads[0]!.suggestedFilename);
  const content = await readFile(exported, 'utf8');
  const parsed: unknown = JSON.parse(content);
  if (JSON.stringify(parsed) !== before) throw Error('保存ファイルと一覧の状態が一致しません');
  await check(
    session,
    `JSON.stringify(${playlist}.serialize())===${JSON.stringify(JSON.stringify(parsed))}`,
    'P3-12-export-json ダウンロードしたJSONが順序・選択・設定と一致'
  );
  await session.send('Page.setInterceptFileChooserDialog', { enabled: true });
  let chooserCount = 0;
  session.onEvent((method) => {
    if (method === 'Page.fileChooserOpened') chooserCount++;
  });
  await session.send('DOM.enable');
  const { root } = (await session.send('DOM.getDocument', { depth: 0 })) as { root: { nodeId: number } };
  const { nodeId } = (await session.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '.import-playlist-file-select',
  })) as { nodeId: number };
  if (!nodeId) throw Error('読込ファイル入力がありません');
  const choose = async (files: string[]) => {
    const previous = chooserCount;
    await menu('importFileMenu');
    const limit = Date.now() + 5000;
    while (chooserCount === previous && Date.now() < limit) await Bun.sleep(50);
    if (chooserCount === previous) throw Error('メニューからファイル選択が開きません');
    await session.send('DOM.setFileInputFiles', { nodeId, files });
  };
  const corrupt = join(directory, 'corrupt.playlist.json');
  await Bun.write(corrupt, '{broken');
  await choose([corrupt]);
  await check(
    session,
    `[...document.querySelectorAll('.futatsumePopupMessage.alert')].some(e=>e.textContent.includes('形式が不正'))&&JSON.stringify(${playlist}.serialize())===${JSON.stringify(before)}`,
    'P3-12-import-corrupt 破損JSONを拒否して一覧を維持'
  );
  const invalid = join(directory, 'invalid.playlist.json');
  await Bun.write(invalid, JSON.stringify({ items: [{ id: '' }] }));
  await choose([invalid]);
  await check(
    session,
    `[...document.querySelectorAll('.futatsumePopupMessage.alert')].some(e=>e.textContent.includes('動画情報が不正'))&&JSON.stringify(${playlist}.serialize())===${JSON.stringify(before)}`,
    'P3-12-import-shape 不正な動画情報を拒否して一覧を維持'
  );
  await choose([]);
  await check(
    session,
    `JSON.stringify(${playlist}.serialize())===${JSON.stringify(before)}`,
    'P3-12-import-cancel ファイル選択取消で一覧を維持'
  );
  const oldItemId = await evaluate(session, `${playlist}.model.items[0].itemId`);
  await choose([exported]);
  const stable = `JSON.stringify(${playlist}.serialize(),(key,value)=>key==='last_activated'?undefined:value)`;
  const expectedStable = JSON.stringify(parsed, (key, value: unknown) =>
    key === 'last_activated' ? undefined : value
  );
  await check(
    session,
    `${playlist}.model.items[0].itemId!==${JSON.stringify(oldItemId)}&&${stable}===${JSON.stringify(expectedStable)}`,
    'P3-12-import-restore 保存したJSONから順序・選択・設定を復元'
  );
  await session.send('Page.setInterceptFileChooserDialog', { enabled: false });
  if ((await readdir(directory)).some((name) => name.endsWith('.crdownload')))
    throw Error('未完了ダウンロードが残りました');
}
