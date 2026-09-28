import { AntiPrototypeJs } from '../../packages/lib/src/infra/anti-prototype-js';
import { installWatchEntry, supportsWatchEntryPage } from '../entry/watch-entry';
import type { WatchEntry } from '../entry/watch-entry';
import { migrateSharedStorage } from '../config/config-migration';

let entry: WatchEntry | undefined;

async function start(): Promise<void> {
  const key = Symbol.for('FutatsumeWatch.start');
  if (Reflect.get(window, key)) return;
  Reflect.set(window, key, true);
  if (!document.body)
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
    );
  if (window === window.top && supportsWatchEntryPage()) entry = installWatchEntry();
  await AntiPrototypeJs();
  migrateSharedStorage(localStorage, sessionStorage);
  if (window === window.top) await import('../shared/u-query');
  const { Config } = await import('../config/index');
  await Config.promise('restore');
  if (location.hostname === 'www.youtube.com' || location.hostname === 'youtube.com') {
    await import('../captube/captube');
    return;
  }
  if (location.hostname === 'ext.nicovideo.jp' && location.pathname.startsWith('/thumb/')) {
    await import('../entry/blog');
    return;
  }
  const { startPlayer, openVideo } = await import('./runtime');
  await startPlayer();
  entry?.ready(openVideo);
  if (window === window.top) {
    if (location.hostname === 'www.nicovideo.jp') await import('../../packages/lib/src/nico/modern-lazyload');
    await import('../pocket/index');
    await import('../config/setting');
    if (location.hostname === 'www.nicovideo.jp' && location.pathname.startsWith('/my/mylist')) {
      await import('../playlist/my4');
    }
  } else if (window.name.startsWith('thumbInfoMylistPocket')) {
    await import('../pocket/index');
  }
}

void start().catch((error: unknown) => {
  entry?.fail(error instanceof Error ? error.message : String(error));
  console.error('FutatsumeWatch の初期化に失敗しました', error);
});
