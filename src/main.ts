import { AntiPrototypeJs } from '../packages/lib/src/infra/AntiPrototype-js';

async function start(): Promise<void> {
  const key = Symbol.for('FutatsumeWatch.start');
  if (Reflect.get(window, key)) return;
  Reflect.set(window, key, true);
  await AntiPrototypeJs();
  Object.assign(console, { nicoru: console.log.bind(console) });
  if (window === window.top) await import('./_uquery');
  const { Config } = await import('./Config');
  await Config.promise('restore');
  if (location.hostname === 'www.youtube.com' || location.hostname === 'youtube.com') {
    await import('./_captube');
    return;
  }
  if (location.hostname === 'ext.nicovideo.jp' && location.pathname.startsWith('/thumb/')) {
    await import('./_blog');
    return;
  }
  if (['live.nicovideo.jp', 'embed.nicovideo.jp', 'sp.nicovideo.jp'].includes(location.hostname)) {
    await import('./_shape');
    return;
  }
  const { startPlayer } = await import('./runtime');
  await startPlayer();
  if (window === window.top) {
    if (location.hostname === 'www.nicovideo.jp') await import('../packages/lib/src/nico/modernLazyload');
    await import('./_pocket');
    await import('./_gamepad');
    await import('./_heatsync');
    await import('./_shape');
    await import('./_setting');
    if (location.hostname === 'www.nicovideo.jp' && location.pathname.startsWith('/my/mylist')) {
      await import('./_my4');
    }
  } else if (window.name.startsWith('thumbInfoMylistPocket')) {
    await import('./_pocket');
  }
}

void start().catch((error: unknown) => {
  console.error('FutatsumeWatch の初期化に失敗しました', error);
});
