//===BEGIN===
const watchResize = (target: Element, callback: () => void): void => {
  if (window.ResizeObserver) {
    const ro = new window.ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === target) {
          callback();
          return;
        }
      }
    });
    ro.observe(target);
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.loading = 'eager';
  iframe.className = 'resizeObserver';
  Object.assign(iframe.style, {
    width: '100%',
    height: '100%',
    position: 'absolute',
    pointerEvents: 'none',
    border: 0,
    //transform: 'translate3d(0, 0, 0)',
    opacity: 0,
  });
  target.parentElement!.append(iframe);
  iframe.contentWindow!.addEventListener('resize', () => {
    callback();
  });
};

//===END===
export { watchResize };
