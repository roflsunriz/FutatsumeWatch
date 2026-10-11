import { expect, test } from 'bun:test';
import { Config } from '../../src/config/index';
Object.assign(globalThis, {
  HTMLElement: window.HTMLElement,
  HTMLCollection: window.HTMLCollection,
  NodeList: window.NodeList,
  Node: window.Node,
  Document: window.Document,
});
await Config.promise('restore');
const { VideoInfoPanel, VideoHeaderPanel, VideoSearchForm, RelatedInfoMenu, VideoMetaInfo } =
  await import('../../src/video-info-panel/index');

test('P3-03 投稿者・説明・シリーズ・関連動画を保ち、タグは詳細だけに表示する', () => {
  const template = document.createElement('template');
  template.innerHTML = VideoInfoPanel.__tpl__;
  for (const selector of [
    '.ownerPageLink',
    '.ownerIcon',
    '[data-command="ownerVideo"]',
    '.videoDescription',
    '.seriesList',
    '.videoTagsContainer',
    '.relatedVideoContainer',
  ]) {
    expect(template.content.querySelector(selector)).not.toBeNull();
  }
  expect(template.content.querySelector('[class*="ichiba"], [class*="Ichiba"]')).toBeNull();
  expect(template.content.textContent).not.toContain('ニコニコ市場');
  template.innerHTML = VideoHeaderPanel.__tpl__;
  expect(template.content.querySelector('.videoTagsContainer')).toBeNull();
});

test('動画情報パネルの公開クラスと検索フォーム操作を維持する', () => {
  expect(VideoInfoPanel).toBeFunction();
  expect(VideoHeaderPanel).toBeFunction();
  expect(RelatedInfoMenu).toBeFunction();
  expect(VideoMetaInfo).toBeFunction();

  const host = document.createElement('div');
  host.innerHTML = VideoSearchForm.__tpl__;
  const input = host.querySelector<HTMLInputElement>('.searchWordInput')!;
  const clear = host.querySelector<HTMLButtonElement>('[data-command="clear"]')!;
  expect(input).not.toBeNull();
  expect(host.querySelector('.searchSortSelect')).not.toBeNull();
  input.value = 'sm9';

  clear.addEventListener('click', (event) => VideoSearchForm.prototype._onClick.call({ _word: input }, event));
  clear.click();
  expect(input.value).toBe('');
});

test('説明文の動画リンクをURLのIDでカード化し、既存リンクの操作と本文を保つ', async () => {
  const host = document.createElement('div');
  const context = Object.assign(Object.create(VideoInfoPanel.prototype) as InstanceType<typeof VideoInfoPanel>, {
    _description: host,
  });
  await context._updateVideoDescription(`
    前の動画 <a class="watch" href="https://www.nicovideo.jp/watch/sm2057168?from=description">sm2057168</a>
    次の動画 <a href="/watch/sm100">任意のタイトル</a>
    <a class="watch" href="https://www.nicovideo.jp/shorts/ss123">短い動画</a>
    <a class="watch" href="https://example.com/watch/sm9">sm9</a>
    <a class="seekTime" data-seektime="0:10">0:10</a>
    <a href="https://www.nicovideo.jp/mylist/42">mylist/42</a>
    <a href="https://www.nicovideo.jp/series/575910">series/575910</a>
    <a href="https://youtu.be/example">YouTube</a>
    <a href="https://example.com/">外部サイト</a>
  `);
  expect([...host.querySelectorAll<HTMLElement>('futatsume-video-item')].map((item) => item.dataset.watchId)).toEqual([
    'sm2057168',
    'sm100',
    'ss123',
  ]);
  const videoLink = host.querySelector<HTMLAnchorElement>('a[href*="sm2057168"]')!;
  expect(videoLink.textContent).toBe('sm2057168');
  expect(videoLink.dataset.command).toBe('open');
  expect(videoLink.dataset.param).toBe('sm2057168');
  expect(videoLink.search).toBe('?from=description');
  const modifiedClick = new window.MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true });
  videoLink.addEventListener('click', (event) => context._onClick(event));
  videoLink.dispatchEvent(modifiedClick);
  expect(modifiedClick.defaultPrevented).toBe(false);
  expect(host.querySelector('[data-command="seek"]')?.getAttribute('data-param')).toBe('10');
  expect(host.querySelector('[data-command="playlistSetMylist"]')?.getAttribute('data-param')).toBe('42');
  expect(host.querySelector('[data-command="playlistSetSeries"]')?.getAttribute('data-param')).toBe('575910');
  expect(host.querySelector('[data-command="setVideo"]')?.getAttribute('data-param')).toBe('https://youtu.be/example');
  expect(host.querySelector('a[href="https://example.com/"]')?.textContent).toBe('外部サイト');
  expect(host.querySelector('a[href="https://example.com/watch/sm9"]')?.hasAttribute('data-command')).toBe(false);
});
