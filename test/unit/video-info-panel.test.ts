import { expect, test } from 'bun:test';
import { Config } from '../../src/config/index';
Object.assign(globalThis, { HTMLElement: window.HTMLElement });
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
