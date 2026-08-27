import { beforeEach, describe, expect, it } from "vitest";
import {
  getStoredFiscalYear,
  getStoredFiscalYearMode,
  getStoredLocalFiscalYear,
  setStoredFiscalYear,
  setStoredFiscalYearPreference
} from "./settingsApi";

const NOW = new Date(2026, 7, 26, 12, 0, 0);

describe("fiscal year settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses the actual fiscal year in online mode", () => {
    setStoredFiscalYearPreference("online", "2023-2024");

    expect(getStoredFiscalYearMode(NOW)).toBe("online");
    expect(getStoredLocalFiscalYear(NOW)).toBe("2023-2024");
    expect(getStoredFiscalYear(NOW)).toBe("2025-2026");
  });

  it("applies a local override only after local mode is enabled", () => {
    setStoredFiscalYearPreference("local", "2023-2024");

    expect(getStoredFiscalYearMode(NOW)).toBe("local");
    expect(getStoredFiscalYear(NOW)).toBe("2023-2024");
  });

  it("preserves a legacy manual year as a local override", () => {
    localStorage.setItem("contribution_current_fiscal_year", "2024-2025");

    expect(getStoredFiscalYearMode(NOW)).toBe("local");
    expect(getStoredFiscalYear(NOW)).toBe("2024-2025");
  });

  it("treats the legacy year setter as a local override", () => {
    setStoredFiscalYear("2024-2025");

    expect(getStoredFiscalYearMode(NOW)).toBe("local");
    expect(getStoredFiscalYear(NOW)).toBe("2024-2025");
  });

  it("ignores an invalid legacy value", () => {
    localStorage.setItem("contribution_current_fiscal_year", "année invalide");

    expect(getStoredFiscalYearMode(NOW)).toBe("online");
    expect(getStoredFiscalYear(NOW)).toBe("2025-2026");
  });
});
