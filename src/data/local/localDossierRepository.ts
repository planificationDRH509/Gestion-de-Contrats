import { DossierRepository } from "../repositories/DossierRepository";
import { CreateDossierInput, Dossier, UpdateDossierInput } from "../types";
import { createId } from "../../lib/uuid";
import { loadDb, saveDb, selectDb } from "./localDb";
import { queueOutbox } from "./localOutbox";
import {
  normalizeDossierName,
  normalizeDossierStatus,
  normalizeNonNegativeInteger,
  normalizeOptionalDate,
  normalizeOptionalText
} from "../../lib/dossier";

function now() {
  return new Date().toISOString();
}

export function readCachedDossiers(workspaceId: string): Dossier[] {
  return selectDb((db) =>
    db.dossiers
      .filter((dossier) => dossier.workspaceId === workspaceId && !dossier.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );
}

export function readCachedDossier(id: string): Dossier | null {
  return selectDb(
    (db) => db.dossiers.find((dossier) => dossier.id === id && !dossier.deletedAt) ?? null
  );
}

export class LocalDossierRepository implements DossierRepository {
  async list(workspaceId: string): Promise<Dossier[]> {
    return readCachedDossiers(workspaceId);
  }

  async getById(id: string): Promise<Dossier | null> {
    return readCachedDossier(id);
  }

  async create(input: CreateDossierInput): Promise<Dossier> {
    return this.applyCreate(input, true);
  }

  async applyCreate(
    input: CreateDossierInput & {
      id?: string;
      createdAt?: string;
      updatedAt?: string;
      deletedAt?: string | null;
    },
    shouldQueue = false
  ): Promise<Dossier> {
    const db = loadDb();
    const name = normalizeDossierName(input.name);
    const existing = db.dossiers.find(
      (dossier) =>
        dossier.workspaceId === input.workspaceId &&
        !dossier.deletedAt &&
        dossier.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    );
    if (existing) {
      return existing;
    }

    const timestamp = now();
    const dossier: Dossier = {
      id: input.id || createId(),
      workspaceId: input.workspaceId,
      name,
      status: normalizeDossierStatus(input.status),
      isEphemeral: input.isEphemeral ?? false,
      priority: input.priority ?? "normal",
      contractTargetCount: normalizeNonNegativeInteger(input.contractTargetCount),
      comment: normalizeOptionalText(input.comment),
      deadlineDate: normalizeOptionalDate(input.deadlineDate),
      focalPoint: normalizeOptionalText(input.focalPoint),
      roadmapSheetNumber: normalizeOptionalText(input.roadmapSheetNumber),
      defaultDurationMonths: input.defaultDurationMonths ?? null,
      createdAt: input.createdAt ?? timestamp,
      updatedAt: input.updatedAt ?? timestamp,
      deletedAt: input.deletedAt ?? null,
      createdBy: input.createdBy ?? null
    };
    db.dossiers.push(dossier);
    saveDb(db);
    if (shouldQueue) {
      queueOutbox(input.workspaceId, "dossier.create", dossier as unknown as Record<string, unknown>);
    }
    return dossier;
  }

  async update(input: UpdateDossierInput): Promise<Dossier> {
    return this.applyUpdate(input, true);
  }

  async applyUpdate(input: UpdateDossierInput, shouldQueue = false): Promise<Dossier> {
    const db = loadDb();
    const index = db.dossiers.findIndex(
      (dossier) =>
        dossier.id === input.id &&
        dossier.workspaceId === input.workspaceId &&
        !dossier.deletedAt
    );
    if (index === -1) {
      throw new Error("Dossier introuvable.");
    }

    const current = db.dossiers[index];
    const nextName = input.name ? normalizeDossierName(input.name) : current.name;
    const duplicate = db.dossiers.find(
      (dossier) =>
        dossier.id !== current.id &&
        dossier.workspaceId === current.workspaceId &&
        !dossier.deletedAt &&
        dossier.name.toLocaleLowerCase() === nextName.toLocaleLowerCase()
    );
    if (duplicate) {
      throw new Error("Un dossier avec ce nom existe déjà.");
    }

    const updated: Dossier = {
      ...current,
      name: nextName,
      status: input.status !== undefined ? normalizeDossierStatus(input.status) : normalizeDossierStatus(current.status),
      isEphemeral: input.isEphemeral ?? current.isEphemeral ?? false,
      priority: input.priority ?? current.priority ?? "normal",
      contractTargetCount:
        input.contractTargetCount !== undefined
          ? normalizeNonNegativeInteger(input.contractTargetCount)
          : normalizeNonNegativeInteger(current.contractTargetCount),
      comment:
        input.comment !== undefined
          ? normalizeOptionalText(input.comment)
          : current.comment ?? null,
      deadlineDate:
        input.deadlineDate !== undefined
          ? normalizeOptionalDate(input.deadlineDate)
          : current.deadlineDate ?? null,
      focalPoint:
        input.focalPoint !== undefined
          ? normalizeOptionalText(input.focalPoint)
          : current.focalPoint ?? null,
      roadmapSheetNumber:
        input.roadmapSheetNumber !== undefined
          ? normalizeOptionalText(input.roadmapSheetNumber)
          : current.roadmapSheetNumber ?? null,
      defaultDurationMonths:
        input.defaultDurationMonths !== undefined
          ? input.defaultDurationMonths
          : current.defaultDurationMonths ?? null,
      updatedAt: now()
    };

    db.dossiers[index] = updated;
    saveDb(db);
    if (shouldQueue) {
      queueOutbox(input.workspaceId, "dossier.update", input as unknown as Record<string, unknown>);
    }
    return updated;
  }

  async delete(id: string, workspaceId: string): Promise<number> {
    return this.applyDelete(id, workspaceId, true);
  }

  async applyDelete(id: string, workspaceId: string, shouldQueue = false): Promise<number> {
    const db = loadDb();
    const index = db.dossiers.findIndex(
      (dossier) =>
        dossier.id === id &&
        dossier.workspaceId === workspaceId &&
        !dossier.deletedAt
    );
    if (index === -1) {
      return 0;
    }

    const timestamp = now();
    let unassignedCount = 0;
    db.contracts = db.contracts.map((contract) => {
      if (
        contract.workspaceId === workspaceId &&
        !contract.deletedAt &&
        contract.dossierId === id
      ) {
        unassignedCount += 1;
        return {
          ...contract,
          dossierId: null,
          updatedAt: timestamp
        };
      }
      return contract;
    });

    db.dossiers[index] = {
      ...db.dossiers[index],
      deletedAt: timestamp,
      updatedAt: timestamp
    };
    saveDb(db);
    if (shouldQueue) {
      queueOutbox(workspaceId, "dossier.delete", { id, workspaceId });
    }
    return unassignedCount;
  }
}
