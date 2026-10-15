export function readmeOptions(args: readonly string[]): { live: boolean; attempt?: string } {
  let mode: 'offline' | 'live' | undefined;
  let attempt: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--offline' || arg === '--live') && !mode) mode = arg === '--live' ? 'live' : 'offline';
    else if (
      arg === '--attempt' &&
      attempt === undefined &&
      !args[i + 1]?.startsWith('--') &&
      /^[a-z0-9-]{4,80}$/.test(args[i + 1] ?? '')
    )
      attempt = args[++i];
    else throw new Error(`撮影オプションが不正です: ${arg}`);
  }
  if ((mode === 'live') !== (attempt !== undefined))
    throw new Error('実サイト撮影は --live --attempt 承認した試行ID、予行は --offline を指定してください');
  return { live: mode === 'live', attempt };
}
