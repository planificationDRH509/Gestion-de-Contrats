import {
  Applicant,
  Contract,
  ContractListParams,
  CreateContractInput,
  Dossier,
  OutboxItem,
  Tag,
  UpsertApplicantInput
} from "../types";
import { createId } from "../../lib/uuid";
import { formatFirstName, formatLastName } from "../../lib/format";
import { loadDb, saveDb } from "./localDb";
import { queueOutbox } from "./localOutbox";

function now() {
  return new Date().toISOString();
}

export function isOfflineFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/failed to fetch|network|fetch|load failed|internet|offline/.test(message)) {
    return true;
  }
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;
  return cause !== undefined && cause !== error ? isOfflineFailure(cause) : false;
}

export function cacheApplicant(applicant: Applicant) {
  const db = loadDb();
  const index = db.applicants.findIndex((item) => item.id === applicant.id);
  if (index >= 0) {
    db.applicants[index] = applicant;
  } else {
    db.applicants.push(applicant);
  }
  saveDb(db);
}

export function cacheApplicants(applicants: Applicant[]) {
  if (applicants.length === 0) return;
  const db = loadDb();
  const byId = new Map(db.applicants.map((applicant, index) => [applicant.id, index]));
  for (const applicant of applicants) {
    const index = byId.get(applicant.id);
    if (index === undefined) {
      db.applicants.push(applicant);
      byId.set(applicant.id, db.applicants.length - 1);
    } else {
      db.applicants[index] = applicant;
    }
  }
  saveDb(db);
}

export function replaceLocalApplicantId(
  workspaceId: string,
  fromId: string,
  applicant: Applicant
) {
  const db = loadDb();
  db.applicants = db.applicants.filter(
    (item) => !(item.workspaceId === workspaceId && item.id === fromId)
  );
  const existingIndex = db.applicants.findIndex((item) => item.id === applicant.id);
  if (existingIndex >= 0) db.applicants[existingIndex] = applicant;
  else db.applicants.push(applicant);
  db.contracts = db.contracts.map((contract) =>
    contract.workspaceId === workspaceId &&
    (contract.applicantId === fromId || contract.nif === fromId)
      ? { ...contract, applicantId: applicant.id, nif: applicant.nif ?? applicant.id }
      : contract
  );
  saveDb(db);
}

export function cacheContracts(contracts: Contract[]) {
  if (contracts.length === 0) return;
  const db = loadDb();
  const byId = new Map(db.contracts.map((contract, index) => [contract.id, index]));
  const tagById = new Map(db.tags.map((tag, index) => [tag.id, index]));
  for (const contract of contracts) {
    const index = byId.get(contract.id);
    if (index === undefined) {
      db.contracts.push(contract);
    } else {
      db.contracts[index] = contract;
    }

    const remoteTagIds = new Set((contract.tags ?? []).map((tag) => tag.id));
    db.contractTags = db.contractTags.filter(
      (link) => link.contractId !== contract.id || remoteTagIds.has(link.tagId)
    );

    for (const tag of contract.tags ?? []) {
      const tagIndex = tagById.get(tag.id);
      if (tagIndex === undefined) {
        db.tags.push(tag);
        tagById.set(tag.id, db.tags.length - 1);
      } else {
        db.tags[tagIndex] = tag;
      }
      const hasLink = db.contractTags.some(
        (link) => link.contractId === contract.id && link.tagId === tag.id
      );
      if (!hasLink) {
        db.contractTags.push({
          contractId: contract.id,
          tagId: tag.id,
          createdAt: new Date().toISOString()
        });
      }
    }
  }
  saveDb(db);
}

export function cacheContract(contract: Contract) {
  cacheContracts([contract]);
}

export function cacheDossiers(dossiers: Dossier[]) {
  if (dossiers.length === 0) return;
  const db = loadDb();
  const byId = new Map(db.dossiers.map((dossier, index) => [dossier.id, index]));
  for (const dossier of dossiers) {
    const index = byId.get(dossier.id);
    if (index === undefined) {
      db.dossiers.push(dossier);
    } else {
      db.dossiers[index] = dossier;
    }
  }
  saveDb(db);
}

export function cacheDossier(dossier: Dossier) {
  cacheDossiers([dossier]);
}

export function cacheTags(tags: Tag[]) {
  if (tags.length === 0) return;
  const db = loadDb();
  const byId = new Map(db.tags.map((tag, index) => [tag.id, index]));
  for (const tag of tags) {
    const index = byId.get(tag.id);
    if (index === undefined) {
      db.tags.push(tag);
    } else {
      db.tags[index] = tag;
    }
  }
  saveDb(db);
}

export function cacheTag(tag: Tag) {
  cacheTags([tag]);
}

export function replaceLocalTagId(workspaceId: string, fromId: string, toTag: Tag) {
  if (!fromId || fromId === toTag.id) return;

  const db = loadDb();
  db.tags = db.tags.filter((tag) => !(tag.workspaceId === workspaceId && tag.id === fromId));
  const existingIndex = db.tags.findIndex((tag) => tag.id === toTag.id);
  if (existingIndex >= 0) {
    db.tags[existingIndex] = toTag;
  } else {
    db.tags.push(toTag);
  }

  db.contractTags = db.contractTags.map((link) =>
    link.tagId === fromId ? { ...link, tagId: toTag.id } : link
  );
  db.contracts = db.contracts.map((contract) => ({
    ...contract,
    tags: (contract.tags ?? []).map((tag) => (tag.id === fromId ? toTag : tag))
  }));
  db.outbox = db.outbox.map((item) => {
    if (item.workspaceId !== workspaceId || (item.type !== "tag.assign" && item.type !== "tag.remove")) {
      return item;
    }
    const payload = item.payload as { tagId?: string };
    if (payload.tagId !== fromId) {
      return item;
    }
    return {
      ...item,
      payload: {
        ...item.payload,
        tagId: toTag.id
      }
    };
  });
  saveDb(db);
}

export function replaceLocalDossierId(workspaceId: string, fromId: string, toDossier: Dossier) {
  if (!fromId || fromId === toDossier.id) return;

  const db = loadDb();
  db.dossiers = db.dossiers.filter(
    (dossier) => !(dossier.workspaceId === workspaceId && dossier.id === fromId)
  );
  const existingIndex = db.dossiers.findIndex((dossier) => dossier.id === toDossier.id);
  if (existingIndex >= 0) {
    db.dossiers[existingIndex] = toDossier;
  } else {
    db.dossiers.push(toDossier);
  }

  db.contracts = db.contracts.map((contract) =>
    contract.workspaceId === workspaceId && contract.dossierId === fromId
      ? { ...contract, dossierId: toDossier.id }
      : contract
  );
  db.outbox = db.outbox.map((item) => {
    if (
      item.workspaceId !== workspaceId ||
      (item.type !== "contract.create" && item.type !== "contract.update")
    ) {
      return item;
    }
    const payload = item.payload as { dossierId?: string | null };
    if (payload.dossierId !== fromId) {
      return item;
    }
    return {
      ...item,
      payload: {
        ...item.payload,
        dossierId: toDossier.id
      }
    };
  });
  saveDb(db);
}

export function upsertApplicantOffline(input: UpsertApplicantInput): Applicant {
  const db = loadDb();
  const timestamp = now();
  const normalizedNif = input.nif?.trim() || "";
  const normalizedNinu = input.ninu?.trim() || "";
  const existing = input.id
    ? db.applicants.find((applicant) => applicant.id === input.id)
    : db.applicants.find((applicant) => {
        if (applicant.workspaceId !== input.workspaceId || applicant.deletedAt) return false;
        return Boolean(
          (normalizedNif && applicant.nif?.trim() === normalizedNif) ||
            (normalizedNinu && applicant.ninu?.trim() === normalizedNinu)
        );
      });

  const nextId = normalizedNif || existing?.id || input.id || createId();
  const duplicate = db.applicants.find(
    (applicant) =>
      applicant.id !== existing?.id &&
      applicant.workspaceId === input.workspaceId &&
      !applicant.deletedAt &&
      (applicant.id === nextId ||
        Boolean(normalizedNinu && applicant.ninu?.trim() === normalizedNinu))
  );
  if (duplicate) {
    throw new Error("Ce NIF ou ce NINU appartient déjà à une autre personne.");
  }

  const applicant: Applicant = {
    ...(existing ?? {
      id: normalizedNif || input.id || createId(),
      workspaceId: input.workspaceId,
      createdAt: timestamp
    }),
    id: nextId,
    gender: input.gender,
    firstName: formatFirstName(input.firstName),
    lastName: formatLastName(input.lastName),
    nif: input.nif ?? null,
    ninu: input.ninu ?? null,
    address: input.address,
    updatedAt: timestamp,
    deletedAt: null,
    createdBy: input.createdBy
  };

  const index = db.applicants.findIndex((item) => item.id === applicant.id);
  if (existing && existing.id !== applicant.id) {
    const oldIndex = db.applicants.findIndex((item) => item.id === existing.id);
    if (oldIndex >= 0) db.applicants.splice(oldIndex, 1);
    db.contracts = db.contracts.map((contract) =>
      contract.workspaceId === input.workspaceId &&
      (contract.applicantId === existing.id || contract.nif === existing.id)
        ? {
            ...contract,
            applicantId: applicant.id,
            nif: applicant.nif,
            updatedAt: timestamp
          }
        : contract
    );
  }
  if (index >= 0) {
    db.applicants[index] = applicant;
  } else {
    db.applicants.push(applicant);
  }
  saveDb(db);
  queueOutbox(input.workspaceId, "applicant.upsert", input as Record<string, unknown>);
  return applicant;
}

export function deleteApplicantOffline(id: string, workspaceId: string) {
  const db = loadDb();
  const index = db.applicants.findIndex(
    (applicant) => applicant.id === id && applicant.workspaceId === workspaceId
  );
  if (index === -1) return;
  const timestamp = now();
  db.applicants[index] = {
    ...db.applicants[index],
    deletedAt: timestamp,
    updatedAt: timestamp
  };
  saveDb(db);
  queueOutbox(workspaceId, "applicant.delete", { id });
}

export function getPendingOutbox(): OutboxItem[] {
  return loadDb().outbox.filter((item) => !item.syncedAt);
}

export function removeOutboxItem(id: string) {
  const db = loadDb();
  db.outbox = db.outbox.filter((item) => item.id !== id);
  saveDb(db);
}

export function getPendingContractIds(): Set<string> {
  const ids = new Set<string>();
  for (const item of getPendingOutbox()) {
    if (!item.type.startsWith("contract.")) continue;
    const payload = item.payload as Partial<Contract> & {
      id?: string;
      contractIds?: string[];
    };
    if (payload.id) ids.add(payload.id);
    if (Array.isArray(payload.contractIds)) {
      payload.contractIds.forEach((id) => ids.add(id));
    }
  }
  return ids;
}

export function getPendingOutboxCount(workspaceId?: string): number {
  return getPendingOutbox().filter(
    (item) => !workspaceId || item.workspaceId === workspaceId
  ).length;
}

export function setWorkspaceSyncMetadata(
  workspaceId: string,
  metadata: { lastSyncedAt?: string | null; lastError?: string | null }
) {
  const db = loadDb();
  db.syncMetadata[workspaceId] = {
    ...db.syncMetadata[workspaceId],
    ...metadata
  };
  saveDb(db);
}

export function getWorkspaceSyncMetadata(workspaceId: string) {
  return loadDb().syncMetadata[workspaceId] ?? {};
}

export function getWorkspaceCacheCounts(workspaceId: string) {
  const db = loadDb();
  return {
    applicants: db.applicants.filter(
      (item) => item.workspaceId === workspaceId && !item.deletedAt
    ).length,
    contracts: db.contracts.filter(
      (item) => item.workspaceId === workspaceId && !item.deletedAt
    ).length,
    dossiers: db.dossiers.filter(
      (item) => item.workspaceId === workspaceId && !item.deletedAt
    ).length,
    tags: db.tags.filter((item) => item.workspaceId === workspaceId && !item.deletedAt).length
  };
}

export function replaceWorkspaceCache(
  workspaceId: string,
  snapshot: {
    applicants: Applicant[];
    contracts: Contract[];
    dossiers: Dossier[];
    tags: Tag[];
  }
) {
  const db = loadDb();
  const pending = db.outbox.filter(
    (item) => item.workspaceId === workspaceId && !item.syncedAt
  );

  const pendingApplicantIds = new Set<string>();
  const pendingContractIds = new Set<string>();
  const pendingDossierIds = new Set<string>();
  const pendingTagIds = new Set<string>();
  const pendingTagContractIds = new Set<string>();

  for (const item of pending) {
    const payload = item.payload as {
      id?: string;
      nif?: string;
      contractId?: string;
      contractIds?: string[];
      tagId?: string;
    };
    if (item.type.startsWith("applicant.")) {
      if (payload.id) pendingApplicantIds.add(payload.id);
      if (payload.nif) pendingApplicantIds.add(payload.nif);
    }
    if (item.type.startsWith("contract.")) {
      if (payload.id) pendingContractIds.add(payload.id);
      payload.contractIds?.forEach((id) => pendingContractIds.add(id));
    }
    if (item.type.startsWith("dossier.") && payload.id) pendingDossierIds.add(payload.id);
    if (item.type === "tag.create" && payload.id) pendingTagIds.add(payload.id);
    if ((item.type === "tag.assign" || item.type === "tag.remove") && payload.contractId) {
      pendingTagContractIds.add(payload.contractId);
    }
  }

  const overlayPending = <T extends { id: string }>(remote: T[], local: T[], ids: Set<string>) => {
    const byId = new Map(remote.map((item) => [item.id, item]));
    local.filter((item) => ids.has(item.id)).forEach((item) => byId.set(item.id, item));
    return Array.from(byId.values());
  };

  const localApplicants = db.applicants.filter((item) => item.workspaceId === workspaceId);
  const localContracts = db.contracts.filter((item) => item.workspaceId === workspaceId);
  const previousWorkspaceContractIds = new Set(localContracts.map((contract) => contract.id));
  const localDossiers = db.dossiers.filter((item) => item.workspaceId === workspaceId);
  const localTags = db.tags.filter((item) => item.workspaceId === workspaceId);
  pendingTagContractIds.forEach((id) => pendingContractIds.add(id));

  db.applicants = [
    ...db.applicants.filter((item) => item.workspaceId !== workspaceId),
    ...overlayPending(snapshot.applicants, localApplicants, pendingApplicantIds)
  ];
  db.contracts = [
    ...db.contracts.filter((item) => item.workspaceId !== workspaceId),
    ...overlayPending(snapshot.contracts, localContracts, pendingContractIds)
  ];
  db.dossiers = [
    ...db.dossiers.filter((item) => item.workspaceId !== workspaceId),
    ...overlayPending(snapshot.dossiers, localDossiers, pendingDossierIds)
  ];
  db.tags = [
    ...db.tags.filter((item) => item.workspaceId !== workspaceId),
    ...overlayPending(snapshot.tags, localTags, pendingTagIds)
  ];

  db.contractTags = db.contractTags.filter(
    (link) => !previousWorkspaceContractIds.has(link.contractId)
  );
  for (const contract of db.contracts.filter((item) => item.workspaceId === workspaceId)) {
    for (const tag of contract.tags ?? []) {
      db.contractTags.push({ contractId: contract.id, tagId: tag.id, createdAt: now() });
    }
  }

  saveDb(db);
}

export function buildOfflineContract(input: CreateContractInput): Contract {
  const timestamp = now();
  return {
    ...input,
    firstName: formatFirstName(input.firstName),
    lastName: formatLastName(input.lastName),
    dossierId: input.dossierId ?? null,
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function matchesWorkspace(params: ContractListParams, contract: Contract): boolean {
  if (contract.workspaceId !== params.workspaceId || contract.deletedAt) return false;
  if (params.onlyMine && params.userId && contract.createdBy !== params.userId) return false;
  return true;
}
