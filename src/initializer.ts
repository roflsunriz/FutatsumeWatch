import { FutatsumeWatch, global } from './futatsume-watch-index';
import { Config, PlayerSession, util, WatchPageHistory } from './util';
import type { ConfigStore } from './config';
import { NicoVideoPlayerDialog, PlayerConfig, PlayerState } from './nico-video-player-dialog';
import { CONSTANT } from './constant';
import { CustomElements } from '../packages/futatsume/src/parts/custom-elements';
import { RootDispatcher } from './root-dispatcher';
import { BroadcastEmitter } from '../packages/lib/src/message/message-util';
import { HoverMenu } from '../packages/futatsume/src/menu/hover-menu';
import { replaceRedirectLinks } from '../packages/futatsume/src/init/replace-redirect-links';
import { cssUtil } from '../packages/lib/src/css/css';
import { ThumbInfoLoader } from '../packages/lib/src/nico/thumb-info-loader';
import { StoryboardWorker } from '../packages/futatsume/src/storyboard/storyboard-worker';
import { VideoSessionWorker } from '../packages/lib/src/nico/video-session-worker';
import { StoryboardCacheDb } from '../packages/lib/src/nico/storyboard-cache-db';
import { WatchInfoCacheDb } from '../packages/lib/src/nico/watch-info-cache-db';
import { domEvent } from '../packages/lib/src/dom/dom-event';
import { uq } from '../packages/lib/src/u-query';
// import {domUtil} from '../packages/lib/src/dom/dom-util';

export interface InitializerDialog {
  on(event: string, listener: (command: string, param?: unknown) => unknown): unknown;
  execCommand(command: string, params?: unknown): { status: string };
  open(watchId: string, options?: unknown): unknown;
  close(): void;
  refreshLastPlayerId(): unknown;
  getId(): string;
  isLastOpenedPlayer: boolean;
  isOpen: boolean;
  playingStatus: unknown;
}

interface InitializerBroadcastEmitter {
  on(event: string, listener: (message: InitializerCommandBody, type: string, sessionId: string) => unknown): unknown;
  emitResolve(event: string, ...args: unknown[]): unknown;
  emitReject(event: string, ...args: unknown[]): unknown;
  hasPromise(sessionId: string): boolean;
  sendMessage(message: Record<string, unknown>): void;
  notifyClose(): void;
  notifyOpen(): void;
  sendOpen(watchId: string, params?: unknown): void;
  sendExecCommand(body: Record<string, unknown>): Promise<unknown>;
  ping: () => Promise<unknown>;
  hello: () => unknown;
  windowId: string;
}

export interface InitializerCommandBody {
  command: string;
  params: Record<string, unknown>;
  watchId?: unknown;
  requestId?: unknown;
  now: number;
}

interface InitializerPlayerSession {
  save(playingStatus: unknown): unknown;
  init(storage: Storage): void;
  restore(): unknown;
  clear(): void;
}

export interface InitializerLastSession {
  playing?: unknown;
  url?: string;
  watchId?: string;
  eventType?: string;
}

interface InitializerWatchPageHistory {
  initialize(dialog: unknown): void;
  pushHistoryAgency(path: string, title: string): void;
}

interface InitializerMylistApiLoader {
  setCsrfToken(token: string): void;
  addDeflistItem(watchId: string, description?: string): Promise<unknown>;
  removeDeflistItem(watchId: string): Promise<unknown>;
}

import { PlayListSession as PlaylistSession } from '../packages/futatsume/src/Playlist/playlist-session';

//===BEGIN===

interface InitializerSteps {
  initialize: () => Promise<void>;
  initializeExternal: (dialog: InitializerDialog) => void;
  initializeMessage: (dialog: InitializerDialog) => void;
  initializeLastSession: (dialog: InitializerDialog) => void;
}

const { initialize, initializeExternal, initializeMessage, initializeLastSession } = ((): InitializerSteps => {
  //@require hover-menu
  const readyContent = (): Promise<void> => {
    if (document.querySelector('[aria-label="nicovideo-content"]') != null) {
      return Promise.resolve();
    }
    const { promise, resolve } = (
      Promise as unknown as {
        withResolvers(): { promise: Promise<void>; resolve: () => void };
      }
    ).withResolvers();
    new MutationObserver((records, observer) => {
      for (const record of records) {
        if (record.addedNodes.length === 0 || document.querySelector('[aria-label="nicovideo-content"]') == null) {
          continue;
        }
        resolve();
        observer.disconnect();
      }
    }).observe(document.getElementById('root') as Element, {
      childList: true,
    });
    return promise;
  };

  const isWatchPage = async (): Promise<boolean> => {
    if (!util.isGinzaWatchUrl()) {
      return false;
    }

    const res = document.querySelector('meta[name="server-response"]')?.getAttribute('content');
    if (res == null) {
      await readyContent();
      return !!document.querySelector('.grid-area_\\[player\\]');
    }

    const json = JSON.parse(res) as {
      meta: { status: number };
      data: { response: { okReason: unknown } };
    };

    if (json.meta.status > 299) {
      return false;
    }

    return typeof json.data.response.okReason === 'string';
  };

  const initWorker = (): Promise<unknown> | undefined => {
    // 動画ロード直後に初期化するとつっかかる原因になるのでWorkerだけ作っておく
    if (!location.host.endsWith('.nicovideo.jp')) {
      return;
    }
    (ThumbInfoLoader as unknown as { load(id: string): unknown }).load('sm9');
    return Promise.all([
      (StoryboardWorker as unknown as { initWorker(): Promise<unknown> }).initWorker(),
      (VideoSessionWorker as unknown as { initWorker(): Promise<unknown> }).initWorker(),
      (StoryboardCacheDb as unknown as { initWorker(): Promise<unknown> }).initWorker(),
      (WatchInfoCacheDb as unknown as { initWorker(): Promise<unknown> }).initWorker(),
    ]);
  };

  //@require replace-redirect-links

  const initialize = async function (): Promise<void> {
    (
      domEvent as unknown as {
        dispatchCustomEvent(target: Element, name: string, detail: unknown, options?: Record<string, unknown>): void;
      }
    ).dispatchCustomEvent(
      document.body,
      'BeforeFutatsumeWatchInitialize',
      (window as unknown as { FutatsumeWatch: unknown }).FutatsumeWatch,
      { bubbles: true, composed: true }
    );
    (
      cssUtil as unknown as {
        addStyle(cssText: string, options?: Record<string, unknown>): void;
      }
    ).addStyle(CONSTANT.COMMON_CSS, { className: 'common' });
    initializeBySite();
    (replaceRedirectLinks as unknown as () => void)();

    await (uq as unknown as { ready(): Promise<unknown> }).ready(); // DOMContentLoaded
    const isWatch = await isWatchPage();

    const hoverMenu = (global.debug.hoverMenu = new (
      HoverMenu as unknown as new (params: { playerConfig: ConfigStore }) => { setPlayer(player: unknown): void }
    )({ playerConfig: Config }));

    await Promise.all([global.emitter.promise('lit-html'), initWorker()]);
    document.body.classList.toggle('is-watch', isWatch);
    const dialog = initializeDialogPlayer(Config);
    hoverMenu.setPlayer(dialog);

    initializeMessage(dialog);
    (WatchPageHistory as unknown as { initialize(dialog: unknown): void }).initialize(dialog);
    initializeExternal(dialog);

    if (!isWatch) {
      initializeLastSession(dialog);
    }

    (CustomElements as unknown as { initialize(): void }).initialize();
    (window as unknown as { FutatsumeWatch: { ready: boolean } }).FutatsumeWatch.ready = true;
    void global.emitter.emitAsync('ready');
    global.emitter.emitResolve('init');
    (
      domEvent as unknown as {
        dispatchCustomEvent(target: Element, name: string, detail: unknown, options?: Record<string, unknown>): void;
      }
    ).dispatchCustomEvent(
      document.body,
      'FutatsumeWatchInitialize',
      (window as unknown as { FutatsumeWatch: unknown }).FutatsumeWatch,
      { bubbles: true, composed: true }
    );
  };

  const initializeMessage = (player: InitializerDialog): void => {
    const config = Config;
    const bcast = BroadcastEmitter as unknown as InitializerBroadcastEmitter;
    /**
     * 複数ウィンドウ間
     * @param {CommandBody} cmd
     * @param {string} type
     * @param {string} sessionId
     */
    const onBroadcastMessage = (cmd: InitializerCommandBody, type: string, sessionId: string): void => {
      const isLast = player.isLastOpenedPlayer;
      const isOpen = player.isOpen;
      // window.console.log('initializeMessage.onBroadcastMessage', {cmd, isLast, isOpen, sessionId});
      const { command, params, requestId, now } = cmd;
      let result: Record<string, unknown> | undefined;
      const localNow = Date.now();

      if (command === 'hello') {
        result = { status: 'ok' };
      } else if (command === 'sendExecCommand' && (params.command === 'echo' || (isLast && isOpen))) {
        // window.console.log('execCommand', {params});
        result = player.execCommand(params.command as string, params.params);
      } else if (command === 'ping' && (params.force || (isLast && isOpen))) {
        result = { status: 'ok' };
      } else if (command === 'pong') {
        result = bcast.emitResolve('ping', params) as Record<string, unknown>;
      } else if (command === 'notifyClose' && isOpen) {
        void player.refreshLastPlayerId();
        return;
      } else if (command === 'notifyOpen') {
        config.refresh('lastPlayerId');
        return;
      } else if (command === 'pushHistory') {
        const { path, title } = params;
        (WatchPageHistory as unknown as InitializerWatchPageHistory).pushHistoryAgency(path as string, title as string);
      } else if (command === 'openVideo' && isLast) {
        const { watchId, query, eventType } = params;
        player.open(watchId as string, { autoCloseFullScreen: false, query, eventType });
      } else if (command === 'messageResult') {
        if (bcast.hasPromise(params.sessionId as string)) {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          params.status === 'ok'
            ? bcast.emitResolve(params.sessionId as string, params)
            : bcast.emitReject(params.sessionId as string, params);
        }
        return;
      } else {
        return;
      }

      result = result || { status: 'ok' };
      Object.assign(result, {
        playerId: player.getId(),
        title: document.title,
        url: location.href,
        windowId: bcast.windowId,
        sessionId,
        isLast,
        isOpen,
        requestId,
        now: localNow,
        time: localNow - now,
      });
      bcast.sendMessage({ command: 'messageResult', params: result });
    };
    /**
     * 親子ウィンドウ間
     * @param {CommandBody} cmd
     * @param {string} type
     * @param {string} sessionId
     */
    const onWindowMessage = (cmd: InitializerCommandBody): void => {
      const { command, params } = cmd;
      const watchId = cmd.watchId || params.watchId; // 互換のため冗長
      // window.console.log('initializeMessage.onWindowMessage', {message: cmd, type, sessionId});

      if (watchId && command === 'open') {
        player.open(watchId as string, { economy: Config.props.forceEconomy });
      } else if (watchId && command === 'send') {
        void bcast.sendExecCommand({ command: 'openVideo', params: watchId });
      }
    };
    /**
     * @param {CommandBody} cmd
     * @param {string} type
     * @param {string} sessionId
     */
    bcast.on('message', (message, type, sessionId) => {
      return type === 'broadcast' ? onBroadcastMessage(message, type, sessionId) : onWindowMessage(message);
    });

    player.on('close', () => bcast.notifyClose());
    player.on('open', () => bcast.notifyOpen());
  };

  const initializeExternal = (dialog: InitializerDialog): void => {
    const command = (command: string, param?: unknown): { status: string } => dialog.execCommand(command, param);

    const open = (watchId: string, params?: unknown): unknown => dialog.open(watchId, params);

    // 最後にFutatsumeWatchを開いたタブに送る
    const send = (watchId: string, params?: unknown): void => {
      (BroadcastEmitter as unknown as InitializerBroadcastEmitter).sendOpen(watchId, params);
    };

    // 最後にFutatsumeWatchを開いたタブに送る
    // なかったら同じタブで開く. 一見万能だが、pingを投げる都合上ワンテンポ遅れる。
    const sendOrOpen = (watchId: string, params?: unknown): unknown => {
      if (dialog.isLastOpenedPlayer) {
        open(watchId, params);
      } else {
        return (BroadcastEmitter as unknown as InitializerBroadcastEmitter).ping().then(
          () => send(watchId, params),
          () => open(watchId, params)
        );
      }
    };

    const importPlaylist = (data: unknown): unknown => PlaylistSession.save(data);

    const exportPlaylist = (): unknown => PlaylistSession.restore() || {};

    const sendExecCommand = (command: string, params?: unknown): Promise<unknown> =>
      (BroadcastEmitter as unknown as InitializerBroadcastEmitter).sendExecCommand({ command, params });

    const sendOrExecCommand = (command: string, params?: unknown): Promise<unknown> => {
      return (BroadcastEmitter as unknown as InitializerBroadcastEmitter).ping().then(
        () => sendExecCommand(command, params),
        () => dialog.execCommand(command, params)
      );
    };

    const playlistAdd = (watchId: string): Promise<unknown> => sendOrExecCommand('playlistAdd', watchId);

    const insertPlaylist = (watchId: string): Promise<unknown> => sendOrExecCommand('playlistInsert', watchId);

    const deflistAdd = ({
      watchId,
      description,
      token,
    }: {
      watchId: string;
      description?: string;
      token?: string;
    }): Promise<unknown> => {
      const mylistApiLoader = FutatsumeWatch.api.MylistApiLoader as InitializerMylistApiLoader;
      if (token) {
        mylistApiLoader.setCsrfToken(token);
      }
      return mylistApiLoader.addDeflistItem(watchId, description);
    };

    const deflistRemove = ({ watchId, token }: { watchId: string; token?: string }): Promise<unknown> => {
      const mylistApiLoader = FutatsumeWatch.api.MylistApiLoader as InitializerMylistApiLoader;
      if (token) {
        mylistApiLoader.setCsrfToken(token);
      }
      return mylistApiLoader.removeDeflistItem(watchId);
    };

    const echo = (msg = 'こんにちはこんにちは！'): Promise<unknown> => sendExecCommand('echo', msg);

    Object.assign(FutatsumeWatch.external, {
      execCommand: command,
      sendExecCommand,
      sendOrExecCommand,
      open,
      send,
      sendOrOpen,
      deflistAdd,
      deflistRemove,
      hello: (BroadcastEmitter as unknown as InitializerBroadcastEmitter).hello,
      ping: (BroadcastEmitter as unknown as InitializerBroadcastEmitter).ping,
      echo,
      playlist: {
        add: playlistAdd,
        insert: insertPlaylist,
        import: importPlaylist,
        export: exportPlaylist,
      },
    });
    Object.assign(FutatsumeWatch.debug, {
      dialog,
      getFrameBodies: () => {
        return Array.from(document.querySelectorAll('.futatsumePlayerContainer iframe')).map(
          (f) => (f as HTMLIFrameElement).contentWindow!.document.body
        );
      },
    });
    if (FutatsumeWatch !== (window as unknown as { FutatsumeWatch: unknown }).FutatsumeWatch) {
      (window as unknown as { FutatsumeWatch: { external: Record<string, unknown> } }).FutatsumeWatch.external = {
        open,
        sendOrOpen,
        sendOrExecCommand,
        hello: (BroadcastEmitter as unknown as InitializerBroadcastEmitter).hello,
        ping: (BroadcastEmitter as unknown as InitializerBroadcastEmitter).ping,
        echo,
        playlist: {
          add: playlistAdd,
          insert: insertPlaylist,
        },
      };
    }
  };

  const initializeLastSession = (dialog: InitializerDialog): void => {
    window.addEventListener(
      'beforeunload',
      () => {
        if (!dialog.isOpen) {
          return;
        }
        (PlayerSession as unknown as InitializerPlayerSession).save(dialog.playingStatus);
        dialog.close();
      },
      { passive: true }
    );
    (PlayerSession as unknown as InitializerPlayerSession).init(sessionStorage);
    const lastSession = (PlayerSession as unknown as InitializerPlayerSession).restore() as InitializerLastSession;
    const screenMode = Config.props.screenMode;
    if (
      lastSession.playing &&
      (screenMode === 'small' || screenMode === 'sideView' || location.href === lastSession.url)
    ) {
      lastSession.eventType = 'session';
      dialog.open(lastSession.watchId as string, lastSession);
    } else {
      (PlayerSession as unknown as InitializerPlayerSession).clear();
    }
  };

  const initializeBySite = (): void => {
    const hostClass = location.host.replace(/^.*\.slack\.com$/, 'slack.com').replace(/\./g, '-');
    document.body.dataset.domain = hostClass;
    util.StyleSwitcher.update({ on: `style.domain.${hostClass}` });
  };

  const initializeDialogPlayer = (config: ConfigStore, offScreenLayer?: unknown): InitializerDialog => {
    const playerConfig = PlayerConfig.getInstance(config) as ConfigStore;
    const state = PlayerState.getInstance(playerConfig);
    FutatsumeWatch.state.player = state;
    const dialog = new (
      NicoVideoPlayerDialog as unknown as new (params: {
        offScreenLayer: unknown;
        config: ConfigStore;
        state: PlayerState;
      }) => InitializerDialog
    )({
      offScreenLayer,
      config: playerConfig,
      state,
    });
    RootDispatcher.initialize(dialog);
    return dialog;
  };

  return { initialize, initializeExternal, initializeMessage, initializeLastSession };
})();

//===END===

export { initialize, initializeExternal, initializeMessage, initializeLastSession };
