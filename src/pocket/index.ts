import _ from 'lodash';
import { gate } from '../../packages/lib/src/message/gate';
import { nicoUtil } from '../../packages/lib/src/nico/nico-util';
import { netUtil } from '../../packages/lib/src/infra/net-util';
import { textUtil } from '../../packages/lib/src/text/text-util';
import { workerUtil } from '../../packages/lib/src/infra/worker-util';
import { css } from '../../packages/lib/src/css/css';
import { Emitter } from '../../packages/lib/src/emitter';
import { AntiPrototypeJs } from '../../packages/lib/src/infra/anti-prototype-js';
import { MylistApiLoader, parseThumbInfo } from '../shared/external-api';
import type { ThumbInfoData, ThumbInfoOk } from '../shared/external-api';
import { ThumbInfoCacheDb } from '../../packages/lib/src/nico/thumb-info-cache-db';
import { createPocketStyles } from './styles';
import { POCKET_TEMPLATE } from './template';
import { createVideoInfoClass } from './video-info';
import { createMatchChecker } from './match-checker';
import { createPocketViews } from './views';
import { addPocketWatchLater } from './deflist-add';
import { createPocketPersistence } from './persistence';
type PocketViews = ReturnType<typeof createPocketViews>;
type HoverMenuInstance = InstanceType<PocketViews['HoverMenu']>;
type VideoInfoViewInstance = InstanceType<PocketViews['VideoInfoView']>;
import type {
  PocketWindow,
  MylistPocketApi,
  PocketUtil,
  FutatsumeLike,
  PocketThumbInfo,
  PocketVideoInfo,
  PocketDispatcher,
  QueueInfoData,
  MatchTargetData,
  PocketCommandResult,
  NgObserveParams,
  PocketConfigNamespace,
  NgInitDomParams,
  GateApi,
  ThumbGateMessage,
  PocketMatchChecker,
  PocketNgChecker,
} from './types';
import { bounce } from '../../packages/lib/src/infra/bounce';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
export function initializePocket(): void {
  void AntiPrototypeJs().then(() => {
    const PRODUCT = 'MylistPocket';

    const monkey = (PRODUCT: string) => {
      const console = window.console;
      const { workerUtil } = (window as unknown as PocketWindow).MylistPocketLib;
      //const $ = window.jQuery;

      const CONSTANT = {
        BASE_Z_INDEX: 100000,
      };
      const MylistPocket = { debug: {} } as unknown as MylistPocketApi;
      (window as unknown as PocketWindow).MylistPocket = MylistPocket;

      const protocol = location.protocol;

      const { __css__, nicoadHideCss, responsiveCss, hideTagCss, __ng_css__ } = createPocketStyles(
        CONSTANT.BASE_Z_INDEX
      );
      const __tpl__ = POCKET_TEMPLATE;

      // TODO: ライブラリ化
      const util: PocketUtil = (MylistPocket.util = (() => {
        const util = {} as unknown as PocketUtil;

        util.mixin = function (
          self: Record<string, (...args: never[]) => unknown>,
          o: Record<string, (...args: never[]) => unknown>
        ) {
          Object.keys(o).forEach((f) => {
            if (!_.isFunction(o[f])) {
              return;
            }
            if (_.isFunction(self[f])) {
              return;
            }
            self[f] = o[f].bind(o);
          });
        };
        util.attachShadowDom = function ({
          host,
          tpl,
          mode = 'open',
        }: {
          host: Element;
          tpl: HTMLTemplateElement;
          mode?: ShadowRootMode;
        }): ShadowRoot {
          const root = host.attachShadow
            ? host.attachShadow({ mode })
            : (host as unknown as { createShadowRoot: () => ShadowRoot }).createShadowRoot();
          const node = document.importNode(tpl.content, true);
          root.appendChild(node);
          return root;
        };
        util.httpLink = function (html: string): string {
          const links: Record<string, string | RegExpMatchArray> = {};
          let keyCount = 0;
          const getTmpKey = function () {
            return ` <!--${keyCount++}--> `;
          };
          html = html.replace(/@([a-zA-Z0-9_]+)/g, (g, id) => {
            const tmpKey = getTmpKey();
            links[tmpKey] =
              ` <a href="https://twitter.com/${id}" class="twitterLink" rel="noopener" target="_blank">@${id}</a> `;
            return tmpKey;
          });

          html = html.replace(
            /(https?:\/\/seiga\.nicovideo\.jp\/seiga\/)?im(\d+)/g,
            ' <a href="//seiga.nicovideo.jp/seiga/im$2" class="seigaLink" rel="noopener" target="_blank">$1im$2</a> '
          );
          html = html.replace(
            /(https?:\/\/com\.nicovideo\.jp\/community\/)?co(\d+)/g,
            ' <a href="//com.nicovideo.jp/community/co$2" class="communityLink" rel="noopener" target="_blank">$1co$2</a> '
          );
          html = html.replace(
            /(https?:\/\/www\.nicovideo\.jp\/)?(watch|shorts|mylist|series|user)\/(\d+)/g,
            ' <a href="https://www.nicovideo.jp/$2/$3" rel="noopener" class="videoLink target-change">$1$2/$3</a> '
          );
          html = html.replace(
            /(https?:\/\/www\.nicovideo\.jp\/watch\/)?(sm|nm|so|ss)(\d+)/g,
            ' <a href="https://www.nicovideo.jp/watch/$2$3" rel="noopener" class="videoLink target-change">$1$2$3</a> '
          );
          html = html.replace(
            /(https?:\/\/www\.nicovideo\.jp\/shorts\/)?ss(\d+)/g,
            ' <a href="https://www.nicovideo.jp/shorts/ss$2" rel="noopener" class="videoLink target-change">$1ss$2</a> '
          );

          const linkmatch = /<a.*?<\/a>/;
          let n: RegExpExecArray | null;
          html = html.split('<br />').join(' <br /> ');
          while ((n = linkmatch.exec(html)) !== null) {
            const tmpKey = getTmpKey();
            links[tmpKey] = n;
            html = html.replace(n as unknown as string, tmpKey);
          }

          html = html.replace(/\((https?:\/\/[\x21-\x3b\x3d-\x7e]+)\)/gi, '( $1 )');
          html = html.replace(/(https?:\/\/[\x21-\x3b\x3d-\x7e]+)http/gi, '$1 http');
          html = html.replace(
            /(https?:\/\/[\x21-\x3b\x3d-\x7e]+)/gi,
            '<a href="$1" rel="noopener" target="_blank" class="otherSite">$1</a>'
          );
          Object.keys(links).forEach((tmpKey) => {
            html = html.replace(tmpKey, links[tmpKey] as string);
          });

          html = html.split(' <br /> ').join('<br />');
          return html;
        };

        util.getSleepPromise = function (sleepTime: number): (result: unknown) => Promise<unknown> {
          return function (result: unknown): Promise<unknown> {
            return new Promise((resolve) => {
              window.setTimeout(() => {
                return resolve(result);
              }, sleepTime);
            });
          };
        };

        util.isFirefox = () => navigator.userAgent.toLowerCase().indexOf('firefox') >= 0;

        return util;
      })());
      Object.assign(util, css);
      Object.assign(util, workerUtil);
      Object.assign(util, nicoUtil);
      Object.assign(util, netUtil);
      Object.assign(util, textUtil);

      MylistPocket.emitter = util.emitter = new Emitter();

      const FutatsumeDetector = (function () {
        let isReady = false;
        let Futatsume: FutatsumeLike | null = null;
        const emitter = new Emitter();

        const initialize = function (): void {
          const onFutatsumeReady = (): void => {
            isReady = true;
            Futatsume = (window as unknown as PocketWindow).FutatsumeWatch!;

            Futatsume.emitter.on('hideHover', () => {
              util.emitter.emit('hideHover');
            });

            Futatsume.emitter.on('csrfToken', ((token: string) => {
              util.emitter.emit('csrfToken', token);
            }) as unknown as EmitterCallback);

            const popup = document.getElementById('mylistPocket-popup');
            const defaultContainer = document.getElementById('mylistPocketDomContainer')!;
            defaultContainer.classList.add('futatsume-family');
            let futatsumeContainer: Element | null;
            Futatsume.emitter.on('fullScreenStatusChange', ((isFull: boolean) => {
              if (isFull) {
                if (!futatsumeContainer) {
                  futatsumeContainer = document.querySelector('.futatsumePlayerContainer');
                }
                futatsumeContainer!.appendChild(popup!);
              } else {
                defaultContainer.appendChild(popup!);
              }
            }) as unknown as EmitterCallback);
            emitter.emit('ready', Futatsume);
          };

          if (
            (window as unknown as PocketWindow).FutatsumeWatch &&
            (window as unknown as PocketWindow).FutatsumeWatch!.ready
          ) {
            onFutatsumeReady();
          } else {
            document.body.addEventListener('FutatsumeWatchInitialize', function () {
              onFutatsumeReady();
            });
          }
        };

        const detect = function (): Promise<FutatsumeLike | null> {
          return new Promise((res) => {
            if (isReady) {
              return res(Futatsume);
            }
            emitter.on('ready', () => {
              res(Futatsume);
            });
          });
        };

        return {
          initialize: initialize,
          detect: detect,
        };
      })();

      const { config, CsrfTokenLoader, ThumbInfoLoader } = createPocketPersistence({
        PRODUCT,
        util,
        pocket: MylistPocket,
      });

      const VideoInfo = createVideoInfoClass(protocol, util.hasLargeThumbnail.bind(util));

      const deflistRemove = (watchId: string): Promise<unknown> => {
        if (location.host === 'www.nicovideo.jp') {
          return MylistApiLoader.removeDeflistItem(watchId);
        }

        let futatsume: FutatsumeLike;
        let token: unknown;
        return FutatsumeDetector.detect()
          .then((z) => {
            futatsume = z as FutatsumeLike;
          })
          .then(() => {
            return CsrfTokenLoader.load().then(
              (t) => {
                token = t;
              },
              () => {
                return Promise.resolve();
              }
            );
          })
          .then(() => {
            return futatsume.external.deflistRemove({ watchId, token });
          });
      };

      const { MatchChecker, NgChecker } = createMatchChecker(util.escapeRegs.bind(util));

      const initDom = (): void => {
        util.addStyle(__css__);
        const f = document.createElement('div');
        f.id = 'mylistPocketDomContainer';
        f.innerHTML = __tpl__;
        document.body.appendChild(f);
      };

      const initFutatsumeBridge = (): void => {
        FutatsumeDetector.initialize();
      };

      const createVideoInfoView = (): VideoInfoViewInstance => {
        const host = document.getElementById('mylistPocket-popup')!;
        const tpl = document.getElementById('mylistPocket-popup-template') as unknown as HTMLTemplateElement;
        const vv = new VideoInfoView({ host, tpl });
        return vv;
      };

      const createVideoInfoLoader = (vv: VideoInfoViewInstance): ((watchId: string) => Promise<unknown>) => {
        const onVideoInfoLoad = (thumbInfo: PocketThumbInfo): void => {
          const vi = VideoInfo.createByThumbInfo(thumbInfo as ThumbInfoOk);
          vv.bind(vi);
        };

        const onVideoInfoFail = (): Promise<void> => {
          vv.bind({ status: 'fail', description: '通信失敗' } as unknown as PocketVideoInfo);
          return Promise.resolve();
        };

        return (watchId: string): Promise<unknown> => {
          vv.reset();
          vv.show();
          return ThumbInfoLoader.load(watchId, { expireTime: 60 * 60 * 1000 }).then(onVideoInfoLoad, onVideoInfoFail);
        };
      };

      const createCommandDispatcher = ({ infoView }: { infoView: VideoInfoViewInstance }): PocketDispatcher => {
        const info = createVideoInfoLoader(infoView);

        const ngConfig = config.namespace('ng');
        const favConfig = config.namespace('fav');
        const { ngChecker, favChecker } = initNgChecker({ ngConfig, favConfig });

        const toggleFavNg = (command: string, param: { value: string; watchId?: string }): void => {
          const parts = command.split('-') as [string, string, string];
          let cmd = parts[0];
          const namespace = parts[1];
          const key = parts[2];
          const _config = namespace === 'fav' ? favConfig : ngConfig;
          _config.refresh();
          const value = param.value.trim();
          let ngs = (_config.props[key] as string).trim().split(/[\r\n]/);
          const isContain = ngs.includes(value);

          if (isContain || cmd === 'remove') {
            ngs = ngs.filter((line) => line !== value);
            cmd = 'remove';
          } else if (!isContain || cmd === 'add') {
            ngs.push(value);
            cmd = 'add';
          }

          ngs = _.uniq(ngs);

          _config.props[key] = ngs.join('\n').trim();

          const className = namespace === 'fav' ? 'is-fav-favorited' : 'is-ng-rejected';
          Array.prototype.forEach.call(
            document.querySelectorAll(`*[data-watch-id=${param.watchId}]`),
            (item: Element) => {
              item.classList.toggle(className, cmd === 'add');
            }
          );
        };

        return (command: string, param: string | { value: string }, src?: unknown): unknown => {
          switch (command) {
            case 'info':
              return info(param as string);
            case 'load':
              return QueueLoader.load(param as string);
            case 'fav-status':
              return QueueLoader.load(param as string).then((result) => {
                const res = result as QueueInfoData | null;
                if (!res || res.status === 'fail' || res.code === 'DELETED') {
                  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 拒否理由のペイロード（呼び元が status/result を読む）のため Error 化しない
                  return Promise.reject({ status: 'unknown', result: res });
                }
                if (ngChecker.isMatch(res as unknown as MatchTargetData)) {
                  return { status: 'ng', result: res };
                }
                if (favChecker.isMatch(res as unknown as MatchTargetData)) {
                  return { status: 'favorite', result: res };
                }
                return { status: 'default', result: res };
              });
            case 'mylist-comment-open':
              window.open(protocol + '//www.nicovideo.jp/mylistcomment/video/' + (param as string));
              break;
            case 'futatsume-open-now':
              (window as unknown as PocketWindow).FutatsumeWatch!.external.execCommand('openNow', param);
              break;
            case 'futatsume-open':
              (window as unknown as PocketWindow).FutatsumeWatch!.external.open(param);
              break;
            case 'playlist-inert':
              (window as unknown as PocketWindow).FutatsumeWatch!.external.playlist.insert(param);
              break;
            case 'playlist-queue':
              (window as unknown as PocketWindow).FutatsumeWatch!.external.playlist.add(param);
              break;
            case 'deflist-remove':
              (src as HoverMenuInstance | VideoInfoViewInstance).notifyBeginDeflistUpdate();

              return deflistRemove(param as string)
                .then(util.getSleepPromise(1000, 'deflist-remove'))
                .then(
                  () => {
                    (src as HoverMenuInstance | VideoInfoViewInstance).notifyEndDeflistUpdate({
                      message: '削除しました',
                    });
                  },
                  (err: unknown) => {
                    console.error('deflist-remove-result', err);
                    (src as HoverMenuInstance | VideoInfoViewInstance).notifyFailDeflistUpdate(
                      err as PocketCommandResult
                    );
                  }
                );
            case 'deflist-add':
              (src as HoverMenuInstance | VideoInfoViewInstance).notifyBeginDeflistUpdate();
              return addPocketWatchLater(param as string, () => FutatsumeDetector.detect()).then(
                (result) =>
                  (src as HoverMenuInstance | VideoInfoViewInstance).notifyEndDeflistUpdate(
                    result as PocketCommandResult
                  ),
                (error: unknown) =>
                  (src as HoverMenuInstance | VideoInfoViewInstance).notifyFailDeflistUpdate(
                    error as PocketCommandResult
                  )
              );
            case 'mylist-select':
              void import('../mylist/mylist-manager').then(({ openMylistManager }) =>
                openMylistManager(param as string)
              );
              break;
            case 'add-ng-word':
            case 'add-ng-tag':
            case 'add-ng-owner':
            case 'add-fav-word':
            case 'add-fav-tag':
            case 'add-fav-owner':
            case 'remove-ng-word':
            case 'remove-ng-tag':
            case 'remove-ng-owner':
            case 'remove-fav-word':
            case 'remove-fav-tag':
            case 'remove-fav-owner':
            case 'toggle-ng-word':
            case 'toggle-ng-tag':
            case 'toggle-ng-owner':
            case 'toggle-fav-word':
            case 'toggle-fav-tag':
            case 'toggle-fav-owner':
              toggleFavNg(command, param as { value: string; watchId?: string });
              break;
          }
        };
      };

      const initExternal = (
        dispatcher: PocketDispatcher,
        hoverMenu: HoverMenuInstance,
        infoView: VideoInfoViewInstance
      ): void => {
        MylistPocket.external = {
          info: (watchId: string): unknown => {
            return dispatcher('info', watchId);
          },
          load: (watchId: string): unknown => {
            return dispatcher('load', watchId, { expireTime: 60 * 60 * 1000 });
          },
          getFavStatus: (watchId: string): unknown => {
            return dispatcher('fav-status', watchId);
          },
          observe: (params: NgObserveParams): void => {
            void initNg(params);
          },
          hide: (): void => {
            hoverMenu.hide();
            infoView.hide();
          },
        };

        MylistPocket.isReady = true;

        const ev = new CustomEvent('MylistPocketInitialized', { detail: { MylistPocket } });
        document.body.dispatchEvent(ev);
        // 過去の互換用
        if (
          (window as unknown as { jQuery?: (selector: string) => { trigger(event: string, data: unknown): void } })
            .jQuery
        ) {
          (window as unknown as { jQuery: (selector: string) => { trigger(event: string, data: unknown): void } })
            .jQuery('body')
            .trigger('MylistPocketReady', MylistPocket);
        }
      };

      const QueueLoader = (() => {
        let lastPromise: Promise<unknown> | null = null;
        let count = 0;
        const MAX_LOAD = 6;
        const promises: Promise<unknown>[] = [];

        const load = function (watchId: string, item?: Element | null): Promise<unknown> {
          count = (count + 1) % MAX_LOAD;
          lastPromise = promises[count]!;

          const onLoad = (info: PocketThumbInfo): Promise<unknown> => {
            if (item) {
              watchId = (info as ThumbInfoOk).watchId;
              item.setAttribute('data-watch-id', watchId);
              item.setAttribute('data-thumb-info', JSON.stringify(info));
            }
            const sleepTime = info.fromCache ? 0 : 50;
            return util.getSleepPromise(sleepTime, 'success-' + watchId)(info);
          };
          const onFail = util.getSleepPromise(1000, 'fail-' + watchId);

          if (lastPromise === null) {
            if (item) {
              item.classList.add('is-ng-current');
            }
            lastPromise = ThumbInfoLoader.load(watchId).then(onLoad, onFail);
          } else {
            //lastPromise = Promise.all([lastPromise]).then(() => {
            lastPromise = Promise.race(promises).then(() => {
              if (item) {
                item.classList.add('is-ng-current');
              }
              return ThumbInfoLoader.load(watchId).then(onLoad, onFail);
            });
          }

          promises[count] = lastPromise;
          return lastPromise;
        };

        return {
          load,
        };
      })();

      const waitForDom = (query: string, timeout = 30000): Promise<Element> => {
        const now = Date.now();
        return new Promise((ok, ng) => {
          const poll = (): void => {
            if (now + timeout <= Date.now()) {
              ng(new Error('timeout'));
              return;
            }
            const dom = document.querySelector(query);
            if (dom) {
              ok(dom);
              return;
            }
            window.setTimeout(poll, 1000);
          };
          poll();
        });
      };

      const getNgEnv = async () => {
        if (
          location.host === 'www.nicovideo.jp' &&
          (location.pathname.startsWith('/tag') || location.pathname.startsWith('/search')) &&
          (await window.cookieStore.get('new_search'))?.value === 'false'
        ) {
          return {
            query: '.item[data-video-id]:not(.is-ng-wait)',
            container: Array.from(document.querySelectorAll('.contentBody .videoListInner')),
            subtree: false,
          };
        }
        if (
          location.host === 'www.nicovideo.jp' &&
          (location.pathname.startsWith('/tag') ||
            location.pathname.startsWith('/search') ||
            location.pathname.startsWith('/ranking'))
        ) {
          await waitForDom('[data-anchor-page="tag"],[data-anchor-page="search"],[data-anchor-page^="ranking_"]');
          return {
            query:
              '[href*="watch/"]:is([data-anchor-page="tag"],[data-anchor-page="search"],[data-anchor-page^="ranking_"]):not(.is-ng-wait)',
            container: document.querySelector('[aria-label="nicovideo-content"]'),
            subtree: true,
          };
        }
        if (
          location.host === 'www.nicovideo.jp' &&
          document.querySelector('#MyPageNicorepoApp, #UserPageNicorepoApp')
        ) {
          return {
            query: '.NicorepoTimelineItem:not(.is-ng-wait)',
            container: document.querySelector('#MyPageNicorepoApp, #UserPageNicorepoApp'),
          };
        }

        if (location.host === 'ch.nicovideo.jp' && location.pathname.startsWith('/search')) {
          return {
            query: '.item:not(.is-ng-wait)',
            container: document.querySelector('.site_body'),
          };
        }

        if (location.host === 'search.nicovideo.jp') {
          return {
            query: '.video:not(.is-ng-wait)',
            container: document.querySelector('#row-results'),
          };
        }

        return { query: null, container: null };
      };

      const initNgConfig = ():
        Record<string, never> | { ngConfig: PocketConfigNamespace; favConfig: PocketConfigNamespace } => {
        const ngConfig = config.namespace('ng');
        const updateEnable = (v: unknown): void => {
          document.body.classList.toggle('is-ng-disable', !v);
        };
        updateEnable(ngConfig.props.enable);
        if (!ngConfig.props.enable) {
          return {};
        }
        ngConfig.onkey('enable', updateEnable);

        const favConfig = config.namespace('fav');
        return { ngConfig, favConfig };
      };

      const initNgChecker = ({
        ngConfig,
        favConfig,
      }: {
        ngConfig: PocketConfigNamespace;
        favConfig: PocketConfigNamespace;
      }): { ngChecker: PocketNgChecker; favChecker: PocketMatchChecker } => {
        const ngChecker = new NgChecker({
          word: ngConfig.props.word as string,
          tag: ngConfig.props.tag as string,
          owner: ngConfig.props.owner as string,
        });

        ngConfig.on(
          'update',
          // eslint-disable-next-line @typescript-eslint/no-misused-promises -- debounce化関数の戻り値はemitterが無視するため許容する
          bounce.time((): void => {
            ngChecker.init({
              word: ngConfig.props.word as string,
              tag: ngConfig.props.tag as string,
              owner: ngConfig.props.owner as string,
            });
          }, 100)
        );

        const favChecker = new MatchChecker({
          word: favConfig.props.word as string,
          tag: favConfig.props.tag as string,
          owner: favConfig.props.owner as string,
        });

        favConfig.on(
          'update',
          // eslint-disable-next-line @typescript-eslint/no-misused-promises -- debounce化関数の戻り値はemitterが無視するため許容する
          bounce.time((): void => {
            favChecker.init({
              word: favConfig.props.word as string,
              tag: favConfig.props.tag as string,
              owner: favConfig.props.owner as string,
            });
          }, 100)
        );

        return { ngChecker, favChecker };
      };

      const initIntersectionObserver = (
        onInview: (item: HTMLElement, watchId: string) => void
      ): IntersectionObserver => {
        const onItemInview = (item: HTMLElement): void => {
          let watchId =
            item.dataset.id || item.dataset.videoId || item.dataset.watchId || item.dataset.decorationVideoId;
          const ignore = (): void => item.classList.add('is-ng-ignore');
          if (!watchId) {
            const a = (item instanceof HTMLAnchorElement
              ? item
              : item.querySelector('a[href*=\'watch/\'],a[href*="shorts/"]')) as unknown as HTMLAnchorElement | null;
            let m: RegExpExecArray | null;
            if (
              a != null &&
              a.hostname === 'www.nicovideo.jp' &&
              (m = /^\/(watch|shorts)\/([a-z0-9]+)/.exec(a.pathname)) !== null
            ) {
              watchId = m[2];
            }
          }

          if (!watchId) {
            item.classList.add('.no-watch-id');
            return ignore();
          }

          item.classList.add('is-ng-queue');
          onInview(item, watchId);
        };

        const intersectionObserver = new window.IntersectionObserver(
          (entries) => {
            entries
              .filter((entry) => entry.isIntersecting)
              .forEach((entry) => {
                const item = entry.target;
                intersectionObserver.unobserve(item);
                onItemInview(item as unknown as HTMLElement);
              });
          },
          { rootMargin: '400px' }
        );

        return intersectionObserver;
      };

      const initNgDom = ({ intersectionObserver, query, closest, container, subtree }: NgInitDomParams): void => {
        subtree = typeof subtree !== 'boolean' ? false : subtree;
        if (!container) {
          return;
        }
        util.addStyle(__ng_css__);

        const update = (container?: Element | Document): void => {
          let items: NodeListOf<Element> | Element[] = (container || document).querySelectorAll(query);
          if (!items || items.length < 1) {
            return;
          }
          if (closest) {
            const tmp: Element[] = [];
            [...items].forEach((item) => {
              const c = item.closest(closest);
              if (c && !tmp.includes(c)) {
                tmp.push(c);
              }
            });
            items = tmp;
          }
          if (!items || items.length < 1) {
            return;
          }
          [...items].forEach((item) => {
            //if (item.offsetLeft < 0) { return; }
            if (item.classList.contains('is-ng-ignore')) {
              return;
            }
            item.classList.add('is-ng-wait');
            intersectionObserver.observe(item);
          });
        };
        update();

        const mutationObserver = new MutationObserver((mutations) => {
          for (const record of mutations) {
            const container = record.target;
            if (record.addedNodes && record.addedNodes.length) {
              update(container as unknown as Element);
            }
          }
        });

        const containers = Array.isArray(container) ? container : [container];
        containers.forEach((container) => {
          (container as unknown as HTMLElement).dataset.isWatching = '1';
          mutationObserver.observe(container, { childList: true, characterData: false, attributes: false, subtree });
        });
      };

      const initNg = async (params?: NgObserveParams | null): Promise<PocketConfigNamespace | undefined> => {
        if (!window.IntersectionObserver) {
          return;
        }

        const { query, container, closest, subtree, callback } = params
          ? params
          : ((await getNgEnv()) as NgObserveParams);

        if (!query) {
          return;
        }

        const { ngConfig, favConfig } = initNgConfig() as {
          ngConfig: PocketConfigNamespace;
          favConfig: PocketConfigNamespace;
        };
        if (!ngConfig) {
          return;
        }

        const { ngChecker, favChecker } = initNgChecker({ ngConfig, favConfig });

        const onItemInview = (item: HTMLElement, watchId: string): void => {
          const loadLazy = (): void => {
            const lazyImage = item.querySelector('.jsLazyImage') as unknown as HTMLImageElement | null;
            if (lazyImage) {
              const origImage = lazyImage.getAttribute('data-original');
              if (origImage) {
                lazyImage.src = origImage;
                lazyImage.classList.remove('jsLazyImage');
              }
            }
          };

          (QueueLoader.load(watchId, item) as Promise<QueueInfoData | null>).then(
            (info) => {
              item.classList.remove('is-ng-current');
              if (!info || info.status === 'fail' || info.code === 'DELETED') {
                if (info && info.code !== 'COMMUNITY') {
                  console.error('empty data', watchId, info, info ? info.code : 'unknown');
                }
                item.classList.add('is-ng-failed', info ? (info.code as string) : 'is-no-data');
              } else {
                if (callback) {
                  return callback(item, {
                    watchId,
                    info,
                    isNg: ngChecker.isNg(info as unknown as MatchTargetData),
                    isFav: favChecker.isMatch(info as unknown as MatchTargetData),
                  });
                }
                item.classList.add(
                  ngChecker.isNg(info as unknown as MatchTargetData) ? 'is-ng-rejected' : 'is-ng-resolved'
                );
                if (favChecker.isMatch(info as unknown as MatchTargetData)) {
                  item.classList.add('is-fav-favorited');
                }

                for (const img of item.querySelectorAll<HTMLImageElement>('img.videoThumbnail.preview')) {
                  img.src = info.thumbnail as string;
                }

                const label = item.querySelector('.label');
                item.dataset.title = info.title;
                // チャンネル動画のリンクを watch/so〜 に置き換える
                if (!(info.id || '').startsWith('so')) {
                  return;
                }
                if (label && item.classList.contains('videoLink')) {
                  label.textContent = info.id as string;
                  item.dataset.param = item.dataset.videoId = info.id as string;
                  (item as unknown as HTMLAnchorElement).href = `https://www.nicovideo.jp/watch/${info.id}`;
                }
                for (const a of item.querySelectorAll(`a[href*="watch/${watchId}"]`)) {
                  const href = a.getAttribute('href') as string;
                  a.setAttribute(
                    'href',
                    href.replace(/watch\/([0-9]+)/, `watch/${info.id}`).replace(/^http:/, 'https:')
                  );
                }
                for (const a of item.querySelectorAll(`a[href*="shorts/${watchId}"]`)) {
                  const href = a.getAttribute('href') as string;
                  a.setAttribute(
                    'href',
                    href.replace(/shorts\/([0-9]+)/, `shorts/${info.id}`).replace(/^http:/, 'https:')
                  );
                }
              }

              loadLazy();
            },
            () => {
              item.classList.remove('is-ng-current');
              item.classList.add('is-ng-failed');
              loadLazy();
            }
          );
        };

        const intersectionObserver = initIntersectionObserver(onItemInview);

        initNgDom({ intersectionObserver, query, container, closest, subtree });

        return ngConfig;
      };

      const { HoverMenu, VideoInfoView } = createPocketViews({
        util,
        config,
        pocket: MylistPocket,
        futatsumeDetector: FutatsumeDetector,
        initNgChecker,
      });

      const init = async (): Promise<void> => {
        await config.promise('restore');
        initDom();
        initFutatsumeBridge();

        const infoView = createVideoInfoView();
        const dispatcher = createCommandDispatcher({ infoView });

        infoView.on('command', dispatcher as unknown as EmitterCallback);

        const hoverMenu = new HoverMenu();
        hoverMenu.on('info', ((watchId: string) => {
          hoverMenu.isBusy = true;

          void (dispatcher('info', watchId) as Promise<unknown>).then(() => {
            hoverMenu.isBusy = false;
          });
        }) as unknown as EmitterCallback);
        hoverMenu.on('deflist-add', ((watchId: string, src: unknown) => {
          dispatcher('deflist-add', watchId, src);
        }) as unknown as EmitterCallback);
        hoverMenu.on('deflist-remove', ((watchId: string, src: unknown) => {
          dispatcher('deflist-remove', watchId, src);
        }) as unknown as EmitterCallback);
        hoverMenu.on('mylist-select', ((watchId: string) => {
          void import('../mylist/mylist-manager').then(({ openMylistManager }) => openMylistManager(watchId));
        }) as unknown as EmitterCallback);
        hoverMenu.on('playlist-queue', ((watchId: string, src: unknown) => {
          dispatcher('playlist-queue', watchId, src);
        }) as unknown as EmitterCallback);
        MylistPocket.debug.hoverMenu = hoverMenu;

        const ngConfig = await initNg();

        if (config.props.nicoad.hide) {
          util.addStyle(nicoadHideCss);
        }

        if (document.querySelector('a[data-anchor-page^="ranking_"]') != null) {
          for (const tagName of (ngConfig!.props.tag as string).trim().split(/[\r\n]/)) {
            util.addStyle(hideTagCss(tagName));
          }
          if (config.props.responsive.matrix) {
            util.addStyle(responsiveCss);
          }
        }

        initExternal(dispatcher, hoverMenu, infoView);
      };

      void init();
    };
    (window as unknown as PocketWindow).MylistPocketLib = {
      workerUtil,
    };
    const thumbInfoApi = async function (): Promise<void> {
      const gateApi = (gate as unknown as () => GateApi)();
      const { port, TOKEN } = gateApi.init({ prefix: `thumbInfo${PRODUCT}`, type: 'thumbInfo' });
      const db = await ThumbInfoCacheDb.open();
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- DOMイベントリスナーの戻り値は無視されるためasyncのままにする
      port.addEventListener('message', async (e) => {
        const data: ThumbGateMessage =
          typeof e.data === 'string' ? (JSON.parse(e.data) as ThumbGateMessage) : (e.data as ThumbGateMessage);
        const { body, sessionId, token } = data;
        const { command, params } = body;
        if (command !== 'fetch') {
          return;
        }
        const p = gateApi.parseUrl(params.url);
        if (TOKEN !== token || p.hostname !== location.host || !p.pathname.startsWith('/api/getthumbinfo/')) {
          return;
        }
        params.options = params.options || {};

        const watchId = params.url.split('/').reverse()[0] as string;
        const expiresAt = Date.now() - (params.options.expireTime || 0);
        const cache = await db.get(watchId);
        if (cache && cache.thumbInfo.status === 'ok' && cache.updatedAt > expiresAt) {
          return gateApi.post({ status: 'ok', command, params: cache.thumbInfo }, { sessionId });
        }

        delete params.options.credentials;
        return gateApi
          .uFetch(params, sessionId)
          .then((res) => res.text())
          .then((xmlText) => {
            let thumbInfo: ThumbInfoData = parseThumbInfo(xmlText);
            if (thumbInfo.status === 'ok') {
              db.put(xmlText, thumbInfo);
            } else if (cache && cache.thumbInfo.status === 'ok') {
              thumbInfo = cache.thumbInfo;
            }
            const result = { status: 'ok', command, params: thumbInfo };
            gateApi.post(result, { sessionId });
          })
          .catch(({ status, message }: { status?: unknown; message?: unknown }) => {
            if (cache && cache.thumbInfo.status === 'ok') {
              return gateApi.post({ status: 'ok', command, params: cache.thumbInfo }, { sessionId });
            }
            return gateApi.post({ status, message, command }, { sessionId });
          });
      });
    };

    const loadGm = (): void => {
      monkey(PRODUCT);
    };

    const host = window.location.host || '';
    if (host === 'ext.nicovideo.jp' && window.name.indexOf(`thumbInfo${PRODUCT}Loader`) >= 0) {
      void thumbInfoApi();
    } else if (window === top) {
      loadGm();
    }
  });
}

initializePocket();
