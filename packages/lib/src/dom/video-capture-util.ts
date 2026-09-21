type CapturableVideo = HTMLVideoElement & { drawableElement?: CanvasImageSource };

interface CaptureState {
  lastSrc?: string;
  wait?: Promise<unknown>;
}

interface CapTubeState {
  promises: Record<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>;
  sessionId: number;
  bridge: { post: (body: unknown, options?: { timeout?: number; transfer?: unknown }) => Promise<unknown> } | null;
}

interface CapTubeMessage {
  id?: unknown;
  body?: { command?: string; params?: { result?: unknown } };
  sessionId: string;
  status?: unknown;
}

interface VideoCaptureUtilShape {
  videoToCanvas: (video: HTMLVideoElement) => Promise<{ canvas: HTMLCanvasElement }>;
  htmlToCanvas: (html: string, width?: number, height?: number) => { canvas: HTMLCanvasElement; img: HTMLImageElement };
  nicoVideoToCanvas: (params: {
    video: HTMLVideoElement;
    html: string;
    minHeight?: number;
  }) => Promise<{ canvas: HTMLCanvasElement; img: HTMLImageElement }>;
  saveToFile: (canvas: HTMLCanvasElement, fileName?: string) => void;
  capture: (src: string, sec: number) => Promise<unknown>;
  initCapTube: () => {
    post: (body: unknown, options?: { timeout?: number; transfer?: unknown }) => Promise<unknown>;
  } | null;
  capTube: (params: { title: string; videoId: string; author: string }) => void;
  capTubeThumbnail: (width?: number, height?: number, type?: string) => void;
}

import { createVideoElement } from '../../../futatsume/src/videoPlayer/create-video-element';
import { sleep } from '../infra/sleep';

//===BEGIN===

const VideoCaptureUtil = (() => {
  const _toCanvas = (v: CapturableVideo, width: number, height: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('画像保存用の描画領域を作成できませんでした');
    canvas.width = width;
    canvas.height = height;
    context.drawImage(v.drawableElement || v, 0, 0, width, height);
    return canvas;
  };

  const videoToCanvas = (video: HTMLVideoElement): Promise<{ canvas: HTMLCanvasElement }> => {
    try {
      if (video.readyState < 2 || !(video.videoWidth > 0) || !(video.videoHeight > 0)) {
        throw new Error('映像の読み込みが完了してから画像を保存してください');
      }
      const canvas = _toCanvas(video, video.videoWidth, video.videoHeight);
      // ホスト名ではなく、実フレームをPNGへ読み出せるかでCORSを判定する。
      canvas.toDataURL('image/png');
      return Promise.resolve({ canvas });
    } catch (error) {
      const reason =
        error instanceof Error || (typeof error === 'object' && error !== null && 'name' in error)
          ? error
          : new Error('画像の生成に失敗しました');
      return Promise.reject(
        reason.name === 'SecurityError'
          ? new Error('ブラウザーのCORS制限により、この映像を画像へ保存できません')
          : error instanceof Error
            ? error
            : new Error('映像を画像へ変換できませんでした')
      );
    }
  };

  // 参考
  // https://developer.mozilla.org/ja/docs/Web/HTML/Canvas/Drawing_DOM_objects_into_a_canvas
  const htmlToSvg = (html: string, width = 682, height = 384): { svg: Blob; data: string } => {
    const data = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>
          <foreignObject width='100%' height='100%'>${html}</foreignObject>
        </svg>`.trim();
    const svg = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    return { svg, data };
  };

  const htmlToCanvas = (
    html: string,
    width = 640,
    height = 360
  ): { canvas: HTMLCanvasElement; img: HTMLImageElement } => {
    const imageW = (height * 16) / 9;
    const imageH = (imageW * 9) / 16;
    const { svg } = htmlToSvg(html);

    const url = window.URL.createObjectURL(svg);
    if (!url) {
      return Promise.reject(new Error('convert svg fail')) as unknown as {
        canvas: HTMLCanvasElement;
        img: HTMLImageElement;
      };
    }
    const img = new Image();
    img.width = 682;
    img.height = 384;
    const canvas = document.createElement('canvas');

    const context = canvas.getContext('2d')!;
    canvas.width = width;
    canvas.height = height;

    img.src = url;
    void img
      .decode()
      .then(() => {
        context.drawImage(img, (width - imageW) / 2, (height - imageH) / 2, imageW, imageH);
      })
      .catch((e) => {
        throw new Error('img decode error', e as { cause?: unknown });
      })
      .finally(() => window.URL.revokeObjectURL(url));
    return { canvas, img };
  };

  const nicoVideoToCanvas = async ({
    video,
    html,
    minHeight = 1080,
  }: {
    video: HTMLVideoElement;
    html: string;
    minHeight?: number;
  }): Promise<{ canvas: HTMLCanvasElement; img: HTMLImageElement }> => {
    let scale = 1;
    let width = Math.max(video.videoWidth, (video.videoHeight * 16) / 9);
    let height = video.videoHeight;
    // 動画の解像度が低いときは、可能な範囲で整数倍に拡大する
    if (height < minHeight) {
      scale = Math.floor(minHeight / height);
      width *= scale;
      height *= scale;
    }

    const canvas = document.createElement('canvas');
    const ct = canvas.getContext('2d', { alpha: false })!;

    canvas.width = width;
    canvas.height = height;

    const { canvas: videoCanvas } = await videoToCanvas(video);

    ct.fillStyle = 'rgb(0, 0, 0)';
    ct.fillRect(0, 0, width, height);

    ct.drawImage(
      videoCanvas,
      (width - video.videoWidth * scale) / 2,
      (height - video.videoHeight * scale) / 2,
      video.videoWidth * scale,
      video.videoHeight * scale
    );

    const { canvas: htmlCanvas, img } =
      // htmlToCanvas は同期的だが microtask 順序を保つため await を維持する
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await htmlToCanvas(html, width, height);

    ct.drawImage(htmlCanvas, 0, 0, width, height);
    return { canvas, img };
  };

  const saveToFile = (canvas: HTMLCanvasElement, fileName = 'sample.png'): void => {
    const dataUrl = canvas.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1] as string);
    const buf = new Uint8Array(bin.length);
    for (let i = 0, len = buf.length; i < len; i++) {
      buf[i] = bin.charCodeAt(i);
    }
    const blob = new Blob([buf.buffer], { type: 'image/png' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.setAttribute('download', fileName);
    a.setAttribute('href', url);
    a.setAttribute('rel', 'noopener');
    document.body.append(a);
    a.click();
    window.setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 2000);
  };

  return {
    videoToCanvas,
    htmlToCanvas,
    nicoVideoToCanvas,
    saveToFile,
  };
})() as VideoCaptureUtilShape;
VideoCaptureUtil.capture = function (this: CaptureState, src: string, sec: number) {
  const func = (): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const v = createVideoElement('capture') as CapturableVideo | null;
      if (!v) {
        // 取得失敗通知は理由なし reject のため Error 限定しない
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return reject();
      }
      Object.assign(v.style, {
        width: '64px',
        height: '36px',
        position: 'fixed',
        left: '-100px',
        top: '-100px',
      });

      v.volume = 0;
      v.autoplay = false;
      v.controls = false;
      v.addEventListener('loadedmetadata', () => (v.currentTime = sec), { once: true });
      v.addEventListener(
        'error',
        (err) => {
          v.remove();
          // メディアエラーはイベントのまま透過させるため Error 限定しない
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(err);
        },
        { once: true }
      );

      const onSeeked = (): void => {
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(v.drawableElement || v, 0, 0);
        v.remove();
        return resolve(c);
      };

      v.addEventListener('seeked', onSeeked, { once: true });

      setTimeout(() => {
        v.remove();
        // タイムアウト通知は理由なし reject のため Error 限定しない
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        reject();
      }, 30000);

      document.body.append(v);
      v.src = src;
      v.currentTime = sec;
    });
  };

  const wait: Promise<unknown> = this.lastSrc === src && this.wait ? this.wait : sleep(1000);
  this.lastSrc = src;
  // 連続アクセスでセッションがkillされないように
  let waitTime = 1000;
  waitTime += src.indexOf('.m3u8') >= 0 ? 2000 : 0;

  let resolve!: (value: unknown) => void;
  let reject!: (reason?: unknown) => void;
  this.wait = new Promise((...args) => ([resolve, reject] = args))
    .then(() => sleep(waitTime))
    .catch(() => sleep(waitTime * 2));

  return wait
    .then(func)
    .then((r) => {
      resolve(r);
      return r;
    })
    .catch((e: unknown) => {
      reject(e);
      return e;
    });
}.bind({});

VideoCaptureUtil.initCapTube = function (this: CapTubeState) {
  const iframe = document.querySelector<HTMLIFrameElement>(
    '#FutatsumeWatchVideoPlayerContainer iframe[title^=YouTube]'
  );
  if (!iframe) {
    return null;
  }
  if (this.bridge) {
    return this.bridge;
  }

  const cw = iframe.contentWindow;
  const promises = this.promises;
  self.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== cw) {
      return;
    }
    const { id, body, sessionId, status } = e.data as CapTubeMessage;
    const { command, params } = body!;
    if (id !== 'CapTube') {
      return;
    }
    switch (command) {
      case 'commandResult':
        if (promises[sessionId]) {
          if (status === 'ok') {
            promises[sessionId].resolve((params as { result?: unknown }).result);
          } else {
            promises[sessionId].reject((params as { result?: unknown }).result);
          }
          delete promises[sessionId];
        }
        return;
    }
  });
  const post = (body: unknown, options: { timeout?: number; transfer?: unknown } = {}) => {
    const sessionId = `send:CapTube:${this.sessionId++}`;
    return new Promise((resolve, reject) => {
      promises[sessionId] = { resolve, reject };
      (cw as Window).postMessage({ body, sessionId }, location.href, options.transfer as Transferable[]);
      if (typeof options.timeout === 'number') {
        setTimeout(() => {
          // timeout 通知は {status, message} 形式のプロトコルのため Error 限定しない
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject({ status: 'fail', message: 'timeout' });
          delete promises[sessionId];
        }, options.timeout);
      }
    }).finally(() => {
      delete promises[sessionId];
    });
  };
  return (this.bridge = { post });
}.bind({ promises: {}, sessionId: 1, bridge: null });

VideoCaptureUtil.capTube = ({ title, videoId, author }: { title: string; videoId: string; author: string }): void => {
  const tube = VideoCaptureUtil.initCapTube();
  if (!tube) {
    return;
  }
  const command = 'capTube';
  void tube.post({ command, params: { title, videoId, author } }, { timeout: 30000 });
};

VideoCaptureUtil.capTubeThumbnail = (width = 320, height = 180, type = 'image/webp'): void => {
  const tube = VideoCaptureUtil.initCapTube();
  if (!tube) {
    return;
  }
  const command = 'capTubeThumbnail';
  void tube.post({ command, params: { width, height, type } }, { timeout: 30000 });
};

//===END===

export { VideoCaptureUtil };
