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
import { loadDb, saveDb } from "./localDb";
import { queueOutbox } from "./localOutbox";
import { matchesContractDateFilter } from "../../lib/contractDateFilters";
import { formatFirstName, formatLastName } from "../../lib/format";

function now() {
  return new Date().toISOString();
}

function matchesQuery(contract: Contract, query: string) {
  const normalized = query.toLowerCase();
  return [
    contract.firstName,
    contract.lastName,
    contract.nif ?? "",
    contract.ninu ?? "",
    contract.position,
    contract.assignment
  ].some((value) => value.toLowerCase().includes(normalized));
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

function withTags(contract: Contract, db: ReturnType<typeof loadDb>): Contract {
  const links = db.contractTags.filter((link) => link.contractId === contract.id);
  const tags = links
    .map((link) => db.tags.find((tag) => tag.id === link.tagId && !tag.deletedAt))
    .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
  return { ...contract, tags: tags.length > 0 ? tags : contract.tags ?? [] };
}

export class LocalContractRepository implements ContractRepository {
  async list(params: ContractListParams): Promise<ContractListResult> {
    const db = loadDb();
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;

    let items = db.contracts.map((contract) => withTags(contract, db)).filter(
      (contract) =>
        contract.workspaceId === params.workspaceId && !contract.deletedAt
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
      items = items.filter((contract) =>
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
    const paged = items.slice(start, start + pageSize);

    return { items: paged, total, page, pageSize };
  }

  async getById(id: string): Promise<Contract | null> {
    const db = loadDb();
    const contract = db.contracts.find((item) => item.id === id && !item.deletedAt);
    return contract ? withTags(contract, db) : null;
  }

  async getByIds(ids: string[], workspaceId: string): Promise<Contract[]> {
    const db = loadDb();
    const set = new Set(ids);
    return db.contracts.map((contract) => withTags(contract, db)).filter(
      (contract) =>
        contract.workspaceId === workspaceId &&
        !contract.deletedAt &&
        set.has(contract.id)
    );
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
      updatedAt: timestamp
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
    const updated: Contract = {
      ...db.contracts[contractIndex],
      ...input,
      firstName: input.firstName ? formatFirstName(input.firstName) : db.contracts[contractIndex].firstName,
      lastName: input.lastName ? formatLastName(input.lastName) : db.contracts[contractIndex].lastName,
      dossierId:
        input.dossierId !== undefined
          ? input.dossierId
          : db.contracts[contractIndex].dossierId ?? null,
      updatedAt: now()
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

    db.contracts = db.contracts.map((contract) => {
      const shouldUpdate =
        contract.workspaceId === workspaceId &&
        !contract.deletedAt &&
        idSet.has(contract.id);
      if (!shouldUpdate) {
        return contract;
      }

      updatedCount += 1;
      return {
        ...contract,
        dossierId,
        updatedAt: now()
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

    db.contracts = db.contracts.map((contract) => {
      const shouldUpdate =
        contract.workspaceId === workspaceId &&
        !contract.deletedAt &&
        idSet.has(contract.id);
      if (!shouldUpdate) {
        return contract;
      }

      updatedCount += 1;
      return {
        ...contract,
        status,
        updatedAt: now()
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

    db.contracts = db.contracts.map((contract) => {
      const shouldUpdate =
        contract.workspaceId === workspaceId &&
        !contract.deletedAt &&
        idSet.has(contract.id);
      if (!shouldUpdate) {
        return contract;
      }

      updatedCount += 1;
      return {
        ...contract,
        durationMonths,
        updatedAt: now()
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
    db.contracts[contractIndex] = {
      ...db.contracts[contractIndex],
      deletedAt: now(),
      updatedAt: now()
    };
    saveDb(db);
    if (shouldQueue) queueOutbox(workspaceId, "contract.delete", { id });
  }
}
