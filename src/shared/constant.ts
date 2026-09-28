//===BEGIN===

const CONSTANT = {
  BASE_Z_INDEX: 6000002,

  CONTROL_BAR_HEIGHT: 40,

  SIDE_PLAYER_WIDTH: 400,
  SIDE_PLAYER_HEIGHT: 225,

  BIG_PLAYER_WIDTH: 896,
  BIG_PLAYER_HEIGHT: 480,

  RIGHT_PANEL_WIDTH: 320,
  BOTTOM_PANEL_HEIGHT: 240,

  // video.src クリア用。
  // 空文字だとbase hrefと連結されて http://www.nicovideo.jp が参照されるという残念な理由で // を指定している
  BLANK_VIDEO_URL: '//',

  BLANK_PNG:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQYV2NgYGD4DwABBAEAcCBlCwAAAABJRU5ErkJggg==',

  MEDIA_ERROR: {
    MEDIA_ERR_ABORTED: 1,
    MEDIA_ERR_NETWORK: 2,
    MEDIA_ERR_DECODE: 3,
    MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
  },
} as ConstantTable;

CONSTANT.BASE_CSS_VARS = (() => {
  const vars = {
    'base-bg-color': '#333',
    'base-fore-color': '#ccc',
    'light-text-color': '#fff',
    'scrollbar-bg-color': '#222',
    'scrollbar-thumb-color': '#666',
    'item-border-color': '#888',
    'hatsune-color': '#039393',
    'enabled-button-color': '#9cf',
  };

  // if (/^\d{4}-(03-09|08-31)/.test(dt)) {
  vars['scrollbar-thumb-color'] = vars['hatsune-color'];
  // }

  return (
    '#futatsumeVideoPlayerDialog, .futatsumeRoot {\n' +
    Object.keys(vars)
      .map((key) => `--${key}:${(vars as Record<string, string>)[key] as string};`)
      .join('\n') +
    '\n}'
  );
})();
CONSTANT.COMMON_CSS = `
  ${CONSTANT.BASE_CSS_VARS}

  .xDomainLoaderFrame {
    border: 0;
    position: fixed;
    top: -999px;
    left: -999px;
    width: 1px;
    height: 1px;
    border: 0;
    contain: paint;
  }

  .FutatsumeButton {
    display: none;
    opacity: 0.8;
    position: absolute;
    z-index: ${CONSTANT.BASE_Z_INDEX + 100000};
    cursor: pointer;
    font-size: 8pt;
    min-width: 32px;
    width: max-content;
    height: 26px;
    padding: 0;
    line-height: 26px;
    font-weight: bold;
    text-align: center;
    transition: box-shadow 0.2s ease, opacity 0.4s ease;
    user-select: none;
    transform: translate(-50%, -50%);
    contain: layout style;
  }
  .FutatsumeButton:hover {
    opacity: 1;
  }
    .FutatsumeButtonInner {
      padding-inline: 8px;
      background: #eee;
      color: #000;
      border: outset 1px;
      box-shadow: 2px 2px rgba(0, 0, 0, 0.8);
    }
    .FutatsumeButton:active .FutatsumeButtonInner {
      border: inset 1px;
      transition: translate(2px, 2px);
      box-shadow: 0 0 rgba(0, 0, 0, 0.8);
    }

  .FutatsumeButton.show {
    display: inline-block;
  }

  .futatsumePopupMenu {
    display: block;
    position: absolute;
    background: var(--base-bg-color);
    color: #fff;
    overflow: visible;
    border: 1px solid var(--base-fore-color);
    padding: 0;
    opacity: 0.99;
    box-sizing: border-box;
    transition: opacity 0.3s ease;
    z-index: 50000;
    user-select: none;
  }

  .futatsumePopupMenu:not(.show) {
    transition: none;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .futatsumePopupMenu ul {
    padding: 0;
  }

  .futatsumePopupMenu ul > li {
    position: relative;
    margin: 2px 4px;
    white-space: nowrap;
    cursor: pointer;
    padding: 2px 8px;
    list-style-type: none;
    float: inherit;
  }
  .futatsumePopupMenu ul > li + li {
    border-top: 1px dotted var(--item-border-color);
  }

  .futatsumePopupMenu ul > li.selected {
    font-weight: bolder;
  }

  .futatsumePopupMenu ul > li:hover {
    background: #663;
  }
  .futatsumePopupMenu ul > li.separator {
    border: 1px outset;
    height: 2px;
    width: 90%;
  }
  .futatsumePopupMenu li > span {
    box-sizing: border-box;
    margin-left: 8px;
    display: inline-block;
    cursor: pointer;
  }
  .futatsumePopupMenu ul > li.selected > span:before {
    content: '✔';
    left: 0;
    position: absolute;
  }
  .futatsumePopupMenu.show {
    opacity: 0.8;
  }
  .futatsumePopupMenu .caption {
    padding: 2px 4px;
    text-align: center;
    margin: 0;
    font-weight: bolder;
    background: #666;
    color: #fff;
  }
  .futatsumePopupMenu .triangle {
    position: absolute;
    width: 16px;
    height: 16px;
    border: 1px solid #ccc;
    border-width: 0 0 1px 1px;
    background: #333;
    box-sizing: border-box;
  }

  body.showNicoVideoPlayerDialog #external_nicoplayer {
    transform: translate(-9999px, 0);
  }

  #FutatsumeWatchVideoPlayerContainer .atsumori-root {
    position: absolute;
    z-index: 10;
  }

  #futatsumeVideoPlayerDialog.is-guest .forMember {
    display: none;
  }
  #futatsumeVideoPlayerDialog .forGuest {
    display: none;
  }
  #futatsumeVideoPlayerDialog.is-guest .forGuest {
    display: inherit;
  }

  .scalingUI {
    transform: scale(var(--futatsume-ui-scale));
  }
`.trim();

CONSTANT.SCROLLBAR_CSS = `
  .videoInfoTab::-webkit-scrollbar,
  #listContainer::-webkit-scrollbar,
  .futatsumeCommentPreview::-webkit-scrollbar,
  .mylistSelectMenuInner::-webkit-scrollbar {
    background: var(--scrollbar-bg-color);
    width: 16px;
  }

  .videoInfoTab::-webkit-scrollbar-thumb,
  #listContainer::-webkit-scrollbar-thumb,
  .futatsumeCommentPreview::-webkit-scrollbar-thumb,
  .mylistSelectMenuInner::-webkit-scrollbar-thumb {
    border-radius: 0;
    background: var(--scrollbar-thumb-color);
    will-change: transform;
  }

  .videoInfoTab::-webkit-scrollbar-button,
  #listContainer::-webkit-scrollbar-button,
  .futatsumeCommentPreview::-webkit-scrollbar-button,
  .mylistSelectMenuInner::-webkit-scrollbar-button {
    display: none;
  }
`.trim();

//===END===

export interface ConstantMediaError {
  MEDIA_ERR_ABORTED: number;
  MEDIA_ERR_NETWORK: number;
  MEDIA_ERR_DECODE: number;
  MEDIA_ERR_SRC_NOT_SUPPORTED: number;
}

export interface ConstantTable {
  BASE_Z_INDEX: number;
  CONTROL_BAR_HEIGHT: number;
  SIDE_PLAYER_WIDTH: number;
  SIDE_PLAYER_HEIGHT: number;
  BIG_PLAYER_WIDTH: number;
  BIG_PLAYER_HEIGHT: number;
  RIGHT_PANEL_WIDTH: number;
  BOTTOM_PANEL_HEIGHT: number;
  BLANK_VIDEO_URL: string;
  BLANK_PNG: string;
  MEDIA_ERROR: ConstantMediaError;
  BASE_CSS_VARS: string;
  COMMON_CSS: string;
  SCROLLBAR_CSS: string;
}

export { CONSTANT };
