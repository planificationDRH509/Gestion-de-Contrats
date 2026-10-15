import type { OutboxItem } from "../types";
import { editTime, latestEditAt } from "../latestEdit";
import { loadDb } from "./localDb";

/** Upgrade legacy clocks without making an old edit look newly authored. */
export function outboxEditTime(item: OutboxItem): string {
  if (editTime(item.modifiedAt)) return item.modifiedAt!;
  const candidates = [item.createdAt, item.payload.modifiedAt, item.payload.updatedAt, item.payload.changedAt];
  // Earlier versions moved a corrected operation back to its original queue
  // position, losing its edit date. Recover it only if the cached row still
  // describes that exact correction, never from a later, different edit.
  if (item.correctionPending && ["applicant.upsert", "contract.create", "contract.update", "dossier.update"].includes(item.type)) {
    const db = loadDb();
    const identity = item.type === "applicant.upsert";
    const records = identity ? db.applicants : item.type === "dossier.update" ? db.dossiers : db.contracts;
    const record = records.find(row => row.workspaceId === item.workspaceId &&
      (row.id === item.payload.id || identity && row.id === item.payload.nif));
    const fields = identity ? ["firstName", "lastName", "gender", "ninu", "phone", "address"]
      : item.type === "dossier.update" ? ["name", "status", "priority", "comment"]
      : ["position", "assignment", "salaryNumber", "durationMonths", "status", "dossierId", "commentaire"];
    const normalize = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr") : value ?? null;
    if (record && fields.every(field => item.payload[field] === undefined ||
      normalize(item.payload[field]) === normalize((record as Record<string, unknown>)[field]))) {
      candidates.push(latestEditAt(record), record.updatedAt);
    }
  }
  const timestamp = Math.max(...candidates.map(editTime));
  return timestamp ? new Date(timestamp).toISOString() : item.createdAt;
}
