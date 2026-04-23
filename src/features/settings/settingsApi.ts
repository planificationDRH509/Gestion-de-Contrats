import { useState, useEffect } from "react";
import { getDefaultFiscalYearString } from "../../lib/contractDateFilters";

const FISCAL_YEAR_KEY = "contribution_current_fiscal_year";

export function getStoredFiscalYear(): string {
  return localStorage.getItem(FISCAL_YEAR_KEY) || getDefaultFiscalYearString();
}

export function setStoredFiscalYear(year: string) {
  localStorage.setItem(FISCAL_YEAR_KEY, year);
  window.dispatchEvent(new Event("fiscal-year-changed"));
}

export function useFiscalYear() {
  const [fiscalYear, setFiscalYear] = useState(getStoredFiscalYear());

  useEffect(() => {
    const handleStorageChange = () => setFiscalYear(getStoredFiscalYear());
    window.addEventListener("fiscal-year-changed", handleStorageChange);
    return () => window.removeEventListener("fiscal-year-changed", handleStorageChange);
  }, []);

  return { fiscalYear, setFiscalYear: setStoredFiscalYear };
}
