import { findContractMinister, LEGACY_MINISTER, type Minister, type MinisterRegistry } from "../../lib/ministers";

const cacheKey = `contribution_ministers_v1:${import.meta.env.VITE_DATA_PROVIDER ?? "local"}`;
export function readMinistersCache(): MinisterRegistry | undefined {
  try {
    const registry = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as MinisterRegistry | null;
    if (registry && Array.isArray(registry.ministers) && registry.ministers.some(m => m.id === registry.currentMinisterId)) return registry;
  } catch { /* No usable cache. */ }
  return undefined;
}
export function cacheMinisters(registry: MinisterRegistry) {
  localStorage.setItem(cacheKey, JSON.stringify(registry));
  window.dispatchEvent(new Event("ministers-changed"));
}
export function currentCachedMinister(): Minister {
  const registry = readMinistersCache();
  const minister = registry?.ministers.find(m => m.id === registry.currentMinisterId);
  if (!minister) throw new Error("Chargez les ministres dans les paramètres avant de créer un contrat.");
  return minister;
}
export function cachedContractMinister(contract: { ministerId?: string; minister?: Minister }) {
  return findContractMinister(contract, readMinistersCache());
}
export function bindContractMinister<T extends { ministerId?: string; minister?: Minister }>(input: T): T & { ministerId: string; minister: Minister } {
  const minister = input.ministerId ? cachedContractMinister(input) : currentCachedMinister();
  if (!minister) throw new Error("Les informations du ministre de ce contrat sont indisponibles.");
  return { ...input, ministerId: minister.id, minister };
}

/** Contracts and queued creations predating this feature belong to the original minister. */
export function migrateLegacyContract<T extends { ministerId?: string; minister?: Minister }>(contract: T): T {
  return contract.ministerId ? contract : { ...contract, ministerId: LEGACY_MINISTER.id };
}
