import type { Minister } from "../../lib/ministers";
import { findContractMinister, isContractStartOutsideMandate } from "../../lib/ministers";
import { getTodayDateInputValue } from "../../lib/contractDateFilters";
import { useMinisters } from "../settings/ministersApi";
import { getContractPeriod, type ContractPeriodInput } from "./contractPeriod";

export function contractMandateWarning(contract: ContractPeriodInput, minister?: Minister): string | null {
  if (!minister || !Number.isInteger(contract.durationMonths) || contract.durationMonths < 1 || contract.durationMonths > 12) return null;
  const { startDate } = getContractPeriod(contract);
  const start = getTodayDateInputValue(startDate);
  if (!isContractStartOutsideMandate(start, minister)) return null;
  return `Début du contrat (${startDate.toLocaleDateString("fr-FR")}) hors du mandat de ${minister.fullName}.`;
}

export function ContractMandateAlert({ contract, minister }: { contract: ContractPeriodInput; minister?: Minister }) {
  const warning = contractMandateWarning(contract, minister);
  if (!warning) return null;
  return <div className="contract-mandate-warning no-print" role="alert">
    <span className="material-symbols-rounded" aria-hidden="true">warning</span>
    <span>{warning}</span>
  </div>;
}

export function EditorMandateAlert({ contract, current = false }: {
  contract: ContractPeriodInput & { ministerId?: string; minister?: Minister };
  current?: boolean;
}) {
  const { registry } = useMinisters();
  const minister = current
    ? registry?.ministers.find(entry => entry.id === registry.currentMinisterId)
    : findContractMinister(contract, registry);
  return <ContractMandateAlert contract={contract} minister={minister} />;
}
