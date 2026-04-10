import { describe, expect, it } from "vitest";
import {
  getContractActivityDate,
  getTodayDateInputValue,
  matchesContractDateFilter
} from "./contractDateFilters";

function isoLocal(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour, 0, 0).toISOString();
}

describe("contractDateFilters", () => {
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
