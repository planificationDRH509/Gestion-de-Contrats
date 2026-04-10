import { Applicant, UpsertApplicantInput } from "../types";

export interface ApplicantRepository {
  getById(id: string): Promise<Applicant | null>;
  findByNifOrNinu(
    workspaceId: string,
    nif?: string | null,
    ninu?: string | null
  ): Promise<Applicant | null>;
  upsert(input: UpsertApplicantInput): Promise<Applicant>;
}
