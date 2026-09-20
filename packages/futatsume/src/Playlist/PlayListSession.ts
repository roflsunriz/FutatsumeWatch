//===BEGIN===
const PlayListSession = ((storage: Storage) => {
  const KEY = 'FutatsumeWatchPlaylist';
  let lastJson = '';

  return {
    isExist() {
      const data = storage.getItem(KEY);
      if (!data) {
        return false;
      }
      try {
        JSON.parse(data);
        return true;
      } catch {
        return false;
      }
    },
    save(data: unknown): void {
      const json = JSON.stringify(data);
      if (lastJson === json) {
        return;
      }
      lastJson = json;
      try {
        storage.setItem(KEY, json);
      } catch (e) {
        window.console.error(e);
        // 他機能やサイトのデータを消して空きを作ってはいけない。
        lastJson = '';
        throw e;
      }
    },
    restore(): unknown {
      const data = storage.getItem(KEY);
      if (!data) {
        return null;
      }
      try {
        lastJson = data;
        return JSON.parse(data) as unknown;
      } catch {
        return null;
      }
    },
  };
})(sessionStorage);

//===END===

export { PlayListSession };
