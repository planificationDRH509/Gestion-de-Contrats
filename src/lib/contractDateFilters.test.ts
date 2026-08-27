import { describe, expect, it } from "vitest";
import {
  getContractActivityDate,
  getDefaultFiscalYearString,
  getFiscalYearOptions,
  getTodayDateInputValue,
  isPastFiscalYear,
  matchesContractDateFilter
} from "./contractDateFilters";

function isoLocal(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour, 0, 0).toISOString();
}

describe("contractDateFilters", () => {
  it("changes fiscal year on October 1", () => {
    expect(getDefaultFiscalYearString(new Date(2026, 8, 30, 23, 59))).toBe("2025-2026");
    expect(getDefaultFiscalYearString(new Date(2026, 9, 1, 0, 0))).toBe("2026-2027");
  });

  it("detects only completed fiscal years as past", () => {
    const now = new Date(2026, 7, 26, 12, 0, 0);

    expect(isPastFiscalYear("2024-2025", now)).toBe(true);
    expect(isPastFiscalYear("2025-2026", now)).toBe(false);
    expect(isPastFiscalYear("2026-2027", now)).toBe(false);
    expect(isPastFiscalYear("invalid", now)).toBe(false);
  });

  it("builds dropdown options around the current fiscal year", () => {
    expect(getFiscalYearOptions(new Date(2026, 7, 26), 2, 1)).toEqual([
      "2026-2027",
      "2025-2026",
      "2024-2025",
      "2023-2024"
    ]);
  });

  it("prioritizes updatedAt when it is newer than createdAt", () => {
    const createdAt = isoLocal(2026, 3, 20, 11);
    const updatedAt = isoLocal(2026, 3, 24, 11);
    const activityDate = getContractActivityDate({
      createdAt,
      updatedAt,
      durationMonths: 12
    });

    expect(activityDate.toISOString()).toBe(updatedAt);
  });

  it("matches a precise day using activity date (updatedAt > createdAt)", () => {
    const now = new Date(2026, 2, 24, 12, 0, 0);
    const contract = {
      createdAt: isoLocal(2026, 3, 20, 12),
      updatedAt: isoLocal(2026, 3, 24, 13),
      durationMonths: 12
    };

    expect(
      matchesContractDateFilter(contract, "day", {
        dayDateInput: getTodayDateInputValue(now),
        now
      })
    ).toBe(true);
  });

  it("uses contract start date for fiscal year filter", () => {
    const now = new Date(2026, 2, 24, 12, 0, 0);

    const inCurrentFiscalYear = {
      createdAt: isoLocal(2026, 1, 15, 12),
      updatedAt: isoLocal(2026, 3, 1, 12),
      durationMonths: 12
    };

    const outsideCurrentFiscalYear = {
      createdAt: isoLocal(2025, 2, 15, 12),
      updatedAt: isoLocal(2026, 3, 1, 12),
      durationMonths: 12
    };

    expect(
      matchesContractDateFilter(
        inCurrentFiscalYear,
        "fiscal_year_current",
        { now }
      )
    ).toBe(true);
    expect(
      matchesContractDateFilter(
        outsideCurrentFiscalYear,
        "fiscal_year_current",
        { now }
      )
    ).toBe(false);

    expect(
      matchesContractDateFilter(
        { ...inCurrentFiscalYear, annee_fiscale: "2024-2025" },
        "fiscal_year_current",
        { now }
      )
    ).toBe(false);
  });

  it("matches a custom range using activity date", () => {
    const now = new Date(2026, 2, 24, 12, 0, 0);
    const contract = {
      createdAt: isoLocal(2026, 3, 1, 12),
      updatedAt: isoLocal(2026, 3, 12, 12),
      durationMonths: 12
    };

    expect(
      matchesContractDateFilter(contract, "range", {
        rangeStartInput: "2026-03-10",
        rangeEndInput: "2026-03-15",
        now
      })
    ).toBe(true);

    expect(
      matchesContractDateFilter(contract, "range", {
        rangeStartInput: "2026-03-13",
        rangeEndInput: "2026-03-20",
        now
      })
    ).toBe(false);
  });
});
