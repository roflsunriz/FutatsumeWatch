// 9222 の既存文書に読み込まれた公式 JavaScript を raw CDP から保存する。
// 認証情報、API 応答、ページ HTML は保存しない。
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { attach, listTargets } from './dev-cdp';

interface ScriptParsed {
  scriptId?: string;
  url?: string;
}

const targets = await listTargets();
const pagePath = process.argv[2] ?? '/watch/';
const target = targets.find(
  (entry) => entry.type === 'page' && entry.url.startsWith(`https://www.nicovideo.jp${pagePath}`)
);
if (!target) throw new Error('9222 にニコニコ動画のページがありません');
const session = await attach(target);
const scripts = new Map<string, string>();
session.onEvent((method, params) => {
  if (method !== 'Debugger.scriptParsed') return;
  const parsed = params as ScriptParsed;
  if (parsed.scriptId && parsed.url?.startsWith('https://resource.video.nimg.jp/')) {
    scripts.set(parsed.scriptId, parsed.url);
  }
});
try {
  await session.send('Debugger.enable');
  const directory = join('dev-assets', `official-mylist-2026-09-29-${pagePath.replaceAll('/', '-')}`);
  await mkdir(directory, { recursive: true });
  const manifest: Array<{ url: string; file: string; length: number }> = [];
  for (const [scriptId, url] of scripts) {
    const result = (await session.send('Debugger.getScriptSource', { scriptId })) as { scriptSource?: string };
    const source = result.scriptSource ?? '';
    if (!/mylists|watch-later|mylist/.test(source)) continue;
    const basename = new URL(url).pathname.split('/').pop() ?? `script-${scriptId}.js`;
    const file = `${manifest.length + 1}-${basename}`;
    await writeFile(join(directory, file), source, 'utf8');
    manifest.push({ url, file, length: source.length });
  }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify(manifest));
} finally {
  await session.send('Debugger.disable');
  await session.close();
}
