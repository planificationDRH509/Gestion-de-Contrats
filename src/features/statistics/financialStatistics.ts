import type { Contract } from "../../data/types";
import { getContractStartDate } from "../../lib/contractDateFilters";

type FinancialContract = Pick<
  Contract,
  | "assignment"
  | "createdAt"
  | "durationMonths"
  | "salaryNumber"
  | "updatedAt"
>;

export type BudgetTrendDirection = "up" | "down" | "stable";

export type BudgetMonth = {
  key: string;
  label: string;
  shortLabel: string;
  monthlyBudget: number;
  activeContracts: number;
};

export type AssignmentBudget = {
  name: string;
  budget: number;
  share: number;
};

export type FinancialStatistics = {
  validContracts: number;
  totalCommittedBudget: number;
  monthlySalaryBase: number;
  averageContractBudget: number;
  fiscalYearProjectedBudget: number;
  peakMonthlyBudget: number;
  peakMonthLabel: string;
  trendDirection: BudgetTrendDirection;
  trendPercent: number;
  monthlyTrend: BudgetMonth[];
  topAssignments: AssignmentBudget[];
};

function parseFiscalYear(fiscalYear: string): number {
  const startYear = Number(fiscalYear.split("-")[0]);
  return Number.isInteger(startYear) ? startYear : new Date().getFullYear();
}

function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

function createFiscalMonths(fiscalYear: string): BudgetMonth[] {
  const startYear = parseFiscalYear(fiscalYear);

  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(startYear, 9 + index, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric"
      }).format(date),
      shortLabel: new Intl.DateTimeFormat("fr-FR", {
        month: "short"
      })
        .format(date)
        .replace(".", ""),
      monthlyBudget: 0,
      activeContracts: 0
    };
  });
}

export function calculateFinancialStatistics(
  contracts: FinancialContract[],
  fiscalYear: string
): FinancialStatistics {
  const monthlyTrend = createFiscalMonths(fiscalYear);
  const assignmentBudgets = new Map<string, number>();

  let validContracts = 0;
  let totalCommittedBudget = 0;
  let monthlySalaryBase = 0;

  contracts.forEach((contract) => {
    const salary = Number(contract.salaryNumber);
    const duration = Math.trunc(Number(contract.durationMonths));

    if (!Number.isFinite(salary) || salary <= 0 || !Number.isFinite(duration) || duration <= 0) {
      return;
    }

    validContracts += 1;
    monthlySalaryBase += salary;

    const committedBudget = salary * duration;
    totalCommittedBudget += committedBudget;

    const assignment = contract.assignment.trim() || "Non renseignée";
    assignmentBudgets.set(
      assignment,
      (assignmentBudgets.get(assignment) ?? 0) + committedBudget
    );

    const contractStartMonth = monthIndex(getContractStartDate(contract));
    const contractEndMonth = contractStartMonth + duration;

    monthlyTrend.forEach((month) => {
      const [year, monthNumber] = month.key.split("-").map(Number);
      const currentMonth = year * 12 + (monthNumber - 1);
      if (currentMonth >= contractStartMonth && currentMonth < contractEndMonth) {
        month.monthlyBudget += salary;
        month.activeContracts += 1;
      }
    });
  });

  const fiscalYearProjectedBudget = monthlyTrend.reduce(
    (sum, month) => sum + month.monthlyBudget,
    0
  );
  const peak = monthlyTrend.reduce(
    (currentPeak, month) =>
      month.monthlyBudget > currentPeak.monthlyBudget ? month : currentPeak,
    monthlyTrend[0]
  );

  const activeMonths = monthlyTrend.filter((month) => month.monthlyBudget > 0);
  const previousActiveBudget = activeMonths.at(-2)?.monthlyBudget ?? 0;
  const lastActiveBudget = activeMonths.at(-1)?.monthlyBudget ?? 0;
  const trendPercent =
    previousActiveBudget > 0
      ? Math.round(((lastActiveBudget - previousActiveBudget) / previousActiveBudget) * 100)
      : 0;
  const trendDirection: BudgetTrendDirection =
    Math.abs(trendPercent) < 1 ? "stable" : trendPercent > 0 ? "up" : "down";

  const topAssignments = Array.from(assignmentBudgets.entries())
    .map(([name, budget]) => ({
      name,
      budget,
      share: totalCommittedBudget > 0 ? (budget / totalCommittedBudget) * 100 : 0
    }))
    .sort((a, b) => b.budget - a.budget)
    .slice(0, 5);

  return {
    validContracts,
    totalCommittedBudget,
    monthlySalaryBase,
    averageContractBudget:
      validContracts > 0 ? totalCommittedBudget / validContracts : 0,
    fiscalYearProjectedBudget,
    peakMonthlyBudget: peak?.monthlyBudget ?? 0,
    peakMonthLabel: peak?.label ?? "",
    trendDirection,
    trendPercent,
    monthlyTrend,
    topAssignments
  };
}
