import _ from 'lodash';
import { nicoUtil } from '../../../lib/src/nico/nicoUtil';
import { PRODUCT } from '../../../../src/FutatsumeWatchIndex';

interface NicoUtilLike {
  isGinzaWatchUrl(url: string): boolean;
}

interface VideoInfoOwner {
  name: string;
}

interface VideoInfoEvent {
  watchId: string;
  title: string;
  owner: VideoInfoOwner;
}

interface HistoryDialog {
  on(name: string, handler: (...args: unknown[]) => void): void;
  close(): void;
}

import { NicoVideoApi } from '../../../lib/src/nico/NicoVideoApi';

//===BEGIN===
/**
 *  pushStateを使ってブラウザバックの履歴に載せようと思ったけど、
 *  あらゆるページに寄生するシステムの都合上断念。
 *  とりあえず既読リンクの色が変わるようにだけする
 */
const WatchPageHistory = (() => {
  if (!window || !window.location) {
    return {
      initialize: () => {},
      pushHistory: () => {},
      pushHistoryAgency: () => {},
    };
  }

  let originalUrl = window && window.location && window.location.href;
  let originalTitle = window && window.document && window.document.title;
  let isOpen = false;
  let dialog: HistoryDialog | undefined;
  let watchId: unknown;
  let path: string | null;
  let title: string | null;

  const replaceHistoryState = (url: string | null): void => {
    history.replaceState(history.state, '', url);
  };

  const restore = (): void => {
    replaceHistoryState(originalUrl);
    document.title = (isOpen ? '📺' : '') + originalTitle.replace(/^📺/, '');
    bouncedRestore.cancel();
  };
  const bouncedRestore = _.debounce(restore, 30000);

  const pushHistory = (path: string, title: string): void => {
    const util = nicoUtil as unknown as NicoUtilLike;
    if (util.isGinzaWatchUrl(originalUrl)) {
      originalUrl = location.href;
      originalTitle = document.title;
    }
    replaceHistoryState(path);
    document.title = (isOpen ? '📺' : '') + title.replace(/^📺/, '');
    bouncedRestore();
  };

  const updateOriginal = (): void => {
    originalUrl = window && window.location && window.location.href;
    originalTitle = window && window.document && window.document.title;
  };

  const onVideoInfoLoad = _.debounce(({ watchId, title, owner: { name } }: VideoInfoEvent) => {
    if (!watchId || !isOpen) {
      return;
    }
    title = `${title} by ${name} - ${PRODUCT}`;
    path = `/watch/${watchId}`;

    if (location.host === 'www.nicovideo.jp') {
      return pushHistory(path, title);
    }
    if (NicoVideoApi && NicoVideoApi.pushHistory) {
      return NicoVideoApi.pushHistory(path, title);
    }
  });

  const onDialogOpen = (): void => {
    updateOriginal();
    isOpen = true;
  };

  const onDialogClose = (): void => {
    isOpen = false;
    watchId = title = path = null;
    replaceHistoryState(originalUrl);
    document.title = originalTitle;
  };

  const initialize = (_dialog: HistoryDialog): void => {
    if (dialog) {
      return;
    }
    dialog = _dialog;

    if (location.host === 'www.nicovideo.jp') {
      dialog.on('close', onDialogClose);
    }
    dialog.on('open', onDialogOpen);
    dialog.on('loadVideoInfo', (info: unknown) => onVideoInfoLoad(info as VideoInfoEvent));

    if (location.host !== 'www.nicovideo.jp') {
      return;
    }
    window.addEventListener('popstate', () => {
      // 戻る/進む先を、開く前のURLや遅延したrestoreで上書きしない。
      bouncedRestore.cancel();
      onVideoInfoLoad.cancel();
      updateOriginal();
      if (isOpen) dialog?.close();
    });
    window.addEventListener(
      'beforeunload',
      () => {
        if (isOpen) {
          restore();
        }
      },
      { passive: true }
    );
    window.addEventListener(
      'error',
      () => {
        if (isOpen) {
          restore();
        }
      },
      { passive: true }
    );
    window.addEventListener('unhandledrejection', updateOriginal, { passive: true });
  };
  // www.nicovideo.jp 以外で開いた時、
  // www.nicovideo.jp 配下のタブがあったら代わりに既読リンクの色を変える
  const pushHistoryAgency = async (path: string, title: string): Promise<void> => {
    if (!navigator || !navigator.locks) {
      pushHistory(path, title);
      bouncedRestore.cancel();
      await new Promise((r) => setTimeout(r, 3000));
      return restore();
    }
    const lastTitle = document.title;
    const lastUrl = location.href;
    // どれかひとつのタブで動けばいい
    await navigator.locks.request('pushHistoryAgency', { ifAvailable: true }, async (lock) => {
      if (!lock) {
        return;
      }
      history.replaceState(null, title, path);
      await new Promise((r) => setTimeout(r, 3000));
      history.replaceState(null, lastTitle, lastUrl);
      await new Promise((r) => setTimeout(r, 10000));
    });
  };

  return {
    initialize,
    pushHistory,
    pushHistoryAgency,
  };
})();
//===END===

export { WatchPageHistory };
