import type { ContractFormSchema } from "./contractSchema";

const PREFIX = "contract_unsaved_draft";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function contractFormDraftKey(kind: "new" | "edit", workspaceId: string, userId: string, contractId = "") {
  return `${PREFIX}:form:${workspaceId}:${userId}:${kind}:${contractId || "default"}`;
}

export function spreadsheetDraftKey(workspaceId: string, userId: string) {
  return `${PREFIX}:spreadsheet:${workspaceId}:${userId}`;
}

export function loadUnsavedDraft<T>(key: string): T | null {
  return safeParse<T>(localStorage.getItem(key));
}

export function saveUnsavedDraft<T>(key: string, value: T) {
  localStorage.setItem(
    key,
    JSON.stringify({
      value,
      updatedAt: new Date().toISOString()
    })
  );
}

export function loadDraftValue<T>(key: string): T | null {
  const envelope = loadUnsavedDraft<{ value: T }>(key);
  return envelope?.value ?? null;
}

export function clearUnsavedDraft(key: string) {
  localStorage.removeItem(key);
}

export function isContractFormDraftEmpty(values: ContractFormSchema) {
  return (
    !values.gender &&
    !values.firstName.trim() &&
    !values.lastName.trim() &&
    !values.nif.trim() &&
    !(values.ninu ?? "").trim() &&
    !values.salaryNumber.trim() &&
    !values.position.trim() &&
    !values.assignment.trim() &&
    !values.address.trim() &&
    !(values.dossierId ?? "").trim()
  );
}
