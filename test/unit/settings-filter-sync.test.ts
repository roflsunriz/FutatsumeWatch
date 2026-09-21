import { describe, expect, test } from 'bun:test';
import { Config } from '../../src/config';
import { DataStorage } from '../../packages/lib/src/infra/data-storage';
import { NicoChatFilter } from '../../packages/futatsume/src/commentLayer/nico-chat-filter';
import { NicoChat } from '../../packages/futatsume/src/commentLayer/nico-chat';
import type { NicoVideoPlayerDialog as Dialog } from '../../src/nico-video-player-dialog';
await Config.promise('restore');
Object.assign(globalThis, {
  HTMLCanvasElement: window.HTMLCanvasElement,
  HTMLElement: window.HTMLElement,
  customElements: window.customElements,
});
const { NicoVideoPlayerDialog } = await import('../../src/nico-video-player-dialog');

async function fixture(): Promise<{ config: DataStorage; filter: NicoChatFilter; dialog: Dialog }> {
  const config = DataStorage.create(
    {
      enableFilter: true,
      commandFilter: [],
      userIdFilter: [],
      wordRegFilter: [],
    },
    { readonly: true }
  );
  await config.promise('restore');
  const filter = new NicoChatFilter({});
  const dialog = { _playerConfig: config, _nicoVideoPlayer: { filter }, emit: () => {} } as unknown as Dialog;
  return { config, filter, dialog };
}
describe('設定とNGモデルの更新順序', () => {
  test('遅延した旧モデル通知が新しいフォーム入力を上書きしない', async () => {
    const { config, filter, dialog } = await fixture();
    config.setValue('commandFilter', ['invisible']);
    NicoVideoPlayerDialog.prototype._onCommentFilterChange.call(dialog, filter);
    expect(config.getValue('commandFilter')).toEqual(['invisible']);
    NicoVideoPlayerDialog.prototype._onPlayerConfigUpdate.call(
      dialog,
      'commandFilter',
      config.getValue('commandFilter')
    );
    expect(filter.commandFilterList).toEqual(['invisible']);
  });
  test('メニューからのNG追加は最新の設定へ追加し、無関係なNGを変えない', async () => {
    const { config, filter, dialog } = await fixture();
    config.setValue('wordRegFilter', ['/newer-form-value/i']);
    config.setValue('commandFilter', ['red']);
    NicoVideoPlayerDialog.prototype._onCommand.call(dialog, 'addWordFilter', 'row.menu\nvalue');
    expect(config.getValue('wordRegFilter')).toEqual(['/newer-form-value/i', '/row\\.menu\\nvalue/i']);
    expect(filter.wordRegFilterList).toEqual(['/newer-form-value/i', '/row\\.menu\\nvalue/i']);
    expect(config.getValue('commandFilter')).toEqual(['red']);
  });
  test('改行単位の正規表現を設定から反映し、空に戻せば全コメントを復帰する', async () => {
    const { config, filter, dialog } = await fixture();
    const comments = [NicoChat.create({ text: 'BLOCKED', no: 1 }), NicoChat.create({ text: 'safe', no: 2 })];
    config.setValue('wordRegFilter', ['/blocked/i', '/^another$/']);
    NicoVideoPlayerDialog.prototype._onPlayerConfigUpdate.call(
      dialog,
      'wordRegFilter',
      config.getValue('wordRegFilter')
    );
    expect(filter.applyFilter(comments)).toEqual([comments[1]!]);
    config.setValue('wordRegFilter', []);
    NicoVideoPlayerDialog.prototype._onPlayerConfigUpdate.call(dialog, 'wordRegFilter', []);
    expect(filter.applyFilter(comments)).toEqual(comments);
  });
});
