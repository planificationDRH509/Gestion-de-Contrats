import { describe, expect, it } from "vitest";
import type { Contract } from "../../data/types";
import { calculateFinancialStatistics } from "./financialStatistics";

function contract(
  overrides: Partial<Contract> & Pick<Contract, "salaryNumber" | "durationMonths">
): Contract {
  return {
    id: crypto.randomUUID(),
    workspaceId: "workspace",
    applicantId: "applicant",
    status: "signe",
    gender: "Homme",
    firstName: "Jean",
    lastName: "Pierre",
    address: "Port-au-Prince",
    position: "Analyste",
    assignment: "Direction générale",
    salaryText: "",
    createdAt: new Date(2026, 0, 15, 12).toISOString(),
    updatedAt: new Date(2026, 0, 15, 12).toISOString(),
    ...overrides
  };
}

describe("calculateFinancialStatistics", () => {
  it("projects monthly salaries from contract duration and calculates commitments", () => {
    const result = calculateFinancialStatistics(
      [
        contract({ salaryNumber: 100, durationMonths: 12 }),
        contract({
          salaryNumber: 200,
          durationMonths: 6,
          assignment: "Finances"
        })
      ],
      "2025-2026"
    );

    expect(result.totalCommittedBudget).toBe(2_400);
    expect(result.fiscalYearProjectedBudget).toBe(2_400);
    expect(result.averageContractBudget).toBe(1_200);
    expect(result.monthlyTrend[0]).toMatchObject({
      key: "2025-10",
      monthlyBudget: 100,
      activeContracts: 1
    });
    expect(result.monthlyTrend[6]).toMatchObject({
      key: "2026-04",
      monthlyBudget: 300,
      activeContracts: 2
    });
    expect(result.peakMonthlyBudget).toBe(300);
    expect(result.peakMonthLabel).toContain("avril");
    expect(result.trendDirection).toBe("stable");
    expect(result.trendPercent).toBe(0);
  });

  it("expresses the trend as the change between the latest two active months", () => {
    const result = calculateFinancialStatistics(
      [
        contract({ salaryNumber: 100, durationMonths: 12 }),
        contract({ salaryNumber: 100, durationMonths: 1 })
      ],
      "2025-2026"
    );

    expect(result.monthlyTrend[10].monthlyBudget).toBe(100);
    expect(result.monthlyTrend[11].monthlyBudget).toBe(200);
    expect(result.trendDirection).toBe("up");
    expect(result.trendPercent).toBe(100);
  });

  it("groups committed budget by assignment", () => {
    const result = calculateFinancialStatistics(
      [
        contract({ salaryNumber: 100, durationMonths: 12 }),
        contract({ salaryNumber: 50, durationMonths: 12 }),
        contract({
          salaryNumber: 100,
          durationMonths: 6,
          assignment: "Finances"
        })
      ],
      "2025-2026"
    );

    expect(result.topAssignments).toEqual([
      {
        name: "Direction générale",
        budget: 1_800,
        share: 75
      },
      {
        name: "Finances",
        budget: 600,
        share: 25
      }
    ]);
  });

  it("ignores contracts without usable financial values", () => {
    const result = calculateFinancialStatistics(
      [
        contract({ salaryNumber: 0, durationMonths: 12 }),
        contract({ salaryNumber: Number.NaN, durationMonths: 6 })
      ],
      "2025-2026"
    );

    expect(result.validContracts).toBe(0);
    expect(result.totalCommittedBudget).toBe(0);
    expect(result.monthlyTrend.every((month) => month.monthlyBudget === 0)).toBe(true);
    expect(result.trendDirection).toBe("stable");
  });
});
