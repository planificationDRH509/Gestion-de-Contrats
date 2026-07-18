import { Applicant, UpsertApplicantInput } from "../types";

export interface ApplicantRepository {
  list(workspaceId: string): Promise<Applicant[]>;
  getById(id: string): Promise<Applicant | null>;
  findByNifOrNinu(
    workspaceId: string,
    nif?: string | null,
    ninu?: string | null
  ): Promise<Applicant | null>;
  upsert(input: UpsertApplicantInput): Promise<Applicant>;
  softDelete(id: string, workspaceId: string): Promise<void>;
}
