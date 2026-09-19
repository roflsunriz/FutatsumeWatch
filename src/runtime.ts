import './player-layout.css';
import { FutatsumeWatch, global } from './FutatsumeWatchIndex';
import { Config } from './Config';
import { util } from './util';
import * as loaders from '../packages/lib/src/nico/loader';
import { workerUtil } from '../packages/lib/src/infra/workerUtil';
import { netUtil } from '../packages/lib/src/infra/netUtil';
import { WatchInfoCacheDb } from '../packages/lib/src/nico/WatchInfoCacheDb';
import { StoryboardCacheDb } from '../packages/lib/src/nico/StoryboardCacheDb';
import { initialize } from './initializer';
import { components } from '../packages/components/src';
import { initCssProps } from '../packages/zenza/src/init/inintCssProps';
import { dll } from '../packages/components/src/dll';
import { GateAPI } from '../packages/lib/src/nico/GateAPI';
import { initializeHls } from './_hls';
import lodash from 'lodash';
import { uQuery } from '../packages/lib/src/uQuery';
import { StoryboardInfoLoader } from '../packages/lib/src/nico/StoryboardInfoLoader';
import { NicoSearchApiV2Loader } from '../packages/lib/src/nico/VideoSearch';
import { TextLabel } from '../packages/lib/src/ui/TextLabel';
import { WindowResizeObserver } from '../packages/lib/src/infra/Observable';
import { cssUtil } from '../packages/lib/src/css/css';
import { installWatchEntry } from './watch-entry';

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
  Object.assign(window, { FutatsumeWatch, ZenzaWatch: FutatsumeWatch });
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
  installWatchEntry((watchId) => (FutatsumeWatch.external.open as (id: string) => unknown)(watchId));
}
