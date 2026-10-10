import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Contract } from "../../data/types";
import { LEGACY_MINISTER, findContractMinister, isContractStartOutsideMandate, validateMandate } from "../../lib/ministers";
import { setStoredContractStartDates } from "../settings/settingsApi";
import { buildTemplateVariables } from "../settings/contractTemplate";
import { ContractMandateAlert, contractMandateWarning } from "./ContractMandateAlert";

const minister = { ...LEGACY_MINISTER, mandateStartDate: "2026-10-01", mandateEndDate: "2027-04-05" };
const contract = { id: "c", workspaceId: "w", firstName: "Jean", lastName: "TEST", gender: "Homme", position: "Agent", assignment: "MSPP", address: "Delmas", salaryNumber: 100,
  createdAt: "2028-01-01", updatedAt: "2028-01-01", durationMonths: 12, annee_fiscale: "2026-2027" } as Contract;
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("minister mandate dates", () => {
  it.each(["", "2026-02-30", "2026-13-01", "0000-01-01", "01/01/2020"])("rejects invalid start %s", start => {
    expect(() => validateMandate(start, null)).toThrow(/valide/);
  });
  it("accepts ongoing mandates and validates chronology and real end dates", () => {
    expect(validateMandate("2020-01-01", "")).toEqual({ mandateStartDate: "2020-01-01", mandateEndDate: null });
    expect(validateMandate("2024-02-29", "2024-02-29").mandateEndDate).toBe("2024-02-29");
    expect(() => validateMandate("2020-01-01", "2019-12-31")).toThrow(/précéder/);
    expect(() => validateMandate("2020-01-01", "2025-02-29")).toThrow(/valide/);
  });
  it.each([
    ["2026-09-30", true], ["2026-10-01", false], ["2027-04-05", false], ["2027-04-06", true]
  ])("compares start %s with inclusive bounds", (start, outside) => {
    expect(isContractStartOutsideMandate(start, minister)).toBe(outside);
  });
  it("has no upper bound for an ongoing mandate and no invented bounds for unknown dates", () => {
    expect(isContractStartOutsideMandate("2090-01-01", LEGACY_MINISTER)).toBe(false);
    expect(isContractStartOutsideMandate("2019-12-31", LEGACY_MINISTER)).toBe(true);
    expect(isContractStartOutsideMandate("2019-12-31", { ...minister, mandateStartDate: null, mandateEndDate: null })).toBe(false);
  });
  it("checks contract start rather than creation date or contract end", () => {
    expect(contractMandateWarning(contract, minister)).toBeNull();
    expect(contractMandateWarning({ ...contract, annee_fiscale: "2025-2026" }, minister)).toContain("01/10/2025");
    expect(contractMandateWarning({ ...contract, durationMonths: 5 }, minister)).toContain("03/05/2027");
  });
  it("uses the printed start date including workspace overrides, with the contract fiscal year", () => {
    const shortContract = { ...contract, durationMonths: 6 };
    expect(contractMandateWarning(shortContract, minister)).toBeNull(); // 5 April is inclusive
    setStoredContractStartDates("w", { 6: "2025-04-06" });
    expect(buildTemplateVariables(shortContract).date_debut).toBe("06 Avril 2027");
    expect(contractMandateWarning(shortContract, minister)).toContain("06/04/2027");
    expect(contractMandateWarning({ ...shortContract, workspaceId: "other" }, minister)).toBeNull();
  });
  it("uses current mandate dates for the assigned minister, even after another minister is selected", () => {
    const successor = { ...minister, id: "successor" };
    const registry = { currentMinisterId: successor.id, ministers: [minister, successor] };
    expect(findContractMinister({ ministerId: LEGACY_MINISTER.id, minister: LEGACY_MINISTER }, registry)).toEqual(minister);
    expect(findContractMinister({ ministerId: LEGACY_MINISTER.id, minister: LEGACY_MINISTER })).toEqual(LEGACY_MINISTER);
  });
  it("shows a non-printing warning only for an out-of-mandate start", () => {
    const view = render(<ContractMandateAlert contract={contract} minister={minister} />);
    expect(screen.queryByRole("alert")).toBeNull();
    view.rerender(<ContractMandateAlert contract={{ ...contract, annee_fiscale: "2025-2026" }} minister={minister} />);
    expect(screen.getByRole("alert")).toHaveClass("no-print");
    expect(screen.getByRole("alert")).toHaveTextContent("hors du mandat de Bertrand SINAL");
  });
});
