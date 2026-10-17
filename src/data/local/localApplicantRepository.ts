import { newEditTimestamp } from "../latestEdit";
import { ApplicantRepository } from "../repositories/ApplicantRepository";
import { Applicant, UpsertApplicantInput } from "../types";
import { flushLocalDbWrites, loadDb, saveDb, selectDb } from "./localDb";
import { queueOutbox } from "./localOutbox";
import { upsertApplicantOffline } from "./offlineStore";

function now() {
  return newEditTimestamp();
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

  async findManyByNifOrNinu(
    workspaceId: string,
    nifs: string[],
    ninus: string[]
  ): Promise<Applicant[]> {
    const nifSet = new Set(nifs.map((value) => value.trim()).filter(Boolean));
    const ninuSet = new Set(ninus.map((value) => value.trim()).filter(Boolean));
    if (nifSet.size === 0 && ninuSet.size === 0) return [];

    const db = loadDb();
    return db.applicants.filter(
      (applicant) =>
        applicant.workspaceId === workspaceId &&
        (nifSet.has(applicant.nif?.trim() || applicant.id) ||
          Boolean(applicant.ninu?.trim() && ninuSet.has(applicant.ninu.trim())))
    );
  }

  async upsert(input: UpsertApplicantInput): Promise<Applicant> {
    const applicant = upsertApplicantOffline(input);
    await flushLocalDbWrites();
    return applicant;
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
      modifiedAt: timestamp, updatedAt: timestamp
    };
    saveDb(db);
    if (shouldQueue) queueOutbox(workspaceId, "applicant.delete", { id });
    await flushLocalDbWrites();
  }
}
