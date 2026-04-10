import { Contract, ContractDateFilterMode } from "../data/types";

type ContractDateShape = Pick<
  Contract,
  "createdAt" | "updatedAt" | "durationMonths"
>;

export type ContractDateFilterOptions = {
  dayDateInput?: string;
  rangeStartInput?: string;
  rangeEndInput?: string;
  now?: Date;
};

function toValidDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateInput(value: string): Date | null {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isDateInRange(date: Date, startInclusive: Date, endExclusive: Date): boolean {
  return date >= startInclusive && date < endExclusive;
}

export function getTodayDateInputValue(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getContractActivityDate(contract: ContractDateShape): Date {
  const created = toValidDate(contract.createdAt) ?? new Date();
  const updated = toValidDate(contract.updatedAt);
  if (updated && updated.getTime() > created.getTime()) {
    return updated;
  }
  return created;
}

export function getContractStartDate(contract: ContractDateShape): Date {
  const createdAt = toValidDate(contract.createdAt) ?? new Date();

  let endYear = createdAt.getFullYear();
  if (createdAt.getMonth() >= 9) {
    endYear += 1;
  }

  const durationMonths = contract.durationMonths ?? 12;
  const targetStartMonth = 8 - durationMonths + 1;
  const startDate = new Date(endYear, targetStartMonth, 1);
  while (startDate.getDay() !== 1) {
    startDate.setDate(startDate.getDate() + 1);
  }

  return startDate;
}

export function getCurrentFiscalYearStart(now = new Date()): Date {
  const fiscalStartYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(fiscalStartYear, 9, 1);
}

export function matchesContractDateFilter(
  contract: ContractDateShape,
  mode: ContractDateFilterMode | undefined,
  options: ContractDateFilterOptions = {}
): boolean {
  if (!mode || mode === "all") {
    return true;
  }

  const now = options.now ?? new Date();

  if (mode === "fiscal_year_current") {
    const contractStart = getContractStartDate(contract);
    const fiscalStart = startOfDay(getCurrentFiscalYearStart(now));
    const tomorrow = new Date(startOfDay(now));
    tomorrow.setDate(tomorrow.getDate() + 1);
    return isDateInRange(contractStart, fiscalStart, tomorrow);
  }

  const activityDate = getContractActivityDate(contract);
  const todayStart = startOfDay(now);

  if (mode === "day") {
    const explicitDay = options.dayDateInput ? parseDateInput(options.dayDateInput) : null;
    const dayStart = explicitDay ? startOfDay(explicitDay) : todayStart;
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    return isDateInRange(activityDate, dayStart, nextDay);
  }

  if (mode === "range") {
    const explicitStart = options.rangeStartInput ? parseDateInput(options.rangeStartInput) : null;
    const explicitEnd = options.rangeEndInput ? parseDateInput(options.rangeEndInput) : null;

    if (!explicitStart && !explicitEnd) {
      return true;
    }

    const startBoundary = explicitStart ? startOfDay(explicitStart) : null;
    const endBoundary = explicitEnd ? startOfDay(explicitEnd) : null;

    if (startBoundary && activityDate < startBoundary) {
      return false;
    }

    if (endBoundary) {
      const nextDay = new Date(endBoundary);
      nextDay.setDate(nextDay.getDate() + 1);
      if (activityDate >= nextDay) {
        return false;
      }
    }

    return true;
  }

  if (mode === "week") {
    const dayOfWeek = todayStart.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - diffToMonday);
    const nextWeek = new Date(weekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return isDateInRange(activityDate, weekStart, nextWeek);
  }

  if (mode === "month") {
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const nextMonth = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1);
    return isDateInRange(activityDate, monthStart, nextMonth);
  }

  return true;
}
