import { expect, spyOn, test } from 'bun:test';
import { VideoItemObserver } from '../../packages/lib/src/nico/video-item-observer';
import { ThumbInfoLoader } from '../../packages/lib/src/nico/thumb-info-loader';
import { parseThumbInfo } from '../../packages/lib/src/nico/parse-thumb-info';

test('既存・追加の動画カードを可視時に一度だけ取得し、失敗後も再送しない', async () => {
  const originalIntersection = window.IntersectionObserver;
  let notify: IntersectionObserverCallback | undefined;
  const observed = new Set<Element>();
  class TestIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      notify = callback;
    }
    observe(item: Element): void {
      observed.add(item);
    }
    unobserve(item: Element): void {
      observed.delete(item);
    }
  }
  Object.assign(window, { IntersectionObserver: TestIntersectionObserver });
  Object.assign(globalThis, { MutationObserver: window.MutationObserver });
  const data = parseThumbInfo(`<?xml version="1.0"?><nicovideo_thumb_response status="ok"><thumb>
    <video_id>sm9</video_id><title>取得したタイトル</title><description>説明</description>
    <thumbnail_url>https://fixture.invalid/poster.svg</thumbnail_url><first_retrieve>2026-09-20T00:00:00+09:00</first_retrieve>
    <length>1:04</length><watch_url>https://www.nicovideo.jp/watch/sm9</watch_url>
    <view_counter>10</view_counter><comment_num>128</comment_num><mylist_counter>2</mylist_counter>
    </thumb></nicovideo_thumb_response>`);
  const load = spyOn(ThumbInfoLoader, 'load').mockImplementation((id) => {
    if (id === 'sm100') return Promise.reject(new Error('通信失敗'));
    return Promise.resolve(data);
  });
  const container = document.createElement('div');
  container.innerHTML = '<futatsume-video-item data-video-id="sm9"></futatsume-video-item>';
  document.body.append(container);
  const first = container.firstElementChild!;
  const inview = async () => {
    const entries = [...observed].map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry);
    notify!(entries, {} as IntersectionObserver);
    await Promise.resolve();
    await Promise.resolve();
  };
  try {
    VideoItemObserver.observe({ container });
    VideoItemObserver.observe({ container });
    expect(observed.has(first)).toBe(true);
    expect(load).not.toHaveBeenCalled();
    await inview();
    expect(JSON.parse((first as HTMLElement).dataset.thumbInfo!)).toEqual(data);
    const second = document.createElement('futatsume-video-item');
    second.dataset.videoId = 'sm100';
    container.append(second);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(observed.has(second)).toBe(true);
    expect(observed.has(first)).toBe(false);
    await inview();
    expect(second.classList.contains('is-fetch-failed')).toBe(true);
    container.append(document.createElement('span'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(observed.size).toBe(0);
    expect(load.mock.calls.map(([id]) => id)).toEqual(['sm9', 'sm100']);
  } finally {
    VideoItemObserver.unobserve({ container });
    container.remove();
    load.mockRestore();
    Object.assign(window, { IntersectionObserver: originalIntersection });
  }
});
