// 初回セットアップ用：TMの「ユーザー スクリプトを許可する」トグルを開く。
// headedのdev用Chromeで chrome://extensions のTM詳細ページを開く。
// ユーザーがトグルをONにした後、このスクリプトは終了する。

import { attachBrowser, listTargets } from './dev-cdp';

const EXT_ID = 'iaedeipfnnhlgimhinclkdkepncnnlgd';

const known = (await listTargets()).some((t) => t.url.includes(EXT_ID));
if (!known) {
  console.log('注意: 既知の拡張IDのターゲットが見当たりません。IDが変わっている可能性があります');
}

const browser = await attachBrowser();
try {
  await browser.send('Target.createTarget', { url: `chrome://extensions/?id=${EXT_ID}` });
  console.log(`拡張機能ページを開きました: chrome://extensions/?id=${EXT_ID}`);
  console.log('「ユーザー スクリプトを許可する」をONにしてから、このままお知らせください');
} finally {
  browser.close();
}
