import type { Contract } from "../../data/types";
import { getContractStartDate, getFiscalYearEndYear } from "../../lib/contractDateFilters";
import { getStoredContractStartDate } from "../settings/settingsApi";

export type ContractPeriodInput = Pick<Contract, "workspaceId" | "durationMonths" | "annee_fiscale"> & Partial<Pick<Contract, "createdAt" | "updatedAt">>;

/** Shared by documents, exports and mandate alerts, including configured start days. */
export function getContractPeriod(contract: ContractPeriodInput) {
  const dated = { ...contract, createdAt: contract.createdAt ?? "", updatedAt: contract.updatedAt ?? "" };
  const endYear = getFiscalYearEndYear(dated);
  const configured = getStoredContractStartDate(contract.workspaceId, contract.durationMonths ?? 12);
  const startDate = configured
    ? new Date(configured.getMonth() >= 9 ? endYear - 1 : endYear, configured.getMonth(), configured.getDate())
    : getContractStartDate(dated);
  return { startDate, endDate: new Date(endYear, 8, 30) };
}
