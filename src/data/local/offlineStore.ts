import {
  Applicant,
  Contract,
  ContractListParams,
  CreateContractInput,
  OutboxItem,
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
  for (const contract of contracts) {
    const index = byId.get(contract.id);
    if (index === undefined) {
      db.contracts.push(contract);
    } else {
      db.contracts[index] = contract;
    }
  }
  saveDb(db);
}

export function cacheContract(contract: Contract) {
  cacheContracts([contract]);
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
