import { global } from '../app/futatsume-watch-index';
import { util, BaseViewComponent } from '../shared/util';
import { cssUtil } from '../../packages/lib/src/css/css';
import type { NvpConfigValue, NvpPlayerState, NvpUtil, NvpBoundHandlers, NvpBaseViewParams } from './types';

class ContextMenu extends BaseViewComponent {
  declare static __tpl__: string;
  declare static __css__: string;
  declare _playerState: NvpPlayerState;
  declare _state: { isOpen: boolean };
  declare _bound: NvpBoundHandlers;
  declare _view: HTMLElement;
  declare _isFirstShow: boolean;
  declare _repeatEvent: MouseEvent | null;
  declare _repeatTimer: number | null;
  declare _isRepeating: boolean;
  constructor({ parentNode, playerState }: { parentNode?: Element | null; playerState: NvpPlayerState }) {
    super({
      parentNode,
      name: 'VideoContextMenu',
      template: ContextMenu.__tpl__,
      css: ContextMenu.__css__,
    });
    this._playerState = playerState;
    this._state = {
      isOpen: false,
    };

    this._bound.onBodyClick = this.hide.bind(this);
  }

  _initDom(...args: [NvpBaseViewParams]) {
    super._initDom(...args);
    global.debug.contextMenu = this;
    const onMouseDown = (this._bound.onMouseDown = this._onMouseDown.bind(this) as EventListener);
    this._bound.onBodyMouseUp = this._onBodyMouseUp.bind(this);
    this._bound.onRepeat = this._onRepeat.bind(this);
    this._view.classList.toggle('is-pictureInPictureEnabled', document.pictureInPictureEnabled);
    this._view.addEventListener('mousedown', onMouseDown);
    this._isFirstShow = true;
    this._view.addEventListener('contextmenu', (e: MouseEvent) => {
      setTimeout(() => {
        this.hide();
      }, 100);
      e.preventDefault();
      e.stopPropagation();
    });
  }

  _onClick(e: MouseEvent): void {
    if (e && e.button !== 0) {
      return;
    }

    if (e.type !== 'mousedown') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    super._onClick(e);
  }

  _onMouseDown(e: MouseEvent): void {
    if (e.target && (e.target as Element).getAttribute('data-is-no-close') === 'true') {
      e.stopPropagation();
      this._onClick(e);
    } else if (e.target && (e.target as Element).getAttribute('data-repeat') === 'on') {
      e.stopPropagation();
      this._onClick(e);
      this._beginRepeat(e);
    } else {
      e.stopPropagation();
      this._onClick(e);
      setTimeout(() => {
        this.hide();
      }, 100);
    }
  }

  _onBodyMouseUp(): void {
    this._endRepeat();
  }

  _beginRepeat(e: MouseEvent): void {
    this._repeatEvent = e;
    document.body.addEventListener('mouseup', this._bound.onBodyMouseUp as EventListener);

    this._repeatTimer = window.setInterval(this._bound.onRepeat as () => void, 200);
    this._isRepeating = true;
  }

  _endRepeat(): void {
    this._repeatEvent = null;
    // this._isRepeating = false;
    if (this._repeatTimer) {
      window.clearInterval(this._repeatTimer);
      this._repeatTimer = null;
    }
    document.body.removeEventListener('mouseup', this._bound.onBodyMouseUp as EventListener);
  }

  _onRepeat(): void {
    if (!this._isRepeating) {
      this._endRepeat();
      return;
    }
    if (this._repeatEvent) {
      this._onClick(this._repeatEvent);
    }
  }

  show(x: number, y: number): void {
    document.body.addEventListener('click', this._bound.onBodyClick);
    const view = this._view;

    this._onBeforeShow();

    view.style.left = cssUtil.px(Math.max(0, Math.min(x, global.innerWidth - view.offsetWidth))) as string;
    view.style.top = cssUtil.px(Math.max(0, Math.min(y + 20, global.innerHeight - view.offsetHeight))) as string;
    this.setState({ isOpen: true });
    void global.emitter.emitAsync('showMenu');
  }

  hide(): void {
    document.body.removeEventListener('click', this._bound.onBodyClick);
    (util as unknown as NvpUtil).$(this._view).css({ left: '', top: '' });
    this._endRepeat();
    this.setState({ isOpen: false });
    void global.emitter.emitAsync('hideMenu');
  }

  get isOpen(): boolean {
    return this._state.isOpen;
  }

  _onBeforeShow(): void {
    // チェックボックスなどを反映させるならココ
    const pr = parseFloat(String(this._playerState.playbackRate));
    const view = (util as unknown as NvpUtil).$(this._view);
    view.find('.selected').removeClass('selected');
    view.find('.playbackRate').forEach((elm: HTMLElement) => {
      const p = parseFloat(elm.dataset.param as string);
      if (Math.abs(p - pr) < 0.01) {
        elm.classList.add('selected');
      }
    });
    view.find('[data-config]').forEach((menu: HTMLElement) => {
      const name = menu.dataset.config;
      menu.classList.toggle('selected', !!(global.config.props as Record<string, NvpConfigValue>)[name as string]);
    });
    view.find('.seekToResumePoint').css('display', this._playerState.videoInfo.initialPlaybackTime > 0 ? '' : 'none');
    if (this._isFirstShow) {
      this._isFirstShow = false;
      const handler = (command: unknown, param: unknown): void => {
        this.emit('command', command, param);
      };
      void global.emitter.emitAsync('videoContextMenu.addonMenuReady', view.find('.empty-area-top'), handler);
      void global.emitter.emitAsync('videoContextMenu.addonMenuReady.list', view.find('.listInner ul'), handler);
      global.emitter.emitResolve('videoContextMenu.addonMenuReady', {
        container: view.find('.empty-area-top'),
        handler,
      });
      global.emitter.emitResolve('videoContextMenu.addonMenuReady.list', {
        container: view.find('.listInner ul'),
        handler,
      });
    }
  }
}

ContextMenu.__css__ = `
  .futatsumePlayerContextMenu {
    position: fixed;
    background: rgba(255, 255, 255, 0.8);
    overflow: visible;
    padding: 8px;
    border: 1px outset #333;
    box-shadow: 2px 2px 4px #000;
    transition: opacity 0.3s ease;
    min-width: 200px;
    z-index: 150000;
    user-select: none;
    color: #000;
  }
  .futatsumePlayerContextMenu.is-Open {
    display: block;
    opacity: 0.5;
  }
  .futatsumePlayerContextMenu.is-Open:hover {
    opacity: 1;
  }
  .is-fullscreen .futatsumePlayerContextMenu {
    position: absolute;
  }

  .futatsumePlayerContextMenu:not(.is-Open) {
    display: none;
    /*left: -9999px;
    top: -9999px;
    opacity: 0;*/
  }

  .futatsumePlayerContextMenu ul {
    padding: 0;
    margin: 0;
  }

  .futatsumePlayerContextMenu ul li {
    position: relative;
    line-height: 120%;
    margin: 2px;
    overflow-y: visible;
    white-space: nowrap;
    cursor: pointer;
    padding: 2px 14px;
    list-style-type: none;
    float: inherit;
  }
  .is-playlistEnable .futatsumePlayerContextMenu li.togglePlaylist:before,
  .is-flipV          .futatsumePlayerContextMenu li.toggle-flipV:before,
  .is-flipH          .futatsumePlayerContextMenu li.toggle-flipH:before,
  .futatsumePlayerContextMenu ul                 li.selected:before {
    content: '✔';
    left: -10px;
    color: #000 !important;
    position: absolute;
  }
  .futatsumePlayerContextMenu ul li:hover {
    background: #336;
    color: #fff;
  }
  .futatsumePlayerContextMenu ul li.separator {
    border: 1px outset;
    height: 2px;
    width: 90%;
  }
  .futatsumePlayerContextMenu.show {
    opacity: 0.8;
  }
  .futatsumePlayerContextMenu .listInner {
  }

  .futatsumePlayerContextMenu .controlButtonContainer {
    position: absolute;
    bottom: 100%;
    left: 50%;
    width: 110%;
    transform: translate(-50%, 0);
    white-space: nowrap;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex {
    display: flex;
  }

  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton {
    flex: 1;
    height: 48px;
    font-size: 24px;
    line-height: 46px;
    border: 1px solid;
    border-radius: 4px;
    color: #333;
    background: rgba(192, 192, 192, 0.95);
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s;
    box-shadow: 0 0 0;
    opacity: 1;
    margin: auto;
  }

  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.screenShot {
    flex: 1;
    font-size: 24px;
  }

  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.playbackRate {
    flex: 2;
    font-size: 14px;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.rate010,
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.rate100,
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.rate200 {
    flex: 3;
    font-size: 24px;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.seek5s {
    flex: 2;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton.seek15s {
    flex: 3;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton:hover {
    transform: translate(0px, -4px);
    box-shadow: 0px 4px 2px #666;
  }
  .futatsumePlayerContextMenu .controlButtonContainerFlex > .controlButton:active {
    transform: none;
    box-shadow: 0 0 0;
    border: 1px inset;
  }

  [data-command="picture-in-picture"] {
    display: none;
  }
  .is-pictureInPictureEnabled [data-command="picture-in-picture"] {
    display: block;
  }

  `.trim();

ContextMenu.__tpl__ = `
  <div class="futatsumePlayerContextMenu">
    <div class="controlButtonContainer">
      <div class="controlButtonContainerFlex">
        <div class="controlButton command screenShot" data-command="screenShot"
          data-param="0.1" data-type="number" data-is-no-close="true">
          &#128247;<div class="tooltip">スクリーンショット</div>
        </div>
        <div class="empty-area-top" style="flex:4;" data-is-no-close="true"></div>
      </div>
      <div class="controlButtonContainerFlex">
        <div class="controlButton command rate010 playbackRate" data-command="playbackRate"
          data-param="0.1" data-type="number" data-repeat="on">
          &#128034;<div class="tooltip">コマ送り(0.1倍)</div>
        </div>
        <div class="controlButton command rate050 playbackRate" data-command="playbackRate"
          data-param="0.5" data-type="number" data-repeat="on">
          <div class="tooltip">0.5倍速</div>
        </div>
        <div class="controlButton command rate075 playbackRate" data-command="playbackRate"
          data-param="0.75" data-type="number" data-repeat="on">
          <div class="tooltip">0.75倍速</div>
        </div>

        <div class="controlButton command rate100 playbackRate" data-command="playbackRate"
          data-param="1.0" data-type="number" data-repeat="on">
          &#9655;<div class="tooltip">標準速</div>
        </div>

        <div class="controlButton command rate125 playbackRate" data-command="playbackRate"
          data-param="1.25" data-type="number" data-repeat="on">
          <div class="tooltip">1.25倍速</div>
        </div>
        <div class="controlButton command rate150 playbackRate" data-command="playbackRate"
          data-param="1.5" data-type="number" data-repeat="on">
          <div class="tooltip">1.5倍速</div>
        </div>
        <div class="controlButton command rate200 playbackRate" data-command="playbackRate"
          data-param="2.0" data-type="number" data-repeat="on">
          &#128007;<div class="tooltip">2倍速</div>
        </div>
      </div>
      <div class="controlButtonContainerFlex seekToResumePoint">
        <div class="controlButton command"
        data-command="seekToResumePoint"
        >▼ここまで見た
          <div class="tooltip">レジューム位置にジャンプ</div>
        </div>
      </div>
      <div class="controlButtonContainerFlex">
        <div class="controlButton command seek5s"
          data-command="seekBy" data-param="-5" data-type="number" data-repeat="on"
          >⇦
            <div class="tooltip">5秒戻る</div>
        </div>
        <div class="controlButton command seek15s"
          data-command="seekBy" data-param="-15" data-type="number" data-repeat="on"
          >⇦
            <div class="tooltip">15秒戻る</div>
        </div>
        <div class="controlButton command seek15s"
          data-command="seekBy" data-param="15" data-type="number" data-repeat="on"
          >⇨
            <div class="tooltip">15秒進む</div>
        </div>
        <div class="controlButton command seek5s"
          data-command="seekBy" data-param="5" data-type="number" data-repeat="on"
          >⇨
            <div class="tooltip">5秒進む</div>
        </div>
      </div>
    </div>
    <div class="listInner">
      <ul>
        <li class="command" data-command="togglePlay">停止/再開</li>
        <li class="command" data-command="seekTo" data-param="0">先頭に戻る</li>
        <hr class="separator">
        <li class="command toggleLoop"        data-config="loop" data-command="toggle-loop">リピート</li>
        <li class="command togglePlaylist"    data-command="togglePlaylist">連続再生</li>
        <li class="command toggleShowComment" data-config="showComment" data-command="toggle-showComment">コメントを表示</li>
        <li class="command" data-command="picture-in-picture">P in P</li>
        <hr class="separator">

        <li class="command forPremium toggle-flipH" data-command="toggle-flipH">左右反転</li>
        <li class="command toggle-flipV"            data-command="toggle-flipV">上下反転</li>

        <hr class="separator">

        <li class="command"
          data-command="reload">動画のリロード</li>
        <li class="command"
          data-command="copy-video-watch-url">動画URLをコピー</li>
        <li class="command mymemory"
          data-command="saveMymemory">コメントの保存</li>
      </ul>
    </div>
  </div>
`.trim();

/**
 *  Video要素をラップした物
 *
 */

export { ContextMenu };
