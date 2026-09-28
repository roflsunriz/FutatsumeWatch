import { CONSTANT } from '../constant';
import { css } from '../../packages/lib/src/css/css';
import { uq } from '../../packages/lib/src/u-query';
import type { UqStatic } from './types';
css.addStyle(
  `
  .futatsumeWatchVideoInfoPanel .tabs:not(.activeTab) {
    display: none;
    pointer-events: none;
    overflow: hidden;
  }

  .futatsumeWatchVideoInfoPanel .tabs.activeTab {
    margin-top: 32px;
    box-sizing: border-box;
    position: relative;
    width: 100%;
    height: calc(100% - 32px);
    overflow-x: hidden;
    overflow-y: visible;
    overscroll-behavior: none;
    text-align: left;
  }
  .futatsumeWatchVideoInfoPanel .tabs.relatedVideoTab.activeTab {
    overflow: hidden;
  }

  .futatsumeWatchVideoInfoPanel .tabs:not(.activeTab) {
    display: none !important;
    pointer-events: none;
    opacity: 0;
  }

  .futatsumeWatchVideoInfoPanel .tabSelectContainer {
    position: absolute;
    display: flex;
    height: 32px;
    z-index: 100;
    width: 100%;
    white-space: nowrap;
    user-select: none;
  }

  .futatsumeWatchVideoInfoPanel .tabSelect {
    flex: 1;
    box-sizing: border-box;
    display: inline-block;
    height: 32px;
    font-size: 12px;
    letter-spacing: 0;
    line-height: 32px;
    color: #666;
    background: #222;
    cursor: pointer;
    text-align: center;
    transition: text-shadow 0.2s ease, color 0.2s ease;
  }
  .futatsumeWatchVideoInfoPanel .tabSelect.activeTab {
    font-size: 14px;
    letter-spacing: 0.1em;
    color: #ccc;
    background: #333;
  }

  .futatsumeWatchVideoInfoPanel .tabSelect.blink:not(.activeTab) {
    color: #fff;
    text-shadow: 0 0 4px #ff9;
    transition: none;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel.is-notFullscreen .tabSelect.blink:not(.activeTab) {
    color: #fff;
    text-shadow: 0 0 4px #006;
    transition: none;
  }

  .futatsumeWatchVideoInfoPanel .tabSelect:not(.activeTab):hover {
    background: #888;
  }

  .futatsumeWatchVideoInfoPanel.initializing {
  }

  .futatsumeWatchVideoInfoPanel>* {
    transition: opacity 0.4s ease;
    pointer-events: none;
  }

  .is-mouseMoving .futatsumeWatchVideoInfoPanel>*,
                .futatsumeWatchVideoInfoPanel:hover>* {
    pointer-events: auto;
  }


  .futatsumeWatchVideoInfoPanel.initializing>* {
    opacity: 0;
    color: #333;
    transition: none;
  }

  .futatsumeWatchVideoInfoPanel {
    position: absolute;
    top: 0;
    width: 320px;
    height: 100%;
    box-sizing: border-box;
    z-index: 25000;
    background: #333;
    color: #ccc;
    overflow-x: hidden;
    overflow-y: hidden;
    transition: opacity 0.4s ease;
  }

  .futatsumeWatchVideoInfoPanel .ownerPageLink {
    display: block;
    margin: 0 auto 8px;
    width: 104px;
  }

  .futatsumeWatchVideoInfoPanel .ownerIcon {
    width: 96px;
    height: 96px;
    border: none;
    border-radius: 4px;
    transition: opacity 1s ease;
    vertical-align: middle;
  }
  .futatsumeWatchVideoInfoPanel .ownerIcon.is-loading {
    opacity: 0;
  }

  .futatsumeWatchVideoInfoPanel .ownerName {
    font-size: 20px;
    word-break: break-all;
  }

  .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer {
    padding: 16px;
    display: table;
    width: 100%;
  }

  .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer>*{
    display: block;
    vertical-align: middle;
    text-align: center;
  }

  .futatsumeWatchVideoInfoPanel .videoDescription {
    padding: 8px 8px 8px;
    margin: 4px 0px;
    word-break: break-all;
    line-height: 1.5;
  }

  .futatsumeWatchVideoInfoPanel .videoDescription a {
    display: inline-block;
    font-weight: bold;
    text-decoration: none;
    color: #ff9;
    padding: 2px;
  }
  .futatsumeWatchVideoInfoPanel .videoDescription a:visited {
    color: #ffd;
  }

  .futatsumeWatchVideoInfoPanel .videoDescription .watch {
    display: block;
    position: relative;
    line-height: 60px;
    box-sizing: border-box;
    padding: 4px 16px;;
    min-height: 60px;
    width: 272px;
    margin: 8px 10px;
    background: #444;
    border-radius: 4px;
  }
  .futatsumeWatchVideoInfoPanel .videoDescription .watch:hover {
    background: #446;
  }

  .videoDescription-font[style*="color"] {
    text-shadow:
      0 -1px 2px var(--base-description-color, #888),
      1px 0 2px var(--base-description-color, #888),
      0 1px 2px var(--base-description-color, #888),
      -1px 0 2px var(--base-description-color, #888);
  }

  .futatsumeWatchVideoInfoPanel .videoDescription .mylistLink,
  .futatsumeWatchVideoInfoPanel .videoDescription .seriesLink {
    white-space: nowrap;
    display: inline-block;
  }

  .futatsumeWatchVideoInfoPanel:not(.is-pocketReady) .pocket-info {
    display: none !important;
  }
  .pocket-info {
    font-family: Menlo;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistAppend,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .deflistAdd,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetMylist,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetSeries,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .pocket-info,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetUploadedVideo {
    display: inline-block;
    font-size: 16px;
    line-height: 20px;
    width: 24px;
    height: 24px;
    background: #666;
    color: #ccc !important;
    background: #666;
    text-decoration: none;
    border: 1px outset;
    cursor: pointer;
    text-align: center;
    user-select: none;
    margin-left: 8px;
  }
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistAppend,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .pocket-info,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .deflistAdd {
    display: none;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .owner:hover .playlistAppend,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .watch:hover .playlistAppend,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .watch:hover .pocket-info,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .watch:hover .deflistAdd {
    display: inline-block;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistAppend {
    position: absolute;
    bottom: 4px;
    left: 16px;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .pocket-info {
    position: absolute;
    bottom: 4px;
    left: 48px;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .deflistAdd {
    position: absolute;
    bottom: 4px;
    left: 80px;
  }

  .futatsumeWatchVideoInfoPanel .videoInfoTab .pocket-info:hover,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistAppend:hover,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .deflistAdd:hover,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetMylist:hover,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetSeries:hover,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetUploadedVideo:hover {
    transform: scale(1.5);
  }
  .futatsumeWatchVideoInfoPanel .videoInfoTab .pocket-info:active,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistAppend:active,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .deflistAdd:active,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetMylist:active,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetSeries:active,
  .futatsumeWatchVideoInfoPanel .videoInfoTab .playlistSetUploadedVideo:active {
    transform: scale(1.2);
    border: 1px inset;
  }


  .futatsumeWatchVideoInfoPanel .videoDescription .watch .videoThumbnail {
    position: absolute;
    right: 16px;
    height: 60px;
    pointer-events: none;
  }
  .futatsumeWatchVideoInfoPanel .videoDescription:hover .watch .videoThumbnail {
    filter: none;
  }



  .futatsumeWatchVideoInfoPanel .publicStatus,
  .futatsumeWatchVideoInfoPanel .videoTagsContainer {
    display: none;
  }

  .futatsumeWatchVideoInfoPanel .publicStatus {
    display: none;
    position: relative;
    margin: 8px 0;
    padding: 8px;
    line-height: 150%;
    text-align: center;
    color: #333;
  }

  .futatsumeWatchVideoInfoPanel .videoMetaInfoContainer {
    display: inline-block;
    padding: 0 8px;
  }


  .futatsumeWatchVideoInfoPanel .relatedVideoTab .relatedVideoContainer {
    box-sizing: border-box;
    position: relative;
    width: 100%;
    height: 100%;
    margin: 0;
    user-select: none;
  }

  .futatsumeWatchVideoInfoPanel .videoListFrame,
  .futatsumeWatchVideoInfoPanel .commentListFrame {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border: 0;
    background: #333;
  }

  .futatsumeWatchVideoInfoPanel .nowLoading {
    display: none;
    opacity: 0;
    pointer-events: none;
  }
  .futatsumeWatchVideoInfoPanel.initializing .nowLoading {
    display: block !important;
    opacity: 1 !important;
    color: #888;
  }
  .futatsumeWatchVideoInfoPanel .nowLoading {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
  }
  .futatsumeWatchVideoInfoPanel .kurukuru {
    position: absolute;
    display: inline-block;
    font-size: 96px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  @keyframes loadingRolling {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(1800deg); }
  }
  .futatsumeWatchVideoInfoPanel.initializing .kurukuruInner {
    display: inline-block;
    pointer-events: none;
    text-align: center;
    text-shadow: 0 0 4px #888;
    animation-name: loadingRolling;
    animation-iteration-count: infinite;
    animation-duration: 4s;
  }
  .futatsumeWatchVideoInfoPanel .nowLoading .loadingMessage {
    position: absolute;
    display: inline-block;
    font-family: Impact;
    font-size: 32px;
    text-align: center;
    top: calc(50% + 48px);
    left: 0;
    width: 100%;
  }

  ${CONSTANT.SCROLLBAR_CSS}

  .futatsumeWatchVideoInfoPanel .futatsumeWatchVideoInfoPanelInner {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
    .futatsumeWatchVideoInfoPanelContent {
      flex: 1;
    }

  .futatsumeTubeButton {
    display: inline-block;
    padding: 4px 8px;
    cursor: pointer;
    background: #666;
    color: #ccc;
    border-radius: 4px;
    border: 1px outset;
    margin: 0 8px;
  }
  .futatsumeTubeButton:hover {
    box-shadow: 0 0 8px #fff, 0 0 4px #ccc;
  }
    .futatsumeTubeButton span {
      pointer-events: none;
      display: inline-block;
      background: #ccc;
      color: #333;
      border-radius: 4px;
    }
    .futatsumeTubeButton:hover span {
      background: #f33;
      color: #ccc;
    }
  .futatsumeTubeButton:active {
    box-shadow:  0 0 2px #ccc, 0 0 4px #000 inset;
    border: 1px inset;
  }

  .futatsumeWatchVideoInfoPanel .relatedInfoMenuContainer {
    text-align: left;
  }

  .futatsumeWatchVideoInfoPanel .seriesList {
    padding: 0 8px;
  }

  futatsume-video-item,
  futatsume-video-series-label,
  futatsume-vieo-description {
    content-visibility: auto;
  }

  `,
  { className: 'videoInfoPanel' }
);

css.addStyle(
  `
  .is-open .futatsumeWatchVideoInfoPanel>* {
    display: none;
    pointer-events: none;
  }
  .futatsumeWatchVideoInfoPanel:hover>* {
    display: inherit;
    pointer-events: auto;
  }
  .futatsumeWatchVideoInfoPanel:hover .tabSelectContainer {
    display: flex;
  }

  .futatsumeWatchVideoInfoPanel {
    top: 20%;
    right: calc(32px - 320px);
    left: auto;
    width: 320px;
    height: 60%;
    border: 1px solid transparent;
    background: none;
    opacity: 0;
    box-shadow: none;
    transition: opacity 0.4s ease, transform 0.4s ease 1s;
    will-change: opacity, transform;
  }

  .is-mouseMoving  .futatsumeWatchVideoInfoPanel {
    border: 1px solid #888;
    opacity: 0.5;
  }

  .futatsumeWatchVideoInfoPanel.is-slideOpen,
  .futatsumeWatchVideoInfoPanel:hover {
    background: #333;
    box-shadow: 4px 4px 4px #000;
    border: none;
    opacity: 0.9;
    transform: translate3d(-288px, 0, 0);
    transition: opacity 0.4s ease, transform 0.4s ease 1s;
  }

`,
  { className: 'screenMode for-full videoInfoPanel' }
);

css.addStyle(
  `
  .futatsumeScreenMode_small .futatsumeWatchVideoInfoPanel {
    display: none;
  }

  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .tabSelectContainer {
    width: calc(100% - 16px);
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .tabSelect {
    background: #ccc;
    color: #888;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .tabSelect.activeTab {
    background: #ddd;
    color: black;
    border: none;
  }

  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel {
    top: 230px;
    left: 0;
    width: ${CONSTANT.SIDE_PLAYER_WIDTH}px;
    height: calc(100vh - 296px);
    bottom: 48px;
    padding: 8px;
    box-shadow: none;
    background: #f0f0f0;
    color: #000;
    border: 1px solid #333;
    margin: 4px 2px;
  }

  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .publicStatus {
    display: block;
    text-align: center;
  }

  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .videoDescription a {
    color: #006699;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .videoDescription a:visited {
    color: #666666;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .videoTagsContainer {
    display: block;
    bottom: 48px;
    width: 364px;
    margin: 0 auto;
    padding: 8px;
    background: #ccc;
  }

  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .videoDescription .watch {
    background: #ddd;
  }
  .futatsumeScreenMode_sideView .futatsumeWatchVideoInfoPanel .videoDescription .watch:hover {
    background: #ddf;
  }

  .futatsumeScreenMode_sideView .videoInfoTab::-webkit-scrollbar {
    background: #f0f0f0;
  }

  .futatsumeScreenMode_sideView .videoInfoTab::-webkit-scrollbar-thumb {
    border-radius: 0;
    background: #ccc;
  }
`,
  { className: 'screenMode for-popup videoInfoPanel' }
);

void (uq as unknown as UqStatic).ready().then(() => {
  if (document.body.classList.contains('MatrixRanking-body')) {
    css.addStyle(
      `
      body.futatsumeScreenMode_sideView.MatrixRanking-body .RankingRowRank {
        line-height: 48px;
        height: 48px;
        pointer-events: none;
        user-select: none;
      }
      body.futatsumeScreenMode_sideView.MatrixRanking-body .RankingRowRank {
        position: sticky;
        left: calc(var(--sideView-left-margin) - 8px);
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
      body.futatsumeScreenMode_sideView.MatrixRanking-body .BaseLayout-block {
        width: ${1024 + 64 * 2}px;
      }
      .RankingMainContainer-decorateChunk+.RankingMainContainer-decorateChunk,
      .RankingMainContainer-decorateChunk>*+* {
        margin-top: 0;
      }
      body.futatsumeScreenMode_sideView .RankingMainContainer {
        width: ${1024}px;
      }
      body.futatsumeScreenMode_sideView.MatrixRanking-body .RankingMatrixVideosRow {
        width: ${1024 + 64}px;
        margin-left: ${-64}px;
      }
        .RankingGenreListContainer-categoryHelp {
          position: static;
        }
        .RankingMatrixNicoadsRow>*+*,
        .RankingMatrixVideosRow>:nth-child(n+3) {
          margin-left: 13px;
        }
        .RankingBaseItem {
          width: 160px;
          height: 196px;
        }
          body.futatsumeScreenMode_sideView .RankingBaseItem .Card-link {
            grid-template-rows: 90px auto;
          }
          .VideoItem.RankingBaseItem .VideoThumbnail {
            border-radius: 3px 3px 0 0;
          }

          [data-nicoad-grade] .Thumbnail.VideoThumbnail .Thumbnail-image {
            margin: 3px;
            background-size: calc(100% + 6px);
          }
          [data-nicoad-grade] .Thumbnail.VideoThumbnail:after {
            width: 40px;
            height: 40px;
            background-size: 80px 80px;
          }
          .Thumbnail.VideoThumbnail .VideoLength {
            bottom: 3px;
            right: 3px;
          }
          .VideoThumbnailComment {
            transform: scale(0.8333);
          }
          .RankingBaseItem-meta {
            position: static;
            padding: 0 4px 8px;
          }
          .VideoItem.RankingBaseItem .VideoItem-metaCount>.VideoMetaCount {
            white-space: nowrap;
          }
      .RankingMainContainer .ToTopButton {
        transform: translateX(calc(100vw / 2 - 100% - 36px));
        user-select: none;
      }
    `,
      { className: 'screenMode for-sideView MatrixRanking', disabled: true }
    );
  }
});

css.addStyle(
  `
  .is-open .futatsumeWatchVideoInfoPanel {
    display: none;
    left: calc(100%);
    top: 0;
  }

  @media screen {
    @media (min-width: 992px) {
      .futatsumeScreenMode_normal .futatsumeWatchVideoInfoPanel {
        display: inherit;
      }
    }

    @media (min-width: 1216px) {
      .futatsumeScreenMode_big .futatsumeWatchVideoInfoPanel {
        display: inherit;
      }
    }

    /* 縦長モニター */
    @media
      (max-width: 991px) and (min-height: 700px)
    {
      .futatsumeScreenMode_normal .futatsumeWatchVideoInfoPanel {
        display: inherit;
        top: 100%;
        left: 0;
        width: 100%;
        height: ${CONSTANT.BOTTOM_PANEL_HEIGHT}px;
        z-index: 20000;
      }


      .futatsumeScreenMode_normal .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer {
        display: table;
      }
      .futatsumeScreenMode_normal .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer>* {
        display: table-cell;
        text-align: left;
      }
      .futatsumeScreenMode_normal .futatsumeWatchVideoHeaderPanel {
        width: 100% !important;
      }
    }

    @media
      (max-width: 1215px) and (min-height: 700px) {
      .futatsumeScreenMode_big .futatsumeWatchVideoInfoPanel {
        display: inherit;
        top: 100%;
        left: 0;
        width: 100%;
        height: ${CONSTANT.BOTTOM_PANEL_HEIGHT}px;
        z-index: 20000;
      }


      .futatsumeScreenMode_big .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer {
        display: table;
      }
      .futatsumeScreenMode_big .futatsumeWatchVideoInfoPanel .videoOwnerInfoContainer>* {
        display: table-cell;
        text-align: left;
      }

      .futatsumeScreenMode_big .futatsumeWatchVideoHeaderPanel {
        width: 100% !important;
      }
    }
  }

`,
  { className: 'screenMode for-dialog videoInfoPanel' }
);

css.addStyle(
  `
  .futatsumeWatchVideoInfoPanel .comment {
    padding-left: 0;
  }
`,
  { className: 'domain slack-com', disabled: true }
);
