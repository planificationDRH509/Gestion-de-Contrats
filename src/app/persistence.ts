import { sealLocalValue, openLocalValue } from "../data/local/deviceVault";
import { del, get, set } from "idb-keyval";
import type { Persister } from "@tanstack/react-query-persist-client";

/**
 * Creates an IndexedDB persister for TanStack Query.
 * This is better than localStorage for large datasets and persistent cache.
 */
export function createIDBPersister(idbKey: string = "react-query-cache"): Persister {
  return {
    persistClient: async (client) => {
      await set(idbKey, await sealLocalValue(client));
    },
    restoreClient: async () => {
      const value = await get(idbKey);
      if (!value) return undefined;
      const client = await openLocalValue<import("@tanstack/react-query-persist-client").PersistedClient>(value);
      if (!value.encrypted) await set(idbKey, await sealLocalValue(client));
      return client;
    },
    removeClient: async () => {
      await del(idbKey);
    },
  };
}

export const cachePersister = createIDBPersister();
