import { FutatsumeWatch } from '../../../../src/futatsume-watch-index';

interface HlsVideoElementFactory {
  createVideoElement?: (...args: unknown[]) => HTMLVideoElement;
}

interface WindowWithFutatsumeHls extends Window {
  FutatsumeHLS?: HlsVideoElementFactory;
}

interface FutatsumeWatchDebugLike {
  debug: {
    createVideoElement?: (...args: unknown[]) => HTMLVideoElement;
  };
}
//===BEGIN===
const createVideoElement = (...args: unknown[]): HTMLVideoElement => {
  const hlsWindow = window as unknown as WindowWithFutatsumeHls;
  if (hlsWindow.FutatsumeHLS && hlsWindow.FutatsumeHLS.createVideoElement) {
    return hlsWindow.FutatsumeHLS.createVideoElement(...args);
  }
  const futatsumeWatch = FutatsumeWatch as unknown as FutatsumeWatchDebugLike;
  if (futatsumeWatch.debug.createVideoElement) {
    return futatsumeWatch.debug.createVideoElement(...args);
  }
  return document.createElement('video');
};
//===END===
export { createVideoElement };
