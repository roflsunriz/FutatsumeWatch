import { afterEach, expect, spyOn, test } from 'bun:test';
import { nicoUtil } from '../../packages/lib/src/nico/nico-util';
import { Config } from '../../src/config';
import { VideoInfoModel } from '../../src/video-info';
import type { RawVideoInfoData } from '../../src/video-info';
import { WatchInfoCacheDb } from '../../packages/lib/src/nico/watch-info-cache-db';
import { VideoSessionWorker } from '../../packages/lib/src/nico/video-session-worker';
import { MediaSessionApi } from '../../packages/lib/src/infra/media-session-api';
import { uQuery } from '../../packages/lib/src/u-query';

await Config.promise('restore');
Object.assign(globalThis, {
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  HTMLVideoElement: window.HTMLVideoElement,
  HTMLCanvasElement: window.HTMLCanvasElement,
  Image: window.Image,
  Node: window.Node,
  Document: window.Document,
  CustomEvent: window.CustomEvent,
  MutationObserver: window.MutationObserver,
  customElements: window.customElements,
  Window: window.Window,
  HTMLCollection: window.HTMLCollection,
  NodeList: window.NodeList,
});
const { NicoVideoPlayerDialog, NicoVideoPlayerDialogView } = await import('../../src/nico-video-player-dialog');
afterEach(() => {
  nicoUtil.beginWatchViewer('cleanup');
  nicoUtil.clearWatchViewer('cleanup');
  document.body.replaceChildren();
});

test('ヘッダー不在では取得したviewerのログイン・プレミアムだけを利用する', () => {
  document.body.replaceChildren();
  expect(nicoUtil.isLogin()).toBe(false);
  expect(nicoUtil.isPremium()).toBe(false);
  nicoUtil.beginWatchViewer('current');
  expect(nicoUtil.updateWatchViewer('current', { id: 123, isPremium: false })).toBe(true);
  expect(nicoUtil.isLogin()).toBe(true);
  expect(nicoUtil.isPremium()).toBe(false);
  nicoUtil.updateWatchViewer('current', { id: 123, isPremium: true });
  expect(nicoUtil.isPremium()).toBe(true);
});

test('guest・不正viewerは以前のログインやプレミアムを引き継がない', () => {
  for (const value of [
    null,
    undefined,
    {},
    [],
    { id: 0, isPremium: true },
    { id: -1, isPremium: true },
    { id: '123', isPremium: true },
    { id: 1, isPremium: 'true' },
    { id: NaN, isPremium: true },
    { id: 1.5, isPremium: true },
    { id: Infinity, isPremium: true },
  ]) {
    nicoUtil.beginWatchViewer('current');
    nicoUtil.updateWatchViewer('current', { id: 1, isPremium: true });
    nicoUtil.updateWatchViewer('current', value);
    expect(nicoUtil.isLogin()).toBe(false);
    expect(nicoUtil.isPremium()).toBe(false);
  }
});

test('切替・closeで状態を破棄し、旧要求の応答やcloseは新世代へ作用しない', () => {
  nicoUtil.beginWatchViewer('first');
  nicoUtil.updateWatchViewer('first', { id: 123, isPremium: true });
  nicoUtil.beginWatchViewer('next');
  expect(nicoUtil.isLogin()).toBe(false);
  expect(nicoUtil.updateWatchViewer('first', { id: 123, isPremium: true })).toBe(false);
  nicoUtil.updateWatchViewer('next', { id: 456, isPremium: false });
  nicoUtil.clearWatchViewer('first');
  expect(nicoUtil.isLogin()).toBe(true);
  nicoUtil.clearWatchViewer('next');
  expect(nicoUtil.isLogin()).toBe(false);
  expect(nicoUtil.updateWatchViewer('next', { id: 456, isPremium: true })).toBe(false);
});

test('現行ヘッダーと旧ヘッダーの既存判定はAPI情報がない時に維持する', () => {
  const header = document.createElement('div');
  header.id = 'CommonHeader';
  header.dataset.commonHeader = JSON.stringify({ initConfig: { user: { isLogin: true, isPremium: true } } });
  document.body.append(header);
  expect(nicoUtil.isLogin()).toBe(true);
  expect(nicoUtil.isPremium()).toBe(true);
  nicoUtil.beginWatchViewer('current');
  nicoUtil.updateWatchViewer('current', null);
  expect(nicoUtil.isLogin()).toBe(false);
  expect(nicoUtil.isPremium()).toBe(false);
  nicoUtil.clearWatchViewer('current');
  expect(nicoUtil.isLogin()).toBe(true);
  delete header.dataset.commonHeader;
  expect(nicoUtil.isLogin()).toBe(true);
  const login = document.createElement('a');
  login.href = 'https://account.nicovideo.jp/login';
  header.append(login);
  expect(nicoUtil.isLogin()).toBe(false);
});

test('動画API内viewerをモデルから公開し、旧top-level値を採用しない', async () => {
  const raw = (await Bun.file('test/fixtures/video-info-raw-data.json').json()) as RawVideoInfoData;
  raw.viewerInfo = { id: 999, isPremium: true };
  raw.watchApiData.viewerInfo = { id: 123, isPremium: false };
  expect(new VideoInfoModel(raw).viewerInfo).toEqual({ id: 123, isPremium: false });
});

test('実loader完了経路は要求世代照合後にviewerと入力パネルを更新する', async () => {
  const raw = (await Bun.file('test/fixtures/video-info-raw-data.json').json()) as RawVideoInfoData;
  raw.watchApiData.viewerInfo = { id: 123, isPremium: false };
  const stop = new Error('test stops before media network');
  raw.isDmc = false;
  const cache = spyOn(WatchInfoCacheDb, 'put').mockResolvedValue({});
  const media = spyOn(MediaSessionApi, 'updateByVideoInfo').mockImplementation(() => undefined);
  const session = spyOn(VideoSessionWorker, 'create').mockRejectedValue(stop);
  const log = spyOn(console, 'log').mockImplementation(() => undefined);
  let updates = 0;
  const context = {
    _requestId: 'current',
    _watchId: 'sm9',
    _videoInfo: undefined,
    _view: { updateViewer: () => updates++ },
    _playerConfig: { props: {} },
    _videoWatchOptions: {},
    _state: { setState: () => undefined },
  };
  try {
    nicoUtil.beginWatchViewer('current');
    await NicoVideoPlayerDialog.prototype._onVideoInfoLoaderLoad.call(context, 'stale', [raw, {}, undefined]);
    expect(updates).toBe(0);
    expect(nicoUtil.isLogin()).toBe(false);
    const outcome = await NicoVideoPlayerDialog.prototype._onVideoInfoLoaderLoad
      .call(context, 'current', [raw, {}, undefined])
      .then(
        () => null,
        (error: unknown) => error
      );
    expect(outcome).toBe(stop);
    expect(updates).toBe(1);
    expect(nicoUtil.isLogin()).toBe(true);
    expect(nicoUtil.isPremium()).toBe(false);
  } finally {
    cache.mockRestore();
    media.mockRestore();
    session.mockRestore();
    log.mockRestore();
  }
});

test('view更新は取得情報を入力欄・guest表示・一般会員stateへ同時反映する', () => {
  const root = document.createElement('div');
  root.id = 'futatsumeVideoPlayerDialog';
  root.classList.add('is-guest');
  const container = document.createElement('div');
  root.append(container);
  let viewer: { isLoggedIn: boolean; isPremium: boolean } | undefined;
  const context = {
    _state: { isRegularUser: false },
    classList: container.classList,
    _$dialog: uQuery(root),
    commentInput: { updateViewer: (value: typeof viewer) => (viewer = value) },
  };
  nicoUtil.beginWatchViewer('current');
  nicoUtil.updateWatchViewer('current', { id: 123, isPremium: false });
  NicoVideoPlayerDialogView.prototype.updateViewer.call(context);
  expect(viewer).toEqual({ isLoggedIn: true, isPremium: false });
  expect(context._state.isRegularUser).toBe(true);
  expect(root.classList.contains('is-guest')).toBe(false);
  nicoUtil.updateWatchViewer('current', null);
  NicoVideoPlayerDialogView.prototype.updateViewer.call(context);
  expect(viewer).toEqual({ isLoggedIn: false, isPremium: false });
  expect(root.classList.contains('is-guest')).toBe(true);
  expect(container.classList.contains('is-guest')).toBe(false);
});

test('dialog終了のrefreshはviewerを破棄して旧loader応答を拒否する', async () => {
  nicoUtil.beginWatchViewer('current');
  nicoUtil.updateWatchViewer('current', { id: 123, isPremium: true });
  let updates = 0;
  const context = {
    _requestId: 'current',
    commentRequestSequence: 0,
    _view: { updateViewer: () => updates++ },
    videoRecovery: { reset: () => undefined },
    commentPosts: { reset: () => undefined },
    _nicoVideoPlayer: null,
    _videoSession: null,
  };
  NicoVideoPlayerDialog.prototype._refresh.call(context);
  expect(nicoUtil.isLogin()).toBe(false);
  expect(nicoUtil.isPremium()).toBe(false);
  expect(updates).toBe(1);
  const log = spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    await NicoVideoPlayerDialog.prototype._onVideoInfoLoaderLoad.call(context, 'current', [{}, {}, undefined]);
    expect(updates).toBe(1);
  } finally {
    log.mockRestore();
  }
});

test('openは非同期プレイヤー初期化前に旧viewerを破棄し、途中close後は適用しない', async () => {
  nicoUtil.beginWatchViewer('old');
  nicoUtil.updateWatchViewer('old', { id: 123, isPremium: true });
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const context = {
    _requestId: 'old',
    _watchId: 'sm9',
    _playerConfig: Config,
    isOpen: false,
    refreshLastPlayerId() {},
    videoRecovery: { reset() {} },
    commentPosts: { reset() {} },
    _view: { updateViewer() {} },
    _initializeNicoVideoPlayer: () => pending,
    commentRequestSequence: 0,
  };
  const log = spyOn(console, 'log').mockImplementation(() => undefined);
  const timer = spyOn(console, 'time').mockImplementation(() => undefined);
  try {
    const opened = NicoVideoPlayerDialog.prototype.open.call(context, 'sm10');
    expect(nicoUtil.isLogin()).toBe(false);
    expect(context._requestId).not.toBe('old');
    NicoVideoPlayerDialog.prototype._refresh.call(context);
    release();
    await opened;
    expect(context._requestId).toBe('');
    expect(nicoUtil.updateWatchViewer('old', { id: 123, isPremium: true })).toBe(false);
  } finally {
    log.mockRestore();
    timer.mockRestore();
  }
});

test('プレイリスト追加だけのopenは現在のviewer世代を変更しない', async () => {
  nicoUtil.beginWatchViewer('playing');
  nicoUtil.updateWatchViewer('playing', { id: 123, isPremium: false });
  const context = {
    _requestId: 'playing',
    _watchId: 'sm9',
    _playerConfig: Config,
    isOpen: true,
    isPlaying: true,
    isPlaylistEnable: true,
    refreshLastPlayerId() {},
    _onPlaylistInsert() {},
  };
  await NicoVideoPlayerDialog.prototype.open.call(context, 'sm10');
  expect(context._requestId).toBe('playing');
  NicoVideoPlayerDialog.prototype._refresh.call({
    ...context,
    _view: { updateViewer() {} },
    commentRequestSequence: 0,
    videoRecovery: { reset() {} },
    commentPosts: { reset() {} },
  });
  expect(nicoUtil.isLogin()).toBe(false);
});
