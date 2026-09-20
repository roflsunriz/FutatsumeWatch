import './player-layout.css';
import { FutatsumeWatch, global } from './futatsume-watch-index';
import { Config } from './config';
import { util } from './util';
import * as loaders from '../packages/lib/src/nico/loader';
import { workerUtil } from '../packages/lib/src/infra/worker-util';
import { netUtil } from '../packages/lib/src/infra/net-util';
import { WatchInfoCacheDb } from '../packages/lib/src/nico/watch-info-cache-db';
import { StoryboardCacheDb } from '../packages/lib/src/nico/storyboard-cache-db';
import { initialize } from './initializer';
import { components } from '../packages/components/src';
import { initCssProps } from '../packages/futatsume/src/init/init-css-props';
import { dll } from '../packages/components/src/dll';
import { GateAPI } from '../packages/lib/src/nico/gate-api';
import { initializeHls } from './hls';
import lodash from 'lodash';
import { uQuery } from '../packages/lib/src/u-query';
import { StoryboardInfoLoader } from '../packages/lib/src/nico/storyboard-info-loader';
import { NicoSearchApiV2Loader } from '../packages/lib/src/nico/video-search';
import { TextLabel } from '../packages/lib/src/ui/text-label';
import { WindowResizeObserver } from '../packages/lib/src/infra/observable';
import { cssUtil } from '../packages/lib/src/css/css';

export function openVideo(watchId: string): unknown {
  return (FutatsumeWatch.external.open as (id: string) => unknown)(watchId);
}

export async function startPlayer(): Promise<void> {
  if (window !== window.top) {
    if (location.pathname === '/robots.txt' && window.name.startsWith('nicovideoApi')) GateAPI.nicovideo();
    else if (/^smile-.*\.nicovideo\.jp$/.test(location.host)) GateAPI.smile();
    else if (location.host === 'api.search.nicovideo.jp' && window.name.startsWith('searchApi')) GateAPI.search();
    else if (
      location.host === 'ext.nicovideo.jp' &&
      window.name.startsWith('thumbInfo') &&
      !window.name.startsWith('thumbInfoMylistPocket')
    )
      await GateAPI.thumbInfo();
    return;
  }
  Object.assign(window, { FutatsumeWatch });
  Object.assign(FutatsumeWatch.util, util);
  Object.assign(FutatsumeWatch.api, loaders);
  Object.assign(FutatsumeWatch.api, { StoryboardInfoLoader, NicoSearchApiV2Loader });
  Object.assign(FutatsumeWatch.lib, { $: uQuery, _: lodash });
  Object.assign(FutatsumeWatch.debug, { WatchInfoCacheDb, StoryboardCacheDb });
  FutatsumeWatch.modules.TextLabel = TextLabel;
  Object.assign(FutatsumeWatch.init, {
    playlistApiLoader: loaders.PlaylistApiLoader,
    mylistApiLoader: loaders.MylistApiLoader,
  });
  FutatsumeWatch.config = Config;
  workerUtil.env({ netUtil, global });
  WatchInfoCacheDb.api(loaders.NicoVideoApi);
  StoryboardCacheDb.api(loaders.NicoVideoApi);
  void components;
  initCssProps();
  WindowResizeObserver.subscribe((value) => {
    const { width, height } = value as { width: number; height: number };
    global.innerWidth = width;
    global.innerHeight = height;
    void cssUtil.setProps(
      [document.documentElement, '--inner-width', cssUtil.number(width)],
      [document.documentElement, '--inner-height', cssUtil.number(height)]
    );
  });
  await initializeHls();
  global.emitter.emitResolve('lit-html', dll.lit);
  if (location.hostname !== 'www.nicovideo.jp') await loaders.NicoVideoApi.configBridge(Config);
  await initialize();
}
