// import {PRODUCT} from './futatsume-watch-index';
const PRODUCT = 'FutatsumeWatch';
import { migrateConfig, migrateImportedConfig } from './config-migration';
import { DataStorage } from '../packages/lib/src/infra/data-storage';
import { validateImportedConfig } from './config-validation';

export interface ConfigProps {
  debug: boolean;
  volume: number;
  forceEnable: boolean;
  showComment: boolean;
  autoPlay: boolean;
  'autoPlay:ginza': boolean;
  'autoPlay:others': boolean;
  enableResume: boolean;
  loop: boolean;
  mute: boolean;
  screenMode: string;
  'screenMode:ginza': string;
  'screenMode:others': string;
  autoFullScreen: boolean;
  autoCloseFullScreen: boolean;
  continueNextPage: boolean;
  autoPauseCommentInput: boolean;
  sharedNgLevel: string;
  enablePushState: boolean;
  enableHeatMap: boolean;
  enableCommentPreview: boolean;
  enableAutoMylistComment: boolean;
  enableTogglePlayOnClick: boolean;
  enableDblclickClose: boolean;
  enableFullScreenOnDoubleClick: boolean;
  enableStoryboard: boolean;
  enableStoryboardBar: boolean;
  videoInfoPanelTab: string;
  fullscreenControlBarMode: string;
  enableFilter: boolean;
  wordRegFilter: string[];
  userIdFilter: string;
  commandFilter: string;
  removeNgMatchedUser: boolean;
  'filter.fork0': boolean;
  'filter.fork1': boolean;
  'filter.fork2': boolean;
  'filter.fork3': boolean;
  'filter.defaultThread': boolean;
  'filter.ownerThread': boolean;
  'filter.communityThread': boolean;
  'filter.nicosThread': boolean;
  'filter.easyThread': boolean;
  'filter.aiThread': boolean;
  'filter.extraDefaultThread': boolean;
  'filter.extraOwnerThread': boolean;
  'filter.extraCommunityThread': boolean;
  'filter.extraNicosThread': boolean;
  'filter.extraEasyThread': boolean;
  videoTagFilter: string;
  videoOwnerFilter: string;
  enableCommentPanel: boolean;
  enableCommentPanelAutoScroll: boolean;
  playlistLoop: boolean;
  commentLanguage: string;
  baseFontFamily: string;
  baseChatScale: number;
  baseFontBolder: boolean;
  cssFontWeight: string;
  allowOtherDomain: boolean;
  overrideWatchLink: boolean;
  'overrideWatchLink:others': boolean;
  speakLark: boolean;
  speakLarkVolume: number;
  enableSingleton: boolean;
  loadLinkedChannelVideo: boolean;
  commentLayerOpacity: number;
  'commentLayer.textShadowType': string;
  'commentLayer.ownerCommentShadowColor': string;
  'commentLayer.easyCommentOpacity': number;
  'commentLayer.aiCommentOpacity': number;
  overrideGinza: boolean;
  enableGinzaSlayer: boolean;
  lastPlayerId: string;
  playbackRate: number;
  lastWatchId: string;
  message: string;
  enableVideoSession: boolean;
  domandVideoQuality: string;
  enableNicosJumpVideo: boolean;
  'videoSearch.ownerOnly': boolean;
  'videoSearch.mode': string;
  'videoSearch.order': string;
  'videoSearch.sort': string;
  'videoSearch.word': string;
  'screenshot.prefix': string;
  'search.limit': number;
  'touch.enable': boolean;
  'touch.tap2command': string;
  'touch.tap3command': string;
  'touch.tap4command': string;
  'touch.tap5command': string;
  'navi.favorite': unknown[];
  'navi.playlistButtonMode': string;
  'navi.ownerFilter': boolean;
  'navi.lastSearchQuery': string;
  autoFutatsumeTube: boolean;
  bestFutatsumeTube: boolean;
  KEY_CLOSE: number;
  KEY_RE_OPEN: number;
  KEY_HOME: number;
  KEY_SEEK_LEFT: number;
  KEY_SEEK_RIGHT: number;
  KEY_SEEK_LEFT2: number;
  KEY_SEEK_RIGHT2: number;
  KEY_SEEK_PREV_FRAME: number;
  KEY_SEEK_NEXT_FRAME: number;
  KEY_VOL_UP: number;
  KEY_VOL_DOWN: number;
  KEY_INPUT_COMMENT: number;
  KEY_FULLSCREEN: number;
  KEY_MUTE: number;
  KEY_TOGGLE_COMMENT: number;
  KEY_TOGGLE_LOOP: number;
  KEY_DEFLIST_ADD: number;
  KEY_DEFLIST_REMOVE: number;
  KEY_TOGGLE_PLAY: number;
  KEY_TOGGLE_PLAYLIST: number;
  KEY_SCREEN_MODE_1: number;
  KEY_SCREEN_MODE_2: number;
  KEY_SCREEN_MODE_3: number;
  KEY_SCREEN_MODE_4: number;
  KEY_SCREEN_MODE_5: number;
  KEY_SCREEN_MODE_6: number;
  KEY_SHIFT_RESET: number;
  KEY_SHIFT_DOWN: number;
  KEY_SHIFT_UP: number;
  KEY_NEXT_VIDEO: number;
  KEY_PREV_VIDEO: number;
  KEY_SCREEN_SHOT: number;
  KEY_SCREEN_SHOT_WITH_COMMENT: number;
  [key: string]: unknown;
}

export interface ConfigNamespace {
  getValue(key: string): unknown;
}

export interface ConfigStore {
  props: ConfigProps;
  onkey(key: string, listener: (...args: unknown[]) => void): unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  promise(name: string): Promise<unknown>;
  namespace(name: string): ConfigNamespace;
  getValue(key: string): unknown;
  setValue(key: string, value: unknown): void;
  export(): Record<string, unknown>;
  exportJson(): string;
  import(data: unknown): unknown;
  importJson(json: string): unknown;
  clear(): unknown;
  refresh(key: string): unknown;
  exportConfig: () => unknown;
  importConfig: (value: unknown) => unknown;
  exportToFile: () => void;
}

interface DataStorageModule {
  create(defaults: Record<string, unknown>, options: DataStorageOptions): ConfigStore;
}

interface DataStorageOptions {
  prefix: string;
  ignoreExportKeys: string[];
  readonly: boolean;
  storage: Storage;
}

// let console = window.console;

//===BEGIN===
//@require ../packages/lib/src/infra/storage-writer.js
//@require ../packages/lib/src/infra/obj-util.js
//@require ../packages/lib/src/infra/data-storage.js
const Config = (() => {
  const DEFAULT_CONFIG = {
    debug: false,
    volume: 0.3,
    forceEnable: false,
    showComment: true,
    autoPlay: true,
    'autoPlay:ginza': true,
    'autoPlay:others': true,
    enableResume: false,
    loop: false,
    mute: false,
    screenMode: 'normal',
    'screenMode:ginza': 'normal',
    'screenMode:others': 'normal',
    autoFullScreen: false,
    autoCloseFullScreen: true, // 再生終了時に自動でフルスクリーン解除するかどうか
    continueNextPage: false, // 動画再生中にリロードやページ切り替えしたら続きから開き直す
    autoPauseCommentInput: true, // コメント入力時に自動停止する
    sharedNgLevel: 'MID', // NG共有の強度 NONE, LOW, MID, HIGH, MAX
    enablePushState: true, // ブラウザの履歴に乗せる
    enableHeatMap: true,
    enableCommentPreview: false,
    enableAutoMylistComment: false, // マイリストコメントに投稿者を入れる
    enableTogglePlayOnClick: false, // 画面クリック時に再生/一時停止するかどうか
    enableDblclickClose: true, //
    enableFullScreenOnDoubleClick: true,
    enableStoryboard: true, // シークバーサムネイル関連
    enableStoryboardBar: false, // シーンサーチ
    videoInfoPanelTab: 'videoInfoTab',
    fullscreenControlBarMode: 'auto', // 'always-show' 'always-hide'

    // forceEconomy: false,
    // NG設定
    enableFilter: true,
    wordRegFilter: [],
    userIdFilter: '',
    commandFilter: '',
    removeNgMatchedUser: false, // NGにマッチしたユーザーのコメント全部消す

    'filter.fork0': true, // 通常コメント
    'filter.fork1': true, // 投稿者コメント
    'filter.fork2': true, // かんたんコメント
    'filter.fork3': true, // AIキャラクターコメント

    'filter.defaultThread': true, // 通常コメント
    'filter.ownerThread': true, // 投稿者コメント
    'filter.communityThread': true, // チャンネルコメント / コミュニティコメント
    'filter.nicosThread': true, // ニコスクリプトコメント
    'filter.easyThread': true, // かんたんコメント
    'filter.aiThread': true, // AIキャラクターコメント
    'filter.extraDefaultThread': true, // ***extra-default
    'filter.extraOwnerThread': true, // ***extra-owner
    'filter.extraCommunityThread': true, // 引用コメント
    'filter.extraNicosThread': true, // ***extra-nicos
    'filter.extraEasyThread': true, // 引用かんたんコメント

    videoTagFilter: '',
    videoOwnerFilter: '',

    enableCommentPanel: true,
    enableCommentPanelAutoScroll: true,

    playlistLoop: false,
    commentLanguage: 'ja-jp',

    baseFontFamily: '',
    baseChatScale: 1.0,
    baseFontBolder: true,
    cssFontWeight: 'bold',

    allowOtherDomain: true,

    overrideWatchLink: false, // すべての動画リンクをFutatsumeWatchで開く
    'overrideWatchLink:others': false, // すべての動画リンクをFutatsumeWatchで開く

    speakLark: false, // 一発ネタのコメント読み上げ機能. 飽きたら消す
    speakLarkVolume: 1.0, // 一発ネタのコメント読み上げ機能. 飽きたら消す

    // enableCommentLayoutWorker: true, // コメントの配置計算を一部マルチスレッド化(テスト中)

    enableSingleton: false,

    // 無料期間の過ぎた動画と同じのがdアニメにあったら、
    // コメントはそのままに映像だけ持ってくる (当然ながらdアニメ加入は必要)
    loadLinkedChannelVideo: false,

    commentLayerOpacity: 1.0, //
    'commentLayer.textShadowType': '', // フォントの修飾タイプ
    'commentLayer.ownerCommentShadowColor': '#008800', // 投稿者コメントの影の色
    'commentLayer.easyCommentOpacity': 0.5, // かんたんコメントの透明度
    'commentLayer.aiCommentOpacity': 0.5, // かんたんコメントの透明度

    overrideGinza: false, // 動画視聴ページでもGinzaの代わりに起動する
    enableGinzaSlayer: false, // まだ実験中
    lastPlayerId: '',
    playbackRate: 1.0,
    lastWatchId: 'sm9',
    message: '',

    enableVideoSession: true,
    domandVideoQuality: 'auto', // 優先する画質 auto, 1080p, 720, 480p, 360p, 144p

    enableNicosJumpVideo: true, // @ジャンプを有効にするかどうか
    'videoSearch.ownerOnly': true,
    'videoSearch.mode': 'tag',
    'videoSearch.order': 'desc',
    'videoSearch.sort': 'playlist',
    'videoSearch.word': '',

    'screenshot.prefix': '', // スクリーンショットのファイル名の先頭につける文字

    'search.limit': 300, // 検索する最大件数(最大1600) 100件ごとにAPIを叩くので多くするほど遅くなる

    //タッチパネルがある場合は null ない場合は undefined になるらしい
    //うちのデスクトップは無いのに null だが…
    'touch.enable': window.ontouchstart !== undefined,
    'touch.tap2command': '',
    'touch.tap3command': 'toggle-mute',
    'touch.tap4command': 'toggle-showComment',
    'touch.tap5command': 'screenShot',

    'navi.favorite': [],
    'navi.playlistButtonMode': 'insert',
    'navi.ownerFilter': false,
    'navi.lastSearchQuery': '',

    autoFutatsumeTube: false,
    bestFutatsumeTube: false,

    KEY_CLOSE: 27, // ESC
    KEY_RE_OPEN: 27 + 0x1000, // SHIFT + ESC
    KEY_HOME: 36 + 0x1000, // SHIFT + HOME

    KEY_SEEK_LEFT: 37 + 0x1000, // SHIFT + LEFT
    KEY_SEEK_RIGHT: 39 + 0x1000, // SHIFT + RIGHT
    KEY_SEEK_LEFT2: 99999999, // カスタマイズ用
    KEY_SEEK_RIGHT2: 99999999, //
    // 1/60秒戻る・進む  本当は1コマ単位の移動にしたいが動画のフレームレートを取得できないため
    KEY_SEEK_PREV_FRAME: 188, // ,
    KEY_SEEK_NEXT_FRAME: 190, // .

    KEY_VOL_UP: 38 + 0x1000, // SHIFT + UP
    KEY_VOL_DOWN: 40 + 0x1000, // SHIFT + DOWN

    KEY_INPUT_COMMENT: 67, // C
    KEY_FULLSCREEN: 70, // F
    KEY_MUTE: 77, // M
    KEY_TOGGLE_COMMENT: 86, // V

    KEY_TOGGLE_LOOP: 82, // R 76, // L

    KEY_DEFLIST_ADD: 84, // T
    KEY_DEFLIST_REMOVE: 84 + 0x1000, // SHIFT + T

    KEY_TOGGLE_PLAY: 32, // SPACE
    KEY_TOGGLE_PLAYLIST: 80, // P

    KEY_SCREEN_MODE_1: 49 + 0x1000, // SHIFT + 1
    KEY_SCREEN_MODE_2: 50 + 0x1000, // SHIFT + 2
    KEY_SCREEN_MODE_3: 51 + 0x1000, // SHIFT + 3
    KEY_SCREEN_MODE_4: 52 + 0x1000, // SHIFT + 4
    KEY_SCREEN_MODE_5: 53 + 0x1000, // SHIFT + 5
    KEY_SCREEN_MODE_6: 54 + 0x1000, // SHIFT + 6

    KEY_SHIFT_RESET: 49, // 1
    KEY_SHIFT_DOWN: 188 + 0x1000, // <
    KEY_SHIFT_UP: 190 + 0x1000, // >

    KEY_NEXT_VIDEO: 74, // J
    KEY_PREV_VIDEO: 75, // K

    KEY_SCREEN_SHOT: 83, // S
    KEY_SCREEN_SHOT_WITH_COMMENT: 83 + 0x1000, // SHIFT + S
  };

  if (navigator && navigator.userAgent && navigator.userAgent.match(/(Android|iPad;|CriOS)/i)) {
    DEFAULT_CONFIG.overrideWatchLink = true;
    DEFAULT_CONFIG.autoFullScreen = true;
    DEFAULT_CONFIG.autoCloseFullScreen = false;
    DEFAULT_CONFIG.volume = 1.0;
    DEFAULT_CONFIG.enableVideoSession = true;
  }

  if (location.host === 'www.nicovideo.jp') migrateConfig(localStorage, Object.keys(DEFAULT_CONFIG));
  const store = (DataStorage as unknown as DataStorageModule).create(DEFAULT_CONFIG, {
    prefix: PRODUCT,
    ignoreExportKeys: ['message', 'lastPlayerId', 'lastWatchId', 'debug'],
    readonly: !location || location.host !== 'www.nicovideo.jp',
    storage: localStorage,
  });
  const importConfig = store.import.bind(store);
  store.import = (data) => importConfig(validateImportedConfig(migrateImportedConfig(data), DEFAULT_CONFIG));
  return store;
})();
Config.on('save-error', () => {
  window.alert(
    navigator.language.startsWith('ja')
      ? '設定を保存できませんでした。変更前の値を保持しています。サイトの保存容量やブラウザーの設定を確認してから、もう一度お試しください。'
      : 'The setting could not be saved. The previous value was kept. Check the site storage quota and browser settings, then try again.'
  );
});
Config.on('reset-error', (error) => {
  window.alert(error instanceof Error ? error.message : '設定を初期化できませんでした。保存設定を確認してください。');
});
Config.exportConfig = () => Config.export();
Config.importConfig = (v: unknown) => Config.import(v);
Config.exportToFile = () => {
  const json = Config.exportJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    download: `${new Date().toLocaleString().replace(/[:/]/g, '_')}_FutatsumeWatch.config.json`,
    rel: 'noopener',
    href: url,
  });
  try {
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
};
const NaviConfig = Config;

//===END===

export { Config, NaviConfig };
