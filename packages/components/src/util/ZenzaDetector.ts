import { Emitter } from '../../../../src/baselib.js';
import { MylistPocketDetector } from '../../../zenza/src/init/MylistPocketDetector';

interface ZenzaWatchLike {
  ready?: unknown;
}

interface WindowWithZenzaWatch extends Window {
  ZenzaWatch?: ZenzaWatchLike;
  FutatsumeWatch?: ZenzaWatchLike;
}
//===BEGIN===

const ZenzaDetector = (() => {
  const zenzaWindow = window as unknown as WindowWithZenzaWatch;
  const current = zenzaWindow.FutatsumeWatch ?? zenzaWindow.ZenzaWatch;
  const promise =
    current && current.ready
      ? Promise.resolve(current)
      : new Promise<unknown>((resolve) => {
          [window, document.body || document.documentElement].forEach((e) => {
            e.addEventListener('FutatsumeWatchInitialize', () => {
              resolve(zenzaWindow.FutatsumeWatch ?? zenzaWindow.ZenzaWatch);
            });
            // 旧イベント名との互換のため旧名も購読する
            e.addEventListener('ZenzaWatchInitialize', () => {
              resolve(zenzaWindow.FutatsumeWatch ?? zenzaWindow.ZenzaWatch);
            });
          });
        });
  return { detect: () => promise };
})();

//===END===

export { ZenzaDetector, MylistPocketDetector };

// const MylistPocketDetector = (() => {
//   let isReady = false;
//   let pocket = null;
//   const emitter = new Emitter();

//   const initialize = () => {
//     const onPocketReady = () => {
//       isReady = true;
//       pocket = window.MylistPocket;

//       emitter.emit('ready', pocket);
//     };

//     if (window.MylistPocket && window.MylistPocket.isReady) {
//       onPocketReady();
//     } else {
//       document.body.addEventListener('MylistPocketInitialized', () => {
//         onPocketReady();
//       }, {once: true});
//     }
//   };

//   const detect = () => {
//     return new Promise(res => {
//       if (isReady) {
//         return res(pocket);
//       }
//       emitter.once('ready', () => {
//         res(pocket);
//       });
//     });
//   };

//   initialize();
//   return {
//     detect: detect
//   };

// })();
