// 初回セットアップ用：TMの「ユーザー スクリプトを許可する」トグルを開く。
// headedのdev用Chromeで chrome://extensions のTM詳細ページを開く。
// 画面を開いたら終了し、トグルはユーザーがONにする。

import { attachBrowser } from './dev-cdp';
import { tampermonkeyOrigin } from './dev-tampermonkey';

const EXT_ID = new URL(await tampermonkeyOrigin()).host;

const browser = await attachBrowser();
try {
  await browser.send('Target.createTarget', { url: `chrome://extensions/?id=${EXT_ID}` });
  console.log(`拡張機能ページを開きました: chrome://extensions/?id=${EXT_ID}`);
  console.log('「ユーザー スクリプトを許可する」をONにして、動画ページを手動で再読み込みしてください。');
} finally {
  await browser.close();
}
