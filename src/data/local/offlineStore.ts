import {
  Applicant,
  Contract,
  ContractListParams,
  CreateContractInput,
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
  return /failed to fetch|network|fetch|load failed|internet|offline/.test(message);
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

  const applicant: Applicant = {
    ...(existing ?? {
      id: input.id || normalizedNif || createId(),
      workspaceId: input.workspaceId,
      createdAt: timestamp
    }),
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
  if (index >= 0) {
    db.applicants[index] = applicant;
  } else {
    db.applicants.push(applicant);
  }
  saveDb(db);
  queueOutbox(input.workspaceId, "applicant.upsert", input as Record<string, unknown>);
  return applicant;
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
