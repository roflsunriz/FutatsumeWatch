//===BEGIN===
const PlayListSession = ((storage: Storage) => {
  const KEY = 'FutatsumeWatchPlaylist';
  const LEGACY_KEY = 'ZenzaWatchPlaylist';
  let lastJson = '';

  return {
    isExist() {
      const data = storage.getItem(KEY) ?? storage.getItem(LEGACY_KEY);
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
        const name = (e as { name?: unknown }).name;
        if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
          storage.clear();
          storage.setItem(KEY, json);
        }
      }
    },
    restore(): unknown {
      const data = storage.getItem(KEY) ?? storage.getItem(LEGACY_KEY);
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
const PlaylistSession = PlayListSession;

//===END===

export { PlayListSession };
