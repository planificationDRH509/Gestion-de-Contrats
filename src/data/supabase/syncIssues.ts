import type { Applicant, Contract, Dossier, OutboxItem, Tag } from "../types";
import type { ContractList } from "../../features/lists/listModel";
import { hasPermission, type AppRole } from "../../features/auth/permissions";
import { cachePinnedContracts, readPinnedContracts } from "../../features/contracts/pinnedContractsCache";
import { withBrowserLock } from "../../lib/browserLock";
import { createId } from "../../lib/uuid";
import { newEditTimestamp } from "../latestEdit";
import { flushLocalDbWrites, getLocalStorageError, loadDb, refreshLocalDb, saveDb, type LocalDb } from "../local/localDb";
import { outboxKeys, outboxWriteKeys } from "../local/outboxDependencies";
import type { QueuedListOperation } from "../local/localListRepository";
import { contractEditFields, dossierEditFields } from "./offlineConflict";
import { readReferenceRestoration } from "./referenceRestoration";
import { getSupabaseClient } from "./supabaseClient";
import { deleteSyncResolutionContract, readSyncResolutionRecord, syncSupabaseOutbox, syncSupabaseWorkspace } from "./supabaseProvider";

export type SyncIssueAction = "retry" | "refresh-local" | "refresh-server" | "delete-local" | "delete-server" | "ignore";
type TargetKind = "contract" | "applicant" | "dossier" | "tag" | "list" | "other";
export type SyncIssue = {
  id: string; workspaceId: string; title: string; message: string;
  actions: SyncIssueAction[]; fingerprint: string; affectedCount: number;
  target?: { kind: TargetKind; id: string };
};

function session() {
  try { return JSON.parse(localStorage.getItem("contribution_auth") ?? "null") as { id: string; workspaceId: string; role: AppRole; taskSessionToken?: string } | null; }
  catch { return null; }
}
function pending(db: LocalDb, workspaceId: string) {
  return db.outbox.filter(item => !item.syncedAt && item.workspaceId === workspaceId);
}
function target(item: OutboxItem): SyncIssue["target"] {
  const p = item.payload;
  if (item.type.startsWith("contract.") && typeof p.id === "string") return { kind: "contract", id: p.id };
  if (item.type.startsWith("applicant.")) return { kind: "applicant", id: String(p.id || p.nif || "") };
  if (item.type.startsWith("dossier.")) return { kind: "dossier", id: String(p.id || "") };
  if (item.type === "tag.create") return { kind: "tag", id: String(p.id || "") };
  if (item.type === "tag.assign" || item.type === "tag.remove" || item.type === "pin.set") return { kind: "contract", id: String(p.contractId || "") };
  if (item.type === "list.operation") {
    const op = p.operation as { listId?: string; createId?: string };
    return { kind: "list", id: op.listId || op.createId || "" };
  }
  return undefined;
}

/** Cancel the whole dependent chain, never leave a later edit based on discarded data. */
function relatedChanges(item: OutboxItem, items: OutboxItem[], missingParents = false): OutboxItem[] {
  const selected = new Set([item.id]);
  if (item.type === "contract.create") for (const next of items) {
    if (next.type === "applicant.upsert" && next.payload.importContractId === item.payload.id) selected.add(next.id);
  }
  const writes = new Set(outboxWriteKeys(item));
  let changed = true;
  while (changed) {
    changed = false;
    for (const next of items) {
      if (selected.has(next.id) || !outboxKeys(next).some(key => writes.has(key))) continue;
      if (!missingParents) {
        // A restored parent still exists: its read dependents remain valid.
        // Do not cancel pins, lists, tags or contracts that merely reference it.
        const family = item.type.split(".")[0];
        if (next.type.split(".")[0] !== family) continue;
        if (item.type === "tag.create" && next.type !== "tag.create") continue;
        if (family === "tag" && item.type !== "tag.create" &&
          (next.payload.tagId !== item.payload.tagId || next.payload.contractId !== item.payload.contractId)) continue;
        if (family === "list" && !outboxKeys(next).some(key => key.startsWith(`${item.workspaceId}:list:`) && writes.has(key))) continue;
      }
      selected.add(next.id);
      if (next.type === "contract.create") for (const identity of items) {
        if (identity.type === "applicant.upsert" && identity.payload.importContractId === next.payload.id) selected.add(identity.id);
      }
      if (missingParents || item.type === "list.operation" || item.type === "reference.change") outboxWriteKeys(next).forEach(key => writes.add(key));
      changed = true;
    }
  }
  return items.filter(next => selected.has(next.id));
}
function fingerprint(item: OutboxItem, db: LocalDb) {
  // Include read dependents as well: a concurrent local edit can change whether
  // removing a previously unsent parent is still safe.
  return JSON.stringify(relatedChanges(item, pending(db, item.workspaceId), true));
}
function allowedActor(items: OutboxItem[], workspaceId: string) {
  const user = session();
  return Boolean(user?.id && user.workspaceId === workspaceId && items.every(item =>
    (!item.actorId || item.actorId === user.id) &&
    (item.type !== "pin.set" || item.payload.userId === user.id) &&
    (item.type !== "list.operation" || item.payload.actorId === user.id)));
}
function title(item: OutboxItem, db: LocalDb): string {
  const t = target(item);
  if (t?.kind === "contract") {
    const record = db.contracts.find(c => c.workspaceId === item.workspaceId && c.id === t.id);
    return `Contrat · ${record?.nif || item.payload.nif || t.id}`;
  }
  if (t?.kind === "applicant") return `Identification · ${item.payload.nif || t.id}`;
  if (t?.kind === "dossier") return `Dossier · ${db.dossiers.find(d => d.id === t.id)?.name || item.payload.name || t.id}`;
  if (t?.kind === "tag") return `Tag · ${item.payload.name || t.id}`;
  if (t?.kind === "list") return "Liste de contrats";
  if (item.type === "print.create") return "Historique d’impression";
  if (item.type === "reference.change") return "Référentiel";
  return "Modification de contrats";
}
function canUpload(item: OutboxItem) {
  const role = session()?.role;
  if (!role || !["admin", "agent", "controller", "reader"].includes(role)) return false;
  if (item.type === "contract.update" && typeof item.payload.id === "string") return hasPermission(role, "contracts.edit");
  if (item.type === "applicant.upsert") return hasPermission(role, "identification.manage");
  if (item.type === "dossier.update") return hasPermission(role, "dossiers.manage");
  return false;
}

export function getSyncIssues(workspaceId: string): SyncIssue[] {
  const db = loadDb();
  const items = pending(db, workspaceId);
  const issues: SyncIssue[] = items.filter(item => item.lastError || item.conflict || item.failureKind === "temporary").map(item => {
    const dependent = relatedChanges(item, items, true);
    const own = allowedActor(dependent, workspaceId);
    const actions: SyncIssueAction[] = ["retry"];
    if (own && item.failureKind !== "temporary") {
      if (item.type !== "print.create") actions.push("refresh-local");
      actions.push("ignore");
      if (canUpload(item)) actions.push("refresh-server");
      if (["contract.create", "dossier.create", "tag.create"].includes(item.type)) actions.push("delete-local");
      if (target(item)?.kind === "contract" && session()?.role === "admin" && item.type.startsWith("contract.")) actions.push("delete-server");
    }
    return { id: item.id, workspaceId, title: title(item, db), message: item.lastError || (item.failureKind === "temporary"
      ? "Connexion interrompue. Réessayez la synchronisation." : "Modifications concurrentes."),
      actions, fingerprint: fingerprint(item, db), affectedCount: dependent.length, target: target(item) };
  });
  const storageError = getLocalStorageError();
  const metadataError = db.syncMetadata[workspaceId]?.lastError;
  for (const [id, message] of [["storage", storageError], ["workspace", metadataError]] as const) {
    if (message && !issues.some(issue => issue.message === message)) issues.push({
      id: `sync:${id}`, workspaceId, title: id === "storage" ? "Enregistrement sur cet appareil" : "Synchronisation",
      message, actions: ["retry"], fingerprint: message, affectedCount: 1
    });
  }
  return issues;
}

function assertIssue(workspaceId: string, id: string, expected: string, action: SyncIssueAction) {
  const issue = getSyncIssues(workspaceId).find(value => value.id === id);
  if (!issue || issue.fingerprint !== expected) throw new Error("Ces modifications ont changé. Actualisez avant de réessayer.");
  if (!issue.actions.includes(action)) throw new Error("Cette action n’est pas autorisée pour cette erreur.");
  if (session()?.workspaceId !== workspaceId) throw new Error("Reconnectez le compte de cet espace.");
  return issue;
}
type RecordKind = "contract" | "applicant" | "dossier" | "tag";
type RemoteRecord = Contract | Applicant | Dossier | Tag;
type Restored = { kind: RecordKind; id: string; record: RemoteRecord | null };

async function readRestoration(items: OutboxItem[], workspaceId: string, root: OutboxItem) {
  const references = await readReferenceRestoration(items, workspaceId);
  const records = new Map<string, { kind: RecordKind; id: string }>();
  const listIds = new Set<string>();
  for (const item of items) for (const key of outboxWriteKeys(item)) {
    const prefix = `${workspaceId}:`;
    const value = key.startsWith(prefix) ? key.slice(prefix.length) : "";
    const split = value.indexOf(":");
    const kind = value.slice(0, split);
    const id = value.slice(split + 1);
    if (root.type.startsWith("contract.") && typeof root.payload.id === "string" && kind === "contract" && id !== root.payload.id) continue;
    if (["contract", "applicant", "dossier", "tag"].includes(kind) && id) records.set(value, { kind: kind as RecordKind, id });
    if (kind === "list") listIds.add(id);
  }
  const restored: Restored[] = await Promise.all([...records.values()].map(async value => ({ ...value,
    record: await readSyncResolutionRecord(value.kind, value.id, workspaceId) })));
  let lists: ContractList[] | undefined;
  let pins: string[] | undefined;
  const user = session();
  if (listIds.size) {
    if (!user?.taskSessionToken) throw new Error("Session utilisateur indisponible.");
    const response = await getSupabaseClient().rpc("read_contract_lists", { p_session_token: user.taskSessionToken, p_workspace_id: workspaceId });
    if (response.error) throw response.error;
    if (!Array.isArray(response.data)) throw new Error("Impossible de récupérer les listes du serveur.");
    lists = response.data as unknown as ContractList[];
    if (lists.some(list => list.workspaceId !== workspaceId)) throw new Error("Liste inaccessible dans cet espace.");
  }
  if (items.some(item => item.type === "pin.set")) {
    if (!user?.taskSessionToken) throw new Error("Session utilisateur indisponible.");
    const response = await getSupabaseClient().rpc("read_pinned_contracts", { p_session_token: user.taskSessionToken });
    if (response.error) throw response.error;
    if (!Array.isArray(response.data)) throw new Error("Impossible de récupérer les contrats épinglés.");
    pins = response.data;
  }
  return { restored, lists, listIds, pins, references };
}

function removeContractReferences(db: LocalDb, workspaceId: string, id: string) {
  db.outbox = db.outbox.flatMap(item => {
    if (item.workspaceId !== workspaceId || item.syncedAt) return [item];
    if (["tag.assign", "tag.remove", "pin.set"].includes(item.type) && item.payload.contractId === id) return [];
    if (item.type !== "list.operation" && item.type !== "print.create") return [item];
    const payload = structuredClone(item.payload);
    if (Array.isArray(payload.contractIds)) payload.contractIds = payload.contractIds.filter(value => value !== id);
    if (item.type === "print.create") return (payload.contractIds as string[]).length ? [{ ...item, payload }] : [];
    const list = payload as QueuedListOperation;
    if (list.operation.contractIds) {
      list.operation.contractIds = list.operation.contractIds.filter(value => value !== id);
      if (!list.operation.contractIds.length) {
        if (list.operation.action === "assign") return [];
        delete list.operation.contractIds;
      }
    }
    delete list.expectedMemberships[id];
    list.expectedLists = Object.fromEntries(Object.entries(list.expectedLists).map(([key, value]) =>
      [key, value ? { ...value, members: value.members.filter(member => member.id !== id) } : null]));
    return [{ ...item, payload }];
  });
}

function applyRestoration(db: LocalDb, items: OutboxItem[], remote: Awaited<ReturnType<typeof readRestoration>>, workspaceId: string, root: OutboxItem) {
  for (const { kind, id, record } of remote.restored) {
    if (kind === "contract") {
      db.contracts = db.contracts.filter(value => value.id !== id || value.workspaceId !== workspaceId);
      db.contractTags = db.contractTags.filter(link => link.contractId !== id);
      if (record) {
        const contract = record as Contract;
        db.contracts.push(contract);
        for (const tag of contract.tags ?? []) {
          if (!db.tags.some(value => value.id === tag.id)) db.tags.push(tag);
          db.contractTags.push({ contractId: id, tagId: tag.id, createdAt: new Date().toISOString() });
        }
      }
      // A cancelled unsent creation cannot remain a member of an optimistic list.
      if (!record || record.deletedAt) {
        for (const list of db.contractLists.filter(value => value.workspaceId === workspaceId)) list.members = list.members.filter(member => member.id !== id);
        removeContractReferences(db, workspaceId, id);
      }
    } else if (kind === "applicant") {
      db.applicants = db.applicants.filter(value => value.id !== id || value.workspaceId !== workspaceId);
      if (record) {
        const applicant = record as Applicant;
        db.applicants.push(applicant);
        db.contracts = db.contracts.map(contract => contract.workspaceId === workspaceId && (contract.applicantId === id || contract.nif === id)
          ? { ...contract, firstName: applicant.firstName, lastName: applicant.lastName, gender: applicant.gender, address: applicant.address, ninu: applicant.ninu } : contract);
      }
    } else if (kind === "dossier") {
      db.dossiers = db.dossiers.filter(value => value.id !== id || value.workspaceId !== workspaceId);
      if (record) db.dossiers.push(record as Dossier);
      if (!record || record.deletedAt) {
        for (const contract of db.contracts) if (contract.workspaceId === workspaceId && contract.dossierId === id) contract.dossierId = null;
        for (const next of pending(db, workspaceId)) if (next.type.startsWith("contract.") && next.payload.dossierId === id) {
          next.payload.dossierId = null;
          const base = next.payload.baseContract as Record<string, unknown> | undefined;
          if (base?.dossierId === id) base.dossierId = null;
        }
      }
    } else {
      db.tags = db.tags.filter(value => value.id !== id || value.workspaceId !== workspaceId);
      if (record) db.tags.push(record as Tag);
      if (!record || record.deletedAt) db.contractTags = db.contractTags.filter(link => link.tagId !== id);
      for (const contract of db.contracts.filter(value => value.workspaceId === workspaceId)) {
        contract.tags = (contract.tags ?? []).flatMap(tag => tag.id !== id ? [tag] : record && !record.deletedAt ? [record as Tag] : []);
      }
      if (!record || record.deletedAt) db.outbox = db.outbox.filter(next => next.workspaceId !== workspaceId || next.syncedAt ||
        !["tag.assign", "tag.remove"].includes(next.type) || next.payload.tagId !== id);
    }
  }
  if (remote.lists) db.contractLists = [...db.contractLists.filter(list => list.workspaceId !== workspaceId || !remote.listIds.has(list.id)),
    ...remote.lists.filter(list => remote.listIds.has(list.id))];
  const cancelled = new Set(items.map(item => item.id));
  const at = new Date().toISOString();
  db.outbox = db.outbox.flatMap(item => {
    if (!cancelled.has(item.id)) return [item];
    if (item.id !== root.id && root.type.startsWith("contract.") && typeof root.payload.id === "string" && Array.isArray(item.payload.contractIds)) {
      const contractIds = item.payload.contractIds.filter(id => id !== root.payload.id);
      if (contractIds.length) return [{ ...item, payload: { ...item.payload, contractIds } }];
    }
    // Only creations need a receipt, to prevent persisted import requests from resurrecting them.
    return item.type === "contract.create" ? [{ ...item, syncedAt: at, ignoredAt: at, lastError: null,
      failureKind: undefined, conflict: undefined, correctionPending: false }] : [];
  });
  // Keep valid unsent intent visible when its parent is restored from the server.
  for (const item of pending(db, workspaceId)) {
    if (item.type === "applicant.upsert") for (const contract of db.contracts) {
      if (contract.workspaceId !== workspaceId || !(contract.applicantId === item.payload.id || contract.nif === item.payload.nif)) continue;
      for (const field of ["firstName", "lastName", "gender", "ninu", "address"] as const) {
        if (item.payload[field] !== undefined) (contract as unknown as Record<string, unknown>)[field] = item.payload[field];
      }
    }
    if (item.type === "contract.update") {
      const base = item.payload.baseContract as Record<string, unknown> | undefined;
      for (const contract of db.contracts.filter(value => value.workspaceId === workspaceId &&
        (value.id === item.payload.id || Array.isArray(item.payload.contractIds) && item.payload.contractIds.includes(value.id)))) {
        for (const field of contractEditFields) if (item.payload[field] !== undefined && (!base || JSON.stringify(base[field] ?? null) !== JSON.stringify(item.payload[field] ?? null))) {
          (contract as unknown as Record<string, unknown>)[field] = item.payload[field];
        }
      }
    }
    if (item.type === "tag.assign" || item.type === "tag.remove") {
      const contractId = String(item.payload.contractId), tagId = String(item.payload.tagId);
      db.contractTags = db.contractTags.filter(link => link.contractId !== contractId || link.tagId !== tagId);
      if (item.type === "tag.assign") db.contractTags.push({ contractId, tagId, createdAt: item.createdAt });
      const contract = db.contracts.find(value => value.id === contractId && value.workspaceId === workspaceId);
      const tag = db.tags.find(value => value.id === tagId && value.workspaceId === workspaceId);
      if (contract) contract.tags = [...(contract.tags ?? []).filter(value => value.id !== tagId), ...(item.type === "tag.assign" && tag ? [tag] : [])];
    }
  }
  for (const list of db.contractLists.filter(value => value.workspaceId === workspaceId)) list.members = list.members.flatMap(member => {
    const contract = db.contracts.find(value => value.id === member.id && value.workspaceId === workspaceId);
    if (!contract || contract.deletedAt) return [];
    if (pending(db, workspaceId).some(item => item.type === "list.operation" && Array.isArray(item.payload.contractIds) && item.payload.contractIds.includes(contract.id))) contract.status = "liste";
    return [{ ...member, firstName: contract.firstName, lastName: contract.lastName, nif: contract.nif ?? "", position: contract.position,
      salaryNumber: contract.salaryNumber, durationMonths: contract.durationMonths }];
  });
  db.syncMetadata[workspaceId] = { ...db.syncMetadata[workspaceId], lastError: pending(db, workspaceId).find(item => item.lastError)?.lastError ?? null };
}

async function rebaseServer(item: OutboxItem, workspaceId: string, expected: string) {
  const t = target(item)!;
  const record = await readSyncResolutionRecord(t.kind as RecordKind, t.id, workspaceId);
  if (!record || record.deletedAt) throw new Error("La version du serveur est introuvable. Les modifications sont conservées.");
  await refreshLocalDb();
  assertIssue(workspaceId, item.id, expected, "refresh-server");
  const db = loadDb();
  const current = db.outbox.find(value => value.id === item.id)!;
  const baseKey = item.type === "applicant.upsert" ? "baseApplicant" : item.type === "dossier.update" ? "baseDossier" : "baseContract";
  const originalBase = current.payload[baseKey] as Record<string, unknown> | undefined;
  const fields: readonly string[] = item.type === "applicant.upsert" ? ["firstName", "lastName", "gender", "ninu", "phone", "address"]
    : item.type === "dossier.update" ? dossierEditFields : contractEditFields;
  for (const field of fields) if (originalBase && JSON.stringify(current.payload[field] ?? null) === JSON.stringify(originalBase[field] ?? null)) {
    if (item.type === "applicant.upsert") current.payload[field] = (record as unknown as Record<string, unknown>)[field];
    else delete current.payload[field];
  }
  current.payload[baseKey] = record;
  current.id = createId();
  current.modifiedAt = newEditTimestamp();
  current.lastError = null;
  current.failureKind = undefined;
  current.conflict = undefined;
  // Promoting an earlier edit must not make a later queued edit look older than
  // the new server clock and silently discard that later user's intent.
  const currentIndex = db.outbox.indexOf(current);
  const writes = new Set(outboxWriteKeys(current));
  for (let index = currentIndex + 1; index < db.outbox.length; index++) {
    const next = db.outbox[index];
    if (next.syncedAt || next.workspaceId !== workspaceId || next.type.split(".")[0] !== current.type.split(".")[0] || !outboxWriteKeys(next).some(key => writes.has(key))) continue;
    if (Array.isArray(next.payload.contractIds)) {
      const matching = next.payload.contractIds.filter(id => writes.has(`${workspaceId}:contract:${id}`));
      const remaining = next.payload.contractIds.filter(id => !matching.includes(id));
      if (remaining.length) {
        const untouched = { ...next, payload: { ...next.payload, contractIds: remaining } };
        db.outbox.splice(index + 1, 0, untouched);
        next.payload = { ...next.payload, contractIds: matching };
      }
    }
    next.id = createId(); next.modifiedAt = newEditTimestamp();
  }
  saveDb(db);
  await flushLocalDbWrites();
  return current.id;
}

export async function resolveSyncIssue(workspaceId: string, id: string, action: SyncIssueAction, expected: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Reconnectez-vous pour résoudre cette erreur.");
  const syntheticRetry = id.startsWith("sync:") && action === "retry";
  if (syntheticRetry) assertIssue(workspaceId, id, expected, action);
  let replayId = id;
  await withBrowserLock("outbox-sync", async () => {
    await refreshLocalDb();
    // A successful durable flush can itself resolve the storage error.
    if (syntheticRetry && !getSyncIssues(workspaceId).some(issue => issue.id === id)) {
      if (session()?.workspaceId !== workspaceId) throw new Error("Reconnectez le compte de cet espace.");
      return;
    }
    assertIssue(workspaceId, id, expected, action);
    const item = loadDb().outbox.find(value => value.id === id && value.workspaceId === workspaceId && !value.syncedAt);
    if (!item || action === "retry") return;
    if (action === "refresh-server") { replayId = await rebaseServer(item, workspaceId, expected); return; }
    let selected = relatedChanges(item, pending(loadDb(), workspaceId));
    if (!allowedActor(selected, workspaceId)) throw new Error("Reconnectez le compte ayant effectué ces modifications.");
    let remote = await readRestoration(selected, workspaceId, item);
    const missingApplicant = item.type.startsWith("applicant.") && remote.restored.some(value => value.kind === "applicant" && (!value.record || value.record.deletedAt));
    if (missingApplicant || remote.references.missingMinisterIds.length) {
      // A missing identity cannot support its unsent contracts. Restore each
      // affected contract, then trim only its references from pending lists.
      const writes = new Set(outboxWriteKeys(item));
      const dependentContracts = pending(loadDb(), workspaceId).filter(value => value.type.startsWith("contract.") &&
        (missingApplicant && outboxKeys(value).some(key => writes.has(key)) || remote.references.missingMinisterIds.includes(String(value.payload.ministerId))));
      const dependencies = dependentContracts.flatMap(value => relatedChanges(value, pending(loadDb(), workspaceId)));
      selected = [...new Map([...selected, ...dependencies].map(value => [value.id, value])).values()];
      remote = await readRestoration(selected, workspaceId, item);
    }
    await refreshLocalDb();
    assertIssue(workspaceId, id, expected, action);
    const t = target(item);
    if (action === "delete-local" && remote.restored.some(value => value.kind === t?.kind && value.id === t.id && value.record)) {
      throw new Error("Cet élément existe sur le serveur. Utilisez Actualiser local.");
    }
    if (action === "delete-server") {
      const record = remote.restored.find(value => value.kind === "contract" && value.id === t?.id)?.record as Contract | null | undefined;
      if (!record) throw new Error("Ce contrat est introuvable sur le serveur.");
      await deleteSyncResolutionContract(record, newEditTimestamp());
      remote = await readRestoration(selected, workspaceId, item);
      const deleted = remote.restored.find(value => value.kind === "contract" && value.id === record.id)?.record;
      if (deleted && !deleted.deletedAt) throw new Error("Le contrat a changé. Sa suppression n’a pas été confirmée.");
      await refreshLocalDb();
      assertIssue(workspaceId, id, expected, action);
    }
    const db = loadDb();
    remote.references.apply();
    applyRestoration(db, selected, remote, workspaceId, item);
    saveDb(db);
    await flushLocalDbWrites();
    const missingContracts = new Set(remote.restored.filter(value => value.kind === "contract" && (!value.record || value.record.deletedAt)).map(value => value.id));
    if (missingContracts.size) {
      const userId = session()!.id;
      cachePinnedContracts(userId, readPinnedContracts(userId).filter(contractId => !missingContracts.has(contractId)));
    }
    if (remote.pins) {
      const user = session()!;
      const pins = new Set(remote.pins);
      for (const remaining of pending(db, workspaceId).filter(value => value.type === "pin.set" && value.payload.userId === user.id)) {
        if (remaining.payload.pinned) pins.add(String(remaining.payload.contractId)); else pins.delete(String(remaining.payload.contractId));
      }
      cachePinnedContracts(user.id, [...pins]);
    }
  });
  window.dispatchEvent(new CustomEvent("contribution-offline-sync", { detail: { queued: true } }));
  await syncSupabaseOutbox();
  const unresolved = pending(loadDb(), workspaceId).find(item => item.id === replayId);
  if (unresolved) throw new Error(unresolved.lastError || "Cette modification attend encore sa synchronisation.");
  if (id.startsWith("sync:")) await syncSupabaseWorkspace(workspaceId, { verify: true });
}
