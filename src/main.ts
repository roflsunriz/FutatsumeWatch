import { AntiPrototypeJs } from '../packages/lib/src/infra/anti-prototype-js';
import { installWatchEntry } from './watch-entry';
import type { WatchEntry } from './watch-entry';
import { migrateSharedStorage } from './config-migration';

let entry: WatchEntry | undefined;

async function start(): Promise<void> {
  const key = Symbol.for('FutatsumeWatch.start');
  if (Reflect.get(window, key)) return;
  Reflect.set(window, key, true);
  if (!document.body)
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
    );
  if (window === window.top && location.hostname === 'www.nicovideo.jp') entry = installWatchEntry();
  await AntiPrototypeJs();
  migrateSharedStorage(localStorage, sessionStorage);
  Object.assign(console, { nicoru: console.log.bind(console) });
  if (window === window.top) await import('./u-query');
  const { Config } = await import('./config');
  await Config.promise('restore');
  if (location.hostname === 'www.youtube.com' || location.hostname === 'youtube.com') {
    await import('./captube');
    return;
  }
  if (location.hostname === 'ext.nicovideo.jp' && location.pathname.startsWith('/thumb/')) {
    await import('./blog');
    return;
  }
  if (['live.nicovideo.jp', 'embed.nicovideo.jp', 'sp.nicovideo.jp'].includes(location.hostname)) {
    await import('./shape');
    return;
  }
  const { startPlayer, openVideo } = await import('./runtime');
  await startPlayer();
  entry?.ready(openVideo);
  if (window === window.top) {
    if (location.hostname === 'www.nicovideo.jp') await import('../packages/lib/src/nico/modern-lazyload');
    await import('./pocket');
    await import('./gamepad');
    await import('./heatsync');
    await import('./shape');
    await import('./setting');
    if (location.hostname === 'www.nicovideo.jp' && location.pathname.startsWith('/my/mylist')) {
      await import('./my4');
    }
  } else if (window.name.startsWith('thumbInfoMylistPocket')) {
    await import('./pocket');
  }
}

void start().catch((error: unknown) => {
  entry?.fail(error instanceof Error ? error.message : String(error));
  console.error('FutatsumeWatch の初期化に失敗しました', error);
});
