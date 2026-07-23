import { ContractRepository } from "../repositories/ContractRepository";
import {
  Contract,
  ContractListParams,
  ContractListResult,
  ContractStatus,
  CreateContractInput,
  UpdateContractInput
} from "../types";
import { createId } from "../../lib/uuid";
import { loadDb, saveDb, selectDb, type LocalDb } from "./localDb";
import { queueOutbox } from "./localOutbox";
import { matchesContractDateFilter } from "../../lib/contractDateFilters";
import { formatFirstName, formatLastName } from "../../lib/format";
import { matchesContractSearch } from "../../lib/personSearch";
import {
  appendContractAuditEntry,
  buildContractAuditChanges,
  createContractAuditHistory,
  inferAuditAction
} from "../../lib/contractAudit";

function now() {
  return new Date().toISOString();
}

function matchesQuery(contract: Contract, query: string) {
  return matchesContractSearch(contract, query);
}

function sortContracts(contracts: Contract[], sort?: ContractListParams["sort"]) {
  const sorted = [...contracts];
  switch (sort) {
    case "createdAt_asc":
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "name_asc":
      return sorted.sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
      );
    case "name_desc":
      return sorted.sort((a, b) =>
        `${b.lastName} ${b.firstName}`.localeCompare(`${a.lastName} ${a.firstName}`)
      );
    case "createdAt_desc":
    default:
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function withTags(contract: Contract, db: LocalDb): Contract {
  const links = db.contractTags.filter((link) => link.contractId === contract.id);
  const tags = links
    .map((link) => db.tags.find((tag) => tag.id === link.tagId && !tag.deletedAt))
    .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
  return { ...contract, tags: tags.length > 0 ? tags : contract.tags ?? [] };
}

/** Returns the immediately available offline page without touching the network. */
export function readCachedContracts(params: ContractListParams): ContractListResult {
  return selectDb((db) => {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;

    let items = db.contracts.filter(
      (contract) => contract.workspaceId === params.workspaceId && !contract.deletedAt
    );

    if (params.onlyMine && params.userId) {
      items = items.filter((contract) => contract.createdBy === params.userId);
    }

    if (params.query) {
      items = items.filter((contract) => matchesQuery(contract, params.query ?? ""));
    }

    if (params.status) {
      items = items.filter((contract) => contract.status === params.status);
    }

    if (params.dossierId !== undefined) {
      items = items.filter((contract) => (contract.dossierId ?? null) === params.dossierId);
    }

    if (params.tagId) {
      const linkedContractIds = new Set(
        db.contractTags
          .filter((link) => link.tagId === params.tagId)
          .map((link) => link.contractId)
      );
      items = items.filter((contract) =>
        linkedContractIds.has(contract.id) ||
        (contract.tags ?? []).some((tag) => tag.id === params.tagId)
      );
    }

    if (params.assignments && params.assignments.length > 0) {
      items = items.filter((contract) => params.assignments!.includes(contract.assignment));
    }

    if (params.positions && params.positions.length > 0) {
      items = items.filter((contract) => params.positions!.includes(contract.position));
    }

    if (params.dateFilterMode && params.dateFilterMode !== "all") {
      items = items.filter((contract) =>
        matchesContractDateFilter(contract, params.dateFilterMode, {
          dayDateInput: params.dateFilterDate,
          rangeStartInput: params.dateFilterStart,
          rangeEndInput: params.dateFilterEnd
        })
      );
    }

    const total = items.length;
    items = sortContracts(items, params.sort);
    const start = (page - 1) * pageSize;

    return {
      items: items.slice(start, start + pageSize).map((contract) => withTags(contract, db)),
      total,
      page,
      pageSize
    };
  });
}

export function readCachedContract(id: string): Contract | null {
  return selectDb((db) => {
    const contract = db.contracts.find((item) => item.id === id && !item.deletedAt);
    return contract ? withTags(contract, db) : null;
  });
}

export function readCachedContractsByIds(ids: string[], workspaceId: string): Contract[] {
  const idSet = new Set(ids);
  return selectDb((db) =>
    db.contracts.filter(
      (contract) =>
        contract.workspaceId === workspaceId &&
        !contract.deletedAt &&
        idSet.has(contract.id)
    ).map((contract) => withTags(contract, db))
  );
}

export class LocalContractRepository implements ContractRepository {
  async list(params: ContractListParams): Promise<ContractListResult> {
    return readCachedContracts(params);
  }

  async getById(id: string): Promise<Contract | null> {
    return readCachedContract(id);
  }

  async getByIds(ids: string[], workspaceId: string): Promise<Contract[]> {
    return readCachedContractsByIds(ids, workspaceId);
  }

  async create(input: CreateContractInput): Promise<Contract> {
    const db = loadDb();
    const timestamp = now();
    const contract: Contract = {
      ...input,
      firstName: formatFirstName(input.firstName),
      lastName: formatLastName(input.lastName),
      dossierId: input.dossierId ?? null,
      id: createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      auditHistory:
        input.auditHistory ?? createContractAuditHistory(undefined, timestamp)
    };
    db.contracts.push(contract);
    saveDb(db);
    queueOutbox(input.workspaceId, "contract.create", contract);
    return contract;
  }

  async createMany(inputs: CreateContractInput[]): Promise<Contract[]> {
    const created: Contract[] = [];
    for (const input of inputs) {
      created.push(await this.create(input));
    }
    return created;
  }

  async update(input: UpdateContractInput): Promise<Contract> {
    const db = loadDb();
    const contractIndex = db.contracts.findIndex((contract) => contract.id === input.id);
    if (contractIndex === -1) {
      throw new Error("Contrat introuvable");
    }
    const previous = db.contracts[contractIndex];
    const timestamp = now();
    const nextValues: Partial<Contract> = {
      ...input,
      firstName: input.firstName ? formatFirstName(input.firstName) : previous.firstName,
      lastName: input.lastName ? formatLastName(input.lastName) : previous.lastName,
      dossierId:
        input.dossierId !== undefined
          ? input.dossierId
          : previous.dossierId ?? null
    };
    const changes = buildContractAuditChanges(previous, nextValues);
    const updated: Contract = {
      ...previous,
      ...input,
      ...nextValues,
      updatedAt: timestamp,
      auditHistory: appendContractAuditEntry(previous.auditHistory, {
        action: inferAuditAction(changes),
        changes,
        at: timestamp
      })
    };
    db.contracts[contractIndex] = updated;
    saveDb(db);
    queueOutbox(updated.workspaceId, "contract.update", updated);
    return updated;
  }

  async assignToDossier(
    workspaceId: string,
    contractIds: string[],
    dossierId: string | null
  ): Promise<number> {
    return this.applyAssignToDossier(workspaceId, contractIds, dossierId, true);
  }

  async applyAssignToDossier(
    workspaceId: string,
    contractIds: string[],
    dossierId: string | null,
    shouldQueue = false
  ): Promise<number> {
    if (contractIds.length === 0) {
      return 0;
    }

    const db = loadDb();
    const idSet = new Set(contractIds);
    let updatedCount = 0;

    const timestamp = now();
    db.contracts = db.contracts.map((contract) => {
      const shouldUpdate =
        contract.workspaceId === workspaceId &&
        !contract.deletedAt &&
        idSet.has(contract.id);
      if (!shouldUpdate) {
        return contract;
      }

      updatedCount += 1;
      const changes = buildContractAuditChanges(contract, { dossierId });
      return {
        ...contract,
        dossierId,
        updatedAt: timestamp,
        auditHistory: appendContractAuditEntry(contract.auditHistory, {
          action: "dossier",
          changes,
          at: timestamp
        })
      };
    });

    if (updatedCount > 0) {
      saveDb(db);
      if (shouldQueue) queueOutbox(workspaceId, "contract.update", {
        contractIds,
        dossierId
      });
    }

    return updatedCount;
  }

  async updateStatus(
    workspaceId: string,
    contractIds: string[],
    status: ContractStatus
  ): Promise<number> {
    return this.applyUpdateStatus(workspaceId, contractIds, status, true);
  }

  async applyUpdateStatus(
    workspaceId: string,
    contractIds: string[],
    status: ContractStatus,
    shouldQueue = false
  ): Promise<number> {
    if (contractIds.length === 0) {
      return 0;
    }

    const db = loadDb();
    const idSet = new Set(contractIds);
    let updatedCount = 0;

    const timestamp = now();
    db.contracts = db.contracts.map((contract) => {
      const shouldUpdate =
        contract.workspaceId === workspaceId &&
        !contract.deletedAt &&
        idSet.has(contract.id);
      if (!shouldUpdate) {
        return contract;
      }

      updatedCount += 1;
      const changes = buildContractAuditChanges(contract, { status });
      return {
        ...contract,
        status,
        updatedAt: timestamp,
        auditHistory: appendContractAuditEntry(contract.auditHistory, {
          action: "status",
          changes,
          at: timestamp
        })
      };
    });

    if (updatedCount > 0) {
      saveDb(db);
      if (shouldQueue) queueOutbox(workspaceId, "contract.update", {
        contractIds,
        status
      });
    }

    return updatedCount;
  }

  async updateDuration(
    workspaceId: string,
    contractIds: string[],
    durationMonths: number
  ): Promise<number> {
    return this.applyUpdateDuration(workspaceId, contractIds, durationMonths, true);
  }

  async applyUpdateDuration(
    workspaceId: string,
    contractIds: string[],
    durationMonths: number,
    shouldQueue = false
  ): Promise<number> {
    if (contractIds.length === 0) {
      return 0;
    }

    const db = loadDb();
    const idSet = new Set(contractIds);
    let updatedCount = 0;

    const timestamp = now();
    db.contracts = db.contracts.map((contract) => {
      const shouldUpdate =
        contract.workspaceId === workspaceId &&
        !contract.deletedAt &&
        idSet.has(contract.id);
      if (!shouldUpdate) {
        return contract;
      }

      updatedCount += 1;
      const changes = buildContractAuditChanges(contract, { durationMonths });
      return {
        ...contract,
        durationMonths,
        updatedAt: timestamp,
        auditHistory: appendContractAuditEntry(contract.auditHistory, {
          action: "duration",
          changes,
          at: timestamp
        })
      };
    });

    if (updatedCount > 0) {
      saveDb(db);
      if (shouldQueue) queueOutbox(workspaceId, "contract.update", {
        contractIds,
        durationMonths
      });
    }

    return updatedCount;
  }

  async softDelete(id: string, workspaceId: string): Promise<void> {
    await this.applySoftDelete(id, workspaceId, true);
  }

  async applySoftDelete(id: string, workspaceId: string, shouldQueue = false): Promise<void> {
    const db = loadDb();
    const contractIndex = db.contracts.findIndex(
      (contract) => contract.id === id && contract.workspaceId === workspaceId
    );
    if (contractIndex === -1) {
      return;
    }
    const timestamp = now();
    const previous = db.contracts[contractIndex];
    db.contracts[contractIndex] = {
      ...previous,
      deletedAt: timestamp,
      updatedAt: timestamp,
      auditHistory: appendContractAuditEntry(previous.auditHistory, {
        action: "deletion",
        changes: [],
        at: timestamp
      })
    };
    saveDb(db);
    if (shouldQueue) queueOutbox(workspaceId, "contract.delete", { id });
  }
}
