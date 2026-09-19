export function installWatchEntry(open: (watchId: string) => unknown): void {
  if (location.hostname !== 'www.nicovideo.jp' || !/^\/watch\/\w+/.test(location.pathname)) return;
  if (document.querySelector('[data-futatsume-open]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.futatsumeOpen = '';
  button.textContent = navigator.language.startsWith('ja') ? 'FutatsumeWatchで再生' : 'Play in FutatsumeWatch';
  button.addEventListener('click', () => {
    const watchId = /^\/watch\/(\w+)/.exec(location.pathname)?.[1];
    if (!watchId) return;
    document.querySelectorAll('video').forEach((video) => {
      if (!video.closest('#zenzaVideoPlayerDialog')) video.pause();
    });
    open(watchId);
  });
  const style = document.createElement('style');
  style.textContent = `[data-futatsume-open]{position:fixed;right:12px;bottom:12px;z-index:99999;max-width:calc(100vw - 24px);padding:10px 16px;border:1px solid #4acac0;border-radius:6px;background:#153b39;color:white;font:600 14px/1.4 sans-serif;cursor:pointer}body.showNicoVideoPlayerDialog [data-futatsume-open]{display:none}`;
  document.head.append(style);
  document.body.append(button);
}
