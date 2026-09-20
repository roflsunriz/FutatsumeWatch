import { expect, spyOn, test } from 'bun:test';
import { Config } from '../../src/config';
import { VideoInfoModel } from '../../src/video-info';
import type { RawVideoInfoData } from '../../src/video-info';
import { netUtil } from '../../packages/lib/src/infra/net-util';
import { DataStorage } from '../../packages/lib/src/infra/data-storage';
await Config.promise('restore');
Object.assign(globalThis, { HTMLElement: window.HTMLElement, Element: window.Element });
const { UaaView } = await import('../../src/video-info-panel');
const raw: unknown = await Bun.file(new URL('../fixtures/video-info-raw-data.json', import.meta.url)).json();

test('提供者表示はON時だけ取得し、OFF・終了後の遅い応答で表示を復活させない', async () => {
  const original = Config.getValue('uaa.enable');
  const jobs: Array<() => void> = [];
  const timer = spyOn(window, 'setTimeout').mockImplementation(((fn: TimerHandler) => {
    if (typeof fn !== 'function') throw Error('予期しない文字列タイマー');
    jobs.push(fn as () => void);
    return jobs.length;
  }) as typeof window.setTimeout);
  let respond!: (response: Response) => void;
  let requests = 0;
  const fetch = spyOn(netUtil, 'fetch').mockImplementation(() => {
    requests++;
    return new Promise<Response>((resolve) => {
      respond = resolve;
    });
  });
  const container = document.createElement('div');
  document.body.append(container);
  let view: InstanceType<typeof UaaView> | undefined;
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  try {
    view = new UaaView({ parentNode: container });
    const info = new VideoInfoModel(raw as RawVideoInfoData) as Parameters<typeof view.update>[0];
    Config.setValue('uaa.enable', false);
    view.update(info);
    expect(jobs).toHaveLength(0);
    Config.setValue('uaa.enable', true);
    view.update(info);
    expect(jobs).toHaveLength(1);
    jobs.shift()!();
    expect(requests).toBe(1);
    respond(
      new Response(
        JSON.stringify({ data: { sponsors: [{ advertiserName: '検証提供者', message: '検証', auxiliary: {} }] } })
      )
    );
    await flush();
    expect(view._elm.body!.textContent).toContain('検証提供者');
    expect(view._state.isExist).toBe(true);
    view.clear();
    view.update(info);
    jobs.shift()!();
    Config.setValue('uaa.enable', false);
    view.clear();
    respond(
      new Response(
        JSON.stringify({ data: { sponsors: [{ advertiserName: '古い提供者', message: '遅延', auxiliary: {} }] } })
      )
    );
    await flush();
    expect(view._elm.body!.textContent).toBe('');
    expect(view._state.isExist).toBe(false);
  } finally {
    if (view) {
      DataStorage.prototype.offkey.call(Config, 'uaa.enable', view.onEnabledChange);
      view.clear();
    }
    Config.setValue('uaa.enable', original);
    timer.mockRestore();
    fetch.mockRestore();
    container.remove();
  }
});
