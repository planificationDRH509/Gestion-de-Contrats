import type { Contract, OutboxItem } from "../types";
import type { QueuedListOperation } from "./localListRepository";
import { loadDb, saveDb, selectDb } from "./localDb";

export function isImportedContractCreation(item: OutboxItem): boolean {
  if (item.type !== "contract.create") return false;
  if (item.payload.skipFiscalYearDuplicate === true) return true;
  // Imports queued by earlier versions predate the outbox marker. Their journal
  // or undo receipt identifies them without relying on translated error text.
  const journal = `contract_import_request:${item.workspaceId}:${item.payload.id}`;
  const prefix = `contract_import_batch:${item.workspaceId}:${item.actorId ? `${item.actorId}:` : ""}`;
  for (const key of Object.keys(localStorage).filter(key => key === journal || key.startsWith(prefix))) {
    try {
      const value = JSON.parse(localStorage.getItem(key)!);
      if (value.workspaceId !== item.workspaceId) continue;
      if (key === journal && value.id === item.payload.id && !value.duplicateUpdate) return true;
      if (value.entries?.some((entry: { before?: Contract; after?: Contract }) => !entry.before && entry.after?.id === item.payload.id)) return true;
    } catch { /* A damaged journal is not evidence of an import. */ }
  }
  return false;
}

export function readSkippedContractIds(workspaceId: string): Set<string> {
  return new Set(selectDb(db => db.outbox.filter(item => item.workspaceId === workspaceId && (item.skippedDuplicateId || item.ignoredAt) && item.syncedAt && item.type === "contract.create")
    .map(item => String(item.payload.id))));
}

/** Retain a durable receipt and the original payload, without leaving a phantom contract. */
export function skipDuplicateContract(creation: OutboxItem, duplicate: Contract) {
  const db = loadDb();
  const id = creation.payload.id;
  if (creation.type !== "contract.create" || typeof id !== "string" || duplicate.id === id || duplicate.workspaceId !== creation.workspaceId) return;
  if (!db.outbox.some(item => item.id === creation.id && !item.syncedAt)) return;
  const at = new Date().toISOString();
  db.contracts = db.contracts.filter(contract => contract.workspaceId !== creation.workspaceId || contract.id !== id);
  db.contractTags = db.contractTags.filter(link => link.contractId !== id);
  for (const list of db.contractLists.filter(list => list.workspaceId === creation.workspaceId)) {
    list.members = list.members.filter(member => member.id !== id);
  }
  db.outbox = db.outbox.flatMap(item => {
    if (item.id === creation.id) return [{ ...item, syncedAt: at, skippedDuplicateId: duplicate.id,
      lastError: null, failureKind: undefined, correctionPending: false, conflict: undefined }];
    if (item.workspaceId !== creation.workspaceId || item.syncedAt) return [item];
    const payload = { ...item.payload };
    if ((item.type.startsWith("contract.") && payload.id === id) ||
      (["tag.assign", "tag.remove", "pin.set"].includes(item.type) && payload.contractId === id)) return [];
    if (Array.isArray(payload.contractIds)) {
      const contractIds = payload.contractIds.filter(value => value !== id);
      payload.contractIds = contractIds;
      if ((item.type.startsWith("contract.") || item.type === "print.create") && !contractIds.length) return [];
    }
    if (item.type === "list.operation") {
      const list = payload as QueuedListOperation;
      list.operation = { ...list.operation };
      if (list.operation.contractIds) {
        list.operation.contractIds = list.operation.contractIds.filter(value => value !== id);
        if (!list.operation.contractIds.length) {
          if (list.operation.action === "assign") return [];
          delete list.operation.contractIds; // Creating an empty list is valid.
        }
      }
      list.expectedMemberships = { ...list.expectedMemberships };
      delete list.expectedMemberships[id];
      list.expectedLists = Object.fromEntries(Object.entries(list.expectedLists).map(([key, value]) =>
        [key, value ? { ...value, members: value.members.filter(member => member.id !== id) } : null]));
    }
    return [{ ...item, payload }];
  });
  saveDb(db);
}
