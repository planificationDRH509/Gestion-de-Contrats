import { DossierRepository } from "../repositories/DossierRepository";
import { CreateDossierInput, Dossier, UpdateDossierInput } from "../types";
import { createId } from "../../lib/uuid";
import { loadDb, saveDb } from "./localDb";
import {
  normalizeDossierName,
  normalizeNonNegativeInteger,
  normalizeOptionalDate,
  normalizeOptionalText
} from "../../lib/dossier";

function now() {
  return new Date().toISOString();
}

export class LocalDossierRepository implements DossierRepository {
  async list(workspaceId: string): Promise<Dossier[]> {
    const db = loadDb();
    return db.dossiers
      .filter((dossier) => dossier.workspaceId === workspaceId && !dossier.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getById(id: string): Promise<Dossier | null> {
    const db = loadDb();
    return db.dossiers.find((dossier) => dossier.id === id && !dossier.deletedAt) ?? null;
  }

  async create(input: CreateDossierInput): Promise<Dossier> {
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
      id: createId(),
      workspaceId: input.workspaceId,
      name,
      isEphemeral: input.isEphemeral ?? false,
      priority: input.priority ?? "normal",
      contractTargetCount: normalizeNonNegativeInteger(input.contractTargetCount),
      comment: normalizeOptionalText(input.comment),
      deadlineDate: normalizeOptionalDate(input.deadlineDate),
      focalPoint: normalizeOptionalText(input.focalPoint),
      roadmapSheetNumber: normalizeOptionalText(input.roadmapSheetNumber),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.dossiers.push(dossier);
    saveDb(db);
    return dossier;
  }

  async update(input: UpdateDossierInput): Promise<Dossier> {
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
      updatedAt: now()
    };

    db.dossiers[index] = updated;
    saveDb(db);
    return updated;
  }

  async delete(id: string, workspaceId: string): Promise<number> {
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
    return unassignedCount;
  }
}
