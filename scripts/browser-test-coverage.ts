import type { BrowserSuite } from './browser-test-options';
import { settingsCategories } from './verify-settings-fields';

// 計画から固定した必須操作。実行結果から期待値を生成しない。
const panels = ['general', 'advanced'] as const;
export const requiredBrowserParents: Readonly<Partial<Record<BrowserSuite, readonly string[]>>> = {
  functionality: [
    'P1-01',
    'P1-02',
    'P1-03',
    'P1-04',
    'P1-05',
    'P1-07',
    'P1-08',
    'P1-09',
    'P1-10',
    'P1-11',
    'P2-01',
    'P2-02',
    'P2-03',
    'P2-04',
    'P2-05',
    'P4-05',
    'P4-07',
    'P4-08',
    'P4-09',
    'P4-10',
  ],
  library: [
    'P3-01',
    'P3-02',
    'P3-03',
    'P3-04',
    'P3-05',
    'P3-06',
    'P3-07',
    'P3-08',
    'P3-09',
    'P3-10',
    'P3-11',
    'P3-12',
    'P4-01',
    'P4-04',
  ],
};
export const requiredBrowserChecks: Readonly<Record<BrowserSuite, readonly string[]>> = {
  entry: [
    'キーワード検索で版・準備完了・結果ボタンを表示',
    '検索結果の見えるボタンをマウスで押して再生',
    'タグ検索でも結果ボタンを表示',
    '通常の動画リンクから視聴ページへ移っても起動ボタンを表示',
    '再読み込みしないページ内遷移を確認',
    '視聴ページの見えるボタンをマウスで押して再生',
    '戻る操作で検索ページの導線を復元',
    '戻った検索ページのボタンから再び再生',
  ],
  player: [
    '配布物注入の初期化・プレイヤー生成',
    '動画ページの再生導線',
    'HLS再生・時間進行',
    'コメント取得・解析・画面描画',
    '再生ボタンで一時停止',
    '30秒へのシーク',
    'ミュート切替',
    'ミュート復帰',
    'シーク後の再生復帰',
    'コメント非表示',
    'コメント再表示',
    'NG反映で描画から除外し元データを保持',
    'NG解除でコメントを復元',
    '投稿取り消しでCanvasの登録から除外',
    'コメント付きPNGの生成と保存導線（ダウンロードは捕捉）',
    '保存HTMLの通信遮断・描画・シーク・再生・停止',
    '詳細設定の変更と永続化',
    '詳細設定を復元して閉じる',
    '動画詳細情報から不要な5ボタンを削除',
    'プレイリストの有効化切替',
    'プレイリストの状態復元',
    '閉じるとCanvasと描画処理を解放し、遅延通知でも再生成しない',
    '閉じた後の再生復帰',
    '再読み込み後の初期化と設定保持',
    ...[
      [640, 480],
      [390, 844],
      [1920, 1080],
    ].map(([width, height]) => `${width}×${height}でプレイヤーが画面内に収まる`),
  ],
  ui: [
    'P1-04/media-sm2057168: ID・長さ・比率・実映像の識別画素・コメント・選択行が一致',
    'ページの起動アイコンから動画再生',
    '中央ボタンで一時停止',
    'ヒートマップ付きシークバーを実クリックで操作',
    '未操作3秒で操作部を隠す',
    'マウス移動で再表示',
    '速度メニューを実キーボード操作で変更',
    'AB区間末尾からAへ戻る',
    'ABリピート解除',
    'AB指定で動画全体のリピートを解除',
    '通常リピートへの切替でAB指定を解除',
    '設定ボタンから共通設定を直接開く',
    '左レールに5カテゴリ・画質・GitHub・3操作を平置き',
    '初期表示から右側へプレイヤー設定を注入',
    'チェック設定を金属調トグルとして表示',
    '金属調トグルの緑・灰状態と保存値を実クリックで切替',
    '右の4タブを開く',
    '詳細固定でぼかしを外し映像・コメント外枠を左側へ収める',
    '詳細固定でコメントCanvasの表示矩形を右パネルと非重複にする',
    '詳細固定後にコメントCanvasの内部画素を表示寸法へ同期',
    '固定解除でコメント外枠・Canvas内部画素を全幅へ復元',
    '全画面ボタンで全画面へ',
    '全画面から復帰',
    '中央の次動画ボタンで切替と再生',
    '中央の前動画ボタンで復帰',
    '動画切替でAB指定を解除',
    'DPR 2でコメントCanvasの画素数と表示寸法を一致',
    '閉じるボタンで終了',
    'Enter送信を既存投稿経路へ一度だけ渡す',
    '送信失敗で本文を保持し操作可能に戻す',
    '成功時のみ本文を消しコマンドを保持',
    ...[
      [390, 844],
      [640, 480],
      [1200, 800],
      [1920, 1080],
      [844, 390],
      [3840, 2160],
    ].flatMap(([width, height]) => [`${width}×${height}でブラウザ内全体に表示`, `${width}×${height}で詳細が画面内`]),
  ],
  settings: [
    'P2-06/roundtrip: 書き出し対象を実入力し数値・真偽値で保存',
    'P2-06/roundtrip: 読み込み前に両設定を別の値へ実変更',
    'P2-06/roundtrip: 実ファイル読み込みの確認後に文書を再読み込み',
    'P2-06/roundtrip: 再読み込み後も起動アイコンから操作できる',
    'P2-06/roundtrip: 再読み込み後に型付き設定と表示を復元し他項目を保持',
    'P2-07: 画面クリックONで実mediaの再生状態が切り替わる',
    'P2-07: 画面クリックOFFで再生状態を保持する',
    'P2-10: ダブルクリックONで実全画面に入る',
    'P2-10: 再度ダブルクリックで全画面を抜ける',
    'P2-10: ダブルクリックOFFでは全画面に入らない',
    'P2-07: 自動全画面ONで起動アイコンから全画面に入る',
    'P2-07: 自動全画面OFFでは通常表示で起動する',
    '設定の入口から共通画面を開く',
    'フォント設定を手入力なしのプルダウンで表示',
    'プルダウンのローカルフォントを実描画幅で利用可能と判定',
    '設定書き出しのJSONが保存設定に一致',
    'プレイヤー終了時に設定と背景も閉じる',
    'P2-06/storage: 容量不足を通知し、UI・モデル・保存値を維持',
    'P2-06/storage: 保存領域回復後の再試行',
    ...['malformed', 'array', 'null', 'invalid-type', 'invalid-range', 'invalid-enum'].map(
      (name) => `P2-06/${name}: ファイルの実選択で失敗を通知し、設定と画面を保持`
    ),
    ...panels.flatMap((name) => [
      `${name}: 共通モーダルを開く`,
      `${name}: パネル内クリックでは閉じない`,
      `${name}: 背景クリックで閉じ、動画へクリックを通さない`,
      `${name}: Escapeは設定だけを閉じる`,
      `${name}: 共通の閉じるボタン`,
      `${name}: 全画面を保って背景クリックで閉じる`,
    ]),
    ...['player', 'comments', 'filters', 'data', 'advanced'].flatMap((tab) =>
      [1280, 390].map((width) => `${width}px: サイドバーで${tab}へ切替`)
    ),
  ],
  migration: [
    '現行名称で本体とマイリスト機能を初期化',
    '新しい初期化イベントを各1回通知',
    '旧グローバル別名を公開しない',
    '現行設定の音量を優先',
    '移行済みの旧版でリセットした設定を復活させない',
    '旧NGワードと単一正規表現を1行1表現の一覧へ移行',
    'MylistPocketの保存キーを移行',
    'プレイリストを現行キーへ移行',
    '前回の再生状態を現行キーへ移行',
    '移行前の設定を復旧用に保持',
    'HLSの通信・デコード・未知のエラーを区別し、取得済み映像の通信エラーは無視',
  ],
  addons: [
    'YouTubeページでCapTubeを起動',
    'キャプチャ対象映像を描画',
    'CapTube低速再生',
    'CapTube速度復帰',
    '入力欄のキー操作を横取りしない',
    'CapTube画像生成・プレビュー・保存導線',
    'ブログパーツの起動ボタン',
    'ブログパーツから動画を開く要求',
    'ブログパーツのShift操作で送る要求',
  ],
  functionality: [
    'P1-04/media-sm9: ID・長さ・比率・実映像の識別画素・コメント・選択行が一致',
    'P1-04/race: 遅いA応答後もBの再生を保持',
    '押下中のドラッグで実映像を移動',
    'ドラッグを3秒保持しても操作部を表示',
    'リサイズ中の範囲外ドラッグを先頭へ制限',
    'リサイズ後の位置を実映像へ反映',
    'ドラッグ終了後は通常の自動非表示へ戻る',
    '再生拒否後も実映像は停止し再生ボタンを保持',
    '拒否解除後の実クリックで映像の時間進行を回復',
    'ゲスト情報から投稿入力を無効にし理由を表示',
    '投稿キー401を成功扱いせず本文と理由を保持',
    '認証回復後の再送が成功して本文を消す',
    '認証拒否は0投稿、回復後は1要求1受理',
    '停止中に時計を保持',
    '実API受理後に本文を消す',
    '受理IDと番号を1件のプレビューへ反映',
    '拒否時は本文と理由を保持',
    '実終端から同一動画の先頭へリピート',
    '終了後の遅延応答で映像・コメントを復活させない',
    'HTTP失敗を成功metaで隠さず再生エラーを表示',
    '配信API回復後に同じ再読込導線で復帰',
    ...[0.5, 1, 2].map((speed) => `速度${speed}のコメント時計を実mediaへ同期`),
  ],
  library: [
    'P1-04/media-sm100: ID・長さ・比率・実映像の識別画素・コメント・選択行が一致',
    'P3-01 投稿者一覧の順序・動画ID一致',
    'P3-02-profile-click プロフィール画像の実クリックで正しいURLの新規タブを開く',
    'P3-04 関連動画からマイリスト追加ボタンを削除',
    'P3-04 プレイリストからマイリスト追加ボタンを削除',
    'P3-06 自動スクロールを実クリックで切替',
    'P3-07-date-fetch 指定日時以前のコメントだけを表示',
    'P3-07-date-back-visible 通常表示へ戻るボタンの描画完了',
    'P3-07-date-return 現在のコメントへ復帰',
    'P3-08-copy 行から選んだ本文だけをコピーAPIへ渡す',
    'P3-08-nicoru-rollback 拒否されたニコるを件数へ反映しない',
    'P3-08-nicoru-reload 再取得でも受理件数を保持',
    'P3-08-delete-retain 拒否された削除で行を消さない',
    'P3-08-delete-reload 再取得でも削除を確認',
    ...['vpos', 'date:desc', 'nicoru:desc'].map((key) => `P3-09 並び替えの描画完了 ${key}`),
    'P3-10 連続再生の状態を同期',
    'P3-10 リストリピートの状態を同期',
    'P3-11 逆順で選択IDを保持',
    'P3-11 シャッフルで欠落・重複なし',
    'P3-12-import-corrupt 破損JSONを拒否して一覧を維持',
    'P3-12-import-shape 不正な動画情報を拒否して一覧を維持',
    'P3-12-import-restore 保存したJSONから順序・選択・設定を復元',
    'タグ閲覧専用UIに編集・追加・更新・削除操作を表示しない',
    'タグ閲覧専用UIはタグAPIを要求しない',
    'P4-04-existing 公式記事照会で既存タグの誤falseを補正',
  ],
  guard: [],
};

const invalidSettingInputs: Readonly<Record<string, readonly string[]>> = {
  'P2-08/baseChatScale': ['', '0.4', '2.1', '0.55'],
  'P2-08/commentLayer.ownerCommentShadowColor': ['#xyz'],
  'P2-09/wordRegFilter': ['/[/i', '/ok/ii'],
};
export const requiredSettingsFields = settingsCategories.flatMap((category) =>
  category.keys.map((key) => ({ id: `${category.id}/${key}`, key, category: category.name }))
);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string');
function labelsFrom(report: Record<string, unknown>): { labels: string[]; parents: Set<string> } {
  const labels: string[] = [],
    ids: string[] = [];
  if (report.checks !== undefined) {
    if (!strings(report.checks)) throw new Error('checksの形式が不正です');
    labels.push(...report.checks);
  }
  if (report.cases !== undefined) {
    if (!Array.isArray(report.cases)) throw new Error('casesの形式が不正です');
    for (const item of report.cases as unknown[]) {
      if (!record(item) || typeof item.id !== 'string' || typeof item.label !== 'string')
        throw new Error('case ID/labelの形式が不正です');
      ids.push(item.id);
      labels.push(item.label);
    }
  }
  const parents = new Set<string>();
  for (const value of [...labels, ...ids])
    for (const match of value.matchAll(/P[1-4]-\d{2}(?:\/\d{2})*/g)) {
      const [first, ...suffixes] = match[0].split('/');
      parents.add(first!);
      for (const suffix of suffixes) parents.add(first!.slice(0, 3) + suffix);
    }
  return { labels, parents };
}
function validateSettings(report: Record<string, unknown>, missing: string[]): void {
  if (!Array.isArray(report.fields)) {
    missing.push('settings.fields');
    return;
  }
  const fields = new Map<string, Record<string, unknown>>();
  for (const value of report.fields as unknown[]) {
    if (!record(value) || typeof value.id !== 'string') {
      missing.push('setting IDの形式');
      continue;
    }
    if (fields.has(value.id)) missing.push(`重複設定:${value.id}`);
    fields.set(value.id, value);
  }
  if (requiredSettingsFields.length !== 36 || fields.size !== 36) missing.push(`設定36件:実際${fields.size}`);
  for (const required of requiredSettingsFields) {
    const field = fields.get(required.id);
    if (!field || field.key !== required.key || field.category !== required.category) {
      missing.push(required.id);
      continue;
    }
    if (typeof field.storageKey !== 'string' || !field.storageKey) missing.push(`${required.id}:storageKey`);
    if (
      !Array.isArray(field.inputs) ||
      field.inputs.length === 0 ||
      field.inputs.some((value: unknown) => typeof value !== 'string' && typeof value !== 'boolean') ||
      JSON.stringify(field.inputs) !== JSON.stringify(field.verifiedInputs)
    )
      missing.push(`${required.id}:全入力`);
    for (const state of ['saved', 'reopened', 'restored'])
      if (field[state] !== true) missing.push(`${required.id}:${state}`);
    for (const input of invalidSettingInputs[required.id] ?? [])
      if (!strings(field.invalidInputs) || !field.invalidInputs.includes(input))
        missing.push(`${required.id}:不正入力${JSON.stringify(input)}`);
  }
}

/** レポートの成功値だけでなく、必須操作と復元の完了を検査する。 */
export function assertBrowserCoverage(
  suite: BrowserSuite,
  value: unknown
): { count: number; parents: string[]; settings: number } {
  if (!record(value) || value.completed !== true) throw new Error(`${suite}: 完了した検証結果がありません`);
  if (
    value.error ||
    (value.errors !== undefined && (!strings(value.errors) || value.errors.length > 0)) ||
    (suite !== 'guard' && value.failures !== undefined && (!strings(value.failures) || value.failures.length > 0))
  )
    throw new Error(`${suite}: 失敗を含むレポートです`);
  const { labels, parents } = labelsFrom(value),
    missing: string[] = [];
  for (const required of requiredBrowserChecks[suite]) if (!labels.includes(required)) missing.push(required);
  for (const required of requiredBrowserParents[suite] ?? []) if (!parents.has(required)) missing.push(required);
  if (suite === 'settings') validateSettings(value, missing);
  let count = labels.length;
  if (suite === 'guard') {
    if (value.isolatedContexts !== true) missing.push('保存値・BroadcastChannelのコンテキスト隔離');
    const urls = ['https://fixture.invalid/unregistered-page', 'https://fixture.invalid/unregistered-worker'];
    const observations = Array.isArray(value.observations) ? (value.observations as unknown[]) : [];
    const failures = strings(value.failures) ? value.failures : [];
    if (observations.length !== 2 || failures.length !== 2) missing.push('ページ/Workerの負例2件');
    for (const url of urls) {
      if (
        observations.filter(
          (item) =>
            record(item) &&
            item.url === url &&
            item.matched === false &&
            (item.intercepted === true ||
              (typeof item.failure === 'string' && item.failure.includes('ERR_PROXY_CONNECTION_FAILED')))
        ).length !== 1 ||
        failures.filter((error) => error.includes(url) && /未登録通信|未捕捉通信/.test(error)).length !== 1
      )
        missing.push(url);
    }
    const startup = record(value.workerStartup) ? value.workerStartup : {};
    const startupFailures = strings(startup.failures) ? startup.failures : [];
    if (startup.closeRejected !== true || startupFailures.length !== 2)
      missing.push('起動直後Worker例外2件の終了時拒否');
    for (const marker of ['guard-worker-startup-throw', 'guard-worker-startup-rejection']) {
      if (startupFailures.filter((error) => error.includes(marker)).length !== 1) missing.push(marker);
    }
    const additional = record(value.additionalTargets) ? value.additionalTargets : {};
    const extraObservations = Array.isArray(additional.observations) ? (additional.observations as unknown[]) : [];
    const extraFailures = strings(additional.failures) ? additional.failures : [];
    if (additional.closeRejected !== true || extraObservations.length !== 3 || extraFailures.length !== 3)
      missing.push('iframe/popup/Service Workerの負例3件の終了時拒否');
    for (const name of ['frame', 'popup', 'service-worker']) {
      const url = `https://fixture.invalid/unregistered-${name}`;
      if (
        extraObservations.filter(
          (item) => record(item) && item.url === url && item.matched === false && item.intercepted === true
        ).length !== 1 ||
        extraFailures.filter((error) => error === `未登録通信: GET ${url}`).length !== 1
      )
        missing.push(url);
    }
    count = observations.length + startupFailures.length + extraObservations.length;
  }
  if (count === 0) missing.push('実行件数0');
  if (missing.length) throw new Error(`${suite}: 必須ケースが未完了 (${missing.length}件): ${missing.join(' / ')}`);
  return { count, parents: [...parents].sort(), settings: suite === 'settings' ? requiredSettingsFields.length : 0 };
}
