import { expect, spyOn, test } from 'bun:test';
import { VideoRecoveryTasks } from '../../src/video-recovery-tasks';
import { MediaSessionApi } from '../../packages/lib/src/infra/media-session-api';
import { Config } from '../../src/config';
import { ABRepeat, PlayerShell } from '../../src/player-shell';
await Config.promise('restore');
Object.assign(globalThis, {
  HTMLElement: window.HTMLElement,
  HTMLVideoElement: window.HTMLVideoElement,
  HTMLCanvasElement: window.HTMLCanvasElement,
  Image: window.Image,
  Element: window.Element,
  Document: window.Document,
  Node: window.Node,
  customElements: window.customElements,
  CustomEvent: window.CustomEvent,
  MutationObserver: window.MutationObserver,
});
const { NicoVideoPlayerDialog } = await import('../../src/nico-video-player-dialog');

test('Bが実終端のABリピートは通常終端・プレイリスト遷移より先にAへ戻す', () => {
  const ab = new ABRepeat();
  ab.advance(10);
  ab.advance(64);
  const commands: Array<[string, number | undefined]> = [];
  const shell = { ab, command: (name: string, value?: number) => commands.push([name, value]) };
  let ended = false,
    next = false;
  const context = {
    _view: { repeatOnEnded: () => PlayerShell.prototype.repeatOnEnded.call(shell) },
    emitAsync: () => {
      ended = true;
    },
    _state: {
      setVideoEnded: () => {
        ended = true;
      },
    },
    _videoInfo: { contextWatchId: 'sm9' },
    _savePlaybackPosition: () => undefined,
    isPlaylistEnable: true,
    _playlist: { hasNext: true },
    playNextVideo: () => {
      next = true;
    },
  };
  NicoVideoPlayerDialog.prototype._onVideoEnded.call(context);
  expect(commands).toEqual([
    ['seek', 10],
    ['play', undefined],
  ]);
  expect(ended).toBe(false);
  expect(next).toBe(false);
});

test('close/別動画への切替は保留中の全再試行を取り消す', async () => {
  const tasks = new VideoRecoveryTasks();
  const actions: string[] = [];
  tasks.schedule(() => actions.push('old-reload'), 5);
  tasks.schedule(() => actions.push('old-next'), 5);
  tasks.reset();
  tasks.schedule(() => actions.push('new-video'), 5);
  await Bun.sleep(30);
  expect(actions).toEqual(['new-video']);
});
test('切替前の接続状態の遅い成功・失敗を新動画へ返さない', async () => {
  for (const succeeds of [true, false]) {
    const tasks = new VideoRecoveryTasks();
    let resolve!: (state: { isDeleted: boolean }) => void;
    let reject!: (error: Error) => void;
    const old = tasks.read(
      () =>
        new Promise<{ isDeleted: boolean }>((yes, no) => {
          resolve = yes;
          reject = no;
        })
    );
    tasks.reset();
    if (succeeds) resolve({ isDeleted: true });
    else reject(new Error('old session failure'));
    expect(await old).toBeUndefined();
    expect(await tasks.read(() => Promise.resolve({ isDeleted: false }))).toEqual({ isDeleted: false });
  }
});
test('現動画の接続状態エラーは握りつぶさず呼出元へ返す', async () => {
  const tasks = new VideoRecoveryTasks();
  const error = await tasks
    .read(() => Promise.reject(new Error('current session failure')))
    .catch((value: Error) => value);
  expect(error).toBeInstanceOf(Error);
});

test('HLS切替でloading解除後にシークしても遅いmetadataが古い再開位置を復元しない', () => {
  const currentTime = Object.getOwnPropertyDescriptor(NicoVideoPlayerDialog.prototype, 'currentTime')!;
  const context = {
    isOpen: true,
    _requestId: 'active',
    _nicoVideoPlayer: { currentTime: 0 },
    _videoWatchOptions: { currentTime: 48 },
    _state: { isLoading: false, isError: false, isYouTube: false },
    _lastCurrentTime: 48,
  };
  const media = spyOn(MediaSessionApi, 'updatePositionStateByMedia').mockImplementation(() => undefined);
  try {
    Object.defineProperty(context, 'currentTime', currentTime);
    currentTime.set!.call(context, 25.6);
    expect(context._videoWatchOptions.currentTime).toBe(25.6);
    NicoVideoPlayerDialog.prototype._onLoadedMetaData.call(context);
    expect(context._nicoVideoPlayer.currentTime).toBe(25.6);
    expect(context._lastCurrentTime).toBe(25.6);
    currentTime.set!.call(context, 0);
    NicoVideoPlayerDialog.prototype._onLoadedMetaData.call(context);
    expect(context._nicoVideoPlayer.currentTime).toBe(0);
    context.isOpen = false;
    context._requestId = '';
    context._videoWatchOptions.currentTime = 25.6;
    NicoVideoPlayerDialog.prototype._onLoadedMetaData.call(context);
    expect(context._nicoVideoPlayer.currentTime).toBe(0);
  } finally {
    media.mockRestore();
  }
});

test('実play/togglePlayの遅い拒否は別動画のエラー表示を変更しない', async () => {
  for (const method of ['play', 'togglePlay'] as const) {
    let reject!: (error: Error) => void;
    const failures: string[] = [];
    const pending = () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      });
    const context = {
      _state: { isError: false },
      _requestId: 'old',
      isOpen: true,
      isPlaying: false,
      _nicoVideoPlayer: { play: pending, togglePlay: pending },
      _onVideoPlayStartFail: (error: Error) => failures.push(error.message),
    };
    NicoVideoPlayerDialog.prototype[method].call(context);
    context._requestId = 'new';
    reject(new Error('old play rejected'));
    await Promise.resolve();
    expect(failures).toEqual([]);
    NicoVideoPlayerDialog.prototype[method].call(context);
    reject(new Error('new play rejected'));
    await Promise.resolve();
    expect(failures).toEqual(['new play rejected']);
  }
});

test('SessionClosedErrorの実ハンドラーは正しいPlayerStateへ到達し、二重エラーにしない', () => {
  for (const alreadyFailed of [false, true]) {
    const messages: string[] = [];
    let stateUpdates = 0;
    const emitted: string[] = [];
    const context = {
      _state: {
        isError: alreadyFailed,
        setVideoErrorOccurred: () => {
          stateUpdates++;
        },
      },
      _setErrorMessage: (message: string) => messages.push(message),
      emit: (event: string) => emitted.push(event),
    };
    NicoVideoPlayerDialog.prototype._onVideoPlayStartFail.call(context, new DOMException('SessionClosedError'));
    expect(stateUpdates).toBe(alreadyFailed ? 0 : 1);
    expect(messages.length).toBe(alreadyFailed ? 0 : 1);
    expect(emitted).toEqual(['loadVideoPlayStartFail']);
  }
});

test('実動画エラーハンドラーも旧sessionの応答で新動画の通知・reloadを変更しない', async () => {
  for (const succeeds of [true, false]) {
    const videoRecovery = new VideoRecoveryTasks();
    let resolve!: (state: { isDeleted: boolean; isAbnormallyClosed: boolean }) => void;
    let reject!: (error: Error) => void;
    const messages: string[] = [];
    const context = {
      videoRecovery,
      isOpen: true,
      _videoInfo: {},
      _state: { setVideoErrorOccurred() {} },
      _videoSession: {
        getState: () =>
          new Promise<{ isDeleted: boolean; isAbnormallyClosed: boolean }>((yes, no) => {
            resolve = yes;
            reject = no;
          }),
      },
      _setErrorMessage: (message: string) => messages.push(message),
      emit: (name: string) => messages.push(name),
    };
    const pending = NicoVideoPlayerDialog.prototype._onVideoError.call(context, { description: 'old error' });
    videoRecovery.reset();
    if (succeeds) resolve({ isDeleted: true, isAbnormallyClosed: false });
    else reject(new Error('old Worker failure'));
    await pending;
    expect(messages).toEqual([]);
  }
});

test('読込・session・NG・YouTube失敗の実経路はcloseで予約を破棄する', async () => {
  const tasks = new VideoRecoveryTasks();
  let next = 0,
    reload = 0;
  const context = {
    _requestId: 'a',
    commentRequestSequence: 0,
    _view: { updateViewer() {} },
    videoRecovery: { schedule: (action: () => void) => tasks.schedule(action, 5), reset: () => tasks.reset() },
    commentPosts: { reset() {} },
    _state: { isError: false, setState() {} },
    _watchId: 'sm9',
    isOpen: true,
    isPlaylistEnable: true,
    _setErrorMessage() {},
    emit() {},
    playNextVideo: () => {
      next++;
    },
    reload: () => {
      reload++;
    },
  };
  NicoVideoPlayerDialog.prototype._onVideoInfoLoaderFail.call(context, 'a', { reason: 'forbidden' });
  NicoVideoPlayerDialog.prototype._onVideoSessionFail.call(context, new Error('fixture'));
  NicoVideoPlayerDialog.prototype._onYouTubeVideoError.call(context, { description: 'fixture', fallback: true });
  NicoVideoPlayerDialog.prototype._refresh.call(context);
  await Bun.sleep(30);
  expect(context._requestId).toBe('');
  expect(context.commentRequestSequence).toBe(1);
  expect(next).toBe(0);
  expect(reload).toBe(0);
  NicoVideoPlayerDialog.prototype._onVideoSessionFail.call(context, new Error('new fixture'));
  await Bun.sleep(30);
  expect(next).toBe(1);
});
