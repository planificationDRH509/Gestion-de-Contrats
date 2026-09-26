import type { AuthUser } from "../../features/auth/auth";
import type { ContractList, ListMember, ListOperation } from "../../features/lists/listModel";
import type { Contract, OutboxItem } from "../types";
import { createId } from "../../lib/uuid";
import { flushLocalDbWrites, loadDb, saveDb, selectDb, type LocalDb } from "./localDb";

export function listSnapshot(list: ContractList) {
  return {
    id: list.id, workspaceId: list.workspaceId, durationMonths: list.durationMonths,
    visaNumber: list.visaNumber, sealed: Boolean(list.sealedAt),
    members: [...list.members].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  };
}

export type QueuedListOperation = {
  actorId: string;
  operation: ListOperation & { createId?: string };
  expectedLists: Record<string, ReturnType<typeof listSnapshot> | null>;
  expectedMemberships: Record<string, string | null>;
  contractIds: string[];
  applicantIds: string[];
};

function memberFromContract(contract: Contract): ListMember {
  return {
    id: contract.id, firstName: contract.firstName, lastName: contract.lastName,
    nif: contract.nif ?? "", position: contract.position,
    salaryNumber: contract.salaryNumber, durationMonths: contract.durationMonths
  };
}

export function readCachedContractLists(workspaceId: string): ContractList[] {
  return selectDb(db => db.contractLists.filter(list => list.workspaceId === workspaceId));
}

export function hasCachedContractLists(workspaceId: string): boolean {
  return selectDb(db => db.cachedListWorkspaces.includes(workspaceId));
}

export function cacheContractLists(workspaceId: string, lists: ContractList[]) {
  const db = loadDb();
  // A download must never replace optimistic lists, including pending deletions.
  if (db.outbox.some(item => item.workspaceId === workspaceId && item.type === "list.operation")) return;
  db.contractLists = [...db.contractLists.filter(list => list.workspaceId !== workspaceId),
    ...lists.filter(list => list.workspaceId === workspaceId)];
  if (!db.cachedListWorkspaces.includes(workspaceId)) db.cachedListWorkspaces.push(workspaceId);
  saveDb(db);
}

/** Keep the same list guards as the server for edits made to offline contracts. */
export function updateListedContract(db: LocalDb, previous: Contract, next: Contract) {
  for (const list of db.contractLists.filter(l => l.workspaceId === previous.workspaceId)) {
    if (!list.members.some(member => member.id === previous.id)) continue;
    if (next.durationMonths !== list.durationMonths || next.workspaceId !== previous.workspaceId) {
      throw new Error("Retirez le contrat de sa liste avant de modifier sa durée.");
    }
    const protectedFields = ["firstName", "lastName", "nif", "ninu", "gender", "address", "salaryNumber", "position", "assignment", "annee_fiscale", "deletedAt"] as const;
    if (list.sealedAt && protectedFields.some(key => (previous[key] ?? null) !== (next[key] ?? null))) {
      throw new Error("Faites rouvrir la liste scellée avant de modifier ce contrat.");
    }
    list.members = next.deletedAt ? list.members.filter(member => member.id !== previous.id)
      : list.members.map(member => member.id === previous.id ? memberFromContract(next) : member);
    list.version += 1;
  }
}

export async function mutateContractListOffline(user: AuthUser, operation: ListOperation): Promise<string | null> {
  if (!["admin", "agent", "controller"].includes(user.role)) throw new Error("Vous n’avez pas le droit de modifier les listes.");
  if ((operation.visaNumber ?? "").trim().length > 120) throw new Error("Le numéro de visa est limité à 120 caractères.");
  const db = loadDb();
  const lists = db.contractLists.filter(list => list.workspaceId === user.workspaceId);
  let id = operation.listId ?? null;
  let target = lists.find(list => list.id === id);
  if (id && !target) throw new Error("Liste introuvable.");
  const expectedLists: QueuedListOperation["expectedLists"] = {};
  const expectedMemberships: QueuedListOperation["expectedMemberships"] = {};
  const affectedContracts = new Set(operation.contractIds ?? []);
  const applicantIds = new Set<string>();
  const remember = (list: ContractList) => {
    if (!(list.id in expectedLists)) expectedLists[list.id] = listSnapshot(structuredClone(list));
    list.members.forEach(member => { affectedContracts.add(member.id); applicantIds.add(member.nif); });
  };
  if (target) remember(target);
  const at = new Date().toISOString();
  const event = { at, actor: user.name, action: operation.action, reason: operation.reason?.trim() };
  if (operation.action === "create") {
    if (!Number.isInteger(operation.durationMonths) || operation.durationMonths! < 1 || operation.durationMonths! > 12) {
      throw new Error("La durée doit être comprise entre 1 et 12 mois.");
    }
    id = createId();
    expectedLists[id] = null;
    target = { id, workspaceId: user.workspaceId, durationMonths: operation.durationMonths!,
      visaNumber: operation.visaNumber?.trim() || null, sealedAt: null, version: 1,
      createdAt: at, history: [event], members: [] };
    lists.push(target);
  }
  if (operation.action === "assign" || (operation.action === "create" && operation.contractIds !== undefined)) {
    const ids = [...new Set(operation.contractIds ?? [])];
    if (!ids.length) throw new Error("Sélectionnez au moins un contrat.");
    if (target?.sealedAt) throw new Error("Faites rouvrir la liste scellée avant de la modifier.");
    const changed = new Set<ContractList>();
    for (const contractId of ids) {
      const contract = db.contracts.find(c => c.id === contractId && c.workspaceId === user.workspaceId && !c.deletedAt);
      if (!contract) throw new Error("Un contrat est introuvable sur cet appareil.");
      if (target && contract.durationMonths !== target.durationMonths) throw new Error("Tous les contrats d’une liste doivent avoir la même durée.");
      const source = lists.find(list => list.members.some(member => member.id === contractId));
      expectedMemberships[contractId] = source?.id ?? null;
      applicantIds.add(contract.nif ?? contract.applicantId ?? "");
      if (source) remember(source);
      if (source?.id === id) continue;
      if (source?.sealedAt) throw new Error("Faites rouvrir la liste scellée avant de déplacer ses contrats.");
      if (source) { source.members = source.members.filter(member => member.id !== contractId); changed.add(source); }
      if (target) { target.members.push(memberFromContract(contract)); changed.add(target); }
    }
    for (const list of changed) {
      list.version += 1;
      list.history.push({ ...event, action: "assign", reason: `${ids.length} contrat(s) · destination : ${id ?? "sans liste"}` });
    }
  } else if (operation.action !== "create") {
    if (!target) throw new Error("Liste introuvable.");
    if (target.version !== operation.version) throw new Error("La liste a changé. Actualisez-la avant de continuer.");
    if (operation.action === "reopen") {
      if (user.role !== "admin") throw new Error("Seul un administrateur peut rouvrir une liste.");
      if (!target.sealedAt || !operation.reason?.trim()) throw new Error("Indiquez le motif de réouverture.");
      target.sealedAt = null;
    } else {
      if (target.sealedAt) throw new Error("Faites rouvrir la liste scellée avant de la modifier.");
      if (operation.action === "visa") target.visaNumber = operation.visaNumber?.trim() || null;
      else if (operation.action === "seal") {
        if (!target.members.length) throw new Error("Une liste vide ne peut pas être scellée.");
        target.sealedAt = at;
      } else if (operation.action === "delete") {
        if (target.members.length) throw new Error("Retirez les contrats avant de supprimer la liste.");
        lists.splice(lists.indexOf(target), 1);
      } else throw new Error("Action inconnue.");
    }
    target.version += 1;
    target.history.push(event);
  }
  const payload: QueuedListOperation = {
    actorId: user.id, operation: { ...operation, ...(operation.action === "create" ? { createId: id! } : {}) },
    expectedLists, expectedMemberships, contractIds: [...affectedContracts], applicantIds: [...applicantIds]
  };
  const item: OutboxItem = { id: createId(), workspaceId: user.workspaceId, type: "list.operation", payload, createdAt: at, actorId: user.id, sequence: Math.max(0, ...db.outbox.map(item => item.sequence ?? 0)) + 1 };
  db.contractLists = [...db.contractLists.filter(list => list.workspaceId !== user.workspaceId), ...lists];
  if (!db.cachedListWorkspaces.includes(user.workspaceId)) db.cachedListWorkspaces.push(user.workspaceId);
  db.outbox.push(item);
  saveDb(db);
  await flushLocalDbWrites();
  window.dispatchEvent(new CustomEvent("contribution-offline-sync", { detail: { queued: true } }));
  return id;
}
