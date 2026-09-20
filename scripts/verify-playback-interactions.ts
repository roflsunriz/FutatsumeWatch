import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';

type Check = (id: string, label: string, condition: string, timeout?: number) => Promise<void>;

export async function verifySeekDrag(page: CdpSession, check: Check): Promise<void> {
  const video = `document.querySelector('futatsume-video')`;
  const rectangle = async () =>
    (await evaluate(page, `document.querySelector('.seekRange').getBoundingClientRect().toJSON()`)) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 180 });
  const r = await rectangle();
  const point = { x: r.x + r.width * 0.2, y: r.y + r.height / 2 };
  if (
    !(await evaluate(page, `document.elementFromPoint(${point.x},${point.y})===document.querySelector('.seekRange')`))
  )
    throw Error('P1-09 シーク入力が覆われています');
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  try {
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      button: 'left',
      buttons: 1,
      x: r.x + r.width * 0.7,
      y: point.y,
    });
    await check('P1-09', '押下中のドラッグで実映像を移動', `Math.abs(${video}.currentTime-${video}.duration*.7)<1`);
    // The duration is the UI contract, not an arbitrary wait for initialization.
    await Bun.sleep(3200);
    await check(
      'P1-15',
      'ドラッグを3秒保持しても操作部を表示',
      `document.querySelector('.futatsumePlayerContainer').dataset.controls==='visible'`
    );
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 900,
      height: 650,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const resized = await rectangle();
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      button: 'left',
      buttons: 1,
      x: resized.x - 20,
      y: resized.y + resized.height / 2,
    });
    await check('P1-09', 'リサイズ中の範囲外ドラッグを先頭へ制限', `${video}.currentTime<.5`);
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      button: 'left',
      buttons: 1,
      x: resized.x + resized.width * 0.4,
      y: resized.y + resized.height / 2,
    });
    await check('P1-09', 'リサイズ後の位置を実映像へ反映', `Math.abs(${video}.currentTime-${video}.duration*.4)<1`);
  } finally {
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      x: 450,
      y: 300,
    });
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 300 });
  await check(
    'P1-15',
    'ドラッグ終了後は通常の自動非表示へ戻る',
    `document.querySelector('.futatsumePlayerContainer').dataset.controls==='hidden'`,
    5000
  );
}

/** A browser permission denial is supplied only at the media boundary. */
export async function verifyPlaybackDenial(page: CdpSession, check: Check): Promise<void> {
  const video = `document.querySelector('futatsume-video')`;
  await evaluate(
    page,
    `(()=>{const media=${video}.shadowRoot.querySelector('video');window.__playDenial={play:media.play,media};media.play=()=>Promise.reject(new DOMException('fixture autoplay denied','NotAllowedError'));})()`
  );
  try {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 180 });
    await clickVisible(page, '[data-shell-action="togglePlay"]');
    await check(
      'P1-03',
      '再生拒否後も実映像は停止し再生ボタンを保持',
      `${video}.paused && !document.querySelector('[data-shell-action="togglePlay"]').disabled`
    );
  } finally {
    await evaluate(page, `window.__playDenial.media.play=window.__playDenial.play;delete window.__playDenial;`);
  }
  await clickVisible(page, '[data-shell-action="togglePlay"]');
  const time = Number(await evaluate(page, `${video}.currentTime`));
  await check(
    'P1-03',
    '拒否解除後の実クリックで映像の時間進行を回復',
    `!${video}.paused && ${video}.currentTime>${time + 0.2}`
  );
  await clickVisible(page, '[data-shell-action="togglePlay"]');
  await check('P1-03', '再生拒否検証後の停止状態を復元', `${video}.paused`);
}
