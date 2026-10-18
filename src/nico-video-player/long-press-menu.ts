/** タップ・ドラッグ・複数指と区別して、既存のcontextmenu経路へ渡す。 */
export function installLongPressMenu(surface: HTMLElement): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { id: number; x: number; y: number } | undefined;
  let suppressClickUntil = 0;
  let longPressed = false;
  const cancel = (): void => {
    clearTimeout(timer);
    start = undefined;
  };
  surface.addEventListener('pointerdown', (event) => {
    cancel();
    longPressed = false;
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      if (!start || !surface.isConnected) return;
      suppressClickUntil = Date.now() + 1500;
      longPressed = true;
      surface.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: start.x,
          clientY: start.y,
        })
      );
      start = undefined;
    }, 600);
  });
  surface.addEventListener('pointermove', (event) => {
    if (start && (event.pointerId !== start.id || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10))
      cancel();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    surface.addEventListener(name, () => {
      if (longPressed) suppressClickUntil = Date.now() + 1500;
      longPressed = false;
      cancel();
    });
  surface.addEventListener(
    'click',
    (event) => {
      if (Date.now() > suppressClickUntil) return;
      suppressClickUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );
}
