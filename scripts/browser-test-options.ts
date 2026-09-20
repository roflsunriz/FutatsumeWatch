export const browserSuites = [
  'entry',
  'player',
  'ui',
  'settings',
  'migration',
  'addons',
  'functionality',
  'library',
  'guard',
] as const;
export type BrowserSuite = (typeof browserSuites)[number];
export function browserTestOptions(args: readonly string[]) {
  let suite = 'all',
    mode: 'offline' | 'live' = 'offline';
  let explicitMode = false,
    explicitSuite = false;
  let url: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--offline' || arg === '--live') {
      if (explicitMode) throw new Error('通信モードは一つだけ指定してください');
      mode = arg === '--live' ? 'live' : 'offline';
      explicitMode = true;
    } else if (arg === '--url') {
      if (url || !args[i + 1]) throw new Error('--urlには視聴URLを一つ指定してください');
      url = args[++i];
    } else if (!explicitSuite && (arg === 'all' || browserSuites.some((name) => name === arg))) {
      suite = arg;
      explicitSuite = true;
    } else throw new Error(`不明な指定: ${arg}`);
  }
  if (url) {
    const parsed = new URL(url);
    if (
      mode !== 'live' ||
      suite !== 'player' ||
      parsed.origin !== 'https://www.nicovideo.jp' ||
      !/^\/watch\/(sm|so)\d+$/.test(parsed.pathname)
    )
      throw new Error('--urlはplayer --liveのニコニコ視聴URLだけに使用できます');
  }
  const offlineOnly = (name: string) => name === 'functionality' || name === 'library' || name === 'guard';
  if (mode === 'live' && offlineOnly(suite)) throw new Error('投稿・タグの機能検証はオフライン専用です');
  const selected: BrowserSuite[] =
    suite === 'all'
      ? browserSuites.filter((name) => mode === 'offline' || !offlineOnly(name))
      : [suite as BrowserSuite];
  return { selected, mode, url };
}
