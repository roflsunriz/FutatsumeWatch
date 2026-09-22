import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { closeMylistPicker, openMylistPicker } from '../../src/mylist-picker';
import { MylistApiLoader } from '../../packages/lib/src/nico/mylist-api-loader';
import { nicoUtil } from '../../packages/lib/src/nico/nico-util';
const prototype = window.HTMLDialogElement.prototype;
const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close');
let login: ReturnType<typeof spyOn<typeof nicoUtil, 'isLogin'>>;
let lists: ReturnType<typeof spyOn<typeof MylistApiLoader, 'getMylistList'>>;
let add: ReturnType<typeof spyOn<typeof MylistApiLoader, 'addMylistItem'>>;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  Object.defineProperties(prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
        this.dispatchEvent(new window.Event('close'));
      },
    },
  });
  login = spyOn(nicoUtil, 'isLogin').mockReturnValue(true);
  lists = spyOn(MylistApiLoader, 'getMylistList').mockResolvedValue([{ id: 42, name: '追加先' }]);
  add = spyOn(MylistApiLoader, 'addMylistItem');
});
afterEach(() => {
  closeMylistPicker();
  login.mockRestore();
  lists.mockRestore();
  add.mockRestore();
  if (originalShow) Object.defineProperty(prototype, 'showModal', originalShow);
  else Reflect.deleteProperty(prototype, 'showModal');
  if (originalClose) Object.defineProperty(prototype, 'close', originalClose);
  else Reflect.deleteProperty(prototype, 'close');
});
const choice = () => document.querySelector<HTMLButtonElement>('[data-mylist-choice="42"]')!;
test('P3-04 マイリストの対象動画と追加先を保持し、送信中の連打を防ぐ', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof MylistApiLoader.addMylistItem>>) => void;
  add.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  await openMylistPicker('sm100');
  choice().click();
  choice().click();
  expect(add).toHaveBeenCalledTimes(1);
  expect(add).toHaveBeenCalledWith('sm100', '42', '');
  expect(choice().disabled).toBe(true);
  resolve({ status: 'ok', result: { meta: { status: 200 }, data: {} }, message: '追加' });
  await flush();
  expect(document.querySelector<HTMLElement>('[data-mylist-picker]')!.dataset.state).toBe('success');
  document.querySelector<HTMLButtonElement>('[data-mylist-close]')!.click();
  expect(document.querySelector('[data-mylist-picker]')).toBeNull();
});
test('P3-04 拒否で理由を表示して再送を許し、閉じた後の結果で別動画を更新しない', async () => {
  add.mockRejectedValueOnce(new Error('拒否されました'));
  await openMylistPicker('sm9');
  choice().click();
  await flush();
  expect(choice().disabled).toBe(false);
  expect(document.querySelector('[data-mylist-picker] [role=status]')!.textContent).toBe('拒否されました');
  let resolve!: (value: Awaited<ReturnType<typeof MylistApiLoader.addMylistItem>>) => void;
  add.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  choice().click();
  await openMylistPicker('sm100');
  resolve({ status: 'ok', result: { meta: { status: 200 }, data: {} }, message: '追加' });
  await flush();
  expect(document.querySelector<HTMLElement>('[data-mylist-picker]')!.dataset.mylistPicker).toBe('sm100');
  expect(document.querySelector<HTMLElement>('[data-mylist-picker]')!.dataset.state).toBeUndefined();
});
test('P3-04 未ログインでは一覧も書込も要求しない', async () => {
  login.mockReturnValue(false);
  await openMylistPicker('sm9');
  expect(lists).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
  expect(document.querySelectorAll('[data-mylist-choice]')).toHaveLength(0);
});
test('P3-04 空一覧から再取得するとキャッシュを使わず新しい追加先を表示する', async () => {
  lists.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 43, name: '新規追加先' }]);
  await openMylistPicker('sm9');
  expect(document.querySelectorAll('[data-mylist-choice]')).toHaveLength(0);
  document.querySelector<HTMLButtonElement>('[data-mylist-reload]')!.click();
  await flush();
  expect(lists).toHaveBeenLastCalledWith({ forceRefresh: true });
  expect(document.querySelector('[data-mylist-choice="43"]')!.textContent).toBe('新規追加先');
});
