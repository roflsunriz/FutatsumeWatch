import { MylistManagementApi } from '../shared/external-api';
import type { ManagedMylist, ManagedMylistItem, MylistFields } from '../shared/external-api';
import { MYLIST_MANAGER_STYLE } from './mylist-manager-style';

const ja = {
  title: 'マイリスト',
  target: '追加する動画',
  destinations: '保存先',
  listSettings: 'マイリスト設定',
  close: '閉じる',
  refresh: '再取得',
  watchLater: 'とりあえずマイリスト',
  addWatchLater: 'とりマイに追加',
  create: '新しいマイリスト',
  new: '新規作成',
  createAction: '作成する',
  name: '名前',
  description: '説明',
  public: '公開',
  private: '非公開',
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
  title: 'Mylists',
  target: 'Video to add',
  destinations: 'Destinations',
  listSettings: 'Mylist settings',
  close: 'Close',
  refresh: 'Reload',
  watchLater: 'Watch later',
  addWatchLater: 'Add to watch later',
  create: 'New mylist',
  new: 'Create new',
  createAction: 'Create',
  name: 'Name',
  description: 'Description',
  public: 'Public',
  private: 'Private',
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
  dialog.innerHTML = `<style>${MYLIST_MANAGER_STYLE}</style>
    <article class="fw-mylist-card">
      <header class="fw-mylist-header">
        <div><h2></h2><p class="fw-mylist-target" data-watch-id></p></div>
        <button type="button" class="fw-mylist-icon-button" data-close>×</button>
      </header>
      <p role="status" aria-live="polite"></p>
      <div data-layout>
        <aside class="fw-mylist-sidebar">
          <div class="fw-mylist-sidebar-header"><span data-destinations></span>
            <button type="button" class="fw-mylist-icon-button" data-refresh>↻</button></div>
          <nav data-lists></nav>
          <button type="button" data-create-mylist></button>
        </aside>
        <main data-detail></main>
      </div>
    </article>`;
  const find = <T extends Element>(selector: string): T => dialog.querySelector<T>(selector)!;
  find('h2').textContent = text.title;
  find('[data-watch-id]').textContent = `${text.target}: ${watchId}`;
  find('[data-destinations]').textContent = text.destinations;
  find('[data-refresh]').setAttribute('aria-label', text.refresh);
  find('[data-refresh]').setAttribute('title', text.refresh);
  find('[data-close]').setAttribute('aria-label', text.close);
  find('[data-close]').setAttribute('title', text.close);
  find('[data-create-mylist]').textContent = `＋ ${text.new}`;
  const status = find<HTMLElement>('[role=status]');
  const listsView = find<HTMLElement>('[data-lists]');
  listsView.setAttribute('aria-label', text.destinations);
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
    selected =
      next === 'watch-later' || lists.some((item) => item.id === next) ? next : (lists[0]?.id ?? 'watch-later');
    renderLists();
    message(lists.length ? '' : text.noLists);
    await renderDetail();
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
    find('[data-create-mylist]').setAttribute('aria-current', String(selected === ''));
  };
  const renderItems = (items: ManagedMylistItem[], listId: string): void => {
    const heading = document.createElement('h4');
    heading.className = 'fw-mylist-section-heading';
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
    const headingRow = document.createElement('div');
    headingRow.className = 'fw-mylist-detail-head';
    const headingLabel = document.createElement('div');
    const eyebrow = document.createElement('small');
    eyebrow.textContent = list ? (list.isPublic ? text.public : text.private) : text.destinations;
    const heading = document.createElement('h3');
    heading.textContent = selected === 'watch-later' ? text.watchLater : (list?.name ?? text.create);
    headingLabel.append(eyebrow, heading);
    headingRow.append(headingLabel);
    detail.append(headingRow);
    if (selected === 'watch-later') {
      const addWatchLater = button(
        text.addWatchLater,
        () =>
          void perform(async () => {
            const result = await MylistManagementApi.addWatchLater(watchId, '');
            if (alive()) {
              message(result === 200 ? text.existing : text.added);
              await renderDetail();
            }
          })
      );
      addWatchLater.dataset.addWatchLater = '';
      headingRow.append(addWatchLater);
      try {
        const items = await MylistManagementApi.watchLaterItems();
        if (alive() && selected === 'watch-later') renderItems(items, 'watch-later');
      } catch (error) {
        if (alive()) message(error instanceof Error ? error.message : text.login, true);
      }
      return;
    }
    if (list) {
      const addButton = button(
        text.add,
        () =>
          void perform(async () => {
            const result = await MylistManagementApi.addItem(list.id, watchId, '');
            if (alive()) {
              message(result === 200 ? text.existing : text.added);
              await renderDetail();
            }
          })
      );
      addButton.dataset.mylistAction = 'add';
      headingRow.append(addButton);
    }
    const sectionHeading = document.createElement('h4');
    sectionHeading.className = 'fw-mylist-section-heading';
    sectionHeading.textContent = text.listSettings;
    detail.append(sectionHeading);
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
    const formActions = document.createElement('div');
    formActions.className = 'fw-mylist-form-actions';
    formActions.append(
      button(
        list ? text.save : text.createAction,
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
    formActions.lastElementChild?.setAttribute('data-mylist-action', list ? 'save' : 'create');
    detail.append(formActions);
    if (!list) return;
    try {
      const items = await MylistManagementApi.items(list.id);
      if (alive() && selected === list.id) renderItems(items, list.id);
    } catch (error) {
      if (alive()) message(error instanceof Error ? error.message : text.login, true);
    }
    const danger = document.createElement('div');
    danger.className = 'fw-mylist-danger';
    danger.append(
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
    danger.lastElementChild?.setAttribute('data-mylist-action', 'remove');
    detail.append(danger);
  };
  find('[data-refresh]').addEventListener('click', () => void perform(() => loadLists()));
  find('[data-create-mylist]').addEventListener('click', () => {
    selected = '';
    renderLists();
    void renderDetail();
  });
  find('[data-close]').addEventListener('click', closeMylistManager);
  let outsidePress = false;
  let outsideRelease = false;
  dialog.addEventListener(
    'pointerdown',
    (event) => {
      outsidePress = event.target === dialog;
      outsideRelease = false;
    },
    true
  );
  dialog.addEventListener(
    'pointerup',
    (event) => {
      outsideRelease = event.target === dialog;
    },
    true
  );
  dialog.addEventListener('pointercancel', () => {
    outsidePress = false;
    outsideRelease = false;
  });
  dialog.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.target === dialog && outsidePress && outsideRelease) closeMylistManager();
    outsidePress = false;
    outsideRelease = false;
  });
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeMylistManager();
  });
  dialog.addEventListener('close', () => {
    if (active === dialog) closeMylistManager();
  });
  (document.fullscreenElement ?? document.body).append(dialog);
  active = dialog;
  dialog.showModal();
  await perform(() => loadLists());
}
