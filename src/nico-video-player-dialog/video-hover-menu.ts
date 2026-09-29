import _ from 'lodash';
import { MylistApiLoader } from '../shared/external-api';
import { util } from '../shared/util';
import { global } from '../app/futatsume-watch-index';

import type { PlayerState } from '../player-shell/state';
import type { DialogUtilView, VideoHoverMenuParams } from './types';
class VideoHoverMenu {
  declare private _container: Element;
  declare private _state: PlayerState;
  declare private _bound: Record<string, _.DebouncedFunc<() => unknown>>;
  declare private _view: Element;
  declare private _mylistApiLoader: typeof MylistApiLoader | undefined;
  declare private _mylistList: Array<Record<string, unknown>> | undefined;
  declare static __tpl__: string;
  constructor(params: VideoHoverMenuParams) {
    this.initialize(params);
  }
  initialize(params: VideoHoverMenuParams): void {
    this._container = params.playerContainer;
    this._state = params.playerState;

    this._bound = {};
    this._bound.emitClose = _.debounce(
      () => (util as unknown as DialogUtilView).dispatchCommand(this._container, 'close'),
      300
    );

    void this._initializeDom();
  }
  async _initializeDom(): Promise<void> {
    const container = this._container;
    (util as unknown as DialogUtilView).$.html(VideoHoverMenu.__tpl__).appendTo(container);
    this._view = container.querySelector('.hoverMenuContainer') as Element;

    const $mc = (util as unknown as DialogUtilView).$(container.querySelectorAll('.menuItemContainer'));
    $mc.on('contextmenu', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    });
    $mc.on('click', this._onClick.bind(this));
    $mc.on('mousedown', this._onMouseDown.bind(this));

    global.emitter.on('hideHover', this._hideMenu.bind(this));
    await this._initializeMylistSelectMenu();
  }
  async _initializeMylistSelectMenu(): Promise<void> {
    if (!(util as unknown as DialogUtilView).isLogin()) {
      return;
    }
    this._mylistApiLoader = MylistApiLoader;
    this._mylistList = await this._mylistApiLoader.getMylistList();
    this._initializeMylistSelectMenuDom();
  }
  _initializeMylistSelectMenuDom(mylistList?: Array<Record<string, unknown>>): void {
    if (!(util as unknown as DialogUtilView).isLogin()) {
      return;
    }
    mylistList = mylistList || this._mylistList;
    const menu = this._container.querySelector('.mylistSelectMenu') as HTMLElement;
    menu.addEventListener('wheel', (e: Event) => e.stopPropagation(), { passive: true });

    const ul = document.createElement('ul');
    mylistList!.forEach((mylist) => {
      const li = document.createElement('li');

      const icon = document.createElement('span');
      icon.className = 'mylistIcon command';
      Object.assign(icon.dataset, {
        mylistId: mylist.id,
        mylistName: mylist.name,
        command: 'mylistOpen',
      });
      icon.title = `${mylist.name as string}を開く`;

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      const folder = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      folder.setAttribute(
        'd',
        'M1 6V5c0-1.1.9-2 2-2h7a2 2 0 011.6.9L13 6h8a2 2 0 012 2v12a2 2 0 01-2 2H3a2 2 0 01-2-2V6z'
      );
      if (mylist.isPublic) {
        folder.setAttribute('fill-rule', 'evenodd');
        svg.append(folder);
      } else {
        const graph = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        graph.setAttribute('fill-rule', 'evenodd');
        const locked = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        locked.setAttribute('fill', '#FFF');
        locked.setAttribute(
          'd',
          'M17 13v-.5a1.5 1.5 0 00-3 0v.5h3zm2 0h1.2c.4 0 .8.4.8.9V19c0 .5-.4.9-.9.9H11a.9.9 0 01-.9-.9V14c0-.5.4-.9.9-.9H12v-.5a3.5 3.5 0 117 0v.5zm-3.5 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3z'
        );
        graph.append(folder, locked);
        svg.append(graph);
      }
      icon.append(svg);

      const link = document.createElement('a');
      link.className = 'mylistLink name command';
      link.textContent = `${mylist.name as string}`;
      link.href = `https://www.nicovideo.jp/my/mylist/#/${mylist.id as string}`;
      Object.assign(link.dataset, {
        mylistId: mylist.id,
        mylistName: mylist.name,
        command: 'mylistAdd',
      });

      li.append(icon, link);
      ul.append(li);
    });

    menu.querySelector('.mylistSelectMenuInner')!.append(ul);
  }
  _onMouseDown(e: MouseEvent): void {
    e.stopPropagation();
    const target = (e.target as unknown as Element).closest<HTMLElement>('[data-command]');
    if (!target) {
      return;
    }
    let command = target.dataset.command;
    switch (command) {
      case 'deflistAdd':
        if (e.shiftKey) {
          command = 'mylistWindow';
        } else {
          command = e.which > 1 ? 'deflistRemove' : 'deflistAdd';
        }
        (util as unknown as DialogUtilView).dispatchCommand(target, command);
        break;
      case 'toggle-like':
        (util as unknown as DialogUtilView).dispatchCommand(target, command);
        break;
      case 'mylistAdd': {
        command = e.shiftKey || e.which > 1 ? 'mylistRemove' : 'mylistAdd';
        const { mylistId, mylistName } = target.dataset;
        this._hideMenu();
        (util as unknown as DialogUtilView).dispatchCommand(target, command, { mylistId, mylistName });
        break;
      }
      case 'mylistOpen': {
        const mylistId = target.dataset.mylistId;
        location.href = `https://www.nicovideo.jp/my/mylist/#/${mylistId}`;
        break;
      }
      case 'close':
        this._bound.emitClose!();
        break;
      default:
        return;
    }
  }
  _onClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const target = (e.target as unknown as Element).closest<HTMLElement>('[data-command]');
    if (!target) {
      return;
    }
    const { command, type } = target.dataset;
    let param: unknown = target.dataset.param;

    switch (type) {
      case 'json':
      case 'bool':
      case 'number':
        param = JSON.parse(param as string);
        break;
    }

    switch (command) {
      case 'deflistAdd':
      case 'mylistAdd':
      case 'mylistOpen':
      case 'close':
        this._hideMenu();
        break;
      case 'mylistMenu':
        if (e.shiftKey) {
          (util as unknown as DialogUtilView).dispatchCommand(target, 'mylistWindow');
        }
        break;
      case 'nop':
        break;
      default:
        this._hideMenu();
        (util as unknown as DialogUtilView).dispatchCommand(target, command, param);
        break;
    }
  }
  _hideMenu() {
    if (!this._view.contains(document.activeElement)) {
      return;
    }
    window.setTimeout(() => document.body.focus(), 0);
  }
}

(util as unknown as DialogUtilView).addStyle(
  `
    .hoverMenuContainer {
      user-select: none;
      contain: style size;
    }

    .menuItemContainer {
      box-sizing: border-box;
      position: absolute;
      z-index: 40000;
      overflow: visible;

      will-change: transform, opacity;
      user-select: none;
    }
      .menuItemContainer .menuButton {
        width: 32px;
        height:32px;
        font-size: 24px;
        background: #888;
        color: #000;
        border: 1px solid #666;
        border-radius: 4px;
        line-height: 30px;
        white-space: nowrap;
        text-align: center;
        cursor: pointer;
        outline: none;
      }
      .menuItemContainer:hover .menuButton {
        pointer-events: auto;
      }

      .menuItemContainer.rightTop {
        width: 240px;
        height: 40px;
        right: 0px;
        top: 0;
        perspective: 150px;
        perspective-origin: center;
      }

      .menuItemContainer.rightTop .scalingUI {
        transform-origin: right top;
      }


      .is-updatingDeflist .menuItemContainer.rightTop,
      .is-updatingMylist  .menuItemContainer.rightTop {
        cursor: wait;
        opacity: 1 !important;
      }
      .is-updatingDeflist .menuItemContainer.rightTop>*,
      .is-updatingMylist  .menuItemContainer.rightTop>* {
        pointer-events: none;
      }

    .menuItemContainer.leftTop {
      width: auto;
      height: auto;
      left: 32px;
      top: 32px;
      display: none;
    }

      .is-debug .menuItemContainer.leftTop {
        display: inline-block !important;
        opacity: 1 !important;
        transition: none !important;
        transform: translateZ(0);
        max-width: 200px;
      }

    .menuItemContainer.leftBottom {
      width: 120px;
      height: 32px;
      left: 8px;
      bottom: 48px;
      transform-origin: left bottom;
    }
    .menuItemContainer.rightBottom {
      width: 120px;
      height: 80px;
      right:  0;
      bottom: 8px;
    }

    .menuItemContainer.onErrorMenu {
      position: absolute;
      left: 50%;
      top: 60%;
      transform: translate(-50%, 0);
      display: none;
      white-space: nowrap;
    }
      .is-error .onErrorMenu {
        display: block !important;
        opacity: 1 !important;
      }

      .is-youTube .onErrorMenu .for-nicovideo,
                  .onErrorMenu .for-FutatsumeTube {
        display: none;
      }
      .is-youTube.is-error .onErrorMenu .for-FutatsumeTube {
        display: inline-block;
      }

      .onErrorMenu .menuButton {
        position: relative;
        display: inline-block !important;
        margin: 0 16px;
        padding: 8px;
        background: #888;
        color: #000;
        opacity: 1;
        cursor: pointer;
        border-radius: 0;
        box-shadow: 4px 4px 0 #333;
        border: 2px outset;
        width: 100px;
        font-size: 14px;
        line-height: 16px;
      }
      .menuItemContainer.onErrorMenu .menuButton:active {
        background: var(--base-fore-color);
        border: 2px inset;
      }
      .menuItemContainer.onErrorMenu .playNextVideo {
        display: none !important;
      }
      .is-playlistEnable .menuItemContainer.onErrorMenu .playNextVideo {
        display: inline-block !important;
      }


    .menuButton {
      position: absolute;
      opacity: 0;
      transition:
        opacity 0.4s ease,
        box-shadow 0.2s ease 1s,
        background 0.4s ease;
      box-sizing: border-box;
      text-align: center;
      text-shadow: none;
      user-select: none;
      will-change: transform, opacity;
      contain: style size layout;
    }
      .menuButton:focus-within,
      .menuButton:hover {
        box-shadow: 0 2px 0 #000;
        cursor: pointer;
        opacity: 1;
        background: #888;
        color: #000;
      }
      .menuButton:active {
        transform: translate(0, 2px);
        box-shadow: 0 0 0 #000;
        transition: none;
      }

      .menuButton .tooltip {
        display: none;
        pointer-events: none;
        position: absolute;
        left: 16px;
        top: -24px;
        font-size: 12px;
        line-height: 16px;
        padding: 2px 4px;
        border: 1px solid #000;
        background: #ffc;
        color: black;
        box-shadow: 2px 2px 2px #fff;
        text-shadow: none;
        white-space: nowrap;
        z-index: 100;
        opacity: 0.8;
      }

      .menuButton:hover .tooltip {
        display: block;
      }
      .menuButton:avtive .tooltip {
        display: none;
      }

      .menuButtonInner {
        will-change: opacity;
      }

      .menuButton:active .futatsumePopupMenu {
        transform: translate(0, -2px);
        transition: none;
      }
      .hoverMenuContainer .menuButton:focus-within {
        pointer-events: none;
      }
      .hoverMenuContainer .menuButton:focus-within .futatsumePopupMenu,
      .hoverMenuContainer .menuButton              .futatsumePopupMenu:hover {
        pointer-events: auto;
        visibility: visible;
        opacity: 0.99;
        pointer-events: auto;
        transition: opacity 0.3s;
      }


      .rightTop .menuButton .tooltip {
        top: auto;
        bottom: -24px;
        right: -16px;
        left: auto;
      }
      .rightBottom .menuButton .tooltip {
        right: 16px;
        left: auto;
      }

      .is-mouseMoving .menuButton {
        opacity: 0.8;
        background: rgba(80, 80, 80, 0.5);
        border: 1px solid #888;
        transition: box-shadow 0.2s ease;
      }
      .is-mouseMoving .menuButton .menuButtonInner {
        opacity: 0.8;
        word-break: normal;
        transition:
          box-shadow 0.2s ease,
          background 0.4s ease;
       }


    .showCommentSwitch {
      left: 0;
      width:  32px;
      height: 32px;
      background:#888;
      color: #000;
      border: 1px solid #666;
      line-height: 30px;
      filter: grayscale(100%);
      border-radius: 4px;
    }
      .is-showComment .showCommentSwitch {
        color: #fff;
        filter: none;
        text-decoration: none;
      }
      .showCommentSwitch .menuButtonInner {
        text-decoration: line-through;
      }
      .is-showComment .showCommentSwitch .menuButtonInner {
        text-decoration: none;
      }


    .menuItemContainer .mylistButton {
      font-size: 21px;
    }

    .mylistButton.mylistAddMenu {
      left: 80px;
      top: 0;
    }
    .mylistButton.deflistAdd {
      left: 120px;
      top: 0;
    }
    .futatsumeTweetButton {
      left: 40px;
    }

    @keyframes spinX {
      0%   { transform: rotateX(0deg); }
      100% { transform: rotateX(1800deg); }
    }
    @keyframes spinY {
      0%   { transform: rotateY(0deg); }
      100% { transform: rotateY(1800deg); }
    }

    .is-updatingDeflist .mylistButton.deflistAdd {
      pointer-events: none;
      opacity: 1 !important;
      border: 1px inset !important;
      box-shadow: none !important;
      background: #888 !important;
      color: #000 !important;
      animation-name: spinX;
      animation-iteration-count: infinite;
      animation-duration: 6s;
      animation-timing-function: linear;
    }
    .is-updatingDeflist .mylistButton.deflistAdd .tooltip {
      display: none;
    }

    .mylistButton.mylistAddMenu:focus-within,
    .is-updatingMylist  .mylistButton.mylistAddMenu {
      pointer-events: none;
      opacity: 1 !important;
      border: 1px inset #000 !important;
      color: #000 !important;
      box-shadow: none !important;
    }
    .mylistButton.mylistAddMenu:focus-within {
      background: #888 !important;
    }
    .is-updatingMylist  .mylistButton.mylistAddMenu {
      background: #888 !important;
      color: #000 !important;
      animation-name: spinX;
      animation-iteration-count: infinite;
      animation-duration: 6s;
      animation-timing-function: linear;
    }

    .mylistSelectMenu {
      top: 36px;
      right: -48px;
      padding: 8px 0;
      font-size: 13px;
      backface-visibility: hidden;
    }
    .is-updatingMylist .mylistSelectMenu {
      display: none;
    }
      .mylistSelectMenu .mylistSelectMenuInner {
        overflow-y: auto;
        overflow-x: hidden;
        max-height: 50vh;
        overscroll-behavior: none;
      }

      .mylistSelectMenu .triangle {
        transform: rotate(135deg);
        top: -8.5px;
        right: 55px;
      }

      .mylistSelectMenu ul li {
        line-height: 120%;
        overflow-y: visible;
        border-bottom: none;
      }

      .mylistSelectMenu .mylistIcon {
        display: inline-block;
        width: 18px;
        height: 14px;
        margin: -4px 4px 0 0;
        margin-right: 15px;
        transform: scale(1.5);
        transform-origin: 0 0 0;
        transition: transform 0.1s ease, box-shadow 0.1s ease;
        cursor: pointer;
      }
      .mylistSelectMenu .mylistIcon:hover {
        background-color: #ff9;
        transform: scale(2);
      }
      .mylistSelectMenu .mylistIcon:hover::after {
        background: #fff;
        z-index: 100;
        opacity: 1;
      }
      .mylistSelectMenu .mylistIcon > svg {
        fill: #666;
        width: 100%;
        height: 100%;
      }


      .mylistSelectMenu .name {
        display: inline-block;
        width: calc(100% - 20px);
        vertical-align: middle;
        font-size: 110%;
        color: #fff;
        text-decoration: none !important;
      }
      .mylistSelectMenu .name:hover {
        color: #fff;
      }
      .mylistSelectMenu .name::after {
        content: ' に登録';
        font-size: 75%;
        color: #333;
      }
      .mylistSelectMenu li:hover .name::after {
        color: #fff;
      }

      .toggleLikeButton {
        transition:
        opacity 0.4s ease,
        box-shadow 0.2s ease 1s,
        transform 0.2s ease 1s;
      }
      .toggleLikeButton:hover {
        text-shadow: 0 0 2px deeppink;
        background: none;
        color: pink;
      }
      .is-liked .toggleLikeButton {
        color: pink;
      }
      .toggleLikeButton .liked-heart {
        display: none;
      }
      .is-liked .toggleLikeButton .liked-heart {
        display: block;
      }
      .is-liked .toggleLikeButton .not-liked-heart {
        display: none;
      }
      .toggleLikeButton .heart-effect {
        position: absolute;
        left: 50%; top: 50%;
        transform: translate(-50%, -50%) scale(5);
        text-shadow: 0 0 3px deeppink;
        color: #fff;
        opacity: 0;
        visibility: hidden;
        transition:
          transform 0.8s ease,
          opacity 0.8s ease,
          visibility 0.8s ease,
          color 0.8s ease;
      }
      .toggleLikeButton:active .heart-effect {
        transition: none;
        transform: translate(-50%, -50%) scale(0.3);
        color: pink;
        opacity: 0.5;
        visibility: visible;
      }

      .futatsumeTweetButton:hover {
        text-shadow: 1px 1px 2px #88c;
        background: #1da1f2;
        color: #fff;
      }

    .menuItemContainer .menuButton.closeButton {
      position: absolute;
      font-size: 20px;
      top: 0;
      right: 0;
      z-index: 60000;
      margin: 0 0 40px 40px;
      color: #ccc;
      border: solid 1px #888;
      border-radius: 0;
      transition:
        opacity 0.4s ease,
        transform 0.2s ease,
        background 0.2s ease,
        box-shadow 0.2s ease
          ;
      pointer-events: auto;
      transform-origin: center center;
    }

    .is-mouseMoving .closeButton,
    .closeButton:hover {
      opacity: 1;
      background: rgba(0, 0, 0, 0.8);
    }
    .closeButton:hover {
      background: rgba(33, 33, 33, 0.9);
      box-shadow: 4px 4px 4px #000;
    }
    .closeButton:active {
      transform: scale(0.5);
    }

    .menuItemContainer .toggleDebugButton {
      position: relative;
      display: inline-block;
      opacity: 1 !important;
      padding: 8px 16px;
      color: #000;
      box-shadow: none;
      font-size: 21px;
      border: 1px solid black;
      background: rgba(192, 192, 192, 0.8);
      width: auto;
      height: auto;
    }

    .togglePlayMenu {
      display: none;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(1.5);
      width: 80px;
      height: 45px;
      font-size: 35px;
      line-height: 45px;
      border-radius: 8px;
      text-align: center;
      color: var(--base-fore-color);
      z-index: 10;
      background: rgba(0, 0, 0, 0.8);
      transition: transform 0.2s ease, box-shadow 0.2s, text-shadow 0.2s, font-size 0.2s;
      box-shadow: 0 0 2px rgba(255, 255, 192, 0.8);
      cursor: pointer;
    }

    .togglePlayMenu:hover {
      transform: translate(-50%, -50%) scale(1.6);
      text-shadow: 0 0 4px #888;
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
    }

    .togglePlayMenu:active {
      transform: translate(-50%, -50%) scale(2.0, 1.2);
      font-size: 30px;
      box-shadow: 0 0 4px inset rgba(0, 0, 0, 0.8);
      text-shadow: none;
      transition: transform 0.1s ease;
    }

    .is-notPlayed .togglePlayMenu {
      display: block;
    }

    .is-playing .togglePlayMenu,
    .is-error   .togglePlayMenu,
    .is-loading .togglePlayMenu {
      display: none;
    }


  `,
  { className: 'videoHoverMenu' }
);
(util as unknown as DialogUtilView).addStyle(
  `
  .menuItemContainer.leftBottom {
    bottom: calc(64px * var(--futatsume-ui-scale,1));
  }
  .menuItemContainer.leftBottom .scalingUI {
    transform-origin: left bottom;
  }
  .menuItemContainer.rightBottom {
    bottom: 64px;
  }
  .ngSettingSelectMenu {
    bottom: 0px;
  }
  `,
  { className: 'videoHoverMenu screenMode for-full' }
);

VideoHoverMenu.__tpl__ = `
    <div class="hoverMenuContainer">
      <div class="menuItemContainer rightTop">
        <div class="scalingUI">
          <div class="menuButton toggleLikeButton forMember" data-command="toggle-like">
            <div class="tooltip">いいね！</div>
            <div class="menuButtonInner"><div class="not-liked-heart"
              >♡</div><div class="liked-heart"
              >♥</div><div class="heart-effect">♡</div></div>
          </div>
          <div class="menuButton futatsumeTweetButton" data-command="tweet">
            <div class="tooltip">ツイート</div>
            <div class="menuButtonInner">t</div>
          </div>
          <div class="menuButton mylistButton mylistAddMenu forMember"
            data-command="nop" tabindex="-1" data-has-submenu="1">
            <div class="tooltip">マイリスト登録</div>
            <div class="menuButtonInner">My</div>
            <div class="mylistSelectMenu selectMenu futatsumePopupMenu forMember">
              <div class="triangle"></div>
              <div class="mylistSelectMenuInner">
              </div>
            </div>
          </div>


          <div class="menuButton mylistButton deflistAdd forMember" data-command="deflistAdd">
            <div class="tooltip">とりあえずマイリスト(T)</div>
            <div class="menuButtonInner">&#x271A;</div>
          </div>

          <div class="menuButton closeButton" data-command="close">
            <div class="menuButtonInner">&#x2716;</div>
          </div>

        </div>
      </div>

      <div class="menuItemContainer leftBottom">
        <div class="scalingUI">
          <div class="showCommentSwitch menuButton" data-command="toggle-showComment">
            <div class="tooltip">コメント表示ON/OFF(V)</div>
            <div class="menuButtonInner">💬</div>
          </div>
        </div>
      </div>

      <div class="menuItemContainer onErrorMenu">
        <div class="menuButton openGinzaMenu" data-command="openGinza">
          <div class="menuButtonInner">(Re)で視聴</div>
        </div>

        <div class="menuButton reloadMenu for-nicovideo" data-command="reload">
          <div class="menuButtonInner for-nicovideo">リロード</div>
          <div class="menuButtonInner for-FutatsumeTube">FutatsumeTube解除</div>
        </div>

        <div class="menuButton playNextVideo" data-command="playNextVideo">
          <div class="menuButtonInner">次の動画</div>
        </div>
      </div>

      <div class="togglePlayMenu menuItemContainer center" data-command="togglePlay">
        ▶
      </div>

    </div>
  `.trim();

export { VideoHoverMenu };
