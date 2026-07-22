import { ApplicantRepository } from "../repositories/ApplicantRepository";
import { Applicant, UpsertApplicantInput } from "../types";
import { createId } from "../../lib/uuid";
import { loadDb, saveDb, selectDb } from "./localDb";
import { formatFirstName, formatLastName } from "../../lib/format";
import { queueOutbox } from "./localOutbox";

function now() {
  return new Date().toISOString();
}

export function readCachedApplicants(workspaceId: string): Applicant[] {
  return selectDb((db) =>
    db.applicants
      .filter((applicant) => applicant.workspaceId === workspaceId && !applicant.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );
}

export function readCachedApplicant(id: string): Applicant | null {
  return selectDb(
    (db) => db.applicants.find((applicant) => applicant.id === id && !applicant.deletedAt) ?? null
  );
}

export class LocalApplicantRepository implements ApplicantRepository {
  async list(workspaceId: string): Promise<Applicant[]> {
    return readCachedApplicants(workspaceId);
  }

  async getById(id: string): Promise<Applicant | null> {
    return readCachedApplicant(id);
  }

  async findByNifOrNinu(
    workspaceId: string,
    nif?: string | null,
    ninu?: string | null
  ): Promise<Applicant | null> {
    const db = loadDb();
    const normalizedNif = nif?.trim() || "";
    const normalizedNinu = ninu?.trim() || "";
    if (!normalizedNif && !normalizedNinu) {
      return null;
    }
    return (
      db.applicants.find((applicant) => {
        if (applicant.workspaceId !== workspaceId || applicant.deletedAt) {
          return false;
        }
        const nifMatch = normalizedNif && applicant.nif?.trim() === normalizedNif;
        const ninuMatch = normalizedNinu && applicant.ninu?.trim() === normalizedNinu;
        return Boolean(nifMatch || ninuMatch);
      }) ?? null
    );
  }

  async upsert(input: UpsertApplicantInput): Promise<Applicant> {
    const db = loadDb();
    const timestamp = now();
    const existing = input.id
      ? db.applicants.find((applicant) => applicant.id === input.id)
      : await this.findByNifOrNinu(input.workspaceId, input.nif, input.ninu);

    if (existing) {
      const nextId = input.nif?.trim() || existing.id;
      const duplicate = db.applicants.find(
        (applicant) =>
          applicant.id !== existing.id &&
          !applicant.deletedAt &&
          (applicant.id === nextId ||
            Boolean(input.ninu?.trim() && applicant.ninu?.trim() === input.ninu.trim()))
      );
      if (duplicate) {
        throw new Error("Ce NIF ou ce NINU appartient déjà à une autre personne.");
      }
      const updated: Applicant = {
        ...existing,
        id: nextId,
        gender: input.gender,
        firstName: formatFirstName(input.firstName),
        lastName: formatLastName(input.lastName),
        nif: input.nif ?? null,
        ninu: input.ninu ?? null,
        address: input.address,
        updatedAt: timestamp,
        deletedAt: null
      };
      const index = db.applicants.findIndex((item) => item.id === existing.id);
      db.applicants[index] = updated;
      if (existing.id !== nextId) {
        db.contracts = db.contracts.map((contract) =>
          contract.applicantId === existing.id || contract.nif === existing.id
            ? { ...contract, applicantId: nextId, nif: nextId, updatedAt: timestamp }
            : contract
        );
      }
      saveDb(db);
      queueOutbox(input.workspaceId, "applicant.upsert", input as Record<string, unknown>);
      return updated;
    }

    const created: Applicant = {
      id: input.nif?.trim() || input.id || createId(),
      workspaceId: input.workspaceId,
      gender: input.gender,
      firstName: formatFirstName(input.firstName),
      lastName: formatLastName(input.lastName),
      nif: input.nif ?? null,
      ninu: input.ninu ?? null,
      address: input.address,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: input.createdBy ?? null
    };
    db.applicants.push(created);
    saveDb(db);
    queueOutbox(input.workspaceId, "applicant.upsert", input as Record<string, unknown>);
    return created;
  }

  async upsertMany(inputs: UpsertApplicantInput[]): Promise<Applicant[]> {
    const saved: Applicant[] = [];
    for (const input of inputs) {
      saved.push(await this.upsert(input));
    }
    return saved;
  }

  async softDelete(id: string, workspaceId: string): Promise<void> {
    await this.applySoftDelete(id, workspaceId, true);
  }

  async applySoftDelete(id: string, workspaceId: string, shouldQueue = false): Promise<void> {
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
    if (shouldQueue) queueOutbox(workspaceId, "applicant.delete", { id });
  }
}
