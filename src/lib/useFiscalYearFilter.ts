import { useSyncExternalStore } from "react";
import { getFiscalYearForDate, parseFiscalYear } from "./contractDateFilters";

const eventName = "contracts-fiscal-year-filter-changed";
function subscribe(onChange: () => void) {
  window.addEventListener(eventName, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(eventName, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Share the home filter across navigation, independently of contract creation settings. */
export function useFiscalYearFilter(workspaceId: string, userId: string) {
  const key = `contracts_fiscal_year_filter:${workspaceId}:${userId}`;
  const currentYear = getFiscalYearForDate(new Date());
  const year = useSyncExternalStore(subscribe, () => {
    const stored = sessionStorage.getItem(key);
    return parseFiscalYear(stored) ? stored! : currentYear;
  });
  function setYear(value: string) {
    if (value === currentYear || !parseFiscalYear(value)) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
    window.dispatchEvent(new Event(eventName));
  }
  return [year, setYear] as const;
}
