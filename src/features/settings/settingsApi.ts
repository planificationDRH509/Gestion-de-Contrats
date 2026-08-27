import { useState, useEffect } from "react";
import {
  getDefaultFiscalYearString,
  parseFiscalYear
} from "../../lib/contractDateFilters";

const FISCAL_YEAR_KEY = "contribution_current_fiscal_year";
const FISCAL_YEAR_MODE_KEY = "contribution_fiscal_year_mode";
const CONTRACT_START_DATES_KEY = "contribution_contract_start_dates";

export type FiscalYearMode = "online" | "local";

export const CONTRACT_DURATION_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

export type ContractStartDates = Partial<Record<number, string>>;

function contractStartDatesKey(workspaceId: string): string {
  return `${CONTRACT_START_DATES_KEY}:${workspaceId || "workspace_default"}`;
}

export function parseContractDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function getStoredContractStartDates(workspaceId: string): ContractStartDates {
  try {
    const raw = localStorage.getItem(contractStartDatesKey(workspaceId));
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return CONTRACT_DURATION_OPTIONS.reduce<ContractStartDates>((dates, durationMonths) => {
      const value = parsed[String(durationMonths)];
      if (typeof value === "string" && parseContractDateInput(value)) {
        dates[durationMonths] = value;
      }
      return dates;
    }, {});
  } catch {
    return {};
  }
}

export function setStoredContractStartDates(
  workspaceId: string,
  dates: ContractStartDates
) {
  const sanitized = CONTRACT_DURATION_OPTIONS.reduce<ContractStartDates>(
    (result, durationMonths) => {
      const value = dates[durationMonths];
      if (value && parseContractDateInput(value)) {
        result[durationMonths] = value;
      }
      return result;
    },
    {}
  );

  localStorage.setItem(contractStartDatesKey(workspaceId), JSON.stringify(sanitized));
  window.dispatchEvent(
    new CustomEvent("contract-start-dates-changed", {
      detail: { workspaceId: workspaceId || "workspace_default" }
    })
  );
}

export function getStoredContractStartDate(
  workspaceId: string,
  durationMonths: number
): Date | null {
  const value = getStoredContractStartDates(workspaceId)[durationMonths];
  return value ? parseContractDateInput(value) : null;
}

export function getStoredFiscalYearMode(now = new Date()): FiscalYearMode {
  const storedMode = localStorage.getItem(FISCAL_YEAR_MODE_KEY);
  if (storedMode === "online" || storedMode === "local") {
    return storedMode;
  }

  // Preserve an older manual override when upgrading from the former setting,
  // which stored only the year and had no explicit mode.
  const legacyYear = localStorage.getItem(FISCAL_YEAR_KEY);
  return parseFiscalYear(legacyYear) && legacyYear!.trim() !== getDefaultFiscalYearString(now)
    ? "local"
    : "online";
}

export function getStoredLocalFiscalYear(now = new Date()): string {
  const storedYear = localStorage.getItem(FISCAL_YEAR_KEY);
  return parseFiscalYear(storedYear) ? storedYear!.trim() : getDefaultFiscalYearString(now);
}

export function getStoredFiscalYear(now = new Date()): string {
  return getStoredFiscalYearMode(now) === "online"
    ? getDefaultFiscalYearString(now)
    : getStoredLocalFiscalYear(now);
}

function dispatchFiscalYearChange() {
  window.dispatchEvent(new Event("fiscal-year-changed"));
}

export function setStoredFiscalYear(year: string) {
  if (!parseFiscalYear(year)) return;
  localStorage.setItem(FISCAL_YEAR_KEY, year.trim());
  localStorage.setItem(FISCAL_YEAR_MODE_KEY, "local");
  dispatchFiscalYearChange();
}

export function setStoredFiscalYearPreference(mode: FiscalYearMode, localFiscalYear: string) {
  if (parseFiscalYear(localFiscalYear)) {
    localStorage.setItem(FISCAL_YEAR_KEY, localFiscalYear.trim());
  }
  localStorage.setItem(FISCAL_YEAR_MODE_KEY, mode);
  dispatchFiscalYearChange();
}

export function useFiscalYear() {
  const [preference, setPreference] = useState(() => ({
    fiscalYear: getStoredFiscalYear(),
    localFiscalYear: getStoredLocalFiscalYear(),
    mode: getStoredFiscalYearMode()
  }));

  useEffect(() => {
    const handleStorageChange = () => setPreference({
      fiscalYear: getStoredFiscalYear(),
      localFiscalYear: getStoredLocalFiscalYear(),
      mode: getStoredFiscalYearMode()
    });
    window.addEventListener("fiscal-year-changed", handleStorageChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("fiscal-year-changed", handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return {
    ...preference,
    setFiscalYear: setStoredFiscalYear,
    setPreference: setStoredFiscalYearPreference
  };
}
