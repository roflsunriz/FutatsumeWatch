import { MylistApiLoader } from '../packages/lib/src/nico/mylist-api-loader';
import { nicoUtil } from '../packages/lib/src/nico/nico-util';
import { ThumbInfoLoader } from '../packages/lib/src/nico/thumb-info-loader';
import { Config } from './config';

const labels = {
  ja: {
    title: 'マイリストに追加',
    cancel: '閉じる',
    loading: 'マイリストを取得しています…',
    empty: '追加先のマイリストがありません。',
    login: 'ログインしてから再試行してください。',
    failed: 'マイリストの処理に失敗しました。再試行してください。',
    retry: '再取得',
    added: '追加しました',
    adding: '追加しています…',
  },
  en: {
    title: 'Add to mylist',
    cancel: 'Close',
    loading: 'Loading mylists…',
    empty: 'No mylists are available.',
    login: 'Sign in and try again.',
    failed: 'Could not update the mylist. Try again.',
    retry: 'Reload',
    added: 'Added',
    adding: 'Adding…',
  },
};
let active: HTMLDialogElement | null = null;
let generation = 0;
export function closeMylistPicker(): void {
  generation++;
  if (!active) return;
  const dialog = active;
  active = null;
  if (dialog.open) dialog.close();
  dialog.remove();
}
export async function openMylistPicker(watchId: string): Promise<void> {
  closeMylistPicker();
  if (!watchId) return;
  const version = generation;
  const text = labels[navigator.language.startsWith('ja') ? 'ja' : 'en'];
  const dialog = document.createElement('dialog');
  dialog.classList.add('futatsume-family');
  dialog.dataset.mylistPicker = watchId;
  dialog.setAttribute('aria-label', text.title);
  dialog.innerHTML = `<style>
    [data-mylist-picker]{box-sizing:border-box;width:min(440px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;background:#192230;color:#edf2f9;border:1px solid #596b83;border-radius:12px;padding:20px;font:16px sans-serif;}
    [data-mylist-picker]::backdrop{background:#0009;}
    [data-mylist-picker] h2{font-size:20px;margin:0 0 12px;}
    [data-mylist-picker] button{font:inherit;padding:10px;margin:4px 0;border:1px solid #718098;border-radius:6px;background:#293b55;color:inherit;cursor:pointer;}
    [data-mylist-picker] [data-mylist-choices]{display:grid;gap:4px;}
    [data-mylist-picker] [role=status]{white-space:pre-wrap;overflow-wrap:anywhere;}
  </style><h2></h2><p data-mylist-target></p><p role="status" aria-live="polite"></p><div data-mylist-choices></div><button type="button" data-mylist-reload></button><button type="button" data-mylist-close></button>`;
  dialog.querySelector('h2')!.textContent = text.title;
  dialog.querySelector('[data-mylist-target]')!.textContent = watchId;
  const status = dialog.querySelector<HTMLElement>('[role=status]')!;
  const choices = dialog.querySelector<HTMLElement>('[data-mylist-choices]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-mylist-close]')!;
  const reload = dialog.querySelector<HTMLButtonElement>('[data-mylist-reload]')!;
  close.textContent = text.cancel;
  reload.textContent = text.retry;
  close.addEventListener('click', closeMylistPicker);
  dialog.addEventListener('close', () => {
    if (active === dialog) closeMylistPicker();
  });
  (document.fullscreenElement ?? document.body).append(dialog);
  active = dialog;
  dialog.showModal();
  async function load(forceRefresh = false): Promise<void> {
    status.textContent = text.loading;
    reload.disabled = true;
    choices.replaceChildren();
    try {
      if (!nicoUtil.isLogin()) throw Error(text.login);
      const lists = await MylistApiLoader.getMylistList({ forceRefresh });
      if (version !== generation) return;
      if (!lists.length) status.textContent = text.empty;
      else status.textContent = '';
      for (const list of lists) {
        if ((typeof list.id !== 'number' && typeof list.id !== 'string') || typeof list.name !== 'string')
          throw Error(text.failed);
        const button = document.createElement('button');
        const id = String(list.id),
          name = list.name;
        button.type = 'button';
        button.dataset.mylistChoice = id;
        button.textContent = name;
        button.addEventListener('click', () => {
          void add(id, name);
        });
        choices.append(button);
      }
    } catch (error) {
      if (version === generation) status.textContent = error instanceof Error ? error.message : text.failed;
    } finally {
      if (version === generation) reload.disabled = false;
    }
  }
  let pending = false;
  async function add(id: string, name: string): Promise<void> {
    if (pending || version !== generation) return;
    pending = true;
    status.textContent = text.adding;
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-mylist-choice], [data-mylist-reload]'))
      button.disabled = true;
    try {
      let description = '';
      if (Config.getValue('enableAutoMylistComment')) {
        const info = await ThumbInfoLoader.load(watchId);
        if (version !== generation) return;
        if (info.status !== 'ok' || !info.owner) throw new Error(text.failed);
        const originalVideoId = info.originalVideoId ? `元動画: ${info.originalVideoId}` : '';
        description = `投稿者: ${info.owner.name} ${info.owner.linkId} ${originalVideoId}`;
      }
      await MylistApiLoader.addMylistItem(watchId, id, description);
      if (version !== generation) return;
      status.textContent = `${text.added}: ${name}`;
      dialog.dataset.state = 'success';
    } catch (error) {
      if (version !== generation) return;
      status.textContent = error instanceof Error && error.message ? error.message : text.failed;
      dialog.dataset.state = 'error';
      pending = false;
      for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-mylist-choice], [data-mylist-reload]'))
        button.disabled = false;
    }
  }
  reload.addEventListener('click', () => {
    void load(true);
  });
  await load();
}
