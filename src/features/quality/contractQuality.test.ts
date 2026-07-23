import { describe, expect, it } from "vitest";
import type { Contract } from "../../data/types";
import { analyzeContractQuality } from "./contractQuality";

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: "c1",
    workspaceId: "w1",
    applicantId: "123-456-789-0",
    status: "saisie",
    gender: "Femme",
    firstName: "Marie",
    lastName: "PIERRE",
    nif: "123-456-789-0",
    ninu: "1234567890",
    address: "Port-au-Prince",
    position: "Analyste",
    assignment: "DRH",
    salaryNumber: 45_000,
    salaryText: "quarante-cinq mille",
    durationMonths: 12,
    dossierId: "d1",
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    ...overrides
  };
}

describe("contract quality analysis", () => {
  it("finds invalid identifiers and missing values", () => {
    const issues = analyzeContractQuality({
      contracts: [makeContract({ nif: "123", salaryNumber: 0, address: "" })],
      identities: [],
      positions: []
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["invalid_nif", "orphan_contract", "invalid_salary", "missing_required"])
    );
  });

  it("detects duplicate NINU values", () => {
    const issues = analyzeContractQuality({
      contracts: [],
      identities: [
        { nif: "111-111-111-1", ninu: "1234567890", nom: "A", prenom: "A", adresse: "X" },
        { nif: "222-222-222-2", ninu: "1234567890", nom: "B", prenom: "B", adresse: "Y" }
      ],
      positions: []
    });

    expect(issues.filter((issue) => issue.code === "duplicate_ninu")).toHaveLength(2);
  });

  it("offers an automatic salary text correction", () => {
    const issues = analyzeContractQuality({
      contracts: [makeContract({ salaryText: "montant incorrect" })],
      identities: [{
        nif: "123-456-789-0",
        ninu: "1234567890",
        nom: "PIERRE",
        prenom: "Marie",
        adresse: "Port-au-Prince"
      }],
      positions: []
    });

    expect(
      issues.find((issue) => issue.code === "salary_text_mismatch")?.autoFix
    ).toEqual({
      field: "salaryText",
      value: "QUARANTE CINQ MILLE"
    });
  });
});
