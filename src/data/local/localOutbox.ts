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
  db.outbox.push(item);
  saveDb(db);
  return item;
}
