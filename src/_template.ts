// ==UserScript==
// @name           FutatsumeWatch
// @namespace      https://github.com/roflsunriz/FutatsumeWatch/
// @description    ニコニコ動画の速くて軽い動画プレイヤー
// @match          *://www.nicovideo.jp/*
// @match          *://ext.nicovideo.jp/
// @match          *://ext.nicovideo.jp/#*
// @match          *://blog.nicovideo.jp/*
// @match          *://ch.nicovideo.jp/*
// @match          *://com.nicovideo.jp/*
// @match          *://commons.nicovideo.jp/*
// @match          *://dic.nicovideo.jp/*
// @match          *://ex.nicovideo.jp/*
// @match          *://info.nicovideo.jp/*
// @match          *://search.nicovideo.jp/*
// @match          *://uad.nicovideo.jp/*
// @match          *://api.search.nicovideo.jp/*
// @match          *://*.nicovideo.jp/smile*
// @match          *://site.nicovideo.jp/*
// @match          *://anime.nicovideo.jp/*
// @match          https://www.upload.nicovideo.jp/niconico-garage/video/*
// @match          https://www.google.co.jp/search*
// @match          https://www.google.com/search*
// @match          https://*.bing.com/search*
// @match          https://feedly.com/*
// @exclude        *://ads.nicovideo.jp/*
// @exclude        *://www.nicovideo.jp/watch/*?edit=*
// @exclude        *://ch.nicovideo.jp/tool/*
// @exclude        *://flapi.nicovideo.jp/*
// @exclude        *://dic.nicovideo.jp/p/*
// @exclude        *://ext.nicovideo.jp/thumb/*
// @exclude        *://ext.nicovideo.jp/thumb_channel/*
// @grant          none
// @author         segabito
// @version        2.6.3-fix-playlist.53
// @run-at         document-body
// @require        https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.11/lodash.min.js
// ==/UserScript==
import { AntiPrototypeJs } from '../packages/lib/src/infra/AntiPrototype-js';
import { Emitter, Handler, EmitterInitFunc, PromiseHandler } from '../packages/lib/src/Emitter';
import { Config, NaviConfig } from './Config';
import { uQuery, uq } from '../packages/lib/src/uQuery';
import { util } from './util';
import { components } from '../packages/components/src/index';
import { BaseState as State } from './State';
import { VideoInfoLoader } from '../packages/lib/src/nico/loader';
import {
  ThumbInfoLoader,
  PlaylistApiLoader,
  MylistApiLoader,
  CacheStorage,
  CrossDomainGate,
  IchibaLoader,
  UaaLoader,
  PlaybackPosition,
  NicoVideoApi,
  RecommendAPILoader,
  NVWatchCaller,
  CommonsTreeLoader,
  NicoRssLoader,
  MatrixRankingLoader,
} from '../packages/lib/src/nico/loader';
import { VideoInfoModel } from './VideoInfo';
import { NicoSearchApiV2Loader as VideoSearch, NicoSearchApiV2Loader } from '../packages/lib/src/nico/VideoSearch';
import { TagEditApi } from '../packages/lib/src/nico/TagEditApi';
import { StoryboardInfoLoader } from '../packages/lib/src/nico/StoryboardInfoLoader';
import { ThreadLoader } from '../packages/lib/src/nico/ThreadLoader';
import { workerUtil } from '../packages/lib/src/infra/workerUtil';
import { IndexedDbStorage } from '../packages/lib/src/infra/IndexedDbStorage';
import { GateAPI } from '../packages/lib/src/nico/GateAPI';
import { boot } from './boot';
import { YouTubeWrapper } from '../packages/zenza/src/videoPlayer/YouTubeWrapper';
import { NicoVideoPlayer } from './NicoVideoPlayer';
import { StoryboardModel as StoryBoardModel } from './StoryBoard';
import { VideoControlBar } from './VideoControlBar';
import { NicoTextParser } from '../packages/zenza/src/commentLayer/NicoTextParser';
import { NicoCommentPlayer as CommentPlayer } from './CommentPlayer';
import { CommentLayoutWorker } from '../packages/zenza/src/commentLayer/CommentLayoutWorker';
import { SlotLayoutWorker } from '../packages/zenza/src/commentLayer/SlotLayoutWorker';
import { NicoScripter } from '../packages/zenza/src/commentLayer/NicoScripter';
import { CommentPanel } from './CommentPanel';
import { PlayList } from '../packages/zenza/src/Playlist/PlayList';
import { VideoSessionWorker } from '../packages/lib/src/nico/VideoSessionWorker';
import { StoryboardCacheDb } from '../packages/lib/src/nico/StoryboardCacheDb';
import { NicoVideoPlayerDialog } from './NicoVideoPlayerDialog';
import { RootDispatcher } from './RootDispatcher';
import { CommentInputPanel } from './CommentInputPanel';
// import {SettingPanel} from './SettingPanel';
import { TagListView } from './TagListView';
import { VideoInfoPanel } from './VideoInfoPanel';
import { initializeGinzaSlayer as GinzaSlayer } from './GinzaSlayer';
import { initialize } from './initializer';
import { CustomElements } from '../packages/zenza/src/parts/CustomElements';
import { CONSTANT } from './constant';
import { TextLabel } from '../packages/lib/src/ui/TextLabel';
import { parseThumbInfo } from '../packages/lib/src/nico/parseThumbInfo';
import { WatchInfoCacheDb } from '../packages/lib/src/nico/WatchInfoCacheDb';
import { ENV, VER } from './FutatsumeWatchIndex';
import { nicoUtil } from '../packages/lib/src/nico/nicoUtil';
import { netUtil } from '../packages/lib/src/infra/netUtil';
import { initCssProps } from '../packages/zenza/src/init/inintCssProps';
import { WindowResizeObserver } from '../packages/lib/src/infra/Observable';
import { dimport } from '../packages/lib/src/infra/dimport';
import { MediaTimeline } from '../packages/lib/src/dom/MediaTimeline';
import { cssUtil } from '../packages/lib/src/css/css';
import { ClassList } from '../packages/lib/src/dom/ClassListWrapper';
import { domUtil } from '../packages/lib/src/dom/domUtil';
//@require AntiPrototypeJs
(AntiPrototypeJs as unknown as () => void)();
(() => {
  try {
    if (window.top === window) {
      (window as unknown as Record<string, unknown>).ZenzaLib = { _ };
      console.log('@require', JSON.stringify({ lodash: _.VERSION }));
    }
  } catch (e) {
    if (window.top === window) {
      console.warn('@require failed!', location, e);
    }
  }
})();

interface TemplateZenzaWatchEmitter {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  emitResolve(event: string, ...args: unknown[]): unknown;
  promise(event: string, ...args: unknown[]): Promise<unknown>;
}

interface TemplateZenzaWatch {
  version: string;
  env: string;
  debug: Record<string, unknown>;
  api: Record<string, unknown>;
  init: Record<string, unknown>;
  lib: Record<string, unknown>;
  external: Record<string, unknown>;
  util: Record<string, unknown>;
  modules: Record<string, unknown>;
  config: unknown;
  emitter: TemplateZenzaWatchEmitter;
  state: Record<string, unknown>;
  dll: Record<string, unknown>;
}

interface TemplateMonkeyWindow {
  PureArray?: typeof Array;
  ZenzaJQuery?: unknown;
  jQuery?: unknown;
  ZenzaLib?: { _: unknown; $: unknown };
  ZenzaWatch?: unknown;
  Navi?: unknown;
}

(function (window: Window) {
  const self = window;
  const document = window.document;
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  ('use strict');
  const PRODUCT = 'ZenzaWatch';
  // 公式プレイヤーがurlを書き換えてしまうので読み込んでおく
  const START_PAGE_QUERY = location.search ? location.search.substring(1) : '';
  const monkey = async (PRODUCT: string, START_PAGE_QUERY: string): Promise<void> /*** (｀・ω・´)9m ***/ => {
    const templateWindow = window as unknown as TemplateMonkeyWindow;
    const Array = templateWindow.PureArray
      ? templateWindow.PureArray
      : (
          window as unknown as {
            Array: typeof globalThis.Array;
          }
        ).Array;
    const console = (window as unknown as { console: Console }).console;
    const $ = templateWindow.ZenzaJQuery || templateWindow.jQuery;
    const _ = templateWindow.ZenzaLib ? templateWindow.ZenzaLib._ : (window as unknown as { _: unknown })._;
    const TOKEN = 'r:' + Math.random();
    const CONFIG = null;
    const NICORU =
      'data:image/png;base64,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';
    const dll: Record<string, unknown> = {};
    const util: Record<string, unknown> = {};
    const {
      dimport,
      workerUtil,
      IndexedDbStorage,
      Handler,
      PromiseHandler,
      Emitter,
      parseThumbInfo,
      WatchInfoCacheDb,
      StoryboardCacheDb,
      VideoSessionWorker,
    } = templateWindow.ZenzaLib as unknown as Record<string, unknown>;
    void decodeURIComponent(START_PAGE_QUERY);

    //@version
    //@environment

    console.log(
      `%c${PRODUCT}@${ENV} v${VER}%c  (ﾟ∀ﾟ) ｾﾞﾝｻﾞ!  %cNicorü? %c田%c \n\nplatform: ${navigator.platform}\nua: ${navigator.userAgent}`,
      'font-family: Chalkduster; font-size: 200%; background: #039393; color: #ffc; padding: 8px; text-shadow: 2px 2px #888;',
      '',
      'font-family: "Chalkboard SE", Chalkduster,HeadLineA; font-size: 24px;',
      'display: inline-block; font-size: 24px; color: transparent; background-repeat: no-repeat; background-position: center; background-size: contain;' +
        `background-image: url(${NICORU});`,
      'line-height: 1.25; font-weight: bold; '
    );
    (console as unknown as { nicoru: unknown }).nicoru = console.log.bind(
      console,
      '%c　 ',
      'display: inline-block; font-size: 120%; color: transparent; background-repeat: no-repeat; background-position: center; background-size: contain;' +
        `background-image: url(${NICORU})`
    );

    //@require Config
    await Config.promise('restore');
    //@require uQuery

    const ZenzaWatch: TemplateZenzaWatch = {
      version: VER,
      env: ENV,
      debug: { WatchInfoCacheDb, StoryboardCacheDb },
      api: {},
      init: {},
      lib: { $: templateWindow.ZenzaLib!.$ || $, _ },
      external: {},
      util,
      modules: { Emitter, Handler },
      config: Config,
      emitter: new (Emitter as new () => TemplateZenzaWatchEmitter)(),
      state: {},
      dll,
    };
    void Promise.all([
      //https://esm.run/lit@2.0.2/html.js
      (dimport as (url: string) => Promise<unknown>)('https://esm.run/lit@2.0.2/html.js'),
      (dimport as (url: string) => Promise<unknown>)('https://esm.run/lit@2.0.2/directives/repeat'),
      (dimport as (url: string) => Promise<unknown>)('https://esm.run/lit@2.0.2/directives/class-map'),
    ]).then(([lit, ...directives]) => {
      dll.lit = lit;
      dll.directives = Object.assign({}, ...directives);
      emitter.emitResolve('lit-html', dll.lit);
    });

    const Navi = {
      version: VER,
      env: ENV,
      debug: {},
      config: NaviConfig,
      emitter: new (Emitter as new () => TemplateZenzaWatchEmitter)(),
      state: {},
    };
    delete (window as unknown as Record<string, unknown>).ZenzaLib;

    if (location.host.match(/\.nicovideo\.jp$/)) {
      (window as unknown as { ZenzaWatch: unknown; Navi: unknown }).ZenzaWatch = ZenzaWatch;
      (window as unknown as { ZenzaWatch: unknown; Navi: unknown }).Navi = Navi;
    } else {
      (window as unknown as { ZenzaWatch: { config: unknown } }).ZenzaWatch = { config: ZenzaWatch.config };
      (window as unknown as { Navi: { config: unknown } }).Navi = { config: Navi.config };
    }
    (window as unknown as { ZenzaWatch: { emitter: unknown } }).ZenzaWatch.emitter = ZenzaWatch.emitter = new (
      Emitter as new () => TemplateZenzaWatchEmitter
    )();
    const debug = ZenzaWatch.debug;
    const emitter = ZenzaWatch.emitter;

    // const modules = ZenzaWatch.modules;
    //@require CONSTANT
    const global = {
      emitter,
      debug,
      external: ZenzaWatch.external,
      PRODUCT,
      TOKEN,
      CONSTANT,
      notify: (msg: unknown) =>
        (ZenzaWatch.external.execCommand as (command: string, params: unknown) => unknown)('notify', msg),
      alert: (msg: unknown) =>
        (ZenzaWatch.external.execCommand as (command: string, params: unknown) => unknown)('alert', msg),
      config: Config,
      api: ZenzaWatch.api,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      NICORU,
      dll,
    };
    //@require ClassList
    //@require domUtil
    //@require util
    ZenzaWatch.lib.$ = uQuery;
    (workerUtil as { env(options: unknown): void }).env({ netUtil, global });
    //@require initCssProps
    initCssProps();
    (
      WindowResizeObserver as {
        subscribe(callback: (size: { width: number; height: number }) => void): void;
      }
    ).subscribe(({ width, height }) => {
      global.innerWidth = width;
      global.innerHeight = height;
      (
        cssUtil as {
          setProps(...args: [Element, string, unknown][]): void;
          number(value: number): unknown;
        }
      ).setProps(
        [document.documentElement, '--inner-width', (cssUtil as { number(value: number): unknown }).number(width)],
        [document.documentElement, '--inner-height', (cssUtil as { number(value: number): unknown }).number(height)]
      );
    });
    //@require components
    //@require State
    //@require VideoInfoLoader
    //@require VideoInfoModel
    //@require VideoSearch
    //@require TagEditApi
    Object.assign(ZenzaWatch.api, {
      VideoInfoLoader,
      ThumbInfoLoader,
      PlaylistApiLoader: PlaylistApiLoader,
      MylistApiLoader,
      CacheStorage,
      IchibaLoader,
      UaaLoader,
      PlaybackPosition,
      NicoVideoApi,
      RecommendAPILoader,
      NVWatchCaller,
      CommonsTreeLoader,
      NicoRssLoader,
      MatrixRankingLoader,
      NicoSearchApiV2Loader,
    });
    ZenzaWatch.init.playlistApiLoader = PlaylistApiLoader;
    ZenzaWatch.init.mylistApiLoader = MylistApiLoader;
    //@require MediaTimeline
    (WatchInfoCacheDb as { api(api: unknown): void }).api(NicoVideoApi);
    (StoryboardCacheDb as { api(api: unknown): void }).api(NicoVideoApi);

    //@require StoryboardInfoLoader
    // ZenzaWatch.api.DmcStoryboardInfoLoader = DmcStoryboardInfoLoader;
    ZenzaWatch.api.StoryboardInfoLoader = StoryboardInfoLoader;

    //@require ThreadLoader

    //@require YouTubeWrapper

    //@require NicoVideoPlayer

    //@require StoryBoardModel

    //@require VideoControlBar

    //@require CommentPlayer

    //@require CommentLayoutWorker

    //@require SlotLayoutWorker

    //@require NicoScripter

    //@require CommentPanel

    //@require PlayList

    //@require NicoVideoPlayerDialog

    //@require RootDispatcher

    //@require CommentInputPanel

    //@require TagListView

    //@require VideoInfoPanel

    //@require GinzaSlayer

    //@require initialize

    //@require CustomElements

    //@require TextLabel
    ZenzaWatch.modules.TextLabel = TextLabel;

    if (window.name === 'commentLayerFrame') {
      return;
    }

    if (location.host === 'www.nicovideo.jp') {
      return initialize();
    }

    void (uq as unknown as { ready(): Promise<unknown> })
      .ready()
      .then(() => NicoVideoApi.configBridge(Config))
      .then(
        () => {
          console.log('%cZenzaWatch Bridge: %s', 'background: lightgreen;', location.host);
          if (document.getElementById('siteHeaderNotification')) {
            return initialize();
          }
          void (
            NicoVideoApi.fetch('https://www.nicovideo.jp/', { credentials: 'include' }) as Promise<{
              text(): Promise<string>;
            }>
          )
            .then((r) => r.text())
            .then((result) => {
              const dom = new DOMParser().parseFromString(result, 'text/html');

              const userData = (
                JSON.parse(dom.querySelector<HTMLElement>('#CommonHeader')!.dataset.commonHeader as string) as {
                  initConfig: { user: { isLogin: boolean; isPremium: boolean } };
                }
              ).initConfig.user;
              const isLogin = !!userData.isLogin;
              const isPremium = !!userData.isPremium;
              console.log('isLogin: %s isPremium: %s', isLogin, isPremium);
              nicoUtil.isLogin = () => isLogin;
              nicoUtil.isPremium = util.isPremium = () => isPremium;
              void initialize();
            });
        },
        (err: unknown) => console.log('ZenzaWatch Bridge disabled', err)
      );
  }; // end of monkey
  (() => {
    //@require dimport
    //@require Emitter
    //@require workerUtil
    //@require IndexedDbStorage
    //@require WatchInfoCacheDb
    //@require parseThumbInfo
    //@require StoryboardCacheDb
    //@require VideoSessionWorker

    (window as unknown as { ZenzaLib?: Record<string, unknown> }).ZenzaLib = Object.assign(
      (window as unknown as { ZenzaLib?: Record<string, unknown> }).ZenzaLib || {},
      {
        workerUtil,
        dimport,
        IndexedDbStorage,
        WatchInfoCacheDb,
        Handler,
        PromiseHandler,
        Emitter,
        EmitterInitFunc,
        parseThumbInfo,
        StoryboardCacheDb,
        VideoSessionWorker,
      }
    );
  })();

  //@require GateAPI

  //@require boot
  void boot(monkey, PRODUCT, START_PAGE_QUERY);
})(globalThis ? globalThis.window : window);
