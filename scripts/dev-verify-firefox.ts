// Firefox専用の代表経路。Chromeランナー・利用者プロファイルとは共有しない。
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createOfflineSite } from './offline-site';
import type { FixtureRequest } from './offline-site';

const port = 9340;
const root = resolve(import.meta.dir, '../dev-assets/firefox-verification');
const run = resolve(root, new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
const profile = resolve(run, 'profile');
const executable = resolve(process.env.ProgramFiles ?? 'C:/Program Files', 'Mozilla Firefox/firefox.exe');
const statePath = resolve(root, 'state.json');
const source = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
const checks: string[] = [];
const errors: string[] = [];
const networkFailures = new Map<string, string>();
const protocolFailures: Array<{ request: string; url: string; matched: boolean; error: string }> = [];
const requests: Array<{ requestId: string; method: string; url: string; matched: boolean; bodyBytes: number }> = [];
const report: {
  completed: boolean;
  checks: string[];
  errors: string[];
  requests: typeof requests;
  capabilities?: unknown;
  diagnostic?: unknown;
  profile: string;
  port: number;
  bundleSha256: string;
  cleanup?: string;
  cancelledRequests?: typeof protocolFailures;
} = {
  completed: false,
  checks,
  errors,
  requests,
  profile,
  port,
  bundleSha256: createHash('sha256').update(source).digest('hex'),
};
interface OwnedProcess {
  pid: number;
  startTicks: string;
  executable: string;
  profile: string;
}
let owned: OwnedProcess | undefined;
let launcherPid: number | undefined;
let launcherStartTicks: string | undefined;
let launchAttempted = false;
let socket: WebSocket | undefined;
let context: string | undefined;
let sessionCreated = false;
let nextId = 0;
const jobs = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
>();
const networkJobs = new Set<Promise<void>>();
const ps = (value: string) => `'${value.replaceAll("'", "''")}'`;
function powershell(command: string): string {
  const child = Bun.spawnSync([
    'powershell',
    '-NoProfile',
    '-Command',
    "$ErrorActionPreference='Stop';" + command + ';exit 0',
  ]);
  if (child.exitCode !== 0)
    throw new Error(child.stderr.toString() || child.stdout.toString() || 'PowerShell処理に失敗しました');
  return child.stdout.toString().trim();
}
function send(method: string, params: object = {}): Promise<unknown> {
  const current = socket;
  if (!current || current.readyState !== WebSocket.OPEN)
    return Promise.reject(new Error('Firefox接続は終了しています'));
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      jobs.delete(id);
      reject(new Error(`BiDi timeout: ${method}`));
    }, 15000);
    jobs.set(id, { resolve, reject, timer });
    current.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression: string): Promise<unknown> {
  const response = (await send('script.evaluate', {
    expression: `(async()=>JSON.stringify(await (${expression})))()`,
    target: { context },
    awaitPromise: true,
  })) as { type: string; result?: { type: string; value?: string }; exceptionDetails?: { text: string } };
  if (response.type === 'exception') throw new Error(response.exceptionDetails?.text ?? 'Firefox script例外');
  if (response.result?.type === 'undefined') return undefined;
  if (response.result?.type !== 'string') throw new Error('Firefox script応答が不正です');
  return JSON.parse(response.result.value!) as unknown;
}
async function check(expression: string, label: string, timeout = 15000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) {
      checks.push(label);
      console.log(`合格: ${label}`);
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error(`Firefox検証失敗: ${label}`);
}
async function pointer(x: number, y: number, press: boolean): Promise<void> {
  await send('input.performActions', {
    context,
    actions: [
      {
        type: 'pointer',
        id: 'fixture-mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x: Math.round(x), y: Math.round(y), duration: 0, origin: 'viewport' },
          ...(press
            ? [
                { type: 'pointerDown', button: 0 },
                { type: 'pointerUp', button: 0 },
              ]
            : []),
        ],
      },
    ],
  });
}
async function click(selector: string, within = 'document'): Promise<void> {
  const locate = async () =>
    (await evaluate(
      `(()=>{const e=window.__firefoxFind(${JSON.stringify(selector)},${within});if(!e||e.disabled)throw Error('操作要素がありません: '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),s=getComputedStyle(e),x=r.left+r.width/2,y=r.top+r.height/2;let hit=document.elementFromPoint(x,y);while(hit?.shadowRoot){const child=hit.shadowRoot.elementFromPoint(x,y);if(!child||child===hit)break;hit=child;}if(r.width<=0||r.height<=0||s.visibility!=='visible'||!e.contains(hit))throw Error('操作要素が不可視または覆われています');return{x,y};})()`
    )) as { x: number; y: number };
  const deadline = Date.now() + 8000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const initial = await locate();
      await pointer(initial.x, initial.y, false);
      await Bun.sleep(120);
      const point = await locate();
      await pointer(point.x, point.y, true);
      return;
    } catch (error) {
      if (!String(error).includes('操作要素')) throw error;
      lastError = error;
      await Bun.sleep(100);
    }
  }
  throw new Error(`${selector}: ${String(lastError)}`);
}
async function connect(): Promise<WebSocket> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      return await new Promise<WebSocket>((resolve, reject) => {
        const connection = new WebSocket(`ws://127.0.0.1:${port}/session`);
        const timer = setTimeout(() => {
          connection.close();
          reject(new Error('Firefox接続待機'));
        }, 1000);
        connection.addEventListener(
          'open',
          () => {
            clearTimeout(timer);
            resolve(connection);
          },
          { once: true }
        );
        connection.addEventListener(
          'error',
          () => {
            clearTimeout(timer);
            connection.close();
            reject(new Error('Firefox接続待機'));
          },
          { once: true }
        );
      });
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error('Firefox BiDiが起動しませんでした');
}
function identifyOwned(): OwnedProcess {
  return JSON.parse(
    powershell(
      `$listener=Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -First 1;$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess);if($p.ExecutablePath -ine ${ps(executable)} -or -not $p.CommandLine.Contains(${ps(profile)})){throw '専用FirefoxのPIDとprofileが一致しません'};$live=Get-Process -Id $p.ProcessId;@{pid=$p.ProcessId;startTicks=$live.StartTime.ToUniversalTime().Ticks.ToString();executable=${ps(executable)};profile=${ps(profile)}}|ConvertTo-Json -Compress`
    )
  ) as OwnedProcess;
}
async function stopOwned(): Promise<void> {
  if (!launchAttempted) {
    report.cleanup = 'not launched';
    return;
  }
  if (!owned) {
    try {
      owned = identifyOwned();
    } catch {
      /* 起動前失敗では専用listenerがない。 */
    }
  }
  if (owned) {
    powershell(
      `$p=Get-Process -Id ${owned.pid} -ErrorAction SilentlyContinue;if($p){if($p.Path -ine ${ps(owned.executable)} -or $p.StartTime.ToUniversalTime().Ticks.ToString() -ne ${ps(owned.startTicks)}){throw 'Firefox所有PIDの照合失敗'};& taskkill /PID ${owned.pid} /T /F | Out-Null;if($LASTEXITCODE -ne 0){throw '専用Firefox停止失敗'}}`
    );
    report.cleanup = `owned PID ${owned.pid} stopped`;
  } else if (launcherPid && launcherStartTicks) {
    // listener作成前の失敗に限り、自分が起動したlauncherだけを止める。
    powershell(
      `$p=Get-Process -Id ${launcherPid} -ErrorAction SilentlyContinue;if($p){if($p.Path -ine ${ps(executable)} -or $p.StartTime.ToUniversalTime().Ticks.ToString() -ne ${ps(launcherStartTicks)}){throw 'Firefox launcher所有PIDの照合失敗'};Stop-Process -Id ${launcherPid} -Force}`
    );
    report.cleanup = `launcher PID ${launcherPid} stopped before listener`;
  }
  await Bun.write(statePath, JSON.stringify({ ...owned, launcherPid, port, profile, stopped: true }, null, 2));
}

mkdirSync(profile, { recursive: true });
try {
  if (!(await Bun.file(executable).exists())) throw new Error(`Firefoxが見つかりません: ${executable}`);
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close((error) => (error ? reject(error) : resolve())));
  });
  const preferences: Record<string, string | number | boolean> = {
    'browser.startup.homepage': 'about:blank',
    'browser.aboutwelcome.enabled': false,
    'browser.shell.checkDefaultBrowser': false,
    'browser.sessionstore.resume_from_crash': false,
    'datareporting.policy.dataSubmissionEnabled': false,
    'media.volume_scale': '0.0',
    'network.proxy.type': 1,
    'network.proxy.http': '127.0.0.1',
    'network.proxy.http_port': 9,
    'network.proxy.ssl': '127.0.0.1',
    'network.proxy.ssl_port': 9,
    'network.proxy.no_proxies_on': '',
  };
  await Bun.write(
    resolve(profile, 'user.js'),
    Object.entries(preferences)
      .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
      .join('\n')
  );
  const launcherFile = resolve(run, 'launcher.json');
  launchAttempted = true;
  const launched = Bun.spawnSync(
    [
      'powershell',
      '-NoProfile',
      '-Command',
      `$ErrorActionPreference='Stop';$p=Start-Process -FilePath ${ps(executable)} -ArgumentList @('-no-remote','-new-instance','-headless','-profile',${ps('"' + profile + '"')},'--remote-debugging-port','${port}','about:blank') -WindowStyle Hidden -RedirectStandardOutput ${ps(resolve(run, 'stdout.log'))} -RedirectStandardError ${ps(resolve(run, 'stderr.log'))} -PassThru;@{pid=$p.Id;startTicks=$p.StartTime.ToUniversalTime().Ticks.ToString()} | ConvertTo-Json -Compress | Set-Content -LiteralPath ${ps(launcherFile)}`,
    ],
    { stdin: 'ignore', stdout: 'ignore', stderr: 'inherit' }
  );
  if (launched.exitCode !== 0) throw new Error('専用Firefoxの起動失敗');
  const launcher = (await Bun.file(launcherFile).json()) as { pid: number; startTicks: string };
  if (!Number.isInteger(launcher.pid) || launcher.pid <= 0 || !/^\d+$/.test(launcher.startTicks))
    throw new Error('Firefox launcherの記録が不正です');
  launcherPid = launcher.pid;
  launcherStartTicks = launcher.startTicks;
  await Bun.write(statePath, JSON.stringify({ launcherPid, port, profile, executable, stopped: false }, null, 2));
  socket = await connect();
  owned = identifyOwned();
  await Bun.write(statePath, JSON.stringify({ ...owned, launcherPid, port, stopped: false }, null, 2));
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      type: string;
      result?: unknown;
      error?: string;
      message?: string;
      method?: string;
      params?: Record<string, unknown>;
    };
    if (message.id !== undefined) {
      const job = jobs.get(message.id);
      if (job) {
        clearTimeout(job.timer);
        jobs.delete(message.id);
        if (message.type === 'error') job.reject(new Error(`${message.error}: ${message.message}`));
        else job.resolve(message.result);
      }
      return;
    }
    if (message.method === 'log.entryAdded') {
      const entry = message.params as { type: string; level: string; text?: string };
      if (entry.type === 'javascript' && entry.level === 'error') errors.push(entry.text ?? 'JavaScript例外');
    }
    if (message.method === 'network.beforeRequestSent') {
      const params = message.params as {
        isBlocked: boolean;
        request: {
          request: string;
          url: string;
          method: string;
          bodySize: number | null;
          headers: Array<{ name: string; value: { type: string; value: string } }>;
        };
      };
      if (!params.isBlocked) return;
      const job = respond(params.request)
        .catch((error: unknown) => {
          protocolFailures.push({
            request: params.request.request,
            url: params.request.url,
            matched: requests.some((value) => value.requestId === params.request.request && value.matched),
            error: String(error),
          });
        })
        .finally(() => networkJobs.delete(job));
      networkJobs.add(job);
    }
    if (message.method === 'network.fetchError') {
      const params = message.params as { request: { request: string }; errorText: string };
      networkFailures.set(params.request.request, params.errorText);
    }
  });
  const session = (await send('session.new', {
    capabilities: {
      alwaysMatch: { proxy: { proxyType: 'manual', httpProxy: '127.0.0.1:9', sslProxy: '127.0.0.1:9' } },
    },
  })) as { capabilities: Record<string, unknown> };
  sessionCreated = true;
  report.capabilities = session.capabilities;
  if (
    session.capabilities['moz:processID'] !== owned.pid ||
    resolve(String(session.capabilities['moz:profile'])) !== profile ||
    session.capabilities['moz:headless'] !== true
  )
    throw new Error('専用Firefoxのsession照合に失敗しました');
  const collector = (await send('network.addDataCollector', {
    dataTypes: ['request'],
    maxEncodedDataSize: 1048576,
  })) as { collector: string };
  const site = createOfflineSite();
  async function respond(request: {
    request: string;
    url: string;
    method: string;
    bodySize: number | null;
    headers: Array<{ name: string; value: { type: string; value: string } }>;
  }): Promise<void> {
    try {
      if (!/^https?:/.test(request.url)) {
        await send('network.continueRequest', { request: request.request });
        return;
      }
      let body: string | undefined;
      if ((request.bodySize ?? 0) > 0 || ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        const data = (await send('network.getData', {
          request: request.request,
          dataType: 'request',
          collector: collector.collector,
        })) as { bytes: { type: 'string' | 'base64'; value: string } };
        body =
          data.bytes.type === 'base64' ? Buffer.from(data.bytes.value, 'base64').toString('utf8') : data.bytes.value;
      }
      const headers = Object.fromEntries(
        request.headers.map((header) => [
          header.name,
          header.value.type === 'base64'
            ? Buffer.from(header.value.value, 'base64').toString('utf8')
            : header.value.value,
        ])
      );
      const input: FixtureRequest = { method: request.method, url: request.url, postData: body, headers };
      const response = await site.reply(input);
      requests.push({
        requestId: request.request,
        method: request.method,
        url: request.url,
        matched: response !== null,
        bodyBytes: body?.length ?? 0,
      });
      if (!response) {
        errors.push(`未登録通信: ${request.method} ${request.url}`);
        await send('network.failRequest', { request: request.request });
        return;
      }
      const origin =
        Object.entries(headers).find(([key]) => key.toLowerCase() === 'origin')?.[1] ?? 'https://www.nicovideo.jp';
      await send('network.provideResponse', {
        request: request.request,
        statusCode: response.status,
        headers: Object.entries({
          'Content-Type': response.mime,
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type, X-Frontend-Id, X-Frontend-Version, X-Request-With, X-Access-Right-Key, X-Client-Os-Type, X-Tag-Edit-Key, X-Niconico-Language',
        }).map(([name, value]) => ({ name, value: { type: 'string', value } })),
        ...(response.status === 204
          ? {}
          : { body: { type: 'base64', value: Buffer.from(response.body).toString('base64') } }),
      });
    } catch (error) {
      try {
        await send('network.failRequest', { request: request.request });
      } catch (cleanupError) {
        if (!String(cleanupError).includes('no such request')) errors.push(String(cleanupError));
      }
      throw error;
    }
  }
  await send('session.subscribe', { events: ['network.beforeRequestSent', 'network.fetchError', 'log.entryAdded'] });
  // data/blobは外部通信ではなく、Firefoxでは継続可能なblocked requestを持たない。
  await send('network.addIntercept', {
    phases: ['beforeRequestSent'],
    urlPatterns: [
      { type: 'pattern', protocol: 'http' },
      { type: 'pattern', protocol: 'https' },
    ],
  });
  const created = (await send('browsingContext.create', { type: 'tab' })) as { context: string };
  context = created.context;
  await send('browsingContext.setViewport', { context, viewport: { width: 1280, height: 800 }, devicePixelRatio: 1 });
  await send('script.addPreloadScript', {
    contexts: [context],
    functionDeclaration: `()=>{window.__firefoxPreloadUrl=location.href;if(location.origin!=='https://www.nicovideo.jp')return;window.__firefoxFind=function find(selector,root=document){const own=root.querySelector(selector);if(own)return own;for(const host of root.querySelectorAll('*'))if(host.shadowRoot){const found=find(selector,host.shadowRoot);if(found)return found;}return null;};document.addEventListener('DOMContentLoaded',()=>{${source}\n},{once:true});}`,
  });
  await send('browsingContext.navigate', { context, url: 'https://www.nicovideo.jp/watch/sm9', wait: 'complete' });
  await send('browsingContext.activate', { context });
  await check(
    `window.FutatsumeWatch?.ready&&document.querySelector('[data-futatsume-open]')?.disabled===false`,
    'Firefoxで配布物を初期化して可視起動導線を表示'
  );
  await click('[data-futatsume-open]');
  const video = `document.querySelector('futatsume-video')`,
    native = `${video}?.shadowRoot?.querySelector('video')`;
  await check(
    `${native}?.videoWidth>0&&${native}.currentTime>0.5&&!${native}.paused`,
    '実HLSをデコードして時間進行',
    30000
  );
  await check(
    `(()=>{const c=document.querySelector('[data-futatsume-comment-canvas]');return c&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)})()`,
    'コメントCanvasを実描画'
  );
  await click('[data-shell-action="togglePlay"]');
  const pausedAt = (await evaluate(`${native}.currentTime`)) as number;
  await Bun.sleep(300);
  await check(`${native}.paused&&Math.abs(${native}.currentTime-${pausedAt})<0.05`, '実ボタンで停止し時計を保持');
  const seek = (await evaluate(
    `(()=>{const e=document.querySelector('.seekBar'),r=e.getBoundingClientRect(),x=r.left+r.width*.4,y=r.top+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('seek covered');return{x,y}})()`
  )) as { x: number; y: number };
  await pointer(seek.x, seek.y, true);
  await check(`Math.abs(${native}.currentTime-25.6)<1`, '実シークバー操作をmedia時刻へ反映');
  await click('[data-shell-action="settings"]');
  await click('[data-shell-action="general"]');
  const panel = `window.__firefoxFind('[data-fw-settings="general"]')`;
  await check(`${panel}?.open`, '一般設定を実メニューから表示');
  const previous = (await evaluate(`window.FutatsumeWatch.config.getValue('autoPlay')`)) as boolean;
  const storedKey = (await evaluate(
    `window.FutatsumeWatch.config.getStorageKey(window.FutatsumeWatch.config.getNativeKey('autoPlay'))`
  )) as string;
  await click('[data-setting-name="autoPlay"]', panel);
  await check(
    `window.FutatsumeWatch.config.getValue('autoPlay')===${!previous}&&localStorage.getItem(${JSON.stringify(storedKey)})===${JSON.stringify(JSON.stringify(!previous))}`,
    '設定の実入力を正しい保存キーへ永続化'
  );
  await click('[data-settings-close]', panel);
  const documentEpoch = await evaluate('performance.timeOrigin');
  await send('browsingContext.reload', { context, wait: 'complete' });
  await check(
    `performance.timeOrigin!==${Number(documentEpoch)}&&window.FutatsumeWatch?.ready&&document.querySelector('[data-futatsume-open]')?.disabled===false&&window.FutatsumeWatch.config.getValue('autoPlay')===${!previous}`,
    '文書再読み込み後に保存設定を復元'
  );
  await click('[data-futatsume-open]');
  await check(`${native}?.readyState>=2`, '再読み込み後も可視入口から映像を初期化', 30000);
  await click('[data-shell-action="settings"]');
  await click('[data-shell-action="general"]');
  await check(
    `window.__firefoxFind('[data-setting-name="autoPlay"]',${panel}).checked===${!previous}`,
    '再表示の設定入力が保存値と一致'
  );
  await click('[data-setting-name="autoPlay"]', panel);
  await click('[data-settings-close]', panel);
  const screenshot = (await send('browsingContext.captureScreenshot', {
    context,
    origin: 'viewport',
    format: { type: 'image/png' },
  })) as { data: string };
  await Bun.write(resolve(run, 'firefox-player.png'), Buffer.from(screenshot.data, 'base64'));
  await click('[data-shell-action="close"]');
  await check(
    `!document.body.classList.contains('showNicoVideoPlayerDialog')&&${native}.paused`,
    'closeで映像を停止しページへ復帰'
  );
  while (networkJobs.size) await Promise.all([...networkJobs]);
  report.cancelledRequests = [];
  for (const failure of protocolFailures) {
    if (
      failure.matched &&
      failure.error.includes('no such request') &&
      /NS_BINDING_ABORTED|NS_ERROR_ABORT/.test(networkFailures.get(failure.request) ?? '')
    ) {
      report.cancelledRequests.push(failure);
    } else errors.push(`${failure.url}: ${failure.error} (${networkFailures.get(failure.request) ?? '取消根拠なし'})`);
  }
  if (errors.length) throw new Error('Firefox例外または未登録通信があります');
  report.completed = true;
} catch (error) {
  errors.push(String(error));
  if (context && socket?.readyState === WebSocket.OPEN)
    report.diagnostic = await evaluate(
      `({url:location.href,epoch:performance.timeOrigin,preload:window.__firefoxPreloadUrl,ready:document.readyState,entry:document.querySelector('[data-futatsume-entry]')?.outerHTML,video:document.querySelector('futatsume-video')?{time:document.querySelector('futatsume-video').currentTime,ready:document.querySelector('futatsume-video').readyState}:null,state:window.FutatsumeWatch?.debug.dialog?._state?.errorMessage})`
    ).catch((diagnostic) => String(diagnostic));
} finally {
  if (sessionCreated) {
    try {
      await send('session.end');
    } catch (error) {
      errors.push(String(error));
    }
  }
  socket?.close();
  for (const job of jobs.values()) {
    clearTimeout(job.timer);
    job.reject(new Error('Firefox検証終了'));
  }
  jobs.clear();
  try {
    await stopOwned();
  } catch (error) {
    errors.push(String(error));
    report.cleanup = 'failed';
  }
  report.completed = report.completed && errors.length === 0;
  await Bun.write(resolve(run, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Firefox検証結果: ${resolve(run, 'report.json')}`);
}
if (!report.completed) throw new Error(errors.join('\n'));
