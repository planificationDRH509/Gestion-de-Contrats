import { describe, expect, it } from "vitest";
import type { Contract } from "../../data/types";
import type { ContractList } from "../lists/listModel";
import { rankPrintCandidates } from "./printContractSuggestions";

const contract = (id: string, changes: Partial<Contract> = {}): Contract => ({
  id, workspaceId: "w", firstName: "Marie", lastName: id, createdAt: "2026-10-01T12:00:00Z", ...changes
} as Contract);
const list = (ids: string[]): ContractList => ({ workspaceId: "w", members: ids.map(id => ({ id })) } as ContractList);

describe("print suggestions", () => {
  it("combines shared information, date, dossier and list instead of using one criterion", () => {
    const selected = contract("selected", { dossierId: "d", position: "Infirmière", assignment: "Centre", salaryNumber: 35000, durationMonths: 6 });
    const strongest = contract("strongest", { dossierId: "d", position: "infirmiere", assignment: "Centre", salaryNumber: 35000, durationMonths: 6 });
    const sameDossier = contract("dossier", { dossierId: "d", createdAt: "2020-01-01" });
    const sameList = contract("list", { createdAt: "2020-01-01" });
    const nearby = contract("nearby");
    const unrelated = contract("unrelated", { createdAt: "2020-01-01" });
    expect(rankPrintCandidates([unrelated, nearby, sameList, sameDossier, strongest], [selected], [list(["selected", "list", "strongest"])], "w").map(c => c.id))
      .toEqual(["strongest", "dossier", "list", "nearby", "unrelated"]);
  });
  it("orders by proximity to any selected creation date and ignores invalid dates", () => {
    const selected = [contract("one"), contract("two", { createdAt: "2026-08-01" })];
    expect(rankPrintCandidates([
      contract("invalid", { createdAt: "invalid" }),
      contract("month", { createdAt: "2026-09-10" }),
      contract("week", { createdAt: "2026-10-05" }),
      contract("day", { createdAt: "2026-08-01T18:00:00Z" })
    ], selected, [], "w").map(c => c.id)).toEqual(["day", "week", "month", "invalid"]);
  });
  it("excludes existing, deleted, duplicate and foreign-workspace contracts", () => {
    const selected = contract("selected");
    const available = contract("available");
    expect(rankPrintCandidates([selected, available, available, contract("foreign", { workspaceId: "other" }), contract("deleted", { deletedAt: "2026-10-02" })], [selected], [], "w").map(c => c.id)).toEqual(["available"]);
  });
  it("searches all candidates across names, identifiers and information without accents or word-order constraints", () => {
    const candidate = contract("match", { firstName: "Stéphanie", lastName: "Jean", nif: "123456789", position: "Infirmière", assignment: "Grand’Anse" });
    for (const search of ["jean stephanie", "123456789", "INFIRMIERE anse"]) {
      expect(rankPrintCandidates([candidate], [], [], "w", search)).toEqual([candidate]);
    }
    expect(rankPrintCandidates([candidate], [], [], "w", "absent")).toEqual([]);
  });
  it("does not reward missing fields or shared lists in another workspace", () => {
    const selected = contract("selected", { createdAt: "invalid" });
    expect(rankPrintCandidates([contract("z"), contract("a")], [selected], [{ ...list(["selected", "z"]), workspaceId: "other" }], "w").map(c => c.id)).toEqual(["a", "z"]);
  });
});
