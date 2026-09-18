import { ZenzaWatch } from '../../../../src/ZenzaWatchIndex';

interface HlsVideoElementFactory {
  createVideoElement?: (...args: unknown[]) => HTMLVideoElement;
}

interface WindowWithZenzaHls extends Window {
  ZenzaHLS?: HlsVideoElementFactory;
}

interface ZenzaWatchDebugLike {
  debug: {
    createVideoElement?: (...args: unknown[]) => HTMLVideoElement;
  };
}
//===BEGIN===
const createVideoElement = (...args: unknown[]): HTMLVideoElement => {
  const hlsWindow = window as unknown as WindowWithZenzaHls;
  if (hlsWindow.ZenzaHLS && hlsWindow.ZenzaHLS.createVideoElement) {
    return hlsWindow.ZenzaHLS.createVideoElement(...args);
  }
  const zenzaWatch = ZenzaWatch as unknown as ZenzaWatchDebugLike;
  if (zenzaWatch.debug.createVideoElement) {
    return zenzaWatch.debug.createVideoElement(...args);
  }
  return document.createElement('video');
};
//===END===
export { createVideoElement };
