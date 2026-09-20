import { VideoSessionWorker } from './VideoSessionWorker';

interface StoryboardVideoInfo {
  hasDomandStoryboard?: boolean;
  hasDmcStoryboard?: boolean;
  toJSON: () => unknown;
}

interface StoryboardInfoLoaderApi {
  load: (serverType: string, videoInfo: StoryboardVideoInfo) => Promise<unknown>;
}
//===BEGIN===

const StoryboardInfoLoader: StoryboardInfoLoaderApi = {
  load: (serverType: string, videoInfo: StoryboardVideoInfo) => {
    if (serverType === 'domand' && videoInfo.hasDomandStoryboard) {
      return VideoSessionWorker.storyboard({ type: 'domand', info: videoInfo });
    }
    if (serverType === 'dmc' && videoInfo.hasDmcStoryboard) {
      return VideoSessionWorker.storyboard({ type: 'dmc', info: videoInfo });
    }

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 旧実装は文字列でrejectする契約のため維持する
    return Promise.reject('smile storyboard api not exist');
  },
};

//===END===
//
export { StoryboardInfoLoader };
