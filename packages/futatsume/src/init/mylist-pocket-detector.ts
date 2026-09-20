interface MylistPocketLike {
  isReady: boolean;
}

interface WindowWithMylistPocket extends Window {
  MylistPocket?: MylistPocketLike;
}

//===BEGIN===
const MylistPocketDetector = (() => {
  const pocketWindow = window as unknown as WindowWithMylistPocket;
  const promise =
    pocketWindow.MylistPocket && pocketWindow.MylistPocket.isReady
      ? Promise.resolve(pocketWindow.MylistPocket)
      : new Promise<unknown>((resolve) => {
          [window, document.body || document.documentElement].forEach((e) =>
            e.addEventListener(
              'MylistPocketInitialized',
              () => {
                resolve(pocketWindow.MylistPocket);
              },
              { once: true }
            )
          );
        });
  return { detect: () => promise };
})();

//===END===
export { MylistPocketDetector };
