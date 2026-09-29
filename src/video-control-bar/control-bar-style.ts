import { CONSTANT } from '../shared/constant';
import { util } from '../shared/util';
import type { VcbUtil } from './types';
(util as unknown as VcbUtil).addStyle(
  `
  .videoControlBar {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100vw;
    height: var(--futatsume-control-bar-height, ${CONSTANT.CONTROL_BAR_HEIGHT}px);
    z-index: 150000;
    background: #000;
    transition: opacity 0.3s ease, transform 0.3s ease;
    user-select: none;
    contain: layout style size;
    will-change: transform;
  }

  .videoControlBar * {
    box-sizing: border-box;
    user-select: none;
    line-break: auto;
  }

  .videoControlBar.is-wheelSeeking {
    pointer-events: none;
  }


  .controlItemContainer {
    position: absolute;
    top: 10px;
    height: 40px;
    z-index: 200;
  }

  .controlItemContainer:hover,
  .controlItemContainer:focus-within,
  .videoControlBar.is-menuOpen .controlItemContainer {
    z-index: 260;
  }

  .controlItemContainer.left {
    left: 0;
    height: 40px;
    white-space: nowrap;
    overflow: visible;
    transition: transform 0.2s ease, left 0.2s ease;
  }
  .controlItemContainer.left .scalingUI {
    padding: 0 8px 0;
  }
  .controlItemContainer.left .scalingUI:empty {
    display: none;
  }
  .controlItemContainer.left .scalingUI>* {
    background: #222;
    display: inline-block;
  }

  .controlItemContainer.center {
    left: 50%;
    height: 40px;
    transform: translate(-50%, 0);
    white-space: nowrap;
    overflow: visible;
    transition: transform 0.2s ease, left 0.2s ease;
  }

  .controlItemContainer.center .scalingUI {
    transform-origin: top center;
  }
  .controlItemContainer.center .scalingUI > div{
    display: flex;
    align-items: center;
    background:
      linear-gradient(to bottom,
      transparent, transparent 4px, #222 0, #222 30px, transparent 0, transparent);
    height: 32px;
  }

  .controlItemContainer.right {
    right: 0;
  }

  .is-mouseMoving .controlItemContainer.right .controlButton{
    background: #333;
  }
  .controlItemContainer.right .scalingUI {
    transform-origin: top right;
  }

  .controlButton {
    position: relative;
    display: inline-block;
    transition: opacity 0.4s ease;
    font-size: 20px;
    width: 32px;
    height: 32px;
    line-height: 30px;
    box-sizing: border-box;
    text-align: center;
    cursor: pointer;
    color: #fff;
    opacity: 0.8;
    min-width: 32px;
    vertical-align: middle;
    outline: none;
  }
  .controlButton:hover {
    cursor: pointer;
    opacity: 1;
  }
  .controlButton:active .controlButtonInner {
    transform: translate(0, 2px) scale(0.8);
  }

  .is-abort   .playControl,
  .is-error   .playControl,
  .is-loading .playControl {
    opacity: 0.4 !important;
    pointer-events: none;
  }


  .controlButton .tooltip {
    display: none;
    pointer-events: none;
    position: absolute;
    left: 16px;
    top: -30px;
    transform:  translate(-50%, 0);
    font-size: 12px;
    line-height: 16px;
    padding: 2px 4px;
    border: 1px solid #000;
    background: #ffc;
    color: #000;
    text-shadow: none;
    white-space: nowrap;
    z-index: 100;
    opacity: 0.8;
  }
  .is-mouseMoving .controlButton:hover .tooltip {
    display: block;
    opacity: 1;
  }
  .videoControlBar:hover .controlButton {
    opacity: 1;
    pointer-events: auto;
  }

  .videoControlBar .controlButton:focus-within {
    pointer-events: none;
  }
  .videoControlBar .controlButton:focus-within .futatsumePopupMenu,
  .videoControlBar .controlButton              .futatsumePopupMenu:hover {
    pointer-events: auto;
    visibility: visible;
    opacity: 0.99;
    pointer-events: auto;
    transition: opacity 0.3s;
  }
  .videoControlBar .controlButton:focus-within .tooltip {
    display: none;
  }

  .settingPanelSwitch {
    width: 32px;
  }
  .settingPanelSwitch:hover {
    text-shadow: 0 0 8px #ff9;
  }
  .settingPanelSwitch .tooltip {
    left: 0;
  }
  .videoControlBar .futatsumeSubMenu {
    left: 50%;
    transform: translate(-50%, 0);
    bottom: 44px;
    white-space: nowrap;
  }

  .videoControlBar .triangle {
    transform: translate(-50%, 0) rotate(-45deg);
    bottom: -8.5px;
    left: 50%;
  }

  .videoControlBar .futatsumeSubMenu::after {
    content: '';
    position: absolute;
    display: block;
    width: 110%;
    height: 16px;
    left: -5%;
  }

  .controlButtonInner {
    display: inline-block;
  }


  .seekTop {
    left: 0px;
    width: 32px;
    transform: scale(1.1);
  }

  .togglePlay {
    width: 36px;
    transition: transform 0.2s ease;
    transform: scale(1.1);
  }
  .togglePlay:active {
    transform: scale(0.75);
  }

  .togglePlay .play,
  .togglePlay .pause {
    display: inline-block;
    position: absolute;
    top: 50%;
    left: 50%;
    transition: transform 0.1s linear, opacity 0.1s linear;
    user-select: none;
    pointer-events: none;
  }
  .togglePlay .play {
    width: 100%;
    height: 100%;
    transform: scale(1.2) translate(-50%, -50%) translate(10%, 10%);
  }
  .is-playing .togglePlay .play {
    opacity: 0;
  }
  .togglePlay>.pause {
    width: 24px;
    height: 16px;
    background-image: linear-gradient(
      to right,
      transparent 0, transparent 12.5%,
      currentColor 0, currentColor 43.75%,
      transparent 0, transparent 56.25%,
      currentColor 0, currentColor 87.5%,
      transparent 0);
    opacity: 0;
    transform: scaleX(0);
  }
  .is-playing .togglePlay>.pause {
    opacity: 1;
    transform: translate(-50%, -50%);
  }

  .seekBarContainer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    cursor: pointer;
    z-index: 250;
  }
  /* 見えないマウス判定 */
  .seekBarContainer .seekBarShadow {
    position: absolute;
    background: transparent;
    opacity: 0;
    width: 100%;
    height: 8px;
    top: -8px;
  }
  .is-mouseMoving .seekBarContainer:hover .seekBarShadow {
    height: 48px;
    top: -48px;
  }

  .is-abort   .seekBarContainer,
  .is-loading .seekBarContainer,
  .is-error   .seekBarContainer {
    pointer-events: none;
  }
  .is-abort   .seekBarContainer *,
  .is-error   .seekBarContainer * {
    display: none;
  }

  .seekBar {
    position: relative;
    width: 100%;
    height: 10px;
    margin: 2px 0 2px;
    border-top:    1px solid #333;
    border-bottom: 1px solid #333;
    cursor: pointer;
    transition: height 0.2s ease 1s, margin-top 0.2s ease 1s;
  }

  .seekBar:hover {
    height: 24px;
    /* このmargin-topは見えないマウスオーバー判定を含む */
    margin-top: -14px;
    transition: none;
    background-color: rgba(0, 0, 0, 0.5);
  }

  .seekBarContainer .seekBar * {
    pointer-events: none;
  }

  .bufferRange {
    position: absolute;
    --buffer-range-left: 0;
    --buffer-range-scale: 0;
    width: 100%;
    height: 110%;
    left: 0px;
    top: 0px;
    box-shadow: 0 0 6px #ff9 inset, 0 0 4px #ff9;
    z-index: 190;
    background: #ff9;
    transform-origin: left;
    transform:
      translateX(var(--buffer-range-left))
      scaleX(var(--buffer-range-scale));
    transition: transform 0.2s;
    mix-blend-mode: overlay;
    will-change: transform, opacity;
    opacity: 0.6;
  }

  .is-youTube .bufferRange {
    width: 100% !important;
    height: 110% !important;
    background: #f99;
    transition: transform 0.5s ease 1s;
    transform: translate3d(0, 0, 0) scaleX(1) !important;
  }

  .seekBarPointer {
    /*--width-pp: 12px;
    --trans-x-pp: 0;*/
    position: absolute;
    display: inline-block;
    top: -1px;
    left: 0;
    width: 12px;
    background: rgba(255, 255, 255, 0.7);
    height: calc(100% + 2px);
    z-index: 200;
    box-shadow: 0 0 4px #ffc inset;
    pointer-events: none;
    transform: translateX(-6px);
    /*transform: translate(calc(var(--trans-x-pp) - var(--width-pp) / 2), -50%);*/
    will-change: transform;
    mix-blend-mode: lighten;
  }

  .is-loading .seekBarPointer {
    display: none !important;
  }

  .is-dragging .seekBarPointer.is-notSmooth {
    transition: none;
  }
  .is-dragging .seekBarPointer::after,
  .is-wheelSeeking .seekBarPointer::after {
    content: '';
    position: absolute;
    width: 36px;
    height: 36px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: 100%;
    box-shadow: 0 0 8px #ffc inset, 0 0 8px #ffc;
    pointer-events: none;
  }

  .seekBarContainer .seekBar .seekRange {
    -webkit-appearance: none;
    position: absolute;
    left: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    box-sizing: border-box;
    cursor: pointer;
    opacity: 0;
    pointer-events: auto;
  }
  .seekRange::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 10px;
    width: 2px;
  }
  .seekRange::-moz-range-thumb {
    height: 10px;
    width: 2px;
  }

  .videoControlBar .videoTime {
    display: inline-flex;
    top: 0;
    padding: 0;
    width: 96px;
    height: 18px;
    line-height: 18px;
    contain: strict;
    color: #fff;
    font-size: 12px;
    white-space: nowrap;
    vertical-align: middle;
    background: rgba(33, 33, 33, 0.5);
    border: 0;
    pointer-events: none;
    user-select: none;
  }

  .videoControlBar .videoTime .currentTimeLabel,
  .videoControlBar .videoTime .currentTime,
  .videoControlBar .videoTime .duration {
    position: relative;
    display: inline-block;
    color: #fff;
    text-align: center;
    background: inherit;
    border: 0;
    width: 44px;
    font-family: 'Yu Gothic', 'YuGothic', 'Courier New', Osaka-mono, 'ＭＳ ゴシック', monospace;
  }
  .videoControlBar.is-loading .videoTime {
    display: none;
  }

  .seekBarContainer .tooltip {
    position: absolute;
    padding: 1px;
    bottom: 12px;
    left: 0;
    transform: translate(-50%, 0);
    white-space: nowrap;
    font-size: 10px;
    opacity: 0;
    border: 1px solid #000;
    background: #fff;
    color: #000;
    z-index: 150;
  }

  .is-dragging .seekBarContainer .tooltip,
  .seekBarContainer:hover .tooltip {
    opacity: 0.8;
  }

  .resumePointer {
    position: absolute;
    mix-blend-mode: color-dodge;
    will-change: transform;
    top: 0;
    z-index: 200;
  }

  .futatsumeHeatMap {
    position: absolute;
    pointer-events: none;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    transform-origin: 0 0 0;
    will-change: transform;
    opacity: 0.5;
    z-index: 110;
  }
  .noHeatMap .futatsumeHeatMap {
    display: none;
  }

  .loopSwitch {
    width:  32px;
    height: 32px;
    line-height: 30px;
    font-size: 20px;
    color: #888;
  }
  .loopSwitch:active {
    font-size: 15px;
  }

  .is-loop .loopSwitch {
    color: var(--enabled-button-color);
  }
  .loopSwitch .controlButtonInner {
    font-family: STIXGeneral;
  }

  .playbackRateMenu {
    bottom: 0;
    width: auto;
    width: 48px;
    height: 32px;
    line-height: 30px;
    font-size: 18px;
    white-space: nowrap;
    margin-right: 0;
  }


  .playbackRateSelectMenu {
    width: 180px;
    text-align: left;
    line-height: 20px;
    font-size: 18px !important;
  }

  .playbackRateSelectMenu ul {
    margin: 2px 8px;
  }

  .playbackRateSelectMenu li {
    padding: 3px 4px;
  }

  .screenModeMenu:focus-within {
    background: #888;
  }
  .screenModeMenu:focus-within .tooltip {
    display: none;
  }

  .screenModeSelectMenu {
    width: 148px;
    padding: 2px 4px;
    font-size: 12px;
    line-height: 15px;
  }

  .screenModeSelectMenu ul {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .screenModeSelectMenu ul li {
    display: inline-block;
    text-align: center;
    border: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .screenModeSelectMenu ul li span {
    border: 1px solid #ccc;
    width: 50px;
    margin: 2px 8px;
    padding: 4px 0;
  }

  body[data-screen-mode="3D"]       .screenModeSelectMenu li.mode3D span,
  body[data-screen-mode="sideView"] .screenModeSelectMenu li.sideView span,
  body[data-screen-mode="small"]    .screenModeSelectMenu li.small span,
  body[data-screen-mode="normal"]   .screenModeSelectMenu li.normal span,
  body[data-screen-mode="big"]      .screenModeSelectMenu li.big span,
  body[data-screen-mode="wide"]     .screenModeSelectMenu li.wide span {
    color: #ff9;
    border-color: #ff0;
  }

  .fullscreenControlBarModeMenu {
    display: none;
    font-size: 16px;
    white-space: nowrap;
  }
  .fullscreenControlBarModeMenu .controlButtonInner {
    filter: grayscale(100%);
  }
  .fullscreenControlBarModeMenu:focus-within .controlButtonInner,
  .fullscreenControlBarModeMenu:hover .controlButtonInner {
    filter: grayscale(50%);
  }


           .is-fullscreen  .fullscreenSwitch .controlButtonInner .toFull,
  body:not(.is-fullscreen) .fullscreenSwitch .controlButtonInner .returnFull {
    display: none;
  }

  .videoControlBar .muteSwitch {
    margin-right: 0;
  }
  .videoControlBar .muteSwitch:active {
    font-size: 15px;
  }

  .futatsumePlayerContainer:not(.is-mute) .muteSwitch .mute-on,
                            .is-mute  .muteSwitch .mute-off {
    display: none;
  }

  .videoControlBar .volumeControl {
    display: inline-block;
  }
  .videoControlBar .volumeRange {
    width: 64px;
    height: 8px;
    position: relative;
    vertical-align: middle;
    --back-color: #333;
    --fore-color: #ccc;
  }
  .is-mute .videoControlBar .volumeRange  {
    --fore-color: var(--back-color);
    pointer-events: none;
  }

  .prevVideo.playControl,
  .nextVideo.playControl {
    display: none;
  }
  .is-playlistEnable .prevVideo.playControl,
  .is-playlistEnable .nextVideo.playControl {
    display: inline-block;
  }

  .prevVideo,
  .nextVideo {
    font-size: 23px;
  }
  .prevVideo .controlButtonInner {
    transform: scaleX(-1);
  }

  .toggleStoryboard {
    visibility: hidden;
    pointer-events: none;
  }
  .is-storyboardAvailable .toggleStoryboard {
    visibility: visible;
    pointer-events: auto;
  }
  .futatsumeStoryboardOpen .is-storyboardAvailable .toggleStoryboard {
    color: var(--enabled-button-color);
  }

  .toggleStoryboard .controlButtonInner {
    position: absolute;
    width: 20px;
    height: 20px;
    top: 50%;
    left: 50%;
    border-radius: 75% 16%;
    border: 1px solid;
    transform: translate(-50%, -50%) rotate(45deg);
    pointer-events: none;
    background:
      radial-gradient(
        currentColor,
        currentColor 6px,
        transparent 0
      );
  }
  .toggleStoryboard:active .controlButtonInner {
    transform: translate(-50%, -50%) scaleY(0.1) rotate(45deg);
  }

  .toggleStoryboard:active {
    transform: scale(0.75);
  }

  .videoQualityMenu {
    min-width: 40px;
    font-size: 16px;
    white-space: nowrap;
  }
  .is-youTube .videoQualityMenu {
    text-shadow:
      0px 0px 8px #fc9, 0px 0px 6px #fc9, 0px 0px 4px #fc9, 0px 0px 2px #fc9 !important;
  }
  .is-youTube .videoQualityMenu:not(.forYouTube),
  .videoQualityMenu.forYouTube {
    display: none;
  }
  .is-youTube .videoQualityMenu.forYouTube {
    display: inline-block;
  }


  .videoQualityMenu:focus-within {
    background: #888;
  }
  .videoQualityMenu:focus-within .tooltip {
    display: none;
  }

  .videoQualitySelectMenu  {
    bottom: 44px;
    left: 50%;
    transform: translate(-50%, 0);
    width: 180px;
    text-align: left;
    line-height: 20px;
    font-size: 16px !important;
    text-shadow: none !important;
    cursor: default;
  }

  .videoQualitySelectMenu > ul {
    margin: 2px 8px;
  }

  .videoQualitySelectMenu > ul > li.selected:hover {
    background: none;
  }

  .videoQualitySelectMenu li:not(.selected) {
    font-weight: initial;
  }

  .videoQualitySelectMenu li.selected > span {
    pointer-events: none;
    text-shadow: 0 0 4px #99f, 0 0 8px #99f !important;
  }

  .videoQualitySelectMenu .domandVideoQuality {
    font-size: 80%;
  }

  .videoQualitySelectMenu .currentVideoQuality {
    color: #ccf;
    font-size: 80%;
    text-align: center;
  }

  .videoQualitySelectMenu .domandVideoQuality > li {
    margin-right: 0;
    margin-left: 0;
    padding-right: 12px;
    padding-left: 12px;
  }

  .videoQualitySelectMenu .domandVideoQuality > li > span {
    margin-left: 12px;
  }

  .videoQualitySelectMenu .domandVideoQuality > li.selected > span::before {
    left: 12px;
  }

  @media screen and (max-width: 768px) {
    .controlItemContainer.center {
      left: 0%;
      transform: translate(0, 0);
    }
  }

  .FutatsumeWatchVer {
    display: none;
  }
  .FutatsumeWatchVer[data-env="DEV"] {
    display: inline-block;
    color: #999;
    position: absolute;
    right: 0;
    background: transparent !important;
    transform: translate(100%, 0);
    font-size: 12px;
    line-height: 32px;
    pointer-events: none;
  }

  .progressWave {
    display: none;
  }
  .is-stalled .progressWave,
  .is-loading .progressWave {
    display: inline-block;
    position: absolute;
    left: 0;
    top: 1px;
    z-index: 400;
    width: 40%;
    height: calc(100% - 2px);
    background: linear-gradient(
      to right,
      rgba(0,0,0,0),
      ${(util as unknown as VcbUtil).toRgba('#ffffcc', 0.3)},
      rgba(0,0,0)
    );
    mix-blend-mode: lighten;
    animation-name: progressWave;
    animation-iteration-count: infinite;
    animation-duration: 4s;
    animation-timing-function: linear;
    animation-delay: -1s;
  }
  @keyframes progressWave {
    0%   { transform: translate3d(-100%, 0, 0) translate3d(-5vw, 0, 0); }
    100% { transform: translate3d(100%, 0, 0) translate3d(150vw, 0, 0); }
  }
  .is-seeking .progressWave {
    display: none;
  }


`,
  { className: 'videoControlBar' }
);
(util as unknown as VcbUtil).addStyle(
  `
  .videoControlBar {
    width: 100% !important; /* 100vwだと縦スクロールバーと被る */
  }
`,
  { className: 'screenMode for-popup videoControlBar', disabled: true }
);
(util as unknown as VcbUtil).addStyle(
  `
  body .videoControlBar {
    position: absolute !important; /* firefoxのバグ対策 */
    opacity: 0;
    background: none;
  }

  .volumeChanging .videoControlBar,
  .is-mouseMoving .videoControlBar {
    opacity: 0.7;
    background: rgba(0, 0, 0, 0.5);
  }
  .showVideoControlBar .videoControlBar {
    opacity: 1 !important;
    background: #000 !important;
  }

  .videoControlBar.is-dragging,
  .videoControlBar:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.9);
  }

  .fullscreenControlBarModeMenu {
    display: inline-block;
  }

  .fullscreenControlBarModeSelectMenu {
    padding: 2px 4px;
    font-size: 12px;
    line-height: 15px;
    font-size: 16px !important;
    text-shadow: none !important;
  }

  .fullscreenControlBarModeSelectMenu ul {
    margin: 2px 8px;
  }

  .fullscreenControlBarModeSelectMenu li {
    padding: 3px 4px;
  }

  .fullscreenControlBarModeMenu li:focus-within,
  body[data-fullscreen-control-bar-mode="auto"] .fullscreenControlBarModeMenu [data-param="auto"],
  body[data-fullscreen-control-bar-mode="always-show"] .fullscreenControlBarModeMenu [data-param="always-show"],
  body[data-fullscreen-control-bar-mode="always-hide"] .fullscreenControlBarModeMenu [data-param="always-hide"] {
    color: #ff9;
    outline: none;
  }

`,
  { className: 'screenMode for-full videoControlBar', disabled: true }
);
(util as unknown as VcbUtil).addStyle(
  `
  .screenModeSelectMenu {
    display: none;
  }

  .controlItemContainer.left {
    top: auto;
    transform-origin: top left;
  }
  .seekBarContainer {
    top: auto;
    bottom: 0;
    z-index: 300;
  }
  .seekBarContainer:hover .seekBarShadow {
    height: 14px;
    top: -12px;
  }
  .seekBar {
    margin-top: 0px;
    margin-bottom: -14px;
    height: 24px;
    transition: none;
  }
  .screenModeMenu {
    display: none;
  }
  .controlItemContainer.center {
    top: auto;
  }
  .futatsumeStoryboardOpen .controlItemContainer.center {
    background: transparent;
  }
  .futatsumeStoryboardOpen .controlItemContainer.center .scalingUI {
    background: rgba(32, 32, 32, 0.5);
  }
  .futatsumeStoryboardOpen .controlItemContainer.center .scalingUI:hover {
    background: rgba(32, 32, 32, 0.8);
  }
  .controlItemContainer.right {
    top: auto;
  }

`,
  { className: 'screenMode for-screen-full videoControlBar', disabled: true }
);
