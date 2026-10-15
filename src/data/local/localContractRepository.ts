import { newEditTimestamp } from "../latestEdit";
import { repairContractOutbox } from "./repairContractOutbox";
import { projectInstitutionAssignment } from './referenceOverlay';
import { sameImportContract } from "../../features/contracts/contractImportBatch";
import { assertContractDuration } from "../../lib/contractDuration";
import { bindContractMinister, migrateLegacyContract, readMinistersCache } from "../../features/settings/ministersCache";
import { numberToFrenchWords } from "../../lib/numberToFrenchWords";
import { assertNoFiscalYearDuplicate } from "../contractIdentity";
import { getStoredFiscalYear } from "../../features/settings/settingsApi";
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
import { loadDb, saveDb, selectDb, flushLocalDbWrites, type LocalDb } from "./localDb";
import { queueOutbox } from "./localOutbox";
import { getPendingContractIds, removeCachedContract } from "./offlineStore";
import { getContractFiscalYear, matchesContractDateFilter } from "../../lib/contractDateFilters";
import { formatFirstName, formatLastName } from "../../lib/format";
import { matchesContractSearch } from "../../lib/personSearch";
import {
  appendContractAuditEntry,
  buildContractAuditChanges,
  createContractAuditHistory,
  inferAuditAction
} from "../../lib/contractAudit";
import { sortContracts } from "../../lib/contractSorting";
import { assertListStatus, updateListedContract } from "./localListRepository";

function now() {
  return newEditTimestamp();
}

function matchesQuery(contract: Contract, query: string) {
  return matchesContractSearch(contract, query);
}

function withTags(contract: Contract, db: LocalDb): Contract {
  const links = db.contractTags.filter((link) => link.contractId === contract.id);
  const tags = links
    .map((link) => db.tags.find((tag) => tag.id === link.tagId && !tag.deletedAt))
    .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
  return { ...projectInstitutionAssignment(contract), tags: tags.length > 0 ? tags : contract.tags ?? [] };
}

/** Returns the immediately available offline page without touching the network. */
export function readCachedContracts(params: ContractListParams): ContractListResult {
  return selectDb((db) => {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;

    let items = db.contracts.filter((contract) =>
      contract.workspaceId === params.workspaceId &&
      (params.deletionState === "deleted" ? Boolean(contract.deletedAt) : !contract.deletedAt)
    ).map(projectInstitutionAssignment);

    if (params.includeIds) {
      const included = new Set(params.includeIds);
      items = items.filter((contract) => included.has(contract.id));
    }
    if (params.excludeIds?.length) {
      const excluded = new Set(params.excludeIds);
      items = items.filter((contract) => !excluded.has(contract.id));
    }

    if (params.onlyMine && params.userId) {
      items = items.filter((contract) => contract.createdBy === params.userId);
    }

    if (params.createdByIds?.length) {
      const creators = new Set(params.createdByIds);
      items = items.filter((contract) => Boolean(contract.createdBy && creators.has(contract.createdBy)));
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

    if (params.durations?.length) {
      items = items.filter((contract) => params.durations!.includes(contract.durationMonths));
    }

    if (params.fiscalYear) {
      items = items.filter(contract => getContractFiscalYear(contract) === params.fiscalYear);
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
    const start = params.offset ?? (page - 1) * pageSize;

    return {
      items: (params.all ? items : items.slice(start, start + pageSize)).map((contract) => withTags(contract, db)),
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
    assertContractDuration(input.durationMonths);
    input = readMinistersCache() || input.ministerId ? bindContractMinister(input) : migrateLegacyContract(input);
    input = { ...input, annee_fiscale: input.annee_fiscale || getStoredFiscalYear() };
    const db = loadDb();
    assertNoFiscalYearDuplicate(input, db.contracts);
    const timestamp = now();
    const contract: Contract = {
      ...input,
      salaryText: numberToFrenchWords(input.salaryNumber),
      firstName: formatFirstName(input.firstName),
      lastName: formatLastName(input.lastName),
      dossierId: input.dossierId ?? null,
      id: input.id ?? createId(),
      createdAt: timestamp,
      modifiedAt: timestamp, updatedAt: timestamp,
      auditHistory:
        input.auditHistory ?? createContractAuditHistory(undefined, timestamp)
    };
    assertListStatus(db, contract, contract.status);
    db.contracts.push(contract);
    saveDb(db);
    queueOutbox(input.workspaceId, "contract.create", contract);
    await flushLocalDbWrites();
    return contract;
  }

  async createMany(inputs: CreateContractInput[]): Promise<Contract[]> {
    inputs.forEach(input => assertContractDuration(input.durationMonths));
    const created: Contract[] = [];
    for (const input of inputs) {
      created.push(await this.create(input));
    }
    return created;
  }

  async update(input: UpdateContractInput, expected?: Contract): Promise<Contract> {
    if (input.durationMonths !== undefined) assertContractDuration(input.durationMonths);
    const db = loadDb();
    const contractIndex = db.contracts.findIndex((contract) => contract.id === input.id);
    if (contractIndex === -1) {
      throw new Error("Contrat introuvable");
    }
    const previous = db.contracts[contractIndex];
    if (expected && (previous.workspaceId !== expected.workspaceId || previous.updatedAt !== expected.updatedAt || !sameImportContract(withTags(previous, db), expected))) throw new Error("Le contrat a changé. Actualisez le lot avant de réessayer.");
    if (input.ministerId !== undefined && input.ministerId !== previous.ministerId) throw new Error("Le ministre d’un contrat existant ne peut pas être remplacé.");
    const timestamp = now();
    const nextValues: Partial<Contract> = {
      ...input,
      salaryText: numberToFrenchWords(input.salaryNumber ?? previous.salaryNumber),
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
      ministerId: previous.ministerId,
      minister: previous.minister,
      modifiedAt: timestamp, updatedAt: timestamp,
      auditHistory: appendContractAuditEntry(previous.auditHistory, {
        action: inferAuditAction(changes),
        changes,
        at: timestamp
      })
    };
    updateListedContract(db, previous, updated);
    db.contracts[contractIndex] = updated;
    saveDb(db);
    if (!repairContractOutbox(updated.workspaceId, input)) queueOutbox(updated.workspaceId, "contract.update", { ...input, baseContract: previous });
    await flushLocalDbWrites();
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
    const previousContracts = db.contracts.filter(c => c.workspaceId === workspaceId && !c.deletedAt && contractIds.includes(c.id));
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
        modifiedAt: timestamp, updatedAt: timestamp,
        auditHistory: appendContractAuditEntry(contract.auditHistory, {
          action: "dossier",
          changes,
          at: timestamp
        })
      };
    });

    if (updatedCount > 0) {
      saveDb(db);
      if (shouldQueue) for (const before of previousContracts) queueOutbox(workspaceId, "contract.update", {
        id: before.id, dossierId, baseContract: before
      });
    }

    await flushLocalDbWrites();
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
    const changesToQueue: Array<{ id: string; previousStatus: ContractStatus }> = [];
    let updatedCount = 0;

    const timestamp = now();
    db.contracts = db.contracts.map((contract) => {
      const shouldUpdate =
        contract.workspaceId === workspaceId &&
        !contract.deletedAt &&
        idSet.has(contract.id);
      if (!shouldUpdate || contract.status === status) {
        return contract;
      }

      if (shouldQueue) assertListStatus(db, contract, status);
      changesToQueue.push({ id: contract.id, previousStatus: contract.status });
      updatedCount += 1;
      const changes = buildContractAuditChanges(contract, { status });
      return {
        ...contract,
        status,
        modifiedAt: timestamp, updatedAt: timestamp,
        auditHistory: appendContractAuditEntry(contract.auditHistory, {
          action: "status",
          changes,
          at: timestamp
        })
      };
    });

    if (updatedCount > 0) {
      saveDb(db);
      if (shouldQueue) {
        // One action per contract makes partial batch retries safe.
        for (const change of changesToQueue) {
          queueOutbox(workspaceId, "contract.update", {
            contractIds: [change.id],
            status,
            previousStatus: change.previousStatus,
            changedAt: timestamp
          });
        }
        await flushLocalDbWrites();
      }
    }

    await flushLocalDbWrites();
    return updatedCount;
  }

  async updateDuration(
    workspaceId: string,
    contractIds: string[],
    durationMonths: number
  ): Promise<number> {
    assertContractDuration(durationMonths);
    return this.applyUpdateDuration(workspaceId, contractIds, durationMonths, true);
  }

  async applyUpdateDuration(
    workspaceId: string,
    contractIds: string[],
    durationMonths: number,
    shouldQueue = false
  ): Promise<number> {
    assertContractDuration(durationMonths);
    if (contractIds.length === 0) {
      return 0;
    }

    const db = loadDb();
    const previousContracts = db.contracts.filter(c => c.workspaceId === workspaceId && !c.deletedAt && contractIds.includes(c.id));
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
      if (shouldQueue) updateListedContract(db, contract, { ...contract, durationMonths });
      return {
        ...contract,
        durationMonths,
        modifiedAt: timestamp, updatedAt: timestamp,
        auditHistory: appendContractAuditEntry(contract.auditHistory, {
          action: "duration",
          changes,
          at: timestamp
        })
      };
    });

    if (updatedCount > 0) {
      saveDb(db);
      if (shouldQueue) for (const before of previousContracts) queueOutbox(workspaceId, "contract.update", {
        id: before.id, durationMonths, baseContract: before
      });
    }

    await flushLocalDbWrites();
    return updatedCount;
  }

  async softDelete(id: string, workspaceId: string, expected?: Contract): Promise<void> {
    const current = readCachedContract(id);
    if (expected && (!current || current.workspaceId !== workspaceId || current.updatedAt !== expected.updatedAt || !sameImportContract(current, expected))) throw new Error("Le contrat a changé. Actualisez le lot avant de réessayer.");
    await this.applySoftDelete(id, workspaceId, true);
  }

  async permanentlyDelete(id: string, workspaceId: string): Promise<void> {
    const contract = loadDb().contracts.find(item => item.id === id && item.workspaceId === workspaceId);
    if (!contract?.deletedAt) throw new Error("Ce contrat n’est plus dans la corbeille. Actualisez la page.");
    if (getPendingContractIds().has(id)) throw new Error("Synchronisez les modifications de ce contrat avant de le supprimer définitivement.");
    removeCachedContract(id, workspaceId);
    await flushLocalDbWrites();
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
    if (shouldQueue) updateListedContract(db, previous, { ...previous, deletedAt: timestamp });
    db.contracts[contractIndex] = {
      ...previous,
      deletedAt: timestamp,
      status: previous.status === "liste" ? "saisie" : previous.status,
      modifiedAt: timestamp, updatedAt: timestamp,
      auditHistory: appendContractAuditEntry(previous.auditHistory, {
        action: "deletion",
        changes: [],
        at: timestamp
      })
    };
    saveDb(db);
    if (shouldQueue) queueOutbox(workspaceId, "contract.delete", { id, baseContract: previous });
    await flushLocalDbWrites();
  }
}
