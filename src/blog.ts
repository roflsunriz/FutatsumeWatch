export interface BlogPartsMessage {
  command: string;
  watchId?: string;
}

export interface BlogPartsContext {
  targetOrigin: string;
  watchId: string;
}

export function getBlogPartsContext(href: string, referrer: string): BlogPartsContext | null {
  try {
    const page = new URL(href);
    const parent = new URL(referrer);
    const watchId = /^\/thumb\/((?:[a-z]{2})?\d+)\/?$/.exec(page.pathname)?.[1];
    if (
      page.hostname !== 'ext.nicovideo.jp' ||
      !watchId ||
      (parent.hostname !== 'nicovideo.jp' && !parent.hostname.endsWith('.nicovideo.jp'))
    )
      return null;
    return { targetOrigin: parent.origin, watchId };
  } catch {
    return null;
  }
}

(() => {
  const addStyle = (styles: string, id?: string): HTMLStyleElement => {
    const elm = document.createElement('style');
    elm.type = 'text/css';
    if (id) {
      elm.id = id;
    }
    elm.append(styles);
    document.head.append(elm);
    return elm;
  };

  const postMessage = (type: string, message: BlogPartsMessage, targetOrigin: string, token?: unknown): void => {
    const { command, watchId } = message;
    try {
      parent.postMessage(
        JSON.stringify({
          // 互換のため冗長
          id: 'FutatsumeWatch',
          type,
          token,
          body: {
            token,
            url: location.href,
            message: { command, watchId },
            command: 'message',
            params: {
              command,
              params: { watchId },
            },
          },
        }),
        targetOrigin
      );
    } catch (e) {
      alert(e);
      console.log('err', e);
    }
  };

  const __css__ = `
    #futatsumeButton {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 10000;
      line-height: 24px;
      padding: 4px 4px;
      cursor: pointer;
      font-weight: bolder;
      display: none;
    }
    body:hover #futatsumeButton {
      display: inline-block;
    }
  `.trim();

  const blogPartsApi = (): void => {
    const context = getBlogPartsContext(location.href, document.referrer);
    if (!context) {
      console.log('disable bridge');
      return;
    }

    addStyle(__css__);
    const button = document.createElement('button');
    button.innerHTML = '<span>Futatsume</span>';
    button.id = 'futatsumeButton';
    document.body.append(button);
    button.onclick = (e) => {
      postMessage(
        'blogParts',
        {
          command: e.shiftKey ? 'send' : 'open',
          watchId: context.watchId,
        },
        context.targetOrigin
      );
    };
  };

  blogPartsApi();
})();
