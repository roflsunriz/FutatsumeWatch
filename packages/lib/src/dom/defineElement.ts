//===BEGIN===

const defineElement = (name: string, classDefinition: CustomElementConstructor): boolean => {
  if (!window.customElements) {
    return false;
  }
  if (customElements.get(name)) {
    return true;
  }
  customElements.define(name, classDefinition);
  return true;
};

//===END===

export { defineElement };
