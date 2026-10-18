import { expect, test } from 'bun:test';
import { installLongPressMenu } from '../../src/nico-video-player/long-press-menu';

test('長押しだけでメニューを開き、直後のクリックを再生操作へ渡さない', async () => {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals['MouseEvent'] ??= window.MouseEvent;
  const surface = document.createElement('div');
  document.body.append(surface);
  installLongPressMenu(surface);
  const menus: MouseEvent[] = [];
  let clicks = 0;
  surface.addEventListener('contextmenu', (event) => menus.push(event));
  surface.addEventListener('click', () => clicks++);
  const pointer = (type: string, props: Partial<PointerEvent> = {}): void => {
    const event = new window.Event(type, { bubbles: true });
    for (const [key, value] of Object.entries({
      pointerType: 'touch',
      pointerId: 1,
      isPrimary: true,
      clientX: 20,
      clientY: 30,
      ...props,
    }))
      Object.defineProperty(event, key, { value });
    surface.dispatchEvent(event);
  };
  const click = (): void => {
    surface.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  };
  try {
    pointer('pointerdown');
    await Bun.sleep(650);
    pointer('pointerup');
    expect(menus).toHaveLength(1);
    expect(menus[0]?.clientX).toBe(20);
    expect(menus[0]?.clientY).toBe(30);
    click();
    expect(clicks).toBe(0);
    click();
    expect(clicks).toBe(1);
    for (const end of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      pointer('pointerdown');
      pointer(end);
      await Bun.sleep(650);
    }
    pointer('pointerdown');
    pointer('pointermove', { clientX: 40 });
    await Bun.sleep(650);
    pointer('pointerdown');
    pointer('pointerdown', { pointerId: 2, isPrimary: false });
    await Bun.sleep(650);
    pointer('pointerdown', { pointerType: 'mouse' });
    await Bun.sleep(650);
    expect(menus).toHaveLength(1);
  } finally {
    surface.remove();
  }
}, 10000);
