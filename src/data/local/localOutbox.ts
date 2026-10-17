import { newEditTimestamp } from "../latestEdit";
import { OutboxItem } from "../types";
import { syncFailureKind } from "./syncFailures";
import { createId } from "../../lib/uuid";
import { loadDb, saveDb, type LocalDb } from "./localDb";

export function queueOutbox(
  workspaceId: string,
  type: OutboxItem["type"],
  payload: Record<string, unknown>
) {
  const db = loadDb();
  const item = appendOutbox(db, workspaceId, type, payload);
  saveDb(db);
  notifyOutboxQueued();
  return item;
}

export function notifyOutboxQueued() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("contribution-offline-sync", { detail: { queued: true } }));
  }
}

/** Add an operation to the same snapshot as its local data mutation. */
export function appendOutbox(db: LocalDb, workspaceId: string, type: OutboxItem["type"], payload: Record<string, unknown>) {
  const item: OutboxItem = {
    id: createId(),
    sequence: Math.max(0, ...db.outbox.map(item => item.sequence ?? 0)) + 1,
    actorId: (() => { try { return JSON.parse(localStorage.getItem("contribution_auth") ?? "null")?.id; } catch { return undefined; } })(),
    workspaceId,
    type,
    payload,
    modifiedAt: newEditTimestamp(),
    createdAt: new Date().toISOString()
  };
  // A correction replaces the unsent identity at its original position, before
  // dependent contract creations. A new queue ID protects against in-flight ACKs.
  const previousIndex = type === "applicant.upsert" ? db.outbox.findIndex((pending) =>
    (pending.correctionPending || !db.outbox.some(entry => entry.workspaceId === workspaceId && entry.type === "list.operation")) &&
    !pending.syncedAt && pending.workspaceId === workspaceId && pending.actorId === item.actorId && pending.type === type &&
    ((payload.nif && pending.payload.nif === payload.nif) ||
      (payload.id && (pending.payload.id === payload.id || pending.payload.nif === payload.id)))
  ) : -1;
  if (previousIndex >= 0) {
    const previous = db.outbox[previousIndex];
    // A→B→C is still an edit of A on the server until its first ACK.
    item.payload = { ...payload, id: previous.payload.id ?? previous.payload.nif ?? payload.id,
      baseApplicant: previous.payload.baseApplicant ?? null };
    item.correctionPending = db.outbox[previousIndex].correctionPending || Boolean(db.outbox[previousIndex].lastError && syncFailureKind(db.outbox[previousIndex], { message: db.outbox[previousIndex].lastError }) === "correction");
    item.conflict = undefined;
    item.createdAt = db.outbox[previousIndex].createdAt;
    item.sequence = db.outbox[previousIndex].sequence;
    db.outbox[previousIndex] = item;
  }
  else {
    const dependentIndex = type === "applicant.upsert" ? db.outbox.findIndex(pending =>
      pending.workspaceId === workspaceId && pending.actorId === item.actorId && pending.correctionPending &&
      (pending.type === "contract.create" || pending.type === "contract.update") &&
      (payload.id && pending.payload.applicantId === payload.id || payload.nif && pending.payload.nif === payload.nif)) : -1;
    if (dependentIndex >= 0) {
      // Identity corrections must precede the rejected contract and any list
      // waiting for it, including after IndexedDB restores chronological order.
      const dependent = db.outbox[dependentIndex];
      item.createdAt = dependent.createdAt;
      item.sequence = dependent.sequence ?? dependentIndex;
      for (const pending of db.outbox) if ((pending.sequence ?? 0) >= item.sequence) pending.sequence = (pending.sequence ?? 0) + 1;
      db.outbox.splice(dependentIndex, 0, item);
    } else db.outbox.push(item);
  }
  return item;
}

export function setOutboxError(id: string, message: string | null, conflict?: OutboxItem["conflict"], failureKind?: OutboxItem["failureKind"]) {
  const db = loadDb();
  const item = db.outbox.find((entry) => entry.id === id);
  if (item) {
    item.lastError = message;
    item.conflict = conflict;
    item.failureKind = failureKind ?? (message ? syncFailureKind(item, { message }) : undefined);
    if (item.failureKind === "correction") {
      item.correctionPending = true;
      // Retain dependent contract rows after their identity is acknowledged.
      if (item.type === "applicant.upsert") for (const pending of db.outbox) {
        if (pending.workspaceId === item.workspaceId && pending.actorId === item.actorId &&
          (pending.type === "contract.create" || pending.type === "contract.update") &&
          (item.payload.id && pending.payload.applicantId === item.payload.id || item.payload.nif && pending.payload.nif === item.payload.nif)) pending.correctionPending = true;
      }
    }
    saveDb(db);
  }
}
