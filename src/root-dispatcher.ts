import { FutatsumeWatch, PRODUCT } from './futatsume-watch-index';
import { PopupMessage } from './util';
import { PlayerConfig } from './nico-video-player-dialog';
import type { ConfigStore } from './config';
import { Clipboard } from '../packages/lib/src/dom/clipboard';
import { nicoUtil } from '../packages/lib/src/nico/nico-util';

interface RootPlayerConfig {
  props: Record<string, unknown>;
  on(event: string, listener: (key: string, value: unknown) => void): unknown;
  exportToFile(): void;
}

interface RootPlayerVideoInfo {
  watchUrl: string;
}

interface RootPlayerState {
  videoInfo: RootPlayerVideoInfo;
  isEnableFilter: boolean;
  isBackComment: boolean;
  isShowComment: boolean;
  isLoop: boolean;
  isMute: boolean;
  isDebug: boolean;
  [key: string]: unknown;
}

interface RootPlayer {
  on(event: string, listener: (command: string, params?: unknown) => unknown): unknown;
}

interface RootPopupMessage {
  notify(message: unknown, html?: boolean): void;
  alert(message: unknown, html?: boolean): void;
}

interface RootClipboard {
  copyText(text: string): unknown;
}
//===BEGIN===
const RootDispatcher = (() => {
  let config!: RootPlayerConfig;
  let player!: RootPlayer;
  let playerState!: RootPlayerState;
  class RootDispatcher {
    static initialize(dialog: RootPlayer): void {
      player = dialog;
      playerState = FutatsumeWatch.state.player as RootPlayerState;
      config = PlayerConfig.getInstance(config as unknown as ConfigStore) as RootPlayerConfig;
      config.on('update', RootDispatcher.onConfigUpdate);
      player.on('command', RootDispatcher.execCommand);
    }

    static execCommand(this: void, command: string, params?: unknown): { status: string } {
      const result = { status: 'ok' };
      switch (command) {
        case 'notifyHtml':
          (PopupMessage as RootPopupMessage).notify(params, true);
          break;
        case 'notify':
          (PopupMessage as RootPopupMessage).notify(params);
          break;
        case 'alert':
          (PopupMessage as RootPopupMessage).alert(params);
          break;
        case 'alertHtml':
          (PopupMessage as RootPopupMessage).alert(params, true);
          break;
        case 'copy-video-watch-url':
          (Clipboard as unknown as RootClipboard).copyText(playerState.videoInfo.watchUrl);
          break;
        case 'tweet':
          (nicoUtil.openTweetWindow as unknown as (info: RootPlayerVideoInfo) => void)(playerState.videoInfo);
          break;
        case 'export-config':
          config.exportToFile();
          break;
        case 'toggleConfig': {
          config.props[params as string] = !config.props[params as string];
          break;
        }
        case 'picture-in-picture':
          void document.querySelector<HTMLVideoElement>('.futatsumeWatchVideoElement')!.requestPictureInPicture();
          break;
        case 'toggle-comment':
        case 'toggle-showComment':
        case 'toggle-backComment':
        case 'toggle-mute':
        case 'toggle-loop':
        case 'toggle-debug':
        case 'toggle-enableFilter':
        case 'toggle-enableNicosJumpVideo':
        case 'toggle-useWellKnownPort':
        case 'toggle-bestFutatsumeTube':
        case 'toggle-autoCommentSpeedRate':
        case 'toggle-video.hls.enableOnlyRequired':
          command = command.replace(/^toggle-/, '');
          config.props[command] = !config.props[command];
          break;
        case 'baseFontFamily':
        case 'baseChatScale':
        case 'enableFilter':
        case 'update-enableFilter':
        case 'screenMode':
        case 'update-screenMode':
        case 'update-sharedNgLevel':
        case 'update-commentSpeedRate':
        case 'update-fullscreenControlBarMode':
          command = command.replace(/^update-/, '');
          if (config.props[command] === params) {
            break;
          }
          config.props[command] = params;
          break;

        case 'nop':
          break;
        case 'echo':
          console.log('%cECHO', 'font-weight: bold;', { params });
          (PopupMessage as RootPopupMessage).notify(
            `ECHO: 「${typeof params === 'string' ? params : JSON.stringify(params)}」`
          );
          break;
        default:
          FutatsumeWatch.emitter.emit(`command-${command}`, command, params);
          window.dispatchEvent(new CustomEvent(`${PRODUCT}-command`, { detail: { command, params, param: params } }));
      }
      return result;
    }

    static onConfigUpdate(this: void, key: string, value: unknown): void {
      switch (key) {
        case 'enableFilter':
          playerState.isEnableFilter = value as boolean;
          break;
        case 'backComment':
          playerState.isBackComment = !!value;
          break;
        case 'showComment':
          playerState.isShowComment = !!value;
          break;
        case 'loop':
          playerState.isLoop = !!value;
          break;
        case 'autoPlay':
          playerState.isAutoPlay = !!value;
          break;
        case 'mute':
          playerState.isMute = !!value;
          break;
        case 'debug':
          playerState.isDebug = !!value;
          (PopupMessage as RootPopupMessage).notify('debug: ' + (value ? 'ON' : 'OFF'));
          break;
        case 'sharedNgLevel':
        case 'screenMode':
        case 'playbackRate':
          playerState[key] = value;
          break;
      }
    }
  }
  return RootDispatcher;
})();
//===END===
export { RootDispatcher };
