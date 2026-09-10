import { UpsertApplicantInput } from "../types";

type ApplicantInsertPayload = {
  nif: string;
  workspace_id: string;
  sexe: UpsertApplicantInput["gender"];
  prenom: string;
  nom: string;
  ninu: string | null;
  telephone?: string | null;
  adresse: string;
  created_by?: string | null;
};

export function buildApplicantInsertPayload(
  input: UpsertApplicantInput,
  formattedFirstName: string,
  formattedLastName: string
): ApplicantInsertPayload {
  return {
    nif: (input.nif || input.id || "").trim(),
    workspace_id: input.workspaceId,
    sexe: input.gender,
    prenom: formattedFirstName,
    nom: formattedLastName,
    ninu: input.ninu || null,
    ...(input.phone !== undefined
      ? { telephone: input.phone?.trim() || null }
      : {}),
    adresse: input.address,
    created_by: input.createdBy
  };
}
