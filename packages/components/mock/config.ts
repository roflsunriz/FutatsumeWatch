
interface MockConfig {
  setValue(key: string, value: unknown): void;
  getValue(key: string, value: unknown): unknown;
}

const config: MockConfig = {
  setValue: function(key: string, value: unknown): void {
    sessionStorage.setItem(key, JSON.stringify(value));
  },
  getValue: function(key: string, value: unknown): unknown {
    return JSON.parse(sessionStorage.getItem(key) as string);
  }

};


export {config};
