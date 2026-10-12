import { CONTRACT_IMPORT_FIELDS } from "./contractImport";
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
  fiscalYear?: string;
  batchId?: string;
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
    return true;
  } catch {
    return false;
  }
}

export function clearContractImportDraft(workspaceId: string, userId: string) {
  localStorage.removeItem(getKey(workspaceId, userId));
}

function mappingKey(workspaceId: string, userId: string, headers: string[]) {
  return `contract_import_mapping:${workspaceId}:${userId}:${JSON.stringify(headers.map(header => header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ")))}`;
}
export function loadImportMapping(workspaceId: string, userId: string, headers: string[]): ContractImportMapping | null {
  try {
    const value = JSON.parse(localStorage.getItem(mappingKey(workspaceId, userId, headers)) ?? "null");
    return Array.isArray(value) && value.length === headers.length && value.every(field => CONTRACT_IMPORT_FIELDS.some(item => item.id === field)) ? value : null;
  } catch { return null; }
}
export function saveImportMapping(workspaceId: string, userId: string, headers: string[], mapping: ContractImportMapping) {
  localStorage.setItem(mappingKey(workspaceId, userId, headers), JSON.stringify(mapping));
}
