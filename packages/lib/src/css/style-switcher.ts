interface StyleSwitchOptions {
  on?: string;
  off?: string;
  document?: Document;
}

//===BEGIN===
class StyleSwitcher {
  static update({ on, off, document = window.document }: StyleSwitchOptions): void {
    if (on) {
      Array.from(document.head.querySelectorAll<HTMLStyleElement>(on)).forEach((s) => {
        s.disabled = false;
        s.dataset.switch = 'on';
      });
    }
    if (off) {
      Array.from(document.head.querySelectorAll<HTMLStyleElement>(off)).forEach((s) => {
        s.disabled = true;
        s.dataset.switch = 'off';
      });
    }
  }

  static addClass(selector: string, ...classNames: string[]): void {
    classNames.forEach((name) => {
      Array.from(document.head.querySelectorAll<HTMLStyleElement>(`${selector}.${name}`)).forEach((s) => {
        s.disabled = false;
        s.dataset.switch = 'on';
      });
    });
  }

  static removeClass(selector: string, ...classNames: string[]): void {
    classNames.forEach((name) => {
      Array.from(document.head.querySelectorAll<HTMLStyleElement>(`${selector}.${name}`)).forEach((s) => {
        s.disabled = true;
        s.dataset.switch = 'off';
      });
    });
  }

  static toggleClass(selector: string, className: string, v?: boolean): void {
    Array.from(document.head.querySelectorAll<HTMLStyleElement>(`${selector}.${className}`)).forEach((s) => {
      s.disabled = v === undefined ? !s.disabled : !v;
      s.dataset.switch = s.disabled ? 'off' : 'on';
    });
  }
}

//===END===

export { StyleSwitcher };
