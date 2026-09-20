import { MylistPocketDetector } from '../../../futatsume/src/init/mylist-pocket-detector';

interface FutatsumeWatchLike {
  ready?: unknown;
}

interface WindowWithFutatsumeWatch extends Window {
  FutatsumeWatch?: FutatsumeWatchLike;
}
//===BEGIN===

const FutatsumeDetector = (() => {
  const futatsumeWindow = window as unknown as WindowWithFutatsumeWatch;
  const current = futatsumeWindow.FutatsumeWatch;
  const promise =
    current && current.ready
      ? Promise.resolve(current)
      : new Promise<unknown>((resolve) => {
          [window, document.body || document.documentElement].forEach((e) => {
            e.addEventListener(
              'FutatsumeWatchInitialize',
              () => {
                resolve(futatsumeWindow.FutatsumeWatch);
              },
              { once: true }
            );
          });
        });
  return { detect: () => promise };
})();

//===END===

export { FutatsumeDetector, MylistPocketDetector };

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
