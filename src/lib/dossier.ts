import { ContractStatus, Dossier, DossierStatus } from "../data/types";

export const DOSSIER_ARCHIVE_AFTER_DAYS = 30;

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

export function normalizeDossierStatus(value?: string | null): DossierStatus {
  return value === "classified" ? "classified" : "active";
}

export function isContractDone(status: ContractStatus) {
  return DONE_CONTRACT_STATUSES.has(status);
}

export function getDossierActivityDate(dossier: Pick<Dossier, "createdAt" | "updatedAt">) {
  const updatedTime = Date.parse(dossier.updatedAt);
  const createdTime = Date.parse(dossier.createdAt);
  const timestamp = Number.isFinite(updatedTime) ? updatedTime : createdTime;
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

export function isDossierArchived(dossier: Dossier, now = new Date()) {
  if (normalizeDossierStatus(dossier.status) === "classified") {
    return false;
  }

  const activityDate = getDossierActivityDate(dossier);
  if (!activityDate) {
    return false;
  }

  const ageMs = now.getTime() - activityDate.getTime();
  return ageMs > DOSSIER_ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export function getDossierGroups(dossiers: Dossier[], now = new Date()) {
  return {
    active: dossiers.filter(
      (dossier) =>
        normalizeDossierStatus(dossier.status) === "active" && !isDossierArchived(dossier, now)
    ),
    archived: dossiers.filter(
      (dossier) =>
        normalizeDossierStatus(dossier.status) === "active" && isDossierArchived(dossier, now)
    ),
    classified: dossiers.filter(
      (dossier) => normalizeDossierStatus(dossier.status) === "classified"
    )
  };
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
