// ==UserScript==
// @name        CapTube
// @namespace   https://github.com/roflsunriz/FutatsumeWatch/
// @description "S"キーでYouTubeのスクリーンショット保存
// @include     https://www.youtube.com/*
// @include     https://www.youtube.com/embed/*
// @include     https://youtube.com/*
// @version     0.0.11
// @grant       none
// @license     public domain
// ==/UserScript==

import { workerUtil } from '../packages/lib/src/infra/workerUtil';
import { cssUtil } from '../packages/lib/src/css/css';

interface CapTubeWorkerParams {
  bitmap: ImageBitmap;
  type?: string;
  quality?: number;
  dataURL?: string;
}

interface CapTubeWorkerMessage {
  command: string;
  params: CapTubeWorkerParams;
}

interface CapTubeWorkerSelf {
  onmessage: ((message: CapTubeWorkerMessage) => unknown) | null;
}

interface CapTubeCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d', options?: Record<string, unknown>): CapTubeCanvasContext | null;
  convertToBlob?(options?: Record<string, unknown>): Promise<Blob>;
  toDataURL?(type?: string, quality?: number): string;
  transferToImageBitmap?(): ImageBitmap;
}

interface CapTubeCanvasContext {
  drawImage(image: unknown, dx: number, dy: number, dw?: number, dh?: number): void;
}

interface CapTubeWorker {
  post(message: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface CapTubeWorkerUtil {
  createCrossMessageWorker(func: (self: CapTubeWorkerSelf) => void): CapTubeWorker;
}

interface CapTubeCssUtil {
  addStyle(cssText: string): void;
}

export interface CapTubeShotParams {
  videoId?: string;
  author?: string;
  title?: string;
}

(() => {
  const PRODUCT = 'CapTube';
  //@require cssUtil
  //@require workerUtil
  let previewContainer: HTMLElement | null = null,
    meterContainer: HTMLElement | null = null;

  const callOnIdle = (func: () => void): void => {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(func);
    } else {
      setTimeout(func, 0);
    }
  };

  const DataUrlConv = (() => {
    const func = function (self: CapTubeWorkerSelf): void {
      let canvas: CapTubeCanvas | undefined, ctx: CapTubeCanvasContext | null | undefined;
      const initCanvas = (): void => {
        if (canvas) {
          return;
        }
        canvas = 'OffscreenCanvas' in self ? new OffscreenCanvas(100, 100) : document.createElement('canvas');
        ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      };

      const fromBitmap = async ({ bitmap, type, quality }: CapTubeWorkerParams): Promise<Record<string, unknown>> => {
        type = type || 'image/png';
        quality = quality || 1;
        initCanvas();
        (canvas as CapTubeCanvas).width = bitmap.width;
        (canvas as CapTubeCanvas).height = bitmap.height;
        console.time('bitmap to ObjectURL');
        (ctx as CapTubeCanvasContext).drawImage(bitmap, 0, 0);
        const blob = (canvas as CapTubeCanvas).convertToBlob
          ? await (canvas as CapTubeCanvas).convertToBlob!({ type, quality })
          : (canvas as CapTubeCanvas).toDataURL!(type, quality);
        const url = URL.createObjectURL(blob as Blob);
        console.timeEnd('bitmap to ObjectURL');
        setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
        return { status: 'ok', command: 'commandResult', params: { url } };
      };

      // eslint-disable-next-line @typescript-eslint/require-await
      const fromDataURL = async ({ dataURL }: CapTubeWorkerParams): Promise<Record<string, unknown>> => {
        console.time('dataURL to objectURL');
        const blob = fetch(dataURL as string).then((r) => r.blob());
        const url = URL.createObjectURL(blob as unknown as Blob);
        console.timeEnd('dataURL to objectURL');
        setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
        return { status: 'ok', command: 'commandResult', params: { url } };
      };

      self.onmessage = async ({ command, params }: CapTubeWorkerMessage): Promise<unknown> => {
        switch (command) {
          case 'fromBitmap':
            return fromBitmap(params);
          case 'fromDataURL':
            return fromDataURL(params);
        }
      };
    };

    let worker: CapTubeWorker | undefined;

    return {
      fromBitmap: (bitmap: ImageBitmap): Promise<Record<string, unknown>> => {
        worker = worker || (workerUtil as unknown as CapTubeWorkerUtil).createCrossMessageWorker(func);
        return worker.post(
          {
            command: 'fromBitmap',
            params: { bitmap },
          },
          { transfer: [bitmap] }
        );
      },
      fromDataURL: (dataURL: string): Promise<Record<string, unknown>> => {
        worker = worker || (workerUtil as unknown as CapTubeWorkerUtil).createCrossMessageWorker(func);
        return worker.post({
          command: 'fromDataURL',
          params: { dataURL },
        });
        // return new Promise(resolve => {
        //   const sessionId = 'id:' + Math.random();
        //   sessions[sessionId] = resolve;
        //   worker.postMessage({dataURL, sessionId});
        // });
      },
    };
  })();

  const __css__ = `
    #CapTubePreviewContainer {
      position: fixed;
      padding: 16px 0 0 16px;
      width: 90%;
      bottom: 100px;
      left: 5%;
      z-index: 10000;
      pointer-events: none;
      transform: translateZ(0);
      /*background: rgba(192, 192, 192, 0.4);*/
      border: 1px solid #ccc;
      -webkit-user-select: none;
      user-select: none;
    }

    #CapTubePreviewContainer:empty {
      display: none;
    }
      #CapTubePreviewContainer canvas {
        display: inline-block;
        width: 256px;
        margin-right: 16px;
        margin-bottom: 16px;
        outline: solid 1px #ccc;
        outline-offset: 4px;
        transform: translateZ(0);
        transition:
          1s opacity      linear,
          1s margin-right linear;
      }

      #CapTubePreviewContainer canvas.is-removing {
        opacity: 0;
        margin-right: -272px;
        /*width: 0;*/
      }

    #CapTubeMeterContainer {
      pointer-events: none;
      position: fixed;
      width: 26px;
      bottom: 100px;
      left: 16px;
      z-index: 10000;
      border: 1px solid #ccc;
      transform: translateZ(0);
      -webkit-user-select: none;
      user-select: none;
     }

     #CapTubeMeterContainer::after {
       content: 'queue';
       position: absolute;
       bottom: -2px;
       left: 50%;
       transform: translate(-50%, 100%);
       color: #666;
     }

    #CapTubeMeterContainer:empty {
      display: none;
    }

      #CapTubeMeterContainer .memory {
        display: block;
        width: 24px;
        height: 8px;
        margin: 1px 0 0;
        background: darkgreen;
        opacity: 0.5;
        border: 1px solid #ccc;
      }

  `.trim();

  (cssUtil as unknown as CapTubeCssUtil).addStyle(__css__);

  const getVideoId = (): string => {
    let id = '';
    location.search
      .substring(1)
      .split('&')
      .forEach((item) => {
        if (item.split('=')[0] === 'v') {
          id = item.split('=')[1] as string;
        }
      });
    return id;
  };

  const toSafeName = (text: string): string => {
    return text
      .trim()
      .replace(/</g, '＜')
      .replace(/>/g, '＞')
      .replace(/\?/g, '？')
      .replace(/:/g, '：')
      .replace(/\|/g, '｜')
      .replace(/\//g, '／')
      .replace(/\\/g, '￥')
      .replace(/"/g, '”')
      .replace(/\./g, '．');
  };

  const getVideoTitle = (params: CapTubeShotParams = {}): string => {
    const prefix = (localStorage['CapTube-prefix'] || '') as string;
    const videoId = params.videoId || getVideoId();
    const title = document.querySelector('.title yt-formatted-string') ||
      document.querySelector('.watch-title') || { textContent: document.title };
    const authorName = toSafeName(
      params.author || document.querySelector('#owner-container yt-formatted-string')!.textContent || ''
    );
    const titleText = toSafeName(params.title || title.textContent);
    return `${prefix}${titleText} - by ${authorName} (v=${videoId})`;
  };

  const createCanvasFromVideo = (
    video: HTMLVideoElement
  ): {
    canvas: CapTubeCanvas;
    thumbnail: HTMLCanvasElement;
    bitmap: ImageBitmap | undefined | null;
  } => {
    console.time('createCanvasFromVideo');
    const width = video.videoWidth;
    const height = video.videoHeight;
    const { canvas, ctx } = getTransferCanvas();
    canvas.width = width;
    canvas.height = height;
    (ctx as CapTubeCanvasContext).drawImage(video, 0, 0);
    const bitmap = 'transferToImageBitmap' in canvas ? canvas.transferToImageBitmap!() : null;

    const thumbnail = document.createElement('canvas');
    thumbnail.width = 256;
    thumbnail.height = canvas.height * (256 / canvas.width);
    (thumbnail.getContext('2d', { alpha: false, desynchronized: true }) as CanvasRenderingContext2D).drawImage(
      bitmap || (canvas as unknown as CanvasImageSource),
      0,
      0,
      thumbnail.width,
      thumbnail.height
    );
    console.timeEnd('createCanvasFromVideo');

    return { canvas, thumbnail, bitmap };
  };

  const getFileName = (video: HTMLVideoElement, params: CapTubeShotParams = {}): string => {
    const title = getVideoTitle(params);
    const currentTime = video.currentTime;
    const min = Math.floor(currentTime / 60);
    const sec = ((currentTime % 60) + 100).toString().substr(1, 6);
    const time = `${min}_${sec}`;

    return `${title}@${time}.png`;
  };

  const createBlobLinkElementAsync = async (
    canvas: CapTubeCanvas,
    fileName: string,
    bitmap: ImageBitmap | undefined | null
  ): Promise<HTMLAnchorElement> => {
    let url: unknown;
    if (bitmap) {
      ({ url } = await DataUrlConv.fromBitmap(bitmap));
    } else {
      console.time('canvas to DataURL');
      const dataURL = canvas.toDataURL!('image/png');
      console.timeEnd('canvas to DataURL');

      ({ url } = await DataUrlConv.fromDataURL(dataURL));
    }
    return Object.assign(document.createElement('a'), {
      download: fileName,
      href: url as string,
    });
  };

  const saveScreenShot = (params: CapTubeShotParams = {}): void => {
    const video = document.querySelector<HTMLVideoElement>('.html5-main-video');
    if (!video) {
      return;
    }

    const meter = document.createElement('div');
    if (meterContainer) {
      meter.className = 'memory';
      meterContainer.append(meter);
    }

    const { canvas, thumbnail, bitmap } = createCanvasFromVideo(video);
    const fileName = getFileName(video, params);

    void createBlobLinkElementAsync(canvas, fileName, bitmap).then((link) => {
      document.body.append(link);
      link.click();
      setTimeout(() => {
        link.remove();
        meter.remove();
        URL.revokeObjectURL(link.href);
      }, 1000);
    });

    if (!previewContainer) {
      return;
    }
    previewContainer.append(thumbnail);
    setTimeout(() => {
      thumbnail.classList.add('is-removing');
      setTimeout(() => {
        thumbnail.remove();
      }, 2000);
    }, 1500);
  };

  // eslint-disable-next-line @typescript-eslint/require-await
  const getThumbnailDataURL = async (width: number, height: number, type: string): Promise<string | undefined> => {
    const video = document.querySelector<HTMLVideoElement>('.html5-main-video');
    if (!video) {
      return;
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    canvas.width = dw;
    canvas.height = dh;
    (canvas.getContext('2d', { alpha: false, desynchronized: true }) as CanvasRenderingContext2D).drawImage(
      video,
      0,
      0,
      dw,
      dh
    );
    return canvas.toDataURL(type);
  };

  const setPlaybackRate = (v: number): void => {
    const video = document.querySelector<HTMLVideoElement>('.html5-main-video');
    if (!video) {
      return;
    }
    video.playbackRate = v;
  };

  const togglePlay = (): void => {
    const video = document.querySelector<HTMLVideoElement>('.html5-main-video');
    if (!video) {
      return;
    }

    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  };

  const seekBy = (v: number): void => {
    const video = document.querySelector<HTMLVideoElement>('.html5-main-video');
    if (!video) {
      return;
    }

    const ct = Math.max(video.currentTime + v, 0);
    video.currentTime = ct;
  };

  let isVerySlow = false;
  const onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    switch (key) {
      case 'd':
        setPlaybackRate(0.1);
        isVerySlow = true;
        break;
      case 's':
        saveScreenShot({});
        break;
    }
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    //console.log('onKeyUp', e);
    const key = e.key.toLowerCase();
    switch (key) {
      case 'd':
        setPlaybackRate(1);
        isVerySlow = false;
        break;
    }
  };

  const onKeyPress = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    switch (key) {
      case 'w':
        togglePlay();
        break;
      case 'a':
        seekBy(isVerySlow ? -0.5 : -5);
        break;
    }
  };

  const getTransferCanvas = function (
    this: { canvas: CapTubeCanvas | null; ctx: CapTubeCanvasContext | null },
    width = 640,
    height = 480
  ): { canvas: CapTubeCanvas; ctx: CapTubeCanvasContext | null } {
    const canvas = (this.canvas =
      this.canvas || 'OffscreenCanvas' in self
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height }));
    const ctx = (this.ctx = this.ctx || this.canvas.getContext('2d', { alpha: false, desynchronized: true }));
    return { canvas, ctx };
  }.bind({ canvas: null, ctx: null });

  const initDom = (): void => {
    const div = document.createElement('div');
    div.id = 'CapTubePreviewContainer';
    previewContainer = div;

    meterContainer = document.createElement('div');
    meterContainer.id = 'CapTubeMeterContainer';
    document.body.append(div, meterContainer);
  };

  const HOST_REG = /^[a-z0-9]*\.nicovideo\.jp$/;

  const parseUrl = (url: string): HTMLAnchorElement => Object.assign(document.createElement('a'), { href: url });

  const initialize = (): void => {
    initDom();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('keypress', onKeyPress);
  };

  const initializeEmbed = (): void => {
    const parentHost = parseUrl(document.referrer).hostname;
    if (!HOST_REG.test(parentHost)) {
      console.log('disable bridge');
      return;
    }
    const origin = document.referrer;
    console.log('%cinit embed CapTube', 'background: lightgreen;');
    window.addEventListener('message', (e) => {
      if (!HOST_REG.test(parseUrl(e.origin).hostname)) {
        return;
      }
      const data = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as {
        body: { command: string; params: { title?: string; videoId?: string; author?: string } };
        sessionId: string;
        command: string;
      };
      const { body, sessionId } = data;
      const { command, params } = body;

      switch (command || data.command) {
        case 'capTube':
          {
            const { title, videoId, author } = params || data;
            saveScreenShot({
              title: title as string,
              videoId: videoId as string,
              author: author as string,
            });
          }
          break;
        case 'capTubeThumbnail':
          {
            // @ts-expect-error 既存の呼び出し形（引数不足のままの呼び出し）を温存する
            const url = getThumbnailDataURL(params);
            const body = {
              command: 'commandResult',
              status: 'ok',
              params: { url },
            };
            const msg = { id: PRODUCT, sessionId, body };
            parent.postMessage(msg, origin);
          }
          break;
      }
    });
  };

  if (window.top !== window && location.pathname.indexOf('/embed/') === 0) {
    initializeEmbed();
  } else {
    initialize();
  }
})();
