interface ClassListCache {
  map: WeakMap<Element, DOMTokenList>;
}

//===BEGIN===
const ClassList = function (this: ClassListCache, element: Element): DOMTokenList {
  if (this.map.has(element)) {
    // self.console.log('ClassListhas cache', element);
    return this.map.get(element) as DOMTokenList;
  }
  const m = element.classList;
  this.map.set(element, m);
  return m;
}.bind({ map: new WeakMap<Element, DOMTokenList>() });

//===END===
export { ClassList };
export type { ClassListCache };
