import { CONSTANT } from '../shared/constant';
export const NICO_VIDEO_PLAYER_DIALOG_VIEW_CSS = `

  .futatsumeVideoPlayerDialog {
    display: none;
    position: fixed;
    /*background: rgba(0, 0, 0, 0.8);*/
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: ${CONSTANT.BASE_Z_INDEX};
    font-size: 13px;
    text-align: left;
    box-sizing: border-box;
    contain: size style layout;
  }

  .futatsumeVideoPlayerDialog::before {
    content: ' ';
    background: rgba(0, 0, 0, 0.8);
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    will-change: transform;
  }

  .is-regularUser  .forPremium {
    display: none !important;
  }

  .futatsumeVideoPlayerDialog * {
    box-sizing: border-box;
  }

  .futatsumeVideoPlayerDialog.is-open {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .futatsumeVideoPlayerDialog li {
    text-align: left;
  }

  .futatsumeVideoPlayerDialogInner {
    background: #000;
    box-sizing: border-box;
    z-index: 1;
    box-shadow: 4px 4px 4px #000;
  }

  .futatsumePlayerContainer {
    position: relative;
    background: #000;
    width: 672px;
    height: 384px;
    background-size: cover;
    background-repeat: no-repeat;
    background-position: center center;
  }
  .futatsumePlayerContainer.is-loading {
    cursor: wait;
  }
  .futatsumePlayerContainer:not(.is-loading):not(.is-error) {
    background-image: none !important;
    background: none !important;
  }
  .futatsumePlayerContainer.is-loading .videoPlayer,
  .futatsumePlayerContainer.is-loading .commentLayerFrame,
  .futatsumePlayerContainer.is-error .videoPlayer,
  .futatsumePlayerContainer.is-error .commentLayerFrame {
    display: none;
  }

  .futatsumePlayerContainer .videoPlayer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    right: 0;
    bottom: 0;
    height: 100%;
    border: 0;
    z-index: 100;
    background: #000;
    will-change: transform, opacity;
    user-select: none;
  }

  .is-mouseMoving .videoPlayer>* {
    cursor: auto;
  }

  .is-loading .videoPlayer>* {
    cursor: wait;
  }

  .futatsumePlayerContainer .commentLayerFrame {
    position: absolute;
    border: 0;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    z-index: 101;
    pointer-events: none;
    cursor: none;
    user-select: none;
    opacity: var(--futatsume-comment-layer-opacity);
  }

  .loadingMessageContainer {
    display: none;
    pointer-events: none;
  }
  .futatsumePlayerContainer.is-loading .loadingMessageContainer {
    display: flex;
    position: absolute;
    z-index: 10000;
    top: 50%;
    left: 50%;
    width: min(320px, 70%);
    flex-direction: column;
    gap: 12px;
    transform: translate(-50%, -50%);
    color: var(--base-fore-color);
    text-shadow: 0 0 8px #003;
    font: 14px/1.5 sans-serif;
    text-align: center;
  }

  .loadingProgressTrack {
    display: block;
    width: 100%;
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: #ffffff40;
  }
  .loadingProgressTrack > span {
    display: block;
    width: 35%;
    height: 100%;
    border-radius: inherit;
    background: #ffffff;
    animation: loadingProgress 1.2s ease-in-out infinite alternate;
  }
  @keyframes loadingProgress {
    from { transform: translateX(0); }
    to { transform: translateX(185%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .loadingProgressTrack > span {
      width: 100%;
      animation: none;
    }
  }

  .errorMessageContainer {
    display: none;
    pointer-events: none;
    user-select: none;
  }

  .futatsumePlayerContainer.is-error .errorMessageContainer {
    display: inline-block;
    position: absolute;
    z-index: 10000;
    top: 50%;
    left: 50%;
    padding: 8px 16px;
    transform: translate(-50%, -50%);
    background: rgba(255, 0, 0, 0.9);
    font-size: 24px;
    box-shadow: 8px 8px 4px rgba(128, 0, 0, 0.8);
    white-space: nowrap;
  }
  .errorMessageContainer:empty {
    display: none !important;
  }

  .popupMessageContainer {
    top: 50px;
    left: 50px;
    z-index: 25000;
    position: absolute;
    pointer-events: none;
    transform: translateZ(0);
    user-select: none;
  }


  @media screen {
    /* 右パネル分の幅がある時は右パネルを出す */
    @media (min-width: 992px) {
      .futatsumeScreenMode_normal .futatsumeVideoPlayerDialogInner {
        padding-right: ${CONSTANT.RIGHT_PANEL_WIDTH}px;
        background: none;
      }
    }

    @media (min-width: 1216px) {
      .futatsumeScreenMode_big .futatsumeVideoPlayerDialogInner {
        padding-right: ${CONSTANT.RIGHT_PANEL_WIDTH}px;
        background: none;
      }
    }

    /* 縦長モニター */
    @media
      (max-width: 991px) and (min-height: 700px)
    {
      .futatsumeScreenMode_normal .futatsumeVideoPlayerDialogInner {
        padding-bottom: 240px;
        background: none;
      }
    }

    @media
      (max-width: 1215px) and (min-height: 700px)
    {
      .futatsumeScreenMode_big .futatsumeVideoPlayerDialogInner {
        padding-bottom: 240px;
        background: none;
      }
    }

    /* 960x540 */
    @media
      (min-width: 1328px) and (min-height: 700px)
    {
      .futatsumeScreenMode_big .futatsumePlayerContainer {
        width: calc(960px * 1.05);
        height: 540px;
      }
    }

    /* 1152x648 */
    @media
      (min-width: 1530px) and (min-height: 900px)
    {
      .futatsumeScreenMode_big .futatsumePlayerContainer {
        width: calc(1152px * 1.05);
        height: 648px;
      }
    }

    /* 1280x720 */
    @media
      (min-width: 1664px) and (min-height: 900px)
    {
      .futatsumeScreenMode_big .futatsumePlayerContainer {
        width: calc(1280px * 1.05);
        height: 720px;
      }
    }

    /* 1920x1080 */
    @media
      (min-width: 2336px) and (min-height: 1200px)
    {
      .futatsumeScreenMode_big .futatsumePlayerContainer {
        width: calc(1920px * 1.05);
        height: 1080px;
      }
    }

    /* 2560x1440 */
    @media
      (min-width: 2976px) and (min-height: 1660px)
    {
      .futatsumeScreenMode_big .futatsumePlayerContainer {
        width: calc(2560px * 1.05);
        height: 1440px;
      }
    }
  }

  `.trim();

export const NICO_VIDEO_PLAYER_DIALOG_VIEW_TEMPLATE = `
    <div id="futatsumeVideoPlayerDialog" class="futatsumeVideoPlayerDialog futatsume-family futatsume-root">
      <div class="futatsumeVideoPlayerDialogInner">
        <div class="menuContainer"></div>
        <div class="futatsumePlayerContainer">

          <div class="popupMessageContainer"></div>
          <div class="errorMessageContainer"></div>
          <div class="loadingMessageContainer" role="progressbar" aria-label="動画を読み込み中" aria-valuetext="読み込み中">
            <span>動画読込中</span>
            <span class="loadingProgressTrack" aria-hidden="true"><span></span></span>
          </div>
        </div>
      </div>
    </div>
  `.trim();
/**
 * TODO: 分割 まにあわなくなっても知らんぞー
 */
