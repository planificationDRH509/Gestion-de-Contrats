export const MAX_PINNED_CONTRACTS = 10;

function storageKey(userId: string) {
  return `contribution_pinned_contracts:${userId}`;
}

export function readPinnedContracts(userId: string): string[] {
  if (!userId) return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))] : [];
  } catch {
    return [];
  }
}

export function cachePinnedContracts(userId: string, ids: string[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  } catch {
    // The server remains authoritative when browser storage is unavailable.
  }
}

export function nextPinnedContracts(ids: string[], contractId: string): string[] {
  if (ids.includes(contractId)) return ids.filter(id => id !== contractId);
  if (ids.length >= MAX_PINNED_CONTRACTS) {
    throw new Error(`Vous pouvez épingler jusqu’à ${MAX_PINNED_CONTRACTS} contrats.`);
  }
  return [...ids, contractId];
}

