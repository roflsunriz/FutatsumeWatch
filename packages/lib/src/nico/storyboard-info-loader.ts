import { VideoSessionWorker } from './video-session-worker';

interface StoryboardVideoInfo {
  hasDomandStoryboard?: boolean;
  toJSON: () => unknown;
}

interface StoryboardInfoLoaderApi {
  load: (videoInfo: StoryboardVideoInfo) => Promise<unknown>;
}
//===BEGIN===

const StoryboardInfoLoader: StoryboardInfoLoaderApi = {
  load: (videoInfo: StoryboardVideoInfo) => {
    if (videoInfo.hasDomandStoryboard) {
      return VideoSessionWorker.storyboard({ info: videoInfo });
    }

    return Promise.reject(new Error('Domand storyboard api not exist'));
  },
};

//===END===
//
export { StoryboardInfoLoader };
