export function createPocketStyles(baseZIndex: number) {
  const CONSTANT = { BASE_Z_INDEX: baseZIndex };

  const __css__ = `
  a[href*='watch/'] > g-img {
    position: inherit;
  }

  .mylistPocketHoverMenu {
    display: none;
    opacity: 0.8;
    position: absolute;
    z-index: ${CONSTANT.BASE_Z_INDEX + 100000};
    font-size: 8pt;
    padding: 0;
    line-height: 26px;
    font-weight: bold;
    text-align: center;
    transition: box-shadow 0.2s ease, opacity 0.4s ease, padding 0.2s ease;
    user-select: none;
  }

  .mylistPocketHoverMenu.is-busy {
    opacity: 0 !important;
    pointer-events: none;
  }
    .mylistPocketHoverMenu.is-otherDomain .wwwOnly {
      display: none;
    }
    .mylistPocketHoverMenu.is-otherDomain:not(.is-futatsumeReady) .wwwFutatsumeOnly {
      display: none;
    }
    .mylistPocketHoverMenu .futatsumeMenu {
      display: none;
    }
    .mylistPocketHoverMenu.is-futatsumeReady .futatsumeMenu {
      display: inline-block;
    }


  .mylistPocketButton {
    /*font-family: Menlo;*/
    display: block;
    font-weight: bolder;
    cursor: pointer;
    width: 32px;
    height: 26px;
    background: #ccc;
    color: black;
    cursor: pointer;
    box-shadow: 1px 1px 1px #000;
    transition:
      0.1s box-shadow ease,
      0.1s transform ease;
    font-size: 16px;
    line-height: 24px;
    -webkit-user-select: none;
    -moz-use-select: none;
    user-select: none;
    outline: none;
  }

  .mylistPocketButton:hover {
    transform: scale(1.2);
    box-shadow: 4px 4px 5px #000;
  }

  .mylistPocketButton:active {
    transform: scale(1.0);
    box-shadow: none;
    transition: none;
  }

  .is-deflistUpdating .mylistPocketButton.deflist-add::after,
  .is-deflistSuccess  .mylistPocketButton.deflist-add::after,
  .is-deflistFail     .mylistPocketButton.deflist-add::after,
  .mylistPocketButton:hover::after, #mylistPocket-poupup [tooltip] {
    content: attr(tooltip);
    position: absolute;
    /*top:  0px;
    left: 50%;*/
    top:  50%;
    right: -8px;
    padding: 2px 4px;
    white-space: nowrap;
    font-size: 12px;
    color: #fff;
    background: #333;
    transform: translate3d(-50%, -120%, 0);
    transform: translate3d(100%, -50%, 0);
    pointer-events: none;
  }

  .is-deflistUpdating .mylistPocketButton.deflist-add {
    cursor: wait;
    opacity: 0.9;
    transform: scale(1.0);
    box-shadow: none;
    transition: none;
    background: #888;
    border-style: inset;
  }
  .is-deflistSuccess .mylistPocketButton.deflist-add,
  .is-deflistFail    .mylistPocketButton.deflist-add {
    transform: scale(1.0);
    box-shadow: none;
    transition: none;
  }
  .is-deflistSuccess  .mylistPocketButton.deflist-add::after {
    content: attr(data-result);
    background: #393;
  }
  .is-deflistFail     .mylistPocketButton.deflist-add::after {
    content: attr(data-result);
    background: #933;
  }
  .is-deflistUpdating .mylistPocketButton.deflist-add::after {
    content: '更新中';
    background: #333;
  }

  .mylistPocketButton + .mylistPocketButton {
    margin-top: 4px;
  }

  .mylistPocketHoverMenu:hover {
    font-weibht: bolder;
    opacity: 1;
  }

  .mylistPocketHoverMenu:active {
  }

  .mylistPocketHoverMenu.is-show {
    display: block;
  }

  #mylistPocket-popup {
    display: none;
    perspective: 800px;
  }
  #mylistPocket-popup.is-firefox {
    /*perspective: none !important;*/
    position: fixed;
    transform: translate3d(-50%, -50%, 0);
    opacity: 0;
    transition: 0.3s opacity ease;
    top: -9999px; left: -9999px;
  }

  #mylistPocket-popup.show {
    display: block;
  }
  #mylistPocket-popup.is-firefox.show {
    top: 50%;
    left: 50%;
    opacity: 1;
  }


  #mylistPocket-popup .owner-icon {
    width: 64px;
    height: 64px;
    transform-origin: center;
    transform-origin: center;
    transition:
      0.2s transform ease,
      0.2s box-shadow ease
    ;
  }
  #mylistPocket-popup .owner-icon:hover {
  }

  #mylistPocket-popup .description a {
    color: #ffff00 !important;
    text-decoration: none !important;
    font-weight: normal !important;
    display: inline-block;
  }
  #mylistPocket-popup .description a.watch {
    position: relative;
    display: block;
    backface-visibility: hidden;
  }

  #mylistPocket-popup .description a[data-title]:hover::after {
    content: attr(data-title);
    position: absolute;
    top: -16px;
    left: 0;
    word-break: break-all;
    line-height: 12px;
    padding: 4px;
    font-size: 12px;
    color: #333;
    background: #ffc;
    opacity: 0.8;
    user-select: none;
    pointer-events: none;
  }

  #mylistPocket-popup .description a:visited {
    color: #ffff99 !important;
  }
  #mylistPocket-popup .description button {
    /*font-family: Menlo;*/
    font-size: 16px;
    font-weight: bolder;
    margin: 4px 8px;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 0;
    background: #333;
    color: #ccc;
    border: solid 2px #ccc;
    outline: none;
  }
  #mylistPocket-popup .description button:hover {
    transform: translate(-2px,-2px);
    box-shadow: 2px 2px 2px #000;
    background: #666;
    transition:
      0.2s transform ease,
      0.2s box-shadow ease
      ;
  }
  #mylistPocket-popup .description button:active {
    transform: none;
    box-shadow: none;
    transition: none;
  }
  #mylistPocket-popup .description button:active::hover {
    opacity: 0;
  }

  #mylistPocket-popup .watch {
    display: block;
    position: relative;
    line-height: 60px;
    box-sizing: border-box;
    padding: 4px 16px;;
    min-height: 60px;
    width: 280px;
    margin: 8px 10px;
    background: #444;
    border-radius: 4px;
  }

  #mylistPocket-popup .watch:hover {
    background: #446;
  }

  #mylistPocket-popup .videoThumbnail {
    position: absolute;
    right: 16px;
    height: 60px;
    transform-origin: center;
    transition:
      0.2s transform ease,
      0.2s box-shadow ease
    ;
  }
  #mylistPocket-popup .videoThumbnail:hover {
    transform: scale(2);
    box-shadow: 0 0 8px #888;
    transition:
      0.2s transform ease 0.5s,
      0.2s box-shadow ease 0.5s
    ;
  }


.futatsumePlayerContainer.is-error   #mylistPocket-popup,
.futatsumePlayerContainer.is-loading #mylistPocket-popup,
.futatsumePlayerContainer.error   #mylistPocket-popup,
.futatsumePlayerContainer.loading #mylistPocket-popup {
  opacity: 0;
  pointer-events: none;
}

.mylistPocketHoverMenu.is-guest .is-need-login {
  display: none !important;
}

  .xDomainLoaderFrame {
    position: fixed;
    left: -100%;
    top: -100%;
    width: 64px;
    height: 64px;
    opacity: 0;
    border: 0;
  }

  body.BaseLayout {
    margin-top: 0 !important;
  }
  ${
    location.host === 'www.niovideo.jp'
      ? `
  #siteHeader {
    position: sticky;
    left: 0 !important;
    will-change: transform;
  }

  body.nofix #siteHeader {
    position: static;
  }

  .RankingMainContainer-header {
    position: sticky;
    top: 36px;
    z-index: 1000;
    background:
      linear-gradient(to bottom,
        rgba(255, 255, 255, 0),
        rgba(255, 255, 255, 0.7),
        rgba(255, 255, 255, 1.0),
        rgba(255, 255, 255, 0.8),
        rgba(232, 232, 255, 0)
      );
  }
  .nofix .RankingMainContainer-header {
    top: 0;
  }

  .RankingBaseItem {
    border-radius: 0 !important;
    box-shadow: none !important;
    border: 1px solid silver;
    pointer-events: none;
    user-select: none;
    display: grid;
  }
    .RankingBaseItem .Card-link {
      display: grid;
      grid-template-rows: 108px auto;
    }
      .RankingBaseItem .Card-media {
        position: static;
        pointer-events: auto;
      }
        .VideoThumbnail {
          border-radius: 0 !important;
        }
      .RankingBaseItem .Card-title {
        pointer-events: auto;
        user-select: auto;
        height: auto;
        max-height: 49px;
        -webkit-line-clamp: unset;

      }
      .RankingBaseItem .Card-secondary {
        width: 100%;
        user-select: none;
        pointer-events: none;
        align-self: end;
        overflow: hidden;

      }

  [data-nicoad-grade=gold] .Thumbnail.VideoThumbnail {
    background: #f7e01c;
  }
  [data-nicoad-grade=silver] .Thumbnail.VideoThumbnail {
    background: #dfeaec;
  }

  .MatrixRanking-body.GlobalHeader#siteHeader #siteHeaderInner {
    width: 1232px;
  }

  .MatrixRanking-body .RankingRowRank {
    line-height: 48px;
    height: 48px;
    pointer-events: none;
    user-select: none;
  }
  .MatrixRanking-body .RankingMatrixVideosRow {
    width: ${1232 + 64}px;
    margin-left: ${-64}px;
  }
  .MatrixRanking-body .RankingRowRank {
    position: sticky;
    left: -8px;
    z-index: 100;
    transform: none;
    padding-right: 16px;
    width: 64px;
    overflow: visible;
    text-align: right;
    mix-blend-mode: difference;
    text-shadow:
       1px  1px 0 #fff,
       1px -1px 0 #fff,
      -1px  1px 0 #fff,
      -1px -1px 0 #fff;

          }
  `
      : ''
  }
`.trim();

  const nicoadHideCss = `
  .nicoadVideoItemWrapper {
    display: none;
  }
  [aria-label="nicovideo-content"] > div > div > div:nth-of-type(2) > div:nth-of-type(2) > div {
    > a:is([data-anchor-page="tag"], [data-anchor-page="search"]):has(div:is(.c_serviceColor\\.nicoadGold, .c_serviceColor\\.nicoadGray)) {
      display: none;
    }
  }
  [aria-label="nicovideo-content"] > div > section > div:nth-of-type(2) {
    > div > div:first-of-type > div:nth-of-type(2) > div:has(a[data-anchor-page="ranking_genre"]),
    > div > div:has(a[data-anchor-page="ranking_custom"]) {
      &:has(div:is(.c_serviceColor\\.nicoadGold, .c_serviceColor\\.nicoadGray)) {
        display: none;
      }
    }
  }
`.trim();

  const responsiveCss = `
  [aria-label="nicovideo-content"]:has([data-anchor-page="ranking_custom"]) > section > div {
    min-width: unset;
  }
`.trim();

  const hideTagCss = (tagName: string) =>
    `
  [aria-label="nicovideo-content"] > div > section > div:nth-of-type(2) > div > div:last-of-type > div:first-of-type:has(a[data-anchor-page="ranking_genre"]):has(a[data-anchor-href^="/ranking/genre/"][data-anchor-href$="?tag=${encodeURIComponent(tagName.trim())}"]) > div:nth-of-type(2) {
    display: none;
  }
`.trim();

  const __ng_css__ = `
  /* [data-decoration-video-id] ランキング  .item 検索 */

  [data-decoration-video-id]:has(.is-ng-rejected) {
    pointer-events: none;

    > * {
      display: none;
    }

    &::before {
      background-color: var(--colors-layer-surface-low-em);
      border-radius: var(--radii-m);
      box-sizing: content-box;

      @media (prefers-color-scheme: light) {
        content: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w_x6 h_x6 fill_icon.baseDisabled"><path fill="hsl(0 0% 70%)" fill-rule="evenodd" d="M20.21 5.81H14.4l2.38-2.24a.83.83 0 0 0 .05-1.17.8.8 0 0 0-1.16-.04L12 5.81 8.33 2.36a.8.8 0 0 0-1.16.04c-.3.34-.28.86.05 1.17L9.6 5.8H3.8C2.8 5.81 2 6.61 2 7.6v10.7c0 1 .8 1.8 1.79 1.8h2.26l1.35 1.56c.23.26.6.26.82 0l1.35-1.57h4.86l1.35 1.57c.23.26.6.26.82 0l1.35-1.57h2.26c1 0 1.79-.8 1.79-1.78V7.6c0-.99-.8-1.79-1.79-1.79" clip-rule="evenodd"></path></svg>');
      }
      @media (prefers-color-scheme: dark) {
        content: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w_x6 h_x6 fill_icon.baseDisabled"><path fill="hsl(0 0% 40%)" fill-rule="evenodd" d="M20.21 5.81H14.4l2.38-2.24a.83.83 0 0 0 .05-1.17.8.8 0 0 0-1.16-.04L12 5.81 8.33 2.36a.8.8 0 0 0-1.16.04c-.3.34-.28.86.05 1.17L9.6 5.8H3.8C2.8 5.81 2 6.61 2 7.6v10.7c0 1 .8 1.8 1.79 1.8h2.26l1.35 1.56c.23.26.6.26.82 0l1.35-1.57h4.86l1.35 1.57c.23.26.6.26.82 0l1.35-1.57h2.26c1 0 1.79-.8 1.79-1.78V7.6c0-.99-.8-1.79-1.79-1.79" clip-rule="evenodd"></path></svg>');
      }
    }

    &::after {
      content: 'Hide by MylistPocket';
      font-weight: var(--font-weights-bold);
      font-size: var(--font-sizes-base);
      color: var(--colors-text-on-layer-low-em);
    }

    &:is([data-anchor-page="ranking_custom"], .cq-t_inline-size[data-anchor-page="tag"], .cq-t_inline-size[data-anchor-page="search"]) {
      flex-direction: column;
      height: 100%;

      div:has(> &) {
        height: 100%;
      }

      &::before {
        width: calc(100%/4);
        height: calc(100%/4);
        padding: calc((100% * 5 / 16) / 2) calc((100% * 3 / 4) / 2);
      }
    }

    &:is([data-anchor-page="ranking_genre"], [data-anchor-page="tag"]:not(.cq-t_inline-size), [data-anchor-page="search"]:not(.cq-t_inline-size)) {
      &:has(.w_thumbnail\\.l)::before {
        width: var(--sizes-x6);
        height: var(--sizes-x6);
        padding: calc((var(--sizes-thumbnail-l) * 9 / 16 - var(--sizes-x6)) / 2) calc((var(--sizes-thumbnail-l) - var(--sizes-x6)) / 2);
      }
      &:has(.w_thumbnail\\.2xl)::before {
        width: var(--sizes-x8);
        height: var(--sizes-x8);
        padding: calc((var(--sizes-thumbnail-2xl) * 9 / 16 - var(--sizes-x8)) / 2) calc((var(--sizes-thumbnail-2xl) - var(--sizes-x8)) / 2);
      }
    }
  }

  [data-decoration-video-id]:has(.is-ng-wait),
  .item.is-ng-wait {
    outline: 1px dotted rgba(192, 192, 192, 0.8);
  }

  [data-decoration-video-id]:has(.is-ng-queue),
  .item.is-ng-queue {
    outline: 2px dotted rgba(192, 192, 192, 0.8);
  }

  [data-decoration-video-id]:has(.is-ng-current),
  .item.is-ng-current {
    outline: 3px dotted rgba(128, 225, 128, 0.8);
  }

  [data-decoration-video-id]:has(.is-ng-resolved),
  .item.is-ng-resolved {
    outline: 0px solid green;
  }

  [data-decoration-video-id]:has(.is-fav-favorited),
  .item.is-fav-favorited {
    outline: 3px dotted orange;
    outline-offset: 3px;
  }
  .item.videoRanking.is-fav-favorited {
    outline-offset: -3px;
  }

  [data-decoration-video-id]:has(.is-ng-rejected),
  .item.is-ng-rejected {
    outline: none;
  }

  .VideoItem.NC-VideoCard.is-ng-rejected,
  .VideoItem.VideoCard.is-ng-rejected {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }

  .VideoItem .VideoItem-postDate {
    line-height: 16px;
    vertical-align: top;
    font-size: 12px;
    color: #666;
  }

  .item.is-ng-rejected,
  .NicorepoTimelineItem.is-ng-rejected {
    display: none;
    opacity: 0;
    pointer-events: none;
  }

  body.is-ng-disable .is-ng-rejected {
    outline: none;
    display: block !important;
    pointer-events: auto;
    opacity: 0.5;
    visibility: visible;
  }

  /* チャンネル検索 */
    #search .item.is-ng-rejected {
      display: none;
    }
`;

  return { __css__, nicoadHideCss, responsiveCss, hideTagCss, __ng_css__ };
}
