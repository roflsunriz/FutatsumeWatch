type RegResult = RegExpExecArray | null;

interface RegEntry {
  str?: unknown;
  regstr?: string;
  result: RegResult;
}

interface RegScopeState {
  results: RegEntry[];
  last: RegEntry;
}

interface RegExecObject {
  exec: (str: string) => RegResult;
  test: (str: string) => boolean;
}

//===BEGIN===
const reg = (() => {
  const $ = Symbol('$');
  const undef = Symbol.for('undefined');
  const MAX_RESULT = 30;
  const smap: WeakMap<object, RegScopeState> = new WeakMap();
  const self = {};

  const reg = function (
    this: object,
    regex: RegExp | symbol = undef,
    str: string | symbol = undef
  ): RegResult | RegExecObject {
    const { results, last } = smap.get(this) || { results: [], last: { result: null } };
    smap.set(this, { results, last });
    if (regex === undef) {
      return last ? last.result : null;
    }
    const regstr = (regex as RegExp).toString();
    if (str !== undef) {
      const found = results.find((r) => regstr === r.regstr && str === r.str);
      return found ? found.result : (reg as (regex: RegExp | symbol) => RegExecObject)(regex).exec(str as string);
    }
    return {
      exec(str: string): RegResult {
        const result = (regex as RegExp).exec(str);
        if (Array.isArray(result)) {
          result.forEach((r, i) => ((result as unknown as Record<string, unknown>)['$' + i] = r));
        }
        Object.assign(last, { str, regstr, result });
        results.push(last);
        if (results.length > MAX_RESULT) {
          results.shift();
        }
        (this as unknown as Record<symbol, unknown>)[$] =
          (str as unknown as Record<symbol, unknown>)[$] =
          (regex as unknown as Record<symbol, unknown>)[$] =
            result;
        return result;
      },
      test(this: RegExecObject, str: string): boolean {
        return !!this.exec(str);
      },
    };
  };

  const scope = (scopeObj: object = {}) => reg.bind(scopeObj);

  return Object.assign(reg.bind(self), { $, scope });
})();

//===END===

export { reg };
