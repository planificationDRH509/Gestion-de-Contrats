import { del, get, set } from "idb-keyval";
import type { Persister } from "@tanstack/react-query-persist-client";

/**
 * Creates an IndexedDB persister for TanStack Query.
 * This is better than localStorage for large datasets and persistent cache.
 */
export function createIDBPersister(idbKey: string = "react-query-cache"): Persister {
  return {
    persistClient: async (client) => {
      await set(idbKey, client);
    },
    restoreClient: async () => {
      return await get(idbKey);
    },
    removeClient: async () => {
      await del(idbKey);
    },
  };
}

export const cachePersister = createIDBPersister();
