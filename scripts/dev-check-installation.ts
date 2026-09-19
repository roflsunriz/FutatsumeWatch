import { VERSION } from '../src/version';
import { attach, attachBrowser, evaluate, listTargets } from './dev-cdp';

export async function confirmAfterNavigation(targetId: string): Promise<void> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const target = (await listTargets()).find((target) => target.id === targetId);
    if (!target || !target.url.startsWith('https://www.nicovideo.jp/')) return;
    const page = await attach(target);
    try {
      if (
        (await evaluate(page, `document.querySelector('[data-futatsume-entry]')?.dataset.futatsumeVersion`)) === VERSION
      )
        return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/CDP connection closed|context.*destroyed|Cannot find context/i.test(error.message)
      )
        throw error;
    } finally {
      page.close();
    }
    await Bun.sleep(200);
  }
  throw new Error('開いていたページへの新版の適用を確認できません。ページを再読み込みしてください。');
}

// マネージャの「有効」表示だけで済ませず、新しい文書への実適用を確認する。
export async function checkInstallation(): Promise<void> {
  const browser = await attachBrowser();
  let targetId: string | undefined;
  try {
    const created = (await browser.send('Target.createTarget', { url: 'about:blank', background: true })) as {
      targetId: string;
    };
    targetId = created.targetId;
    const target = (await listTargets()).find((target) => target.id === targetId);
    if (!target) throw new Error('導入確認用ページを用意できませんでした');
    const page = await attach(target);
    try {
      await page.send('Page.enable');
      await page.send('Page.navigate', { url: 'https://www.nicovideo.jp/watch/sm9' });
      // 拡張の初回登録が既存文書に間に合わない場合だけ、新しい文書で再確認する。
      for (let attempt = 0; attempt < 3; attempt++) {
        const deadline = Date.now() + 6000;
        while (Date.now() < deadline) {
          const version = await evaluate(
            page,
            `document.querySelector('[data-futatsume-entry]')?.dataset.futatsumeVersion`
          );
          if (version === VERSION) {
            console.log(`ページへの適用確認: FutatsumeWatch ${VERSION}`);
            return;
          }
          if (typeof version === 'string') throw new Error(`導入された版が異なります: ${version}（必要: ${VERSION}）`);
          await Bun.sleep(250);
        }
        if (attempt < 2) await page.send('Page.reload');
      }
      throw new Error(
        'スクリプトは登録されていますがページへ適用されません。「ユーザー スクリプトを許可する」とサイトへのアクセスを確認してください。導入成功とは扱いません。'
      );
    } finally {
      page.close();
    }
  } finally {
    if (targetId) await browser.send('Target.closeTarget', { targetId });
    browser.close();
  }
}
