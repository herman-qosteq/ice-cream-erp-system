// @react-native-async-storage/async-storage has no Windows native module, so
// linking it breaks the RNW build. This in-memory shim covers the only
// methods this app actually calls (getItem/setItem/removeItem/clear) so
// Windows builds and runs — the tradeoff is that the auth token and offline
// sync queue don't persist across app restarts on Windows.
const memoryStore = new Map<string, string>();

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return memoryStore.has(key) ? memoryStore.get(key)! : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    memoryStore.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    memoryStore.delete(key);
  },
  async clear(): Promise<void> {
    memoryStore.clear();
  },
};

export default AsyncStorage;
