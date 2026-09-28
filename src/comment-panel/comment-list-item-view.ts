import { CONSTANT } from '../shared/constant';
import { NICORU } from '../shared/nicoru-icon';
import type { CommentListItem } from './comment-list-item';

interface CommentListItemViewParams {
  item: CommentListItem;
  index: number;
  height: number;
}
export const CommentListItemView = (() => {
  // なんか汎用性を持たせようとして失敗してる奴

  // ここはDOM的に隔離されてるので外部要因との干渉を考えなくてよい
  const CSS = `
      * {
        box-sizing: border-box;
      }

      body {
        background: #000;
        margin: 0;
        padding: 0;
        overflow: hidden;
        line-height: 0;
      }

      ${CONSTANT.SCROLLBAR_CSS}

      .listMenu {
        position: absolute;
        width: 100%;
        right: 0;
        z-index: 100;

        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        gap: 8px;
        padding-inline: 8px;
      }

      .listMenu:not(.show) {
        display: none;
      }

      .listMenu  .comment-row-action {
        font-size: 13px;
        line-height: 20px;
        border: 1px solid #666;
        color: #fff;
        background: #666;
        cursor: pointer;
        text-align: center;
        width: 48px;
      }

      .listMenu .comment-row-action:hover {
        border: 1px solid #ccc;
        box-shadow: 2px 2px 2px #333;
      }

      .listMenu .comment-row-action:active {
        box-shadow: none;
        transform: translate(0, 1px);
      }

      .listMenu .itemDetailRequest {
        width: auto;
        padding: 0 8px;
      }

      /* 自分の投稿をNGに突っ込む奴いるのかな？とは思いつつ残す。どっかで消すかなんかしたい
      .listMenu[data-is-mine="true"] .addWordFilter {
        display: none;
      }

      .listMenu[data-is-mine="true"] .addUserIdFilter {
        display: none;
      }*/

      .listMenu:not([data-is-mine="true"]) .removeComment {
        display: none;
      }

      .commentListItem {
        position: absolute;
        display: inline-block;
        will-change: transform;
        width: 100%;
        height: 40px;
        line-height: 20px;
        font-size: 20px;
        white-space: nowrap;
        margin: 0;
        padding: 0;
        background: #131923;
        z-index: 50;
        contain: strict;
      }
      .is-firefox .commentListItem {
        contain: layout !important;
        width: calc(100vw - 16px);
        will-change: auto;
      }

      .is-active .commentListItem {
        pointer-events: auto;
      }

      .commentListItem * {
        cursor: default;
      }

      .commentListItem.odd {
        background: #19212e;
      }
      .commentListItem[data-nicoru] {
        background: #332;
      }
      .commentListItem.odd[data-nicoru] {
        background: #443;
      }
      .commentListItem[data-nicoru]:hover::before {
        position: absolute;
        content: attr(data-nicoru);
        color: #ccc;
        font-size: 12px;
        left: 80px;
      }
      .commentListItem .nicoru-icon {
        position: absolute;
        pointer-events: auto;
        display: inline-block;
        cursor: pointer;
        visibility: hidden;
        transition: transform 0.2s linear, filter 0.2s;
        transform-origin: center;
        left: 50px;
        top: -2px;
        width: 24px;
        height: 24px;
        contain: strict;
      }
      .commentListItem:hover .nicoru-icon {
        visibility: visible;
      }
      .commentListItem.nicotta .nicoru-icon {
        visibility: visible;
        transform: rotate(270deg);
        filter: drop-shadow(0px 0px 6px gold);
        pointer-events: none;
      }

      .commentListItem.updating {
        opacity: 0.5;
        cursor: wait;
      }

      .commentListItem .info {
        display: flex;
        justify-content: space-between;
        width: 100%;
        font-size: 14px;
        height: 20px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: #aab4c6;
        margin: 0;
        padding: 0 8px 0;
      }
      .commentListItem[data-valhalla="1"] .info {
        color: #f88;
      }
      .commentListItem .timepos {
        display: inline-block;
        width: 100px;
      }

      .commentListItem .text {
        display: block;
        font-size: 16px;
        height: 20px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: #ccc;
        margin: 0;
        padding: 0 8px;
        font-family: '游ゴシック', 'Yu Gothic', 'YuGothic', arial, 'Menlo';
        font-feature-settings: "palt" 1;
      }
      .commentListItem[data-valhalla="1"] .text {
        color: red;
        font-weight: bold;
      }

      .is-active .commentListItem:hover {
        overflow-x: hidden;
        overflow-y: visible;
        z-index: 60;
        height: auto;
        box-shadow: 2px 2px 2px #000, 2px -2px 2px #000;
        contain: layout style paint;
      }

      .is-active .commentListItem:hover .text {
        white-space: normal;
        word-break: break-all;
        height: auto;
      }

      .commentListItem.fork1 .timepos {
        text-shadow: 1px 1px 0 #008800, -1px -1px 0 #008800 !important;
      }
      .commentListItem:where(.fork2, .fork3) .timepos {
        opacity: 0.6;
      }
      .commentListItem.fork1 .text {
        font-weight: bolder;
      }

      .commentListItem.subThread {
        opacity: 0.6;
      }

      .commentListItem.is-active {
        outline: dashed 2px #ff8;
        outline-offset: 4px;
      }

      .font-gothic .text {font-family: "游ゴシック", "Yu Gothic", 'YuGothic', "ＭＳ ゴシック", "IPAMonaPGothic", sans-serif, Arial, Menlo;}
      .font-mincho .text {font-family: "游明朝体", "Yu Mincho", 'YuMincho', Simsun, Osaka-mono, "Osaka−等幅", "ＭＳ 明朝", "ＭＳ ゴシック", "モトヤLシーダ3等幅", 'Hiragino Mincho ProN', monospace;}
      .font-defont .text {font-family: 'Yu Gothic', 'YuGothic', "ＭＳ ゴシック", "MS Gothic", "Meiryo", "ヒラギノ角ゴ", "IPAMonaPGothic", sans-serif, monospace, Menlo; }
/*
      .commentListItem .progress-negi {
        position: absolute;
        width: 2px;
        height: 100%;
        bottom: 0;
        right: 0;
        pointer-events: none;
        background: #888;
        will-change: transform;
        animation-duration: var(--duration);
        animation-delay: calc(var(--vpos-time) - var(--current-time) - 1s);
        animation-name: negi-moving;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
        animation-play-state: paused !important;
        contain: paint layout style size;
      }
      @keyframes negi-moving {
        0% { background: #ebe194;}
        50% { background: #fff; }
        80% { background: #fff; }
        100% { background: #039393; }
      }
*/
    `.trim();

  const TPL = `
      <div class="commentListItem" style="position: absolute;">
        <img src="${NICORU}" class="nicoru-icon" data-command="nicoru" title="Nicorü">
        <p class="info">
          <span class="timepos"></span>&nbsp;&nbsp;<span class="date"></span>
        </p>
        <p class="text"></p>
        <span class="progress-negi" style="position: absolute; will-change: transform; contain: strict;"></span>
      </div>
    `.trim();

  let counter = 0;
  let template:
    | {
        t: HTMLTemplateElement;
        clone: () => HTMLElement | null;
        commentListItem: HTMLElement;
        timepos: HTMLElement;
        date: HTMLElement;
        text: HTMLElement;
      }
    | undefined;

  class CommentListItemView {
    declare private _item: CommentListItem;
    declare private _index: number;
    declare private _height: number;
    declare private _id: number;
    declare private _view: HTMLElement | null;
    declare static TPL: string;
    declare static CSS: string;
    static get template(): {
      t: HTMLTemplateElement;
      clone: () => HTMLElement | null;
      commentListItem: HTMLElement;
      timepos: HTMLElement;
      date: HTMLElement;
      text: HTMLElement;
    } {
      if (!template) {
        const t = document.createElement('template');
        t.id = 'CommentListItemView-template' + Date.now();
        t.innerHTML = TPL;
        // document.body.append(t);
        template = {
          t,
          clone: () => {
            return document.importNode(t.content, true).firstChild as HTMLElement | null;
          },
          commentListItem: t.content.querySelector('.commentListItem') as HTMLElement,
          timepos: t.content.querySelector('.timepos') as HTMLElement,
          date: t.content.querySelector('.date') as HTMLElement,
          text: t.content.querySelector('.text') as HTMLElement,
        };
      }
      return template;
    }

    constructor(params: CommentListItemViewParams) {
      this.initialize(params);
    }

    initialize(params: CommentListItemViewParams): void {
      this._item = params.item;
      this._index = params.index;
      this._height = params.height;

      this._id = counter++;
    }

    build(): void {
      const template = (this.constructor as typeof CommentListItemView).template;
      const { commentListItem, timepos, date, text } = template;
      const item = this._item;
      const oden = this._index % 2 === 0 ? 'even' : 'odd';
      const time3dp = Math.round(this._item.time3dp * 100);

      const formattedDate = item.formattedDate;
      commentListItem.id = this.domId;
      const font = item.fontCommand || 'default';
      commentListItem.className = `commentListItem no${item.no} item${this._id} ${oden} fork${item.fork} font-${font} ${item.isSubThread ? 'subThread' : ''}`;
      commentListItem.classList.toggle('nicotta', item.nicotta);
      commentListItem.style.cssText = `top: ${this.top}px; content-visibility: hidden;`;
      /*--duration: ${item.duration}s;
          --vpos-time: ${item.vpos / 100}s;*/
      // commentListItem.style.transform = `translateZ(${time3dp}px)`;
      //commentListItem.setAttribute('data-time-3dp', time3dp);

      Object.assign(commentListItem.dataset, {
        itemId: item.itemId,
        no: item.no,
        uniqNo: item.uniqNo,
        vpos: item.vpos,
        top: this.top,
        thread: item.threadId,
        isMine: item.isMine,
        title: `${item.no}: ${formattedDate} ID:${item.userId}\n${item.text}`,
        time3dp,
        valhalla: item.valhalla,
      });
      if (item.nicoru > 0) {
        (commentListItem.dataset as Record<string, string | number | undefined>).nicoru = item.nicoru;
      } else {
        delete (commentListItem.dataset as Record<string, string | number | undefined>).nicoru;
      }

      timepos.textContent = item.timePos;
      date.textContent = formattedDate;
      text.textContent = item.text.trim();

      const color = item.color;
      text.style.textShadow = color ? `0px 0px 2px ${color}` : '';
      this._view = template.clone();
    }

    get viewElement(): HTMLElement {
      if (!this._view) {
        this.build();
      }
      return this._view as HTMLElement;
    }

    get itemId(): number {
      return this._item.itemId;
    }

    get domId(): string {
      return `item${this._item.itemId}`;
    }

    get top(): number {
      return this._index * this._height;
    }

    remove(): void {
      if (!this._view) {
        return;
      }
      this._view.remove();
    }

    toString(): string {
      return this.viewElement.outerHTML;
    }

    get time3dp(): number {
      return this._item.time3dp;
    }

    get time3d(): number {
      return this._item.time3d;
    }

    get nicotta(): boolean {
      return this._item.nicotta;
    }
    set nicotta(v: boolean) {
      this._item.nicotta = v;
      this._view!.classList.toggle('nicotta', v);
    }
    get nicoru(): number {
      return this._item.nicoru;
    }
    set nicoru(v: number) {
      this._item.nicoru = v;
      if (v > 0) {
        (this._view!.dataset as Record<string, string | number | undefined>).nicoru = v;
      } else {
        delete (this._view!.dataset as Record<string, string | number | undefined>).nicoru;
      }
    }
  }

  CommentListItemView.TPL = TPL;
  CommentListItemView.CSS = CSS;
  return CommentListItemView;
})();
