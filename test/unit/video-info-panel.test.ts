import { expect, test } from 'bun:test';
import { Config } from '../../src/config';
Object.assign(globalThis, { HTMLElement: window.HTMLElement });
await Config.promise('restore');
const { VideoInfoPanel, VideoHeaderPanel } = await import('../../src/video-info-panel');

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
