import type { Contract, OutboxItem } from "../types";

/** Shared keys preserve ordering only for records touched by a failed action. */
export function outboxKeys(item: OutboxItem): string[] {
  const keys = new Set<string>();
  const add = (kind: string, id: unknown) => {
    if (typeof id === "string" && id) keys.add(`${item.workspaceId}:${kind}:${id}`);
  };
  const p = item.payload;
  if (item.type === "list.operation") {
    add("lists", "all");
    if (Array.isArray(p.contractIds)) p.contractIds.forEach(id => add("contract", id));
    if (Array.isArray(p.applicantIds)) p.applicantIds.forEach(id => add("applicant", id));
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
  if (item.type === "tag.create") add("tag", p.id);
  if (item.type === "tag.assign" || item.type === "tag.remove") {
    add("contract", p.contractId); add("tag", p.tagId);
  }
  return [...keys];
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
