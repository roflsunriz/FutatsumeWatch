// import * as _ from 'lodash';
// const emitter;
import { global } from '../../../../src/FutatsumeWatchIndex';
import { ClassList } from './ClassListWrapper';

interface LegacyFullscreen {
  fullScreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  mozFullScreen?: unknown;
  webkitIsFullScreen?: unknown;
  requestFullScreen?: () => void;
  webkitRequestFullScreen?: () => void;
  mozRequestFullScreen?: () => void;
  cancelFullScreen?: () => void;
  webkitCancelFullScreen?: () => void;
  mozCancelFullScreen?: () => void;
}

interface FullscreenShape {
  now: () => boolean;
  get: () => Element | null;
  request: (target: string | Element) => void;
  cancel: () => void;
  _handleEvents: () => void;
  element?: Element | null;
  _handleEvnets?: unknown;
}
//===BEGIN===
const Fullscreen: FullscreenShape = {
  now() {
    // return matchMedia('(display-mode: fullscreen)').matches;
    const doc = document as unknown as LegacyFullscreen;
    if (doc.fullScreenElement || doc.mozFullScreen || doc.webkitIsFullScreen) {
      return true;
    }
    return false;
  },
  get() {
    const doc = document as unknown as LegacyFullscreen;
    return doc.fullScreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || null;
  },
  request(target) {
    this._handleEvents();
    const elm = typeof target === 'string' ? document.getElementById(target) : target;
    if (!elm) {
      return;
    }
    const legacyElm = elm as unknown as LegacyFullscreen;
    if (legacyElm.requestFullScreen) {
      legacyElm.requestFullScreen();
    } else if (legacyElm.webkitRequestFullScreen) {
      legacyElm.webkitRequestFullScreen();
    } else if (legacyElm.mozRequestFullScreen) {
      legacyElm.mozRequestFullScreen();
    }
  },
  cancel() {
    if (!this.now()) {
      return;
    }

    const doc = document as unknown as LegacyFullscreen;
    if (doc.cancelFullScreen) {
      doc.cancelFullScreen();
    } else if (doc.webkitCancelFullScreen) {
      doc.webkitCancelFullScreen();
    } else if (doc.mozCancelFullScreen) {
      doc.mozCancelFullScreen();
    }
  },
  _handleEvents() {
    // _.noop は this を使わないため unbind のまま保持する
    // eslint-disable-next-line @typescript-eslint/unbound-method
    this._handleEvnets = _.noop;
    const cl = ClassList(document.body);
    const handle = (ev: Event) => {
      ev.stopImmediatePropagation();
      const isFull = this.now();
      cl.toggle('is-fullscreen', isFull);
      (global as { emitter: { emit: (...args: unknown[]) => unknown } }).emitter.emit('fullscreenStatusChange', isFull);
    };
    document.addEventListener('webkitfullscreenchange', handle, true);
    document.addEventListener('mozfullscreenchange', handle, true);
    document.addEventListener('MSFullscreenChange', handle, true);
    document.addEventListener('fullscreenchange', handle, true);
  },
};

//===END===

export { Fullscreen };
export type { FullscreenShape };
