import { OutboxItem } from "../types";
import { createId } from "../../lib/uuid";
import { loadDb, saveDb } from "./localDb";

export function queueOutbox(
  workspaceId: string,
  type: OutboxItem["type"],
  payload: Record<string, unknown>
) {
  const db = loadDb();
  const item: OutboxItem = {
    id: createId(),
    workspaceId,
    type,
    payload,
    createdAt: new Date().toISOString()
  };
  // A correction replaces the unsent identity at its original position, before
  // dependent contract creations. A new queue ID protects against in-flight ACKs.
  const previousIndex = type === "applicant.upsert" && !db.outbox.some(item => item.workspaceId === workspaceId && item.type === "list.operation") ? db.outbox.findIndex((pending) =>
    !pending.syncedAt && pending.workspaceId === workspaceId && pending.type === type &&
    ((payload.nif && pending.payload.nif === payload.nif) ||
      (payload.id && pending.payload.id === payload.id))
  ) : -1;
  if (previousIndex >= 0) db.outbox[previousIndex] = item;
  else db.outbox.push(item);
  saveDb(db);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("contribution-offline-sync", { detail: { queued: true } }));
  }
  return item;
}

export function setOutboxError(id: string, message: string | null) {
  const db = loadDb();
  const item = db.outbox.find((entry) => entry.id === id);
  if (item) { item.lastError = message; saveDb(db); }
}
