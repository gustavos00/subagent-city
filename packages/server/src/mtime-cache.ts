interface Entry<T> {
  mtimeMs: number;
  value: T;
}

interface MtimeCache<T> {
  load: (key: string, mtimeMs: number, loader: () => Promise<T>) => Promise<T>;
  finishPoll: () => void;
}

/**
 * Remembers what was parsed from a file until the file changes. Entries live for one more poll than the last one that
 * asked for them, so files that disappear drop out and the cache never outgrows what one poll reads.
 * @returns load (cached by key and modification time) and finishPoll (ends a poll, forgetting what it did not touch)
 */
export function createMtimeCache<T>(): MtimeCache<T> {
  let previous = new Map<string, Entry<T>>();
  let current = new Map<string, Entry<T>>();
  return {
    async load(key, mtimeMs, loader) {
      const known = current.get(key) ?? previous.get(key);
      if (known?.mtimeMs === mtimeMs) {
        current.set(key, known);
        return known.value;
      }
      const value = await loader();
      current.set(key, { mtimeMs, value });
      return value;
    },
    finishPoll() {
      previous = current;
      current = new Map();
    },
  };
}
