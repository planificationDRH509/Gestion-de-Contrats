import { ContractStatus } from "../data/types";

const DONE_CONTRACT_STATUSES = new Set<ContractStatus>([
  "final",
  "imprime",
  "signe",
  "transfere",
  "classe"
]);

export function normalizeDossierName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function normalizeOptionalText(value?: string | null) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function normalizeOptionalDate(value?: string | null) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function normalizeNonNegativeInteger(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export function isContractDone(status: ContractStatus) {
  return DONE_CONTRACT_STATUSES.has(status);
}

export function getDossierProgressState(doneCount: number, targetCount: number) {
  const safeDone = normalizeNonNegativeInteger(doneCount);
  const safeTarget = normalizeNonNegativeInteger(targetCount);
  const ratio = safeTarget > 0 ? Math.min(1, safeDone / safeTarget) : 0;

  if (safeDone === 0 || safeTarget === 0) {
    return {
      ratio,
      color: "#E24C4B",
      tone: "empty" as const
    };
  }

  if (safeDone >= safeTarget) {
    return {
      ratio: 1,
      color: "#20915B",
      tone: "done" as const
    };
  }

  return {
    ratio,
    color: "#E0902D",
    tone: "in_progress" as const
  };
}
