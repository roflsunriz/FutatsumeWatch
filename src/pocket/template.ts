export const POCKET_TEMPLATE = `
  <div class="mylistPocketHoverMenu scalingUI futatsume-family">
    <button class="mylistPocketButton command deflist-add" data-command="deflist"
      tooltip="とりあえずマイリスト">&#x271A;</button>
    <button class="mylistPocketButton command mylist-select" data-command="mylist-select"
      tooltip="マイリスト追加・編集">＋M</button>
    <button class="mylistPocketButton command info" data-command="info"
      tooltip="動画情報を表示">？</button>
    <button class="mylistPocketButton command playlist-queue futatsumeMenu" data-command="playlist-queue"
      tooltip="FutatsumeWatchのプレイリストに追加">▶</button>
  </div>
  </div>

  <div id="mylistPocket-popup" class="futatsume-family">
    <span slot="video-title">【実況】どんぐりころころの大冒険 Part1(最終回)</span>
    <a href="/watch/sm9" slot="watch-link"></a>
    <img slot="video-thumbnail" data-type="image">
    <a slot="owner-page-link" href="https://www.nicovideo.jp/user/1234" class="owner-page-link target-change" data-type="link" rel="noopener"><img slot="owner-icon" class="owner-icon" src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank_s.jpg" data-type="image"></img></a>

    <span slot="upload-date"     data-type="date">1970/01/01 00:00</span>
    <span slot="view-counter"    data-type="int">12,345</span>
    <span slot="mylist-counter"  data-type="int">6,789</span>
    <span slot="comment-counter" data-type="int">2,525</span>

    <span slot="duration" class="duration">1:23</span>

    <span slot="owner-id">1234</span>
    <span slot="locale-owner-name">ほげほげ</span>

    <div slot="error-description"></div>
    <div class="description" slot="description" data-type="html"></div>
    <span slot="last-res-body"></span>

  </div>

  <template id="mylistPocket-popup-template">
    <style>

      :host(#mylistPocket-popup) {
        position: fixed;
        z-index: 10000000;
        transform: translate3d(-50%, -50%, 0);
        opacity: 0;
        transition: 0.3s opacity ease;
        top: -9999px; left: -9999px;
      }

      :host(#mylistPocket-popup.show) {
        top: 50%;
        left: 50%;
        opacity: 1;
        pointer-events: auto;
      }

      .root.is-otherDomain .wwwOnly {
        display: none;
      }
      .root.is-otherDomain:not(.is-futatsumeReady) .wwwFutatsumeOnly {
        display: none;
      }

      * {
        box-sizing: border-box;
        font-kerning: none;
      }

      a {
        color: #ffff00;
        font-weight: bold;
        display: inline-block;
      }

      a:visited {
        color: #ffff99;
      }

      button {
        font-size: 14px;
        padding: 8px 8px;
        cursor: pointer;
        border-radius: 0;
        margin: 0;
        background: #333;
        color: #ccc;
        border: solid 2px #ccc;
        outline: none;
        line-height: 20px;
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
      }
      button:hover {
        transform: translate(-4px,-4px);
        box-shadow: 4px 4px 4px #000;
        background: #666;
        transition:
          0.2s transform ease,
          0.2s box-shadow ease
          ;
      }

      button.is-updating {
        cursor: wait;
      }
      button.is-active,
      button:active {
        transform: none;
        box-shadow: none;
        transition: none;
      }
      button.is-active::after,
      button:active::after {
        opacity: 0;
      }


      [tooltip] {
        position: relative;
      }

      .is-deflistUpdating .deflist-add::after,
      .is-deflistSuccess  .deflist-add::after,
      .is-deflistFail     .deflist-add::after,
      [tooltip]:hover::after {
        content: attr(tooltip);
        position: absolute;
        top:  0px;
        left: 50%;
        padding: 2px 4px;
        white-space: nowrap;
        font-size: 14px;
        color: #fff;
        background: #333;
        transform: translate3d(-50%, -120%, 0);
        pointer-events: none;

      }


      .root {
        text-align: left;
        outline-offset: 8px;
        border: 12px solid rgba(32, 32, 32, 0);
        border-radius: 20px;
        padding: 8px 0;
        background: rgba(0, 0, 0, 0.7);
        color: #ccc;
        box-shadow: 0 0 16px #000;
        transition:
          0.6s -webkit-clip-path ease,
          0.6s clip-path ease,
          0.5s transform ease;
          /*0.4s border-radius ease-out 0.4s,
          0.4s height ease-out 0.4s*/
        ;
      }

      .root * {
      }

      .root.show {
        opacity: 1;
        pointer-events: auto !important;
      }

      .root.is-loading,
      .root.is-loading.is-ok,
      .root.is-loading.is-fail {
        text-align: center;
        position: relative;
        width: 190px;
        height: 190px;
        padding: 32px;
        opacity: 0.8;
        cursor: wait;
        border-radius: 100%;
        clip-path: circle(100px at center) !important;
        transition: none;
        outline: none;
        transform: none !important;
      }
      .root.is-firefox {
      }
      .root.is-loading > * {
        pointer-events: none;
      }

      .root.is-setting {
        transform: rotateX(180deg);
      }

      .root.is-setting > *:not(.setting-panel) {
        pointer-events: none;
        z-index: 1;
      }

      .root:not(.is-setting) > .setting-panel {
        pointer-events: none;
      }

      .root.is-setting > .setting-panel {
        display: block;
        opacity: 1;
        pointer-events: auto;
      }

      .root.is-loading         .loading-inner,
      .root.is-loading.is-ok   .loading-inner,
      .root.is-loading.is-fail .loading-inner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate3d(-50%, -50%, 0);
      }

      .loading-inner .spinner {
        font-size: 64px;
        display: inline-block;
        animation-name: spin;
        animation-iteration-count: infinite;
        animation-duration: 3s;
        animation-timing-function: linear;
      }

      @keyframes spin {
        0%   { transform: rotate(0deg); }
        100% { transform: rotate(1800deg); }
      }



      .root.is-ok {
        width: 800px;
        /*clip-path: circle(800px at center);*/
      }

      .root.is-ok.noclip {
        clip-path: none;
      }

      .root.is-fail {
        font-size: 120%;
        white-space: nowrap;
        text-align: center;
        padding: 16px;
      }

      .root.is-loading>*:not(.loading-now),
      .root.is-loading.is-ok>*:not(.loading-now),
      .root.is-loading.is-fail>*:not(.loading-now),
      .root.is-fail:not(.is-loading)>*:not(.error-info),
      .root.is-ok:not(.is-loading)>*:not(.video-detail):not(.setting-panel) {
        display: none !important;
      }

      .root.is-loading>.loading-now,
      .root.is-fail>.error-info,
      .root.is-ok>.video-detail {
        display: block;
      }

      .header {
        padding: 8px 8px 8px;
        font-size: 12px;
      }
        .upload-date {
          margin-right: 8px;
        }
        .counter span + span {
          margin-left: 8px;
        }
        .video-title {
          font-weight: bolder;
          font-size: 22px;
          margin-bottom: 4px;
        }

        .close-button {
          position: absolute;
          right: 0;
          top: 0;
          transition: 0.2s background ease, 0.2s border-color ease;
          cursor: pointer;
          width: 48px;
          height: 48px;
          font-size: 28px;
          line-height: 36px;
          text-align: center;
          user-select: none;
          border: 6px solid rgba(80, 80, 80, 0.5);
          border-color: transparent;
          border-radius: 0 16px 0 0;
        }
        .close-button:hover {
          background: #333;
          /*border-color: rgba(0, 0, 0, 0.9);*/
          /*transform: translate(-50%, -50%) scale(2.5);*/
        }
        .close-button:active {
          /*transform: translate(-50%, -50%) scale(2) rotate(360deg);*/
          box-shadow: none;
          transition: none;
        }

        .is-setting .close-button {
          display: none;
        }




      .main {
        display: flex;
        background: rgba(0, 0, 0, 0.2);
        box-shadow: 0 0 4px rgba(0, 0, 0, 0.5) inset;
      }

      .main-left {
        width: 360px;
        padding: 8px;
        z-index: 100;
      }
        .video-thumbnail-container {
          position: relative;
          width: 360px;
          height: 270px;
          background: #000;
          /*box-shadow: 2px 2px 4px #000;*/
        }
        .video-thumbnail-container ::slotted(img) {
          width: 360px !important;
          height: 270px !important;
          object-fit: contain;
        }

        .video-thumbnail-container .duration {
          position: absolute;
          display: inline-block;
          right: 0;
          bottom: 0;
          font-size: 14px;
          background: #000;
          color: #fff;
          padding: 2px 4px;
        }
        .video-thumbnail-container:hover .duration {
          display: none;
        }


      .main-right {
        position: relative;
        padding: 0;
        flex-grow: 1;
        font-size: 14px;
      }

        ::slotted(.owner-page-link) {
          display: inline-block;
          vertical-align: middle;
        }

        .owner-page-link img {
          border: 1px solid #333;
          border-radius: 3px;
        }

        .video-info {
          /*background: rgba(0, 0, 0, 0.2);*/
          max-height: 282px;
          overflow-x: hidden;
          overflow-y: scroll;
          overscroll-behavior: contain;
        }

        *::-webkit-scrollbar,
        .video-info::-webkit-scrollbar {
          background: rgba(34, 34, 34, 0.5);
        }

        *::-webkit-scrollbar-thumb,
        .video-info::-webkit-scrollbar-thumb {
          border-radius: 0;
          background: #666;
        }

        *::-webkit-scrollbar-button,
        .video-info::-webkit-scrollbar-button {
          background: #666;
          display: none;
        }

        *::scrollbar,
        .video-info::scrollbar {
          background: #222;
        }

        *::scrollbar-thumb,
        .video-info::scrollbar-thumb {
          border-radius: 0;
          background: #666;
        }

        *::scrollbar-button,
        .video-info::scrollbar-button {
          background: #666;
          display: none;
        }

        .scrollable {
          overscroll-behavior: contain;
        }

        .owner-info {
          margin: 16px;
          display: table;
        }

          .owner-info * {
            vertical-align: middle;
            word-break: break-all;
          }

          .owner-info>* {
            display: table-cell !important;
          }

          .owner-name {
            display: inline-block;
            padding: 8px;
            font-size: 18px;
          }
          .owner-info.is-favorited {
            font-weight: bolder;
            color: orange;
          }

          .owner-info.is-ng {
            color: #888;
            text-decoration: line-through;
          }

          .is-channel .owner-name::before {
            content: 'CH';
            margin: 0 4px;
            background: #999;
            color: #333;
            padding: 2px 4px;
            border: 1px solid;
          }

          .locale-owner-name::after {
            content: ' さん';
          }

          .owner-info .add-ng-button,
          .owner-info .add-fav-button {
            visibility: hidden;
            pointer-events: none;
          }
          .is-ng-enable .owner-info:hover .add-ng-button,
          .is-ng-enable .owner-info:hover .add-fav-button {
            visibility: visible;
            pointer-events: auto;
          }

        .description {
          word-break: break-all;
          line-height: 1.5;
          padding: 0 16px 8px;
        }

        .description:first-letter {
          font-size: 24px;
        }

        .last-res-body {
          margin: 16px 16px 0;
          border: 1px solid #ccc;
          padding: 4px;
          border-radius: 4px;
          word-break: break-all;
          font-size: 12px;
          min-height: 24px;
        }


      .footer {
        padding: 8px;
        backface-visibility: hidden;
      }

        .pocket-button {
          cusror: pointer;
        }

        .pocket-button:active {
        }


        .video-tags {
          display: block;
        }

          .tag-container {
            display: inline-block;
            position: relative;
            padding: 4px 8px;
            border: 1px solid #888;
            border-radius: 4px;
            margin: 0 20px 4px 0;
          }
          .tag-container .tag {
            display: inline-block;
            font-size: 14px;
            color: #ccc;
            text-decoration: none;
            cursor: pointer;
          }
          .tag-container .tag.channel-search {
            margin-left: 8px;
            color: #ccc !important;
            padding: 0 8px;
          }
          .tag-container:hover .tag {
            color: #fff !important;
          }
          .tag-container.is-favorited .tag {
            font-weight: bolder;
            color: orange !important;
          }
          .tag-container.is-ng .tag {
            text-decoration: line-through;
            color: #888 !important;
          }
          .futatsumePlayerContainer .tagItemMenu {
            margin: 0 8px;
          }


          .tag-container       .add-ng-button,
          .tag-container       .add-fav-button {
            position: absolute !important;
            visibility: hidden;
            pointer-events: none;
          }
          .is-ng-enable .tag-container:hover .add-ng-button,
          .is-ng-enable .tag-container:hover .add-fav-button {
            visibility: visible;
            pointer-events: auto;
            width: 24px;
            height: 24px;
            line-height: 24px;
            font-size: 24px;
            vertical-align: bottom;
            display: inline-block;
          }
          .is-ng-enable .tag-container:hover .add-ng-button {
            right: -16px;
          }
          .is-ng-enable .tag-container:hover .add-fav-button {
            left: -16px;
          }

        .footer-menu {
          position: absolute;
          right: 0px;
          bottom: 0px;
          transform: translate3d(0, 120%, 0);
          opacity: 1;
          transition:
            0.4s opacity ease 0.4s,
            0.4s transform ease 0.4s;
        }

        .is-setting .video-detail .footer-menu {
          transform: translate3d(0, 0, 0);
          opacity: 0;
        }

          .footer-menu button {
            min-width: 70px;
          }

          .regular-menu {
            display: inline-block;
            background: rgba(0, 0, 0, 0.7);
            position: relative;
            border-radius: 8px;
            padding: 12px 16px;
            box-shadow: 0 0 16px #000;
          }

          .is-deflistUpdating .deflist-add {
            cursor: wait;
            opacity: 0.9;
            transform: scale(1.0);
            box-shadow: none;
            transition: none;
          }
          .is-deflistSuccess .deflist-add,
          .is-deflistFail    .deflist-add {
            transform: scale(1.0);
            box-shadow: none;
            transition: none;
          }
          .is-deflistSuccess  .deflist-add::after {
            content: attr(data-result);
            background: #393;
          }
          .is-deflistFail     .deflist-add::after {
            content: attr(data-result);
            background: #933;
          }
          .is-deflistUpdating .deflist-add::after {
            content: '更新中';
            background: #333;
          }

          .futatsume-menu {
            display: none;
          }

          .is-futatsumeReady .futatsume-menu {
            display: inline-block;
            background: rgba(0, 0, 0, 0.7);
            margin-left: 32px;
            position: relative;
            border-radius: 8px;
            padding: 12px 16px;
            box-shadow: 0 0 16px #000;
          }

          .is-futatsumeReady .futatsume-menu::after {
            content: 'FutatsumeWatch';
            position: absolute;
            left: 50%;
            bottom: 10px;
            padding: 2px 8px;
            transform: translate(-50%, 100%);
            pointer-events: none;
            font-weith: bolder;
            background: rgba(0, 0, 0, 0.7);
            pointer-events: none;
            border-radius: 4px;
            white-space: nowrap;
          }

          .setting-menu {
            display: inline-block;
            background: rgba(0, 0, 0, 0.7);
            margin-left: 32px;
            position: relative;
            border-radius: 8px;
            padding: 12px 16px;
            box-shadow: 0 0 16px #000;
          }

      .toggle-setting-button {
        font-size: 32px;
        border-radius: 100%;
        border: 12px solid #333;
        cursor: pointer;
        background: rgba(32, 32, 32, 1);
        transition:
          0.2s transform ease
          ;
      }

      .toggle-setting-button:hover {
        transform: scale(1.2);
        box-shadow: none;
        background: rgba(32, 32, 32, 1);
        background: transparent;
      }

      .toggle-setting-button:active {
        transform: scale(1.0);
      }

      .mylist-comment-link {
        cursor: pointer;
      }

      .setting-panel {
        opacity: 0;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        padding: 8px 12px;
        z-index: 10000;
        background: rgba(50, 50, 64, 0.9);
        border-radius: 16px;
        color: #ccc;
        /*-webkit-user-select: none;
        user-select: none;*/
        transform: rotateX(180deg);
        transition: 0.25s opacity ease 0.25s;
      }
      .is-setting .setting-panel {
        transition: 0.25s opacity ease;
      }
        .setting-panel-main {
          width: 100%;
          height: 100%;
          overflow-y: scroll;
          overflow-x: hidden;
        }

        .root:not(.is-setting) .setting-panel .footer-menu {
          transform: translate3d(0, 0, 0);
          opacity: 0;
        }

        .root.is-setting       .setting-panel .footer-menu {
          right:  -12px;
          bottom: -12px;
          transform: translate3d(0, 120%, 0);
          opacity: 1;
          transition:
            opacity 0.4s ease 0.4s,
            transform 0.4s ease 0.4s;
        }


        .close-setting-menu {
          display: inline-block;
          background: rgba(0, 0, 0, 0.7);
          margin-left: 32px;
          position: relative;
          border-radius: 8px;
          padding: 12px 16px;
          box-shadow: 0 0 16px #000;
        }

        .setting-label {
          display: inline-block;
          line-height: 24px;
          padding: 8px;
        }

        .setting-label:hover {
          text-shadow: 0 0 4px #996;
        }

        .setting-label * {
          cursor: pointer;
        }

        .setting-label input[type=checkbox] {
          transform: scale(2);
          margin: 8px;
          vertical-align: middle;
        }

        .setting-label input + span {
          font-size: 16px;
        }

        .setting-label input:checked + span {
        }


        .setting-fav,
        .setting-ng-textarea,
        .setting-fav-textarea {
          display: none;
        }

        .is-ng-enable .setting-fav {
          display: block;
        }
        .is-ng-enable .setting-ng-textarea,
        .is-ng-enable .setting-fav-textarea {
          display: flex;
        }

          .setting-ng-text-column,
          .setting-fav-text-column {
            flex: 1;
            position: relative;
            padding: 8px;
          }

            .setting-ng-text-column textarea,
            .setting-fav-text-column textarea {
              width: 100%;
              height: 150px;
              background: transparent;
              color: #ccc;
            }

        .setting-ng-label {
          display: none;
        }

        .is-ng-enable .setting-ng-label {
          display: inline-block;
        }


      .add-ng-button,
      .add-fav-button {
        display: none;
      }

      .is-ng-enable .add-ng-button,
      .is-ng-enable .add-fav-button {
        display: inline-block;
        position: relative;
        width: 32px;
        height: 32px;
        line-height: 32px;
        font-size: 28px;
        padding: 0;
        margin: 0;
        /*border-radius: 100%;*/
        border: none;
        text-align: center;
        color: red;
        font-weight: bolder;
        cursor: pointer;
        background: transparent;
        box-shadow: none;
        transition:
          0.2s transform ease,
          0.2s text-shadow ease;
      }
      .is-ng-enable .add-fav-button {
        color: orange;
      }
      .is-ng-enable .add-ng-button:hover,
      .is-ng-enable .add-fav-button:hover {
        transform: scale(1.2);
        text-shadow: 2px 2px 4px black;
      }
      .is-ng-enable .add-ng-button:active,
      .is-ng-enable .add-fav-button:active {
        transform: scale(1.0);
        text-shadow: 0   0   2px black;
      }
      .is-ng-enable .add-ng-button:hover::after,
      .is-ng-enable .add-fav-button:hover::after {
        content: 'NG登録';
        position: absolute;
        top: 0;
        left: 50%;
        transform: translate(-50%, -80%);
        font-size: 12px;
        line-height: 12px;
        white-space: nowrap;
        background: rgba(192, 192, 192, 0.8);
        color: #000;
        opacity: 0.9;
        padding: 2px 4px;
        text-shadow: none;
        font-weight: normal;
        pointer-evnets: none !important;
      }
      .is-ng-enable .is-ng .add-ng-button:hover::after,
      .is-ng-enable .is-ng .add-fav-button:hover::after {
        content: 'NG解除';
      }
      .is-ng-enable .add-fav-button:hover::after {
        content: '強調登録';
      }
      .is-ng-enable .is-favorited .add-fav-button:hover::after {
        content: '強調解除';
      }
      .is-ng-enable .add-ng-button:active:hover::after,
      .is-ng-enable .add-fav-button:active:hover::after {
        display: none;
      }

   </style>
    <div class="popup root">
      <div class="loading-now">
        <div class="loading-inner">
          <span class="spinner">&#8987;</span>
        </div>
      </div>
      <div class="error-info">
        <slot name="error-description"></slot>
      </div>
      <div class="video-detail">
        <div class="header">
          <div class="video-title"><slot name="video-title"></slot></div>

          <span class="upload-date">投稿: <slot name="upload-date"/></span>
          <span class="counter">
            <span class="view-counter">再生: <slot name="view-counter"/></span>
            <span class="comment-counter">コメント: <slot name="comment-counter"/></span>
            <span class="mylist-counter command2" data-command="mylist-comment-open">マイリスト:
              <span class="mylist-comment-link command" data-command="mylist-comment-open">&#x274F;</span>
              <slot name="mylist-counter"/>
            </span>
          </span>
          <div class="close-button command" data-command="close" tooltip="閉じる">
            &#x2716;
          </div>
        </div>

        <div class="main">

          <div class=" main-left">
            <div class="video-thumbnail-container">
              <slot name="video-thumbnail"></slot>
              <span class="duration"><slot name="duration"></slot></slot>
            </div>
          </div>

          <div class="video-info main-right scrollable">

            <div class="owner-info">
              <slot name="owner-page-link"></slot>
              <span class="owner-name"><slot name="locale-owner-name"></slot>
              <button class="add-fav-button command" data-command="toggle-fav-owner">★</button>
              <button class="add-ng-button command" data-command="toggle-ng-owner">&#x2716;</button>
              </span>
            </div>

            <div class="description">
              <slot name="description"></slot>
            </div>

            <div class="last-res-body">
              <slot name="last-res-body"></slot>
            </div>


          </div>

        </div>

        <div class="footer">
          <div class="video-tags">
            <slot name="tag"></slot>
          </div>
        </div>
        <div class="footer-menu scalingUI">
          <div class="regular-menu">
            <button class="mylistPocketButton deflist-add pocket-button command command-watch-id"
              data-command="deflist-add" tooltip="とりあえずマイリスト">とり</button>
            <button class="pocket-button command command-watch-id" data-command="mylist-select"
              tooltip="マイリスト追加・編集">マイ</button>
          </div>
          <div class="futatsume-menu">
            <button
              class="pocket-button command command-watch-id"
              data-command="futatsume-open-now"
              tooltip="FutatsumeWatchで開く"
            >Futatsume</button>
            <button
              class="pocket-button command command-watch-id"
              data-command="playlist-inert"
              tooltip="プレイリスト(次に再生)"
            >playlist</button>
            <button
              class="pocket-button command command-watch-id"
              data-command="playlist-queue"
              tooltip="プレイリスト(末尾に追加)"
            >▶</button>
          </div>


        </div>
      </div>
    </div>
  </template>
`.trim();
