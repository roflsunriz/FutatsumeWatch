import { attach, evaluate, listTargets } from './dev-cdp';

// background.jsというファイル名は他の拡張にもあるため、実行中のmanifestで識別する。
export async function tampermonkeyOrigin(): Promise<string> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    for (const target of (await listTargets()).filter(
      (target) => target.type === 'service_worker' && target.url.startsWith('chrome-extension://')
    )) {
      const session = await attach(target);
      try {
        const info = (await evaluate(
          session,
          `({name:globalThis.chrome?.runtime?.getManifest?.().name,url:globalThis.chrome?.runtime?.getURL?.('')})`
        )) as { name?: string; url?: string };
        if (info.name === 'Tampermonkey' && info.url?.startsWith('chrome-extension://')) {
          return `chrome-extension://${new URL(info.url).host}`;
        }
      } finally {
        session.close();
      }
    }
    await Bun.sleep(250);
  }
  throw new Error('Tampermonkeyを確認できません。bun run dev:setup と bun run dev:browse で準備してください。');
}
