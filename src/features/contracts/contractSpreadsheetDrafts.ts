import { parseMoney } from "../../lib/format";

export type ComparableSpreadsheetDraft = {
  nif: string;
  firstName: string;
  lastName: string;
  gender: string;
  ninu: string;
  address: string;
  position: string;
  assignment: string;
  salaryNumber: string;
  salaryText: string;
  comment: string;
  durationMonths: string;
};

export function areSpreadsheetDraftsEqual(
  a: ComparableSpreadsheetDraft,
  b: ComparableSpreadsheetDraft
): boolean {
  return (
    a.nif === b.nif &&
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.gender === b.gender &&
    a.ninu === b.ninu &&
    a.address === b.address &&
    a.position === b.position &&
    a.assignment === b.assignment &&
    parseMoney(a.salaryNumber) === parseMoney(b.salaryNumber) &&
    a.salaryText === b.salaryText &&
    a.comment === b.comment &&
    a.durationMonths === b.durationMonths
  );
}
