const globalForTwitterStore = globalThis as typeof globalThis & {
  twitterRequestTokenStore?: Map<string, string>;
};

export const twitterRequestTokenStore =
  globalForTwitterStore.twitterRequestTokenStore ??
  new Map<string, string>();

if (!globalForTwitterStore.twitterRequestTokenStore) {
  globalForTwitterStore.twitterRequestTokenStore = twitterRequestTokenStore;
}