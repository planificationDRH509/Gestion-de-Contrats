import type { Contract, OutboxItem } from "../types";

function errorChain(error: unknown): Record<string, unknown>[] {
  const chain: Record<string, unknown>[] = [];
  while (error && typeof error === "object" && !chain.includes(error as Record<string, unknown>)) {
    chain.push(error as Record<string, unknown>);
    error = (error as { cause?: unknown }).cause;
  }
  return chain;
}

/** Transport, throttling and database contention say nothing about the input. */
export function isTransientSyncFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return errorChain(error).some(part => {
    const status = Number(part.status ?? part.statusCode);
    const code = String(part.code ?? "");
    return status === 408 || status === 429 || status >= 500 && status <= 599 ||
      /^(08\w{3}|40001|40P01|55P03|57014|57P0[123]|53300|53400|PGRST00[012])$/.test(code) ||
      /failed to fetch|fetch failed|network(?:error| request| still| connection)|load failed|internet|offline|connection.*(?:lost|refused|reset)|timed? out|timeout|too many requests|service unavailable|bad gateway|gateway timeout|HTTP (?:408|429|5\d\d)|a changé pendant la synchronisation/i.test(String(part.message ?? ""));
  });
}

export function syncErrorMessage(error: unknown): string {
  // Repository wrappers keep the detailed server cause; retain it for correction.
  return errorChain(error).map(part => String(part.message ?? "")).filter(Boolean)
    .filter((message, index, all) => all.indexOf(message) === index).join(" — ") || "Erreur de synchronisation.";
}

export function syncFailureKind(item: OutboxItem, error: unknown): NonNullable<OutboxItem["failureKind"]> {
  if (isTransientSyncFailure(error)) return "temporary";
  const message = syncErrorMessage(error);
  if (errorChain(error).some(part => [401, 403].includes(Number(part.status)) || /^(42|28)/.test(String(part.code)) || ["PGRST301", "PGRST302"].includes(String(part.code))) ||
    /session|reconnect|permission|autoris|access|accès|droits?|supprimé|introuvable|synchronisé avant|synchronisée avant|action liée/i.test(message)) return "action";
  return item.type === "applicant.upsert" || ((item.type === "contract.create" || item.type === "contract.update") && typeof item.payload.id === "string")
    ? "correction" : "action";
}

export function isCorrectionQueued(item: OutboxItem): boolean {
  return !item.syncedAt && ["contract.create", "contract.update", "applicant.upsert"].includes(item.type) && Boolean(
    item.correctionPending || item.lastError && (item.failureKind === "correction" ||
      !item.failureKind && syncFailureKind(item, { message: item.lastError }) === "correction"));
}

export function isContractCorrection(item: OutboxItem, contract: Contract, userId?: string): boolean {
  if (item.syncedAt || item.workspaceId !== contract.workspaceId || contract.deletedAt) return false;
  if (userId && (item.actorId ? item.actorId !== userId : contract.createdBy !== userId)) return false;
  if (!isCorrectionQueued(item)) return false;
  if (item.type === "contract.create" || item.type === "contract.update") return item.payload.id === contract.id;
  return item.type === "applicant.upsert" && Boolean(
    item.payload.id && item.payload.id === contract.applicantId || item.payload.nif && item.payload.nif === contract.nif
  );
}
