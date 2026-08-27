import { describe, expect, it } from "vitest";
import {
  areSpreadsheetDraftsEqual,
  type ComparableSpreadsheetDraft
} from "./contractSpreadsheetDrafts";

const BASE_DRAFT: ComparableSpreadsheetDraft = {
  nif: "123-456-789-0",
  firstName: "Marie",
  lastName: "Jean",
  gender: "Femme",
  ninu: "1234567890",
  address: "Delmas",
  position: "Comptable",
  assignment: "Direction",
  salaryNumber: "45000",
  salaryText: "QUARANTE-CINQ MILLE",
  comment: "",
  durationMonths: "12"
};

describe("areSpreadsheetDraftsEqual", () => {
  it("detects a duration-only modification", () => {
    expect(
      areSpreadsheetDraftsEqual(BASE_DRAFT, {
        ...BASE_DRAFT,
        durationMonths: "6"
      })
    ).toBe(false);
  });

  it("keeps equivalent salary formats equal", () => {
    expect(
      areSpreadsheetDraftsEqual(BASE_DRAFT, {
        ...BASE_DRAFT,
        salaryNumber: "45 000"
      })
    ).toBe(true);
  });
});
