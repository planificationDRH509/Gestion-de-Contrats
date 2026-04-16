import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import type { QueryClient } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";
import type {
  Persister,
  PersistQueryClientOptions,
} from "@tanstack/react-query-persist-client";

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

/**
 * Configures a QueryClient with persistence.
 */
export function configurePersistence(queryClient: QueryClient) {
  persistQueryClient({
    queryClient,
    persister: cachePersister,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    buster: "v1", // Change this to invalidate all cache
  });
}
