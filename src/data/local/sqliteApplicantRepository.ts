import { ApplicantRepository } from "../repositories/ApplicantRepository";
import { Applicant, UpsertApplicantInput } from "../types";
import { sqliteApiRequest } from "./sqliteApiClient";
import { formatFirstName, formatLastName } from "../../lib/format";

export class SqliteApplicantRepository implements ApplicantRepository {
  async getById(id: string): Promise<Applicant | null> {
    return sqliteApiRequest<Applicant | null>(`/applicants/${encodeURIComponent(id)}`);
  }

  async findByNifOrNinu(
    workspaceId: string,
    nif?: string | null,
    ninu?: string | null
  ): Promise<Applicant | null> {
    const params = new URLSearchParams({ workspaceId });
    if (nif?.trim()) {
      params.set("nif", nif.trim());
    }
    if (ninu?.trim()) {
      params.set("ninu", ninu.trim());
    }

    return sqliteApiRequest<Applicant | null>(`/applicants/find?${params.toString()}`);
  }

  async upsert(input: UpsertApplicantInput): Promise<Applicant> {
    return sqliteApiRequest<Applicant>("/applicants/upsert", {
      method: "POST",
      body: {
        ...input,
        firstName: formatFirstName(input.firstName),
        lastName: formatLastName(input.lastName)
      }
    });
  }
}
