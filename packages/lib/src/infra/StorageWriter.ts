interface ToJsonWorker {
  post: (message: unknown) => Promise<string>;
}

type JsonReplacer = ((key: string, value: unknown) => unknown) | (string | number)[] | null;

interface WorkerSelf {
  onmessage: unknown;
}

import { workerUtil } from './workerUtil';
//===BEGIN===

const StorageWriter = (() => {
  const func = function (self: WorkerSelf) {
    self.onmessage = ({
      command,
      params,
    }: {
      command: unknown;
      params: { obj: unknown; replacer?: JsonReplacer; space?: string | number };
    }) => {
      const { obj, replacer, space } = params;
      return JSON.stringify(obj, (replacer || null) as (string | number)[] | null, space || 0);
    };
  };

  let worker: ToJsonWorker | undefined;
  const prototypePollution: unknown =
    (window as unknown as Record<string, unknown>).Prototype &&
    Object.prototype.hasOwnProperty.call(Array.prototype, 'toJSON');

  const toJson = async (obj: unknown, replacer: JsonReplacer = null, space: string | number = 0): Promise<string> => {
    if (!prototypePollution || obj === null || ['string', 'number', 'boolean'].includes(typeof obj)) {
      return JSON.stringify(obj, replacer as (string | number)[] | null, space);
    }
    worker = worker || (workerUtil.createCrossMessageWorker(func, { name: 'ToJsonWorker' }) as ToJsonWorker);
    return worker.post({ command: 'toJson', params: { obj, replacer, space } });
  };

  const writer = Symbol('StorageWriter');
  const setItem = (storage: Storage, key: string, value: unknown): void => {
    if (!prototypePollution || value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      storage.setItem(key, JSON.stringify(value));
    } else {
      void toJson(value).then((json) => storage.setItem(key, json));
    }
  };

  (localStorage as unknown as Record<symbol, unknown>)[writer] = (key: string, value: unknown) =>
    setItem(localStorage, key, value);
  (sessionStorage as unknown as Record<symbol, unknown>)[writer] = (key: string, value: unknown) =>
    setItem(sessionStorage, key, value);

  return { writer, toJson };
})();

//===END===

export { StorageWriter };
