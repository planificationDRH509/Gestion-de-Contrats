import type {
  ContractImportEditableField,
  ContractImportEditableRow,
  ContractImportMapping
} from "./contractImport";

const PREFIX = "contract_import_draft";

export type ContractImportDraftState = {
  clipboardText: string;
  mapping: ContractImportMapping;
  editableRows: ContractImportEditableRow[];
  selectedRowIds: string[];
  bulkField: ContractImportEditableField;
  bulkValue: string;
  selectedDossierId: string;
  responsibleUserId: string;
  updatedAt: string;
};

function getKey(workspaceId: string, userId: string) {
  return `${PREFIX}:${workspaceId}:${userId}`;
}

export function loadContractImportDraft(workspaceId: string, userId: string): ContractImportDraftState | null {
  const raw = localStorage.getItem(getKey(workspaceId, userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ContractImportDraftState;
  } catch {
    localStorage.removeItem(getKey(workspaceId, userId));
    return null;
  }
}

export function saveContractImportDraft(workspaceId: string, userId: string, state: Omit<ContractImportDraftState, "updatedAt">) {
  const key = getKey(workspaceId, userId);
  const updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(key, JSON.stringify({ ...state, updatedAt }));
  } catch {
    // Large imports can exceed the browser storage quota. Preserve the pasted
    // source and settings when possible; editable rows can be rebuilt.
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ ...state, editableRows: [], selectedRowIds: [], updatedAt })
      );
    } catch {
      localStorage.removeItem(key);
    }
  }
}

export function clearContractImportDraft(workspaceId: string, userId: string) {
  localStorage.removeItem(getKey(workspaceId, userId));
}
