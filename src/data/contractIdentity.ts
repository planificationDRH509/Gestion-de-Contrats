import type { Contract, CreateContractInput } from "./types";
import { getContractFiscalYear } from "../lib/contractDateFilters";
import { getStoredFiscalYear } from "../features/settings/settingsApi";

export const identityDigits = (value?: string | null) => (value ?? "").replace(/\D/g, "");

export function assertNoFiscalYearDuplicate(input: CreateContractInput, contracts: Contract[]) {
  const nif = identityDigits(input.nif || input.applicantId);
  if (!nif) return;
  const fiscalYear = input.annee_fiscale || getStoredFiscalYear();
  const duplicate = contracts.find((contract) => contract.workspaceId === input.workspaceId &&
    contract.id !== input.id && !contract.deletedAt &&
    identityDigits(contract.nif || contract.applicantId) === nif &&
    getContractFiscalYear(contract) === fiscalYear);
  if (duplicate) throw new Error(`Un contrat existe déjà pour ce NIF dans l’année fiscale ${fiscalYear}. La création est bloquée (contrat ${duplicate.id}).`);
}
