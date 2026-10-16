import type { Contract, OutboxItem } from "../types";

/** Records an action reads or changes: failures of these records must run first. */
export function outboxKeys(item: OutboxItem): string[] {
  const keys = new Set<string>();
  const add = (kind: string, id: unknown) => {
    if (typeof id === "string" && id) keys.add(`${item.workspaceId}:${kind}:${id}`);
  };
  const p = item.payload;
  if (item.type === 'reference.change') {
    const scope = `reference:${['salary', 'prepositions', 'ministers'].includes(String(p.scope)) ? 'global' : item.workspaceId}:${p.scope}`;
    // Ministers share the active selection. Other references have independent
    // entry versions; a rejected entry must not hold the entire catalogue.
    const patches = p.patches as { id: string }[] | undefined;
    if (p.scope === 'ministers' || !patches?.length) keys.add(scope);
    else patches.forEach(patch => keys.add(`${scope}:${patch.id}`));
  }
  if (item.type === "list.operation") {
    const operation = p.operation as { listId?: string; createId?: string } | undefined;
    Object.keys(p.expectedLists ?? {}).forEach(id => add("list", id));
    add("list", operation?.listId); add("list", operation?.createId);
    if (Array.isArray(p.contractIds)) p.contractIds.forEach(id => add("contract", id));
    if (Array.isArray(p.applicantIds)) p.applicantIds.forEach(id => add("applicant", id));
  }
  if (item.type === "pin.set") {
    add("pin", `${p.userId}:${p.contractId}`);
    add("contract", p.contractId);
  }
  if (item.type.startsWith("applicant.")) {
    add("applicant", p.id); add("applicant", p.nif);
  }
  if (item.type.startsWith("contract.")) {
    add("contract", p.id);
    if (Array.isArray(p.contractIds)) p.contractIds.forEach((id) => add("contract", id));
    add("applicant", p.applicantId); add("applicant", p.nif); add("dossier", p.dossierId);
  }
  if (item.type.startsWith("dossier.")) add("dossier", p.id);
  if (item.type === "dossier.delete" && Array.isArray(p.contractIds)) p.contractIds.forEach(id => add("contract", id));
  if (item.type === "tag.create") add("tag", p.id);
  if (item.type === "tag.assign" || item.type === "tag.remove") {
    add("contract", p.contractId); add("tag", p.tagId);
  }
  return [...keys];
}

/** A failed write does not invalidate the shared records it merely references. */
export function outboxWriteKeys(item: OutboxItem): string[] {
  const keys = outboxKeys(item);
  const prefix = `${item.workspaceId}:`;
  if (item.type.startsWith("contract.") || item.type === "tag.assign" || item.type === "tag.remove") {
    return keys.filter(key => key.startsWith(`${prefix}contract:`));
  }
  if (item.type === "list.operation") return keys.filter(key => !key.startsWith(`${prefix}applicant:`));
  if (item.type === "pin.set") return keys.filter(key => key.startsWith(`${prefix}pin:`));
  return keys;
}

export function contractSyncInfo(contract: Contract, pending: OutboxItem[], cloudEnabled = true) {
  const keys = new Set([
    `${contract.workspaceId}:contract:${contract.id}`,
    `${contract.workspaceId}:applicant:${contract.applicantId}`,
    `${contract.workspaceId}:applicant:${contract.nif}`,
    ...(contract.dossierId ? [`${contract.workspaceId}:dossier:${contract.dossierId}`] : []),
    ...(contract.tags ?? []).map((tag) => `${contract.workspaceId}:tag:${tag.id}`)
  ]);
  const related = pending.filter((item) => {
    if (item.syncedAt || item.workspaceId !== contract.workspaceId) return false;
    if (item.type.startsWith("contract.")) return item.payload.id === contract.id ||
      (Array.isArray(item.payload.contractIds) && item.payload.contractIds.includes(contract.id));
    return outboxKeys(item).some((key) => keys.has(key));
  });
  const deviceOnly = !cloudEnabled || related.some((item) => item.type === "contract.create" && item.payload.id === contract.id);
  const error = related.find((item) => item.lastError)?.lastError;
  return {
    icon: error ? "sync_problem" : deviceOnly ? "devices" : related.length ? "cloud_upload" : "cloud_done",
    label: deviceOnly ? "Sur cet appareil" : related.length ? "Modifications sur cet appareil" : "Synchronisé sur le cloud",
    detail: error || (deviceOnly ? "Contrat enregistré sur cet appareil, pas encore envoyé au cloud." : related.length
      ? "Le contrat existe sur le cloud ; des modifications locales attendent leur synchronisation."
      : "Dernière version confirmée sur le cloud, également disponible dans le cache de cet appareil."),
    pending: related.length > 0,
    error
  };
}

/** Only contract-local edits can be dropped without changing shared records. */
export function discardableContractChanges(contract: Contract, pending: OutboxItem[]) {
  return pending.filter(item => !item.syncedAt && item.workspaceId === contract.workspaceId && (
    (item.type === "contract.update" && (item.payload.id === contract.id ||
      (Array.isArray(item.payload.contractIds) && item.payload.contractIds.includes(contract.id)))) ||
    ((item.type === "tag.assign" || item.type === "tag.remove") && item.payload.contractId === contract.id)
  ));
}
