import { global } from '../../../../src/futatsume-watch-index';

//===BEGIN===
const domEvent = {
  dispatchCustomEvent(elm: Element, name: string, detail: unknown = {}, options: CustomEventInit = {}): void {
    const ev = new CustomEvent(name, Object.assign({ detail }, options));
    elm.dispatchEvent(ev);
  },
  dispatchCommand(element: Element, command: string, param: unknown, originalEvent: Event | null = null): boolean {
    return element.dispatchEvent(
      new CustomEvent('command', { detail: { command, param, originalEvent }, bubbles: true, composed: true })
    );
  },
  bindCommandDispatcher(element: Element, command: string): void {
    element.addEventListener(command, (e) => {
      const target = (e.target as Element).closest('[data-command]');
      if (!target) {
        (global as { emitter: { emitAsync: (...args: unknown[]) => unknown } }).emitter.emitAsync('hideHover');
        return;
      }
      const [cmd, param, type] = (target as HTMLElement).dataset as unknown as [string, string, string];
      let parsedParam: unknown = param;
      if (['number', 'boolean', 'json'].includes(type)) {
        parsedParam = JSON.parse(param);
      }
      e.preventDefault();
      return this.dispatchCommand(element, cmd, parsedParam, e);
    });
  },
};

//===END===

export { domEvent };
