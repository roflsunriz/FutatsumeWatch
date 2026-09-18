import { uq } from '../../../lib/src/uQuery';
import { textUtil } from '../../../lib/src/text/textUtil';
import { cssUtil } from '../../../lib/src/css/css';
import { nicoUtil } from '../../../lib/src/nico/nicoUtil';

interface UqCollection {
  readonly length: number;
  [index: number]: Element;
  forEach(callback: (element: Element, index: number) => void): void;
  find(selector: string): UqCollection;
  closest(selector: string): UqCollection;
  clone(): UqCollection;
  text(value: string): UqCollection;
  addClass(className: string): UqCollection;
  attr(name: string): string | undefined;
  attr(name: string, value: string): UqCollection;
  css(styles: Record<string, string>): UqCollection;
  css(name: string, value: string | number): UqCollection;
  after(content: UqCollection): UqCollection;
}

interface UqStatic {
  (selector: string): UqCollection;
  (element: Element): UqCollection;
  ready(): Promise<unknown>;
  html(html: string): UqCollection;
}

interface TextUtilLike {
  parseUrl(value: unknown): { pathname: string };
}

interface CssUtilLike {
  px(value: number): string | number;
}

interface NicoUtilLike {
  getMypageVer(): unknown;
}

interface WindowWithNico extends Window {
  Nico?: { onReady?: (callback: () => void) => void };
}

//===BEGIN===
const replaceRedirectLinks = async (): Promise<void> => {
  const uqFn = uq as unknown as UqStatic;
  const textUtilLike = textUtil as unknown as TextUtilLike;
  const cssUtilLike = cssUtil as unknown as CssUtilLike;
  const nicoUtilLike = nicoUtil as unknown as NicoUtilLike;
  await uqFn.ready();
  uqFn('a[href*="www.flog.jp/j.php/http://"]').forEach((a) => {
    const link = a as HTMLAnchorElement;
    link.href = link.href.replace(/^.*https?:/, '');
  });

  uqFn('a[href*="rd.nicovideo.jp/cc/"]').forEach((a) => {
    const link = a as HTMLAnchorElement;
    const href = link.href;
    const m = /cc_video_id=([a-z0-9+]+)/.exec(href);
    if (m) {
      const watchId = m[1] as string;
      if (!watchId.startsWith('lv')) {
        link.href = `//www.nicovideo.jp/watch/${watchId}`;
      }
    }
  });

  // マイリストページの連続再生ボタン横に「シャッフル再生」を追加する
  const nicoWindow = window as unknown as WindowWithNico;
  if (nicoWindow.Nico && nicoWindow.Nico.onReady) {
    nicoWindow.Nico.onReady(() => {
      let shuffleButton: UqCollection | undefined | null;
      const query = 'a[href*="continuous=1"]';
      const addShufflePlaylistLink = _.debounce(() => {
        if (shuffleButton) {
          return;
        }
        const $a = uqFn(query);
        if (!$a.length) {
          return false;
        }
        const a = $a[0] as HTMLAnchorElement;
        const search = (a.search || '').substr(1);
        const css = {
          display: 'inline-block',
          padding: '8px 6px',
        };
        const $shuffle = uqFn
          .html(a.outerHTML)
          .text('シャッフル再生')
          .addClass('zenzaPlaylistShuffleStart')
          .attr('href', `//www.nicovideo.jp/watch/1470321133?${search}&shuffle=1`)
          .css(css);

        $a.css(css).after($shuffle);
        shuffleButton = $shuffle;
        return true;
      }, 100);
      addShufflePlaylistLink();
      const container = uqFn('#myContBody, #SYS_box_mylist_header')[0];
      if (!container) {
        return;
      }
      new MutationObserver((records) => {
        for (const rec of records) {
          const changed = ([] as Node[]).concat(Array.from(rec.addedNodes), Array.from(rec.removedNodes));
          if (
            changed.some((i) => {
              const el = i as Element;
              return !!el.querySelector && !!el.querySelector(query);
            })
          ) {
            shuffleButton = null;
            addShufflePlaylistLink();
            return;
          }
        }
      }).observe(container, { childList: true });
    });
  }
  if (
    location.host === 'www.nicovideo.jp' &&
    nicoUtilLike.getMypageVer() === 'spa' &&
    (location.pathname.indexOf('/user/') === 0 || location.pathname.indexOf('/my') === 0)
  ) {
    await uqFn.ready(); // DOMContentLoaded
    const createShuffleButton = (continuous: Element) => {
      const shuffle = continuous.cloneNode(true) as HTMLAnchorElement;
      shuffle.classList.add('zenzaPlaylistShuffleStart');
      shuffle.innerText = 'シャッフル再生';
      shuffle.href += '&shuffle=1';
      continuous.after(shuffle);
    };
    const observer = new MutationObserver(() => {
      const shuffle = document.querySelector('.zenzaPlaylistShuffleStart');
      if (shuffle) {
        return;
      }
      const continuous = document.querySelector('.ContinuousPlayButton');
      if (continuous) {
        createShuffleButton(continuous);
        return;
      }
    });
    const continuous = document.querySelector('.ContinuousPlayButton');
    if (continuous) {
      createShuffleButton(continuous);
    }
    observer.observe(document.querySelector('.UserPage-main') as Element, { childList: true, subtree: true });
  }

  if (
    location.host === 'www.nicovideo.jp' &&
    (location.pathname.indexOf('/search/') === 0 || location.pathname.indexOf('/tag/') === 0)
  ) {
    const $autoPlay = uqFn('.autoPlay');
    const $target = $autoPlay.find('a');
    const search = (location.search || '').substr(1);
    const href = ($target.attr('href') as string) + '&' + search;
    $target.attr('href', href);
    const $shuffle = $autoPlay.clone();
    const a = $target[0];
    void a;
    $shuffle
      .find('a')
      .attr('href', href + '&shuffle=1')
      .text('シャッフル再生');
    $autoPlay.after($shuffle);

    // ニコニ広告枠のリンクを置き換える
    window.setTimeout(() => {
      uqFn('.nicoadVideoItem').forEach((item) => {
        const pointLink = item.querySelector('.count .value a');
        if (!pointLink) {
          return;
        }

        // 動画idはここから取るしかなさそう
        const { pathname } = textUtilLike.parseUrl(pointLink);
        const videoId = pathname.replace(/^.*\//, '');
        uqFn(item).find('a[data-link]').attr('href', `//www.nicovideo.jp/watch/${videoId}`);
      });
    }, 3000);
  }

  if (location.host === 'www.nicovideo.jp' && location.pathname.indexOf('/series/') === 0) {
    const firstVideo = document.querySelector('.NC-Link.NC-MediaObject-contents');
    if (!firstVideo) {
      return;
    }

    const autoPlayButton = document.createElement('a');
    autoPlayButton.classList.add('ContinuousPlayButton');
    autoPlayButton.innerText = '連続再生';
    autoPlayButton.href =
      ((firstVideo as HTMLAnchorElement).dataset.href ?? (firstVideo as HTMLAnchorElement).href) + '&continuous=1';
    Object.assign(autoPlayButton.style, {
      alignItems: 'center',
      background: '#fff',
      border: '2px solid #eee',
      borderRadius: '4px',
      color: '#555',
      display: 'flex',
      fontSize: '12px',
      height: '32px',
      padding: '0 8px',
    });

    const shuffleButton = autoPlayButton.cloneNode(true) as HTMLAnchorElement;
    shuffleButton.classList.add('zenzaPlaylistShuffleStart');
    shuffleButton.href += '&shuffle=1';
    shuffleButton.innerText = 'シャッフル再生';

    const seriesPlayButtons = document.createElement('div');
    seriesPlayButtons.append(autoPlayButton, shuffleButton);
    seriesPlayButtons.classList.add('SeriesPlayMenu');
    Object.assign(seriesPlayButtons.style, {
      display: 'flex',
      marginTop: '8px',
      gap: '8px',
    });

    (document.querySelector('.SeriesDetailContainer') as Element).append(seriesPlayButtons);
  }

  if (location.host === 'ch.nicovideo.jp') {
    uqFn('#sec_current a.item')
      .closest('li')
      .forEach((li) => {
        const $li = uqFn(li),
          $img = $li.find('img');
        const thumbnail = $img.attr('src') || $img.attr('data-original') || '';
        const $a = $li.find('a');
        const m = /smile\?i=([0-9]+)/.exec(thumbnail);
        if (m) {
          ($a[0] as HTMLAnchorElement).href = `//www.nicovideo.jp/watch/so${m[1]}`;
        }
      });
    uqFn('.playerNavContainer .video img').forEach((img) => {
      const video = img.closest('.video');
      if (!video) {
        return;
      }
      const image = img as HTMLImageElement;
      const thumbnail = image.src || image.dataset.original || '';
      const m = /smile\?i=([0-9]+)/.exec(thumbnail);
      if (m) {
        const $a = uqFn('<a class="more zen" rel="noopener" target="_blank">watch</a>')
          .css('right', cssUtilLike.px(128))
          .attr('href', `//www.nicovideo.jp/watch/so${m[1]}`);

        uqFn(video).find('.more').after($a);
      }
    });
  }
};
//===END===

export { replaceRedirectLinks };
