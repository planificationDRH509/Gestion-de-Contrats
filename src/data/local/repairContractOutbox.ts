import { newEditTimestamp } from "../latestEdit";
import type { UpdateContractInput } from "../types";
import { createId } from "../../lib/uuid";
import { loadDb, saveDb } from "./localDb";
import { syncFailureKind } from "./syncFailures";

/** Repair the rejected operation in its original place, keeping the contract UUID. */
export function repairContractOutbox(workspaceId: string, input: UpdateContractInput): boolean {
  const db = loadDb();
  let actorId: string | undefined;
  try { actorId = JSON.parse(localStorage.getItem("contribution_auth") ?? "null")?.id; } catch { /* no session */ }
  const index = db.outbox.findIndex(item => !item.syncedAt && item.workspaceId === workspaceId && item.actorId === actorId &&
    (item.type === "contract.create" || item.type === "contract.update") && item.payload.id === input.id &&
    (item.correctionPending || item.lastError && syncFailureKind(item, { message: item.lastError }) === "correction"));
  if (index < 0) return false;
  const item = db.outbox[index];
  const previous = { ...item.payload };
  const base = item.payload.baseContract ?? (item.type === "contract.create" ? previous : undefined);
  const patch = { ...input } as Record<string, unknown>;
  delete patch.baseContract;
  item.payload = { ...item.payload, ...patch, baseContract: base };
  item.id = createId(); // A reply for the rejected version cannot acknowledge the correction.
  item.modifiedAt = newEditTimestamp();
  item.conflict = undefined;
  item.lastError = null;
  item.failureKind = undefined;
  item.correctionPending = true;
  // A correction is a new edit, even though it retains its dependency position.
  const changed = Object.keys(patch).filter(field => JSON.stringify(previous[field]) !== JSON.stringify(patch[field]));
  for (const later of db.outbox.slice(index + 1)) {
    if (later.workspaceId !== workspaceId || later.actorId !== actorId || later.type !== "contract.update" || later.payload.id !== input.id) continue;
    const laterBase = later.payload.baseContract as Record<string, unknown> | undefined;
    for (const field of changed) {
      if (laterBase) laterBase[field] = patch[field];
      if (field in later.payload) later.payload[field] = patch[field];
    }
    later.id = createId();
    later.modifiedAt = newEditTimestamp();
    later.conflict = undefined;
    later.correctionPending = true;
    later.lastError = null;
    later.failureKind = undefined;
  }
  saveDb(db);
  window.dispatchEvent(new CustomEvent("contribution-offline-sync", { detail: { queued: true } }));
  return true;
}
