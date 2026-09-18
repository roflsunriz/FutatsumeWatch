import { CONSTANT } from '../../../../src/constant';
import { css } from '../css/css';
//===BEGIN===

const PopupMessage = (() => {
  const __css__ = `
    .zenzaPopupMessage {
      --notify-color: #0c0;
      --alert-color: #c00;
      --shadow-color: #ccc;

      z-index: 100000;
      opacity: 0;
      display: block;
      min-width: 150px;
      margin-bottom: 8px;
      padding: 8px 16px;
      white-space: nowrap;
      font-weight: bolder;
      overflow-y: hidden;
      text-align: center;

      color: rgba(255, 255, 255, 0.8);
      box-shadow: 2px 2px 0 var(--shadow-color, #ccc);
      border-radius: 4px;
      pointer-events: none;
      user-select: none;

      animation: zenza-popup-message-animation 5s;
      animation-fill-mode: forwards;
    }

    .zenzaPopupMessage.notify {
      background: var(--notify-color, #0c0);
    }

    .zenzaPopupMessage.alert {
      background: var(--alert-color, #0c0);
    }

    .zenzaPopupMessage.debug {
      background: #333;
    }

    /* できれば広告に干渉したくないけど仕方なく */
    div[data-follow-container] {
      position: static !important;
    }

    @keyframes zenza-popup-message-animation {
      0%  { transform: translate3d(0, -100px, 0); opacity: 0; }
      10% { transform: translate3d(0, 0, 0); }
      20% { opacity: 0.8; }
      80% { opacity: 0.8; }
      90% { opacity: 0; }
    }
  `;

  let initialized = false;
  const initialize = (): void => {
    if (initialized) {
      return;
    }
    initialized = true;
    css.addStyle(__css__);
  };

  const create = (msg: string, className: string, allowHtml = false): HTMLDivElement => {
    const d = document.createElement('div');
    d.className = `zenzaPopupMessage ${className}`;
    if (allowHtml) {
      d.innerHTML = msg;
    } else {
      d.textContent = msg;
    }
    d.addEventListener('animationend', () => d.remove(), { once: true });
    return d;
  };

  const show = (msg: HTMLDivElement): void => {
    initialize();
    const target = document.querySelector('.popupMessageContainer');
    (target ?? document.body).prepend(msg);
  };

  const nt = (msg: unknown, allowHtml: boolean, type: string, consoleStyle: string): void => {
    let body: string;
    if (msg === undefined) {
      body = '不明なエラー';
      window.console.error('undefined message sent');
      window.console.trace();
    } else if (typeof msg === 'string') {
      body = msg;
    } else {
      // DOM セッターと %s 整形が元のまま文字列化するため、そのまま渡す。
      body = msg as string;
    }
    console.log('%c%s', consoleStyle, body);
    show(create(body, type, allowHtml));
  };

  const notify = (msg: unknown, allowHtml = false): void =>
    nt(msg, allowHtml, 'notify', 'background: #080; color: #fff; padding: 8px;');

  const alert = (msg: unknown, allowHtml = false): void =>
    nt(msg, allowHtml, 'alert', 'background: #800; color: #fff; padding: 8px;');

  const debug = (msg: unknown, allowHtml = false): void =>
    nt(msg, allowHtml, 'debug', 'background: #333; color: #fff; padding: 8px;');

  return { notify, alert, debug };
})();
//===END===
export { PopupMessage };
