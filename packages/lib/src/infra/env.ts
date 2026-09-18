interface Env {
  hasFlashPlayer: () => boolean;
  isEdgePC: () => boolean;
  isFirefox: () => boolean;
  isWebkit: () => boolean;
  isChrome: () => boolean;
}

// import {browser} from './browser';

//===BEGIN===
const env: Env = {
  hasFlashPlayer() {
    return !!(navigator.mimeTypes as unknown as Record<string, unknown>)['application/x-shockwave-flash'];
  },
  isEdgePC() {
    return navigator.userAgent.toLowerCase().includes('edge');
  },
  isFirefox() {
    return navigator.userAgent.toLowerCase().includes('firefox');
  },
  isWebkit() {
    return !this.isEdgePC() && navigator.userAgent.toLowerCase().includes('webkit');
  },
  isChrome() {
    return !this.isEdgePC() && navigator.userAgent.toLowerCase().includes('chrome');
  },
};

//===END===
export { env };
export type { Env };
