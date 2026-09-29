import { MylistManagementApi } from '../shared/external-api';
import type { ManagedMylist, ManagedMylistItem, MylistFields } from '../shared/external-api';

const ja = {
  title: 'マイリスト追加・編集',
  close: '閉じる',
  refresh: '再取得',
  watchLater: 'とりあえずマイリスト',
  addWatchLater: 'とりマイに追加',
  create: '新しいマイリストを作成',
  name: '名前',
  description: '説明',
  public: '公開',
  save: '変更を保存',
  remove: 'マイリストを削除',
  add: 'この動画を追加',
  items: '登録動画',
  memo: '動画のメモ・コメント',
  saveMemo: 'メモを保存',
  removeItem: '動画を削除',
  confirmRemove: 'このマイリストを削除しますか？',
  confirmRemoveItem: 'この動画をマイリストから削除しますか？',
  loading: '読み込み中…',
  noLists: 'マイリストがありません。新規作成できます。',
  noItems: '登録動画がありません。',
  created: '作成しました',
  saved: '保存しました',
  added: '追加しました',
  removed: '削除しました',
  existing: '登録済みです',
  login: 'ログインしてから再試行してください。',
};
const en: typeof ja = {
  title: 'Add to and edit mylists',
  close: 'Close',
  refresh: 'Reload',
  watchLater: 'Watch later',
  addWatchLater: 'Add to watch later',
  create: 'Create a mylist',
  name: 'Name',
  description: 'Description',
  public: 'Public',
  save: 'Save changes',
  remove: 'Delete mylist',
  add: 'Add this video',
  items: 'Videos',
  memo: 'Video memo or comment',
  saveMemo: 'Save memo',
  removeItem: 'Remove video',
  confirmRemove: 'Delete this mylist?',
  confirmRemoveItem: 'Remove this video from the mylist?',
  loading: 'Loading…',
  noLists: 'No mylists yet. You can create one.',
  noItems: 'No videos yet.',
  created: 'Created',
  saved: 'Saved',
  added: 'Added',
  removed: 'Removed',
  existing: 'Already added',
  login: 'Sign in and try again.',
};

let active: HTMLDialogElement | null = null;
let generation = 0;

export function closeMylistManager(): void {
  generation++;
  const dialog = active;
  active = null;
  if (!dialog) return;
  if (dialog.open) dialog.close();
  dialog.remove();
}

export async function openMylistManager(watchId: string): Promise<void> {
  closeMylistManager();
  if (!/^(?:sm|nm|so|[a-z]{2})\d+$/.test(watchId)) return;
  const version = generation;
  const text = navigator.language.startsWith('ja') ? ja : en;
  const dialog = document.createElement('dialog');
  dialog.className = 'futatsume-family fw-mylist-manager';
  dialog.dataset.mylistManager = watchId;
  dialog.setAttribute('aria-label', text.title);
  dialog.innerHTML = `<style>
    .fw-mylist-manager{box-sizing:border-box;width:min(820px,calc(100vw - 20px));max-height:calc(100dvh - 20px);overflow:auto;background:#192230;color:#edf2f9;border:1px solid #596b83;border-radius:12px;padding:18px;font:15px sans-serif;}
    .fw-mylist-manager::backdrop{background:#000a;}
    .fw-mylist-manager h2{font-size:20px;margin:0 0 8px;}
    .fw-mylist-manager h3{font-size:17px;margin:16px 0 8px;}
    .fw-mylist-manager button,.fw-mylist-manager input,.fw-mylist-manager textarea{font:inherit;}
    .fw-mylist-manager button{padding:7px 10px;margin:3px;border:1px solid #718098;border-radius:5px;background:#293b55;color:inherit;cursor:pointer;}
    .fw-mylist-manager button:hover{background:#385777;}
    .fw-mylist-manager button:disabled{opacity:.55;cursor:wait;}
    .fw-mylist-manager label{display:grid;gap:4px;margin:8px 0;}
    .fw-mylist-manager label:has([type=checkbox]){display:flex;align-items:center;}
    .fw-mylist-manager input[type=text],.fw-mylist-manager textarea{box-sizing:border-box;width:100%;padding:7px;border:1px solid #718098;border-radius:5px;background:#101925;color:inherit;}
    .fw-mylist-manager textarea{min-height:64px;resize:vertical;}
    .fw-mylist-manager [data-layout]{display:grid;grid-template-columns:minmax(160px,210px) minmax(0,1fr);gap:16px;}
    .fw-mylist-manager [data-lists]{display:grid;align-content:start;gap:4px;max-height:65dvh;overflow:auto;}
    .fw-mylist-manager [data-lists] button{text-align:left;overflow-wrap:anywhere;}
    .fw-mylist-manager [data-lists] button[aria-current=true]{background:#42677d;}
    .fw-mylist-manager [data-items]{display:grid;gap:8px;max-height:32dvh;overflow:auto;}
    .fw-mylist-manager [data-item]{border:1px solid #596b83;border-radius:7px;padding:8px;overflow-wrap:anywhere;}
    .fw-mylist-manager [role=status]{min-height:1.5em;white-space:pre-wrap;overflow-wrap:anywhere;}
    @media(max-width:560px){.fw-mylist-manager [data-layout]{grid-template-columns:1fr;}.fw-mylist-manager [data-lists]{max-height:18dvh;}}
  </style>
  <h2></h2><div data-watch-id></div><p role="status" aria-live="polite"></p>
  <button type="button" data-refresh></button><button type="button" data-add-watch-later></button><button type="button" data-close></button>
  <div data-layout><nav data-lists aria-label="Mylists"></nav><main data-detail></main></div>`;
  const find = <T extends Element>(selector: string): T => dialog.querySelector<T>(selector)!;
  find('h2').textContent = text.title;
  find('[data-watch-id]').textContent = watchId;
  find('[data-refresh]').textContent = text.refresh;
  find('[data-add-watch-later]').textContent = text.addWatchLater;
  find('[data-close]').textContent = text.close;
  const status = find<HTMLElement>('[role=status]');
  const listsView = find<HTMLElement>('[data-lists]');
  const detail = find<HTMLElement>('[data-detail]');
  let lists: ManagedMylist[] = [];
  let selected = '';
  let busy = false;
  const alive = (): boolean => active === dialog && version === generation;
  const message = (value: string, error = false): void => {
    status.textContent = value;
    status.dataset.state = error ? 'error' : 'ok';
  };
  const perform = async (action: () => Promise<void>): Promise<void> => {
    if (busy || !alive()) return;
    busy = true;
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('button')) button.disabled = true;
    try {
      await action();
    } catch (error) {
      if (alive()) message(error instanceof Error ? error.message : text.login, true);
    } finally {
      busy = false;
      if (alive()) for (const button of dialog.querySelectorAll<HTMLButtonElement>('button')) button.disabled = false;
    }
  };
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.addEventListener('click', action);
    return element;
  };
  const field = (
    label: string,
    value: string,
    key: string,
    multiline = false
  ): HTMLInputElement | HTMLTextAreaElement => {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const control = multiline ? document.createElement('textarea') : document.createElement('input');
    if (control instanceof HTMLInputElement) control.type = 'text';
    control.dataset.mylistField = key;
    control.value = value;
    wrapper.append(control);
    detail.append(wrapper);
    return control;
  };
  const loadLists = async (next = selected): Promise<void> => {
    message(text.loading);
    lists = await MylistManagementApi.list();
    if (!alive()) return;
    selected = next && lists.some((item) => item.id === next) ? next : '';
    renderLists();
    await renderDetail();
    message(lists.length ? '' : text.noLists);
  };
  const renderLists = (): void => {
    listsView.replaceChildren();
    const watchLaterButton = button(text.watchLater, () => {
      selected = 'watch-later';
      renderLists();
      void renderDetail();
    });
    watchLaterButton.dataset.watchLater = '';
    watchLaterButton.setAttribute('aria-current', String(selected === 'watch-later'));
    listsView.append(watchLaterButton);
    for (const list of lists) {
      const entry = button(list.name, () => {
        selected = list.id;
        renderLists();
        void renderDetail();
      });
      entry.dataset.mylistId = list.id;
      entry.setAttribute('aria-current', String(selected === list.id));
      listsView.append(entry);
    }
    const createButton = button(text.create, () => {
      selected = '';
      renderLists();
      void renderDetail();
    });
    createButton.dataset.createMylist = '';
    listsView.append(createButton);
  };
  const renderItems = (items: ManagedMylistItem[], listId: string): void => {
    const heading = document.createElement('h3');
    heading.textContent = text.items;
    detail.append(heading);
    const view = document.createElement('div');
    view.dataset.items = '';
    detail.append(view);
    if (!items.length) {
      view.textContent = text.noItems;
      return;
    }
    for (const item of items) {
      const row = document.createElement('div');
      row.dataset.item = item.itemId;
      const title = document.createElement('div');
      title.textContent = `${item.title} (${item.watchId})`;
      row.append(title);
      const memoLabel = document.createElement('label');
      memoLabel.textContent = text.memo;
      const memo = document.createElement('textarea');
      memo.dataset.mylistField = 'memo';
      memo.value = item.description;
      memoLabel.append(memo);
      row.append(memoLabel);
      row.append(
        button(
          text.saveMemo,
          () =>
            void perform(async () => {
              if (listId === 'watch-later') await MylistManagementApi.updateWatchLater(item.itemId, memo.value);
              else await MylistManagementApi.updateItem(listId, item.itemId, memo.value);
              if (alive()) message(text.saved);
            })
        )
      );
      row.lastElementChild?.setAttribute('data-mylist-action', 'save-memo');
      row.append(
        button(
          text.removeItem,
          () =>
            void perform(async () => {
              if (!window.confirm(text.confirmRemoveItem)) return;
              if (listId === 'watch-later') await MylistManagementApi.removeWatchLater(item.itemId);
              else await MylistManagementApi.removeItem(listId, item.itemId);
              if (alive()) {
                message(text.removed);
                await renderDetail();
              }
            })
        )
      );
      row.lastElementChild?.setAttribute('data-mylist-action', 'remove-item');
      view.append(row);
    }
  };
  const renderDetail = async (): Promise<void> => {
    detail.replaceChildren();
    const list = lists.find((entry) => entry.id === selected);
    if (selected === 'watch-later') {
      const heading = document.createElement('h3');
      heading.textContent = text.watchLater;
      detail.append(heading);
      try {
        const items = await MylistManagementApi.watchLaterItems();
        if (alive() && selected === 'watch-later') renderItems(items, 'watch-later');
      } catch (error) {
        if (alive()) message(error instanceof Error ? error.message : text.login, true);
      }
      return;
    }
    const heading = document.createElement('h3');
    heading.textContent = list?.name ?? text.create;
    detail.append(heading);
    const name = field(text.name, list?.name ?? '', 'name');
    const description = field(text.description, list?.description ?? '', 'description', true);
    const publicLabel = document.createElement('label');
    publicLabel.textContent = text.public;
    const isPublic = document.createElement('input');
    isPublic.type = 'checkbox';
    isPublic.dataset.mylistField = 'public';
    isPublic.checked = list?.isPublic ?? false;
    publicLabel.append(isPublic);
    detail.append(publicLabel);
    const fields = (): MylistFields => ({
      name: name.value,
      description: description.value,
      isPublic: isPublic.checked,
      defaultSortKey: list?.defaultSortKey ?? 'addedAt',
      defaultSortOrder: list?.defaultSortOrder ?? 'desc',
    });
    detail.append(
      button(
        list ? text.save : text.create,
        () =>
          void perform(async () => {
            const updated = list
              ? await MylistManagementApi.update(list.id, fields())
              : await MylistManagementApi.create(fields());
            if (alive()) {
              await loadLists(updated.id);
              message(list ? text.saved : text.created);
            }
          })
      )
    );
    detail.lastElementChild?.setAttribute('data-mylist-action', list ? 'save' : 'create');
    if (!list) return;
    detail.append(
      button(
        text.remove,
        () =>
          void perform(async () => {
            if (!window.confirm(text.confirmRemove)) return;
            await MylistManagementApi.remove(list.id);
            if (alive()) {
              await loadLists('');
              message(text.removed);
            }
          })
      )
    );
    detail.lastElementChild?.setAttribute('data-mylist-action', 'remove');
    detail.append(
      button(
        text.add,
        () =>
          void perform(async () => {
            const result = await MylistManagementApi.addItem(list.id, watchId, '');
            if (alive()) {
              message(result === 200 ? text.existing : text.added);
              await renderDetail();
            }
          })
      )
    );
    detail.lastElementChild?.setAttribute('data-mylist-action', 'add');
    try {
      const items = await MylistManagementApi.items(list.id);
      if (alive() && selected === list.id) renderItems(items, list.id);
    } catch (error) {
      if (alive()) message(error instanceof Error ? error.message : text.login, true);
    }
  };
  find('[data-refresh]').addEventListener('click', () => void perform(() => loadLists()));
  find('[data-add-watch-later]').addEventListener(
    'click',
    () =>
      void perform(async () => {
        const result = await MylistManagementApi.addWatchLater(watchId, '');
        if (alive()) {
          message(result === 200 ? text.existing : text.added);
          if (selected === 'watch-later') await renderDetail();
        }
      })
  );
  find('[data-close]').addEventListener('click', closeMylistManager);
  dialog.addEventListener('close', () => {
    if (active === dialog) closeMylistManager();
  });
  (document.fullscreenElement ?? document.body).append(dialog);
  active = dialog;
  dialog.showModal();
  await perform(() => loadLists());
}
