import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { monitorLiveRead } from './live-capture';
import { scrub } from './live-capture-policy';
import { LiveWritePermitGuard } from './live-write-permit';
import type { LiveWritePermit, CreatedMylistReceipt, AddedMylistItemReceipt } from './live-write-permit';
import type { CdpSession } from './dev-cdp';

const root = resolve(import.meta.dir, '../dev-assets/live-account');
const state = (await Bun.file(resolve(root, 'state.json')).json()) as {
  port: number;
  targetId: string;
  browserContextId: string;
  loggedInVerified?: boolean;
};
if (state.port !== 9341 || !state.loggedInVerified) throw Error('本人ログイン済みの専用環境ではありません');
process.env.FUTATSUME_DEV_PORT = String(state.port);
process.env.FUTATSUME_TEST_OFFLINE = '0';
const { attachBrowser, evaluate, evaluateAsync } = await import('./dev-cdp');
const { clickVisible } = await import('./dev-ui');
const sessionName = Bun.argv[Bun.argv.indexOf('--session') + 1];
if (!Bun.argv.includes('--session') || !sessionName || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(sessionName))
  throw Error('--session に承認済みの試行IDを指定してください。新しいIDは再試行の承認にはなりません');
const directory = resolve(root, sessionName);
mkdirSync(directory, { recursive: true });
const resume = Bun.argv.includes('--resume');
const existingActions = resume
  ? (await Bun.file(resolve(directory, 'actions.jsonl')).text())
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { phase?: string; command?: Command })
  : [];
const existingNetwork = resume
  ? (await Bun.file(resolve(directory, 'network.jsonl')).text())
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as {
            kind: string;
            data: {
              action?: string;
              request?: { method: string; url: string; postData?: string; headers: Record<string, string> };
            };
          }
      )
  : [];
if (existingNetwork.some((event) => event.kind === 'write-decision' && event.data.action === 'allow-write'))
  throw Error('書込み済みsessionの自動再開は禁止です');
if (!resume)
  writeFileSync(
    resolve(directory, 'session-started.json'),
    JSON.stringify({
      startedAt: new Date().toISOString(),
      scope: 'user-approved selected new video; one attempt per public operation',
    }),
    { flag: 'wx' }
  );
const browser = await attachBrowser();
const monitor = await monitorLiveRead(browser, state.browserContextId, directory);
const writes = new LiveWritePermitGuard();
monitor.configureWrites(writes);
const previousCommands = existingActions
  .filter((event) => event.phase === 'before' && event.command)
  .map((event) => event.command!);
const previousWatch = previousCommands.filter((command) => command.action === 'watch').at(-1)?.watchId;
if (previousWatch) monitor.setWatchId(previousWatch);
if (resume)
  monitor.restoreReadHistory(
    existingNetwork
      .filter((event) => event.kind === 'allowed' && event.data.request)
      .map((event) => event.data.request!)
  );
let page = await monitor.page(state.targetId),
  targetId = state.targetId;
const source = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
const prepare = async (connection: CdpSession): Promise<void> => {
  await connection.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if(location.pathname.startsWith('/watch/'))document.addEventListener('DOMContentLoaded',()=>{${source}\n},{once:true});`,
  });
};
await prepare(page);
const commands = new Set<string>(previousCommands.map((command) => command.id));
const navigated = new Set<string>(
  previousCommands.filter((command) => command.action === 'navigate').map((command) => command.url!)
);
const record = (value: unknown): void =>
  appendFileSync(resolve(directory, 'actions.jsonl'), JSON.stringify(scrub(value)) + '\n');
let finished = false;
interface Command {
  id: string;
  action: string;
  url?: string;
  expression?: string;
  selector?: string;
  text?: string;
  method?: string;
  params?: Record<string, unknown>;
  watchId?: string;
  targetId?: string;
  permit?: LiveWritePermit;
  permitId?: string;
  created?: CreatedMylistReceipt;
  added?: AddedMylistItemReceipt;
}
async function act(command: Command): Promise<unknown> {
  switch (command.action) {
    case 'armWrite':
      if (!command.permit) throw Error('許可内容なし');
      writes.arm(command.permit);
      return writes.status();
    case 'created':
      if (!command.permitId || !command.created) throw Error('成功情報なし');
      writes.recordCreatedMylist(command.permitId, command.created);
      return writes.status();
    case 'added':
      if (!command.permitId || !command.added) throw Error('成功情報なし');
      writes.recordAddedItem(command.permitId, command.added);
      return writes.status();
    case 'status':
      return { targetId, directory };
    case 'navigate': {
      if (!command.url) throw Error('URLなし');
      const url = new URL(command.url);
      if (url.origin !== 'https://www.nicovideo.jp') throw Error('対象外の遷移先');
      if (navigated.has(url.href)) throw Error('同一文書の再遷移は追加承認が必要');
      navigated.add(url.href);
      return page.send('Page.navigate', { url: url.href });
    }
    case 'watch':
      if (!command.watchId) throw Error('動画IDなし');
      monitor.setWatchId(command.watchId);
      return { watchId: command.watchId };
    case 'refresh':
      if (!command.url) throw Error('URLなし');
      monitor.allowReadRefresh(command.url);
      return { url: command.url };
    case 'evaluate':
      if (!command.expression) throw Error('式なし');
      return evaluate(page, command.expression);
    case 'evaluateAsync':
      if (!command.expression) throw Error('式なし');
      return evaluateAsync(page, command.expression);
    case 'click':
      if (!command.selector) throw Error('selectorなし');
      await clickVisible(page, command.selector);
      return { clicked: command.selector };
    case 'input':
      if (command.text === undefined) throw Error('入力なし');
      return page.send('Input.insertText', { text: command.text });
    case 'send':
      if (!command.method || !command.method.startsWith('Input.')) throw Error('入力以外の任意通信は拒否');
      return page.send(command.method, command.params);
    case 'confirm':
      if (typeof command.params?.accept !== 'boolean') throw Error('確認結果なし');
      return page.send('Page.handleJavaScriptDialog', { accept: command.params.accept });
    case 'screenshot': {
      const shot = (await page.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
      const path = resolve(directory, command.id + '.png');
      writeFileSync(path, Buffer.from(shot.data, 'base64'));
      return { path };
    }
    case 'newTab': {
      const created = (await browser.send('Target.createTarget', {
        url: 'about:blank',
        browserContextId: state.browserContextId,
      })) as { targetId: string };
      page = await monitor.page(created.targetId);
      targetId = created.targetId;
      await prepare(page);
      return { targetId };
    }
    case 'target':
      if (!command.targetId) throw Error('targetなし');
      page = await monitor.page(command.targetId);
      targetId = command.targetId;
      await page.send('Page.bringToFront');
      return { targetId };
    case 'summary':
      await monitor.flush();
      return monitor.summary();
    case 'finish':
      finished = true;
      return { finished: true };
    default:
      throw Error('不明な操作');
  }
}
console.log(JSON.stringify({ ready: true, directory, targetId }));
const decoder = new TextDecoder();
const input = Bun.stdin.stream().getReader();
let buffer = '';
try {
  while (!finished) {
    const { done, value: chunk } = await input.read();
    if (done) break;
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let id = 'invalid';
      try {
        const command = JSON.parse(line) as Command;
        id = command.id;
        if (!/^[a-z0-9-]+$/.test(id) || commands.has(id)) throw Error('操作IDが不正または再実行です');
        commands.add(id);
        record({ at: new Date().toISOString(), phase: 'before', command });
        const result = await act(command);
        record({ at: new Date().toISOString(), phase: 'after', id, result });
        const response = { id, ok: true, result: scrub(result) };
        writeFileSync(resolve(directory, id + '.json'), JSON.stringify(response, null, 2));
        console.log(JSON.stringify(response));
      } catch (error) {
        const response = { id, ok: false, error: String(error) };
        record(response);
        console.log(JSON.stringify(response));
      }
      if (finished) break;
    }
    if (finished) break;
  }
} finally {
  monitor.seal();
  try {
    await browser.send('Target.disposeBrowserContext', { browserContextId: state.browserContextId });
  } finally {
    await monitor.flush();
    writeFileSync(resolve(directory, 'network-summary.json'), JSON.stringify(monitor.summary(), null, 2));
    await browser.close();
  }
}
process.exit(0);
