import { ApplicantRepository } from "../repositories/ApplicantRepository";
import { Applicant, UpsertApplicantInput } from "../types";
import { createId } from "../../lib/uuid";
import { loadDb, saveDb } from "./localDb";

function now() {
  return new Date().toISOString();
}

export class LocalApplicantRepository implements ApplicantRepository {
  async getById(id: string): Promise<Applicant | null> {
    const db = loadDb();
    return db.applicants.find((applicant) => applicant.id === id && !applicant.deletedAt) ?? null;
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
      const updated: Applicant = {
        ...existing,
        gender: input.gender,
        firstName: input.firstName,
        lastName: input.lastName,
        nif: input.nif ?? null,
        ninu: input.ninu ?? null,
        address: input.address,
        updatedAt: timestamp,
        deletedAt: null
      };
      const index = db.applicants.findIndex((item) => item.id === existing.id);
      db.applicants[index] = updated;
      saveDb(db);
      return updated;
    }

    const created: Applicant = {
      id: createId(),
      workspaceId: input.workspaceId,
      gender: input.gender,
      firstName: input.firstName,
      lastName: input.lastName,
      nif: input.nif ?? null,
      ninu: input.ninu ?? null,
      address: input.address,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.applicants.push(created);
    saveDb(db);
    return created;
  }
}
