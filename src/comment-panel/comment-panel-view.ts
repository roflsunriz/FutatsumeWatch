import _ from 'lodash';
import { global } from '../futatsume-watch-index';
import { Emitter } from '../baselib';
import { css } from '../../packages/lib/src/css/css';
import { uq } from '../../packages/lib/src/u-query';
import type { EmitterCallback } from '../../packages/lib/src/emitter';
import { CommentListView } from './comment-list-view';
import { CommentListItemView } from './comment-list-item-view';
import { TimeMachineView } from './time-machine-view';
import type { Uq, UqFactory, ThreadInfo } from './types';
import type { CommentListModel } from './comment-list-model';
import type { CommentListItem } from './comment-list-item';
import type { CommentPanel } from './comment-panel';

interface CommentPanelViewParams {
  $container: Uq;
  model: CommentListModel;
  commentPanel: CommentPanel;
  builder?: unknown;
  itemCss?: unknown;
}
export class CommentPanelView extends Emitter {
  declare static __css__: string;
  declare static __tpl__: string;
  declare private $container: Uq;
  declare private model: CommentListModel;
  declare private commentPanel: CommentPanel;
  declare private $view: Uq;
  declare private _$menu: Uq;
  declare private _listView: CommentListView;
  declare private _timeMachineView: TimeMachineView;
  declare private _lastCurrentTime: number | undefined;

  constructor(params: CommentPanelViewParams) {
    super();
    this.$container = params.$container;
    this.model = params.model;
    this.commentPanel = params.commentPanel;

    css.addStyle(CommentPanelView.__css__);
    const $view = (this.$view = (uq as unknown as UqFactory).html(CommentPanelView.__tpl__));
    this.$container.append($view);

    const $menu = (this._$menu = this.$view.find('.commentPanel-menu'));

    global.debug.commentPanelView = this;

    const listView = (this._listView = new CommentListView({
      container: this.$view.find('.commentPanel-frame')[0],
      model: this.model,
      className: 'commentList',
      builder: CommentListItemView,
      itemCss: (CommentListItemView as unknown as { __css__: unknown }).__css__,
    }));
    listView.on('command', this._onCommand.bind(this) as unknown as EmitterCallback);

    this._timeMachineView = new TimeMachineView({
      parentNode: document.querySelector('.timeMachineContainer'),
    });
    this._timeMachineView.on('command', this._onCommand.bind(this) as unknown as EmitterCallback);

    this.commentPanel.on('threadInfo', _.debounce(this._onThreadInfo.bind(this), 100) as unknown as EmitterCallback);
    this.commentPanel.on('update', _.debounce(this._onCommentPanelStatusUpdate.bind(this), 100));
    this.commentPanel.on(
      'itemDetailResp',
      _.debounce((item: CommentListItem) => listView.showItemDetail(item), 100) as unknown as EmitterCallback
    );
    this._onCommentPanelStatusUpdate();

    this.model.on('currentTimeUpdate', this._onModelCurrentTimeUpdate.bind(this) as unknown as EmitterCallback);

    this.$view.on('click', this._onCommentListCommandClick.bind(this));

    global.emitter.on('hideHover', () => $menu.removeClass('show'));
  }
  toggleClass(className: string, v: boolean): Uq {
    return this.$view.raf.toggleClass(className, v);
  }
  _onModelCurrentTimeUpdate(sec: number, viewIndex: number): void {
    if (!this.$view) {
      return;
    }

    this._lastCurrentTime = sec;
    this._listView.setCurrentPoint(sec, viewIndex, this.commentPanel.isAutoScroll);
  }
  _onCommand(command: string, param: Element & { nicotta?: unknown }, itemId?: string): void {
    switch (command) {
      case 'nicoru':
        this.emit('command', command, param, itemId);
        break;
      default:
        this.emit('command', command, param, itemId);
        break;
    }
  }
  _onCommentListCommandClick(e: Event): void {
    const target = (e.target as unknown as Element).closest<HTMLElement>('[data-command]');
    if (!target) {
      return;
    }
    const { command, param } = target.dataset;
    e.stopPropagation();
    if (!command) {
      return;
    }

    const $view = this.$view;
    const setUpdating = (): void => {
      (document.activeElement as HTMLElement).blur();
      $view.raf.addClass('updating');
      window.setTimeout(() => $view.removeClass('updating'), 1000);
    };

    switch (command) {
      case 'sortBy':
        setUpdating();
        this.emit('command', command, param);
        break;
      case 'reloadComment':
        setUpdating();
        this.emit('command', command, param);
        break;
      default:
        this.emit('command', command, param);
    }
    void global.emitter.emitAsync('hideHover');
  }
  _onThreadInfo(threadInfo: ThreadInfo): void {
    this._timeMachineView.update(threadInfo);
  }
  _onCommentPanelStatusUpdate(): void {
    const commentPanel = this.commentPanel;
    this.toggleClass('autoScroll', commentPanel.isAutoScroll);
  }
}
CommentPanelView.__css__ = `
    :root {
      --futatsume-comment-panel-header-height: 64px;
    }

    .commentPanel-container {
      height: 100%;
      overflow: hidden;
      user-select: none;
    }

    .commentPanel-header {
      height: var(--futatsume-comment-panel-header-height);
      border-bottom: 1px solid #000;
      background: #333;
      color: #ccc;
    }

    .commentPanel-menu-button {
      display: inline-block;
      cursor: pointer;
      border: 1px solid #333;
      padding: 0px 4px;
      margin: 0 4px;
      background: #666;
      font-size: 16px;
      line-height: 28px;
      white-space: nowrap;
    }
    .commentPanel-menu-button:hover {
      border: 1px outset;
    }
    .commentPanel-menu-button:active {
      border: 1px inset;
    }
    .commentPanel-menu-button .commentPanel-menu-icon {
      font-size: 24px;
      line-height: 28px;
    }

    .commentPanel-container.autoScroll .autoScroll {
      text-shadow: 0 0 6px #f99;
      color: #ff9;
    }

    .commentPanel-frame {
      height: calc(100% - var(--futatsume-comment-panel-header-height));
      transition: opacity 0.3s;
    }

    .updating .commentPanel-frame,
    .shuffle .commentPanel-frame {
      opacity: 0;
    }

    .commentPanel-menu-toggle {
      position: absolute;
      right: 8px;
      display: inline-block;
      font-size: 14px;
      line-height: 32px;
      cursor: pointer;
      outline: none;
    }
    .commentPanel-menu-toggle:focus-within {
      pointer-events: none;
    }
    .commentPanel-menu-toggle:focus-within .futatsumePopupMenu {
      pointer-events: auto;
      visibility: visible;
      opacity: 0.99;
      pointer-events: auto;
      transition: opacity 0.3s;
    }

    .commentPanel-menu {
      position: absolute;
      right: 0px;
      top: 24px;
      min-width: 150px;
    }

    .commentPanel-menu li {
      line-height: 20px;
    }

  `.trim();

CommentPanelView.__tpl__ = `
    <div class="commentPanel-container">
      <div class="commentPanel-header">
        <label class="commentPanel-menu-button autoScroll commentPanel-command"
          data-command="toggleScroll"><icon class="commentPanel-menu-icon">⬇️</icon> 自動スクロール</label>

        <div class="commentPanel-command commentPanel-menu-toggle" tabindex="-1">
          ▼ メニュー
          <div class="futatsumePopupMenu commentPanel-menu">
            <div class="listInner">
            <ul>
              <li class="commentPanel-command" data-command="sortBy" data-param="vpos">
                コメントを位置順に並べる
              </li>
              <li class="commentPanel-command" data-command="sortBy" data-param="date:desc">
                新しい順
              </li>
              <li class="commentPanel-command" data-command="sortBy" data-param="nicoru:desc">
                ニコる数
              </li>
            </ul>
            </div>
          </div>
        </div>
        <div class="timeMachineContainer"></div>
      </div>
      <div class="commentPanel-frame"></div>
    </div>
  `.trim();
