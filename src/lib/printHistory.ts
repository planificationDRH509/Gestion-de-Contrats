import { Contract } from "../data/types";
import { createId } from "./uuid";

export type PrintHistoryEntry = {
  id: string;
  contractId: string;
  firstName: string;
  lastName: string;
  nif?: string | null;
  ninu?: string | null;
  position: string;
  printedAt: string;
  partial?: boolean;
};

const STORAGE_PREFIX = "contribution_print_history";

function getStorageKey(userId: string, workspaceId: string) {
  return `${STORAGE_PREFIX}:${userId}:${workspaceId}`;
}

function normalizeIdentifier(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function isPrintHistoryDuplicate(
  entries: PrintHistoryEntry[],
  nif?: string | null,
  ninu?: string | null,
  contractId?: string
) {
  if (contractId && entries.some((entry) => entry.contractId === contractId)) {
    return true;
  }
  const normalizedNif = normalizeIdentifier(nif);
  if (normalizedNif && entries.some((entry) => normalizeIdentifier(entry.nif) === normalizedNif)) {
    return true;
  }
  const normalizedNinu = normalizeIdentifier(ninu);
  if (normalizedNinu && entries.some((entry) => normalizeIdentifier(entry.ninu) === normalizedNinu)) {
    return true;
  }
  return false;
}

export function loadPrintHistory(userId: string, workspaceId: string): PrintHistoryEntry[] {
  if (!userId || !workspaceId) return [];
  const raw = localStorage.getItem(getStorageKey(userId, workspaceId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PrintHistoryEntry[];
  } catch {
    return [];
  }
}

export function savePrintHistory(
  userId: string,
  workspaceId: string,
  entries: PrintHistoryEntry[]
) {
  if (!userId || !workspaceId) return;
  localStorage.setItem(getStorageKey(userId, workspaceId), JSON.stringify(entries));
}

export function appendPrintHistory(
  userId: string,
  workspaceId: string,
  contracts: Contract[]
): PrintHistoryEntry[] {
  if (!userId || !workspaceId || contracts.length === 0) return [];
  const existing = loadPrintHistory(userId, workspaceId);
  const timestamp = new Date().toISOString();
  const next = [...existing];
  contracts.forEach((contract) => {
    if (isPrintHistoryDuplicate(next, contract.nif, contract.ninu, contract.id)) {
      return;
    }
    next.push({
      id: createId(),
      contractId: contract.id,
      firstName: contract.firstName,
      lastName: contract.lastName,
      nif: contract.nif ?? null,
      ninu: contract.ninu ?? null,
      position: contract.position,
      printedAt: timestamp,
      partial: false
    });
  });
  savePrintHistory(userId, workspaceId, next);
  return next;
}
