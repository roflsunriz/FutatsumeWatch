interface DomCreateOptions {
  dataset?: Record<string, string>;
  style?: Record<string, string>;
  [prop: string]: unknown;
}

//===BEGIN===
class domUtil {
  static create(name: string, options: DomCreateOptions = {}): HTMLElement {
    const { dataset, style, ...props } = options;
    const element = Object.assign(document.createElement(name), props || {});
    if (dataset) {
      Object.assign(element.dataset, dataset);
    }
    if (style) {
      Object.assign(element.style, style);
    }
    return element;
  }
  static define(name: string, classDefinition: CustomElementConstructor): boolean {
    if (!self.customElements) {
      return false;
    }
    if (customElements.get(name)) {
      return true;
    }
    customElements.define(name, classDefinition);
    return true;
  }
}
//===END===

export { domUtil };
export type { DomCreateOptions };
