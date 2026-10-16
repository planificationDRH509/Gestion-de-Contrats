import type { LocalDb } from "./localDb";
import type { OutboxItem } from "../types";

export type DossierAlias = { id: string; workspaceId: string; dossierId: string };

/** Imports and other tabs may retain a folder ID after the server reuses a folder. */
export function resolveDossierId(db: Pick<LocalDb, "dossierAliases">, workspaceId: string, id: string | null | undefined): string | null {
  let resolved = id ?? null;
  const visited = new Set<string>();
  while (resolved && !visited.has(resolved)) {
    visited.add(resolved);
    const alias = db.dossierAliases?.find(item => item.workspaceId === workspaceId && item.id === resolved);
    if (!alias) break;
    resolved = alias.dossierId;
  }
  return resolved;
}

export function resolveOutboxDossier(db: Pick<LocalDb, "dossierAliases">, item: OutboxItem): OutboxItem {
  const payload = { ...item.payload };
  const resolve = (id: unknown) => typeof id === "string" ? resolveDossierId(db, item.workspaceId, id) : id;
  if (item.type.startsWith("contract.")) {
    if ("dossierId" in payload) payload.dossierId = resolve(payload.dossierId);
    const base = payload.baseContract as Record<string, unknown> | undefined;
    if (base) payload.baseContract = { ...base, dossierId: resolve(base.dossierId) };
  }
  if (item.type === "dossier.update" || item.type === "dossier.delete") {
    payload.id = resolve(payload.id);
    const base = payload.baseDossier as Record<string, unknown> | undefined;
    if (base) payload.baseDossier = { ...base, id: resolve(base.id) };
  }
  return { ...item, payload };
}
