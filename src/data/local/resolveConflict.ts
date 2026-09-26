import { createId } from "../../lib/uuid";
import { flushLocalDbWrites, loadDb, saveDb } from "./localDb";
import { contractEditFields, dossierEditFields } from "../supabase/offlineConflict";

export async function resolveOfflineConflict(id: string, choices: Record<string, "local" | "remote">) {
  const db = loadDb();
  const item = db.outbox.find(entry => entry.id === id);
  if (!item?.conflict) throw new Error("Ce conflit a changé. Actualisez avant de continuer.");
  if (item.conflict.fields.some(field => !choices[field])) throw new Error("Choisissez une valeur pour chaque champ.");
  const remote = item.conflict.remote;
  if (item.type === "contract.delete" && choices.deletedAt === "remote") {
    db.outbox = db.outbox.filter(entry => entry.id !== item.id);
    const index = db.contracts.findIndex(record => record.id === item.payload.id);
    if (index >= 0) db.contracts[index] = remote as unknown as typeof db.contracts[number];
    saveDb(db); await flushLocalDbWrites();
    window.dispatchEvent(new CustomEvent("contribution-offline-sync", { detail: { queued: true } }));
    return;
  }
  if (item.payload.previousStatus !== undefined) item.payload.previousStatus = remote.status;
  const baseKey = item.type === "dossier.update" ? "baseDossier" : "baseContract";
  const originalBase = item.payload[baseKey] as Record<string, unknown> | undefined;
  for (const field of item.type === "dossier.update" ? dossierEditFields : contractEditFields) {
    if (originalBase && JSON.stringify(item.payload[field] ?? null) === JSON.stringify(originalBase[field] ?? null)) {
      delete item.payload[field];
    }
  }
  const records = item.type === "dossier.update" ? db.dossiers : db.contracts;
  const record = records.find(entry => (entry.id === item.payload.id || (Array.isArray(item.payload.contractIds) && item.payload.contractIds.includes(entry.id)))) as Record<string, unknown> | undefined;
  for (const field of item.conflict.fields) {
    if (choices[field] !== "remote") continue;
    const oldValue = item.payload[field];
    item.payload[field] = remote[field];
    if (record && record[field] === oldValue) record[field] = remote[field];
    // Later local edits still keep their own intent; rebase their old value.
    for (const later of db.outbox.slice(db.outbox.indexOf(item) + 1)) {
      const base = later.payload[baseKey] as Record<string, unknown> | undefined;
      if (later.payload.id === item.payload.id && base && base[field] === oldValue) base[field] = remote[field];
    }
  }
  item.payload[baseKey] = remote;
  item.id = createId(); // In-flight acknowledgements cannot remove the resolved operation.
  item.lastError = null;
  item.conflict = undefined;
  saveDb(db);
  await flushLocalDbWrites();
  window.dispatchEvent(new CustomEvent("contribution-offline-sync", { detail: { queued: true } }));
}
