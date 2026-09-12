import { describe, expect, it } from "vitest";
import type { Contract } from "../data/types";
import { orderContractsByIds, sortContracts } from "./contractSorting";

function contract(id: string, nif: string, lastName = id): Contract {
  return {
    id,
    workspaceId: "workspace-1",
    applicantId: null,
    status: "saisie",
    gender: "Homme",
    firstName: "Jean",
    lastName,
    nif,
    ninu: null,
    address: "",
    position: "",
    assignment: "",
    salaryNumber: 0,
    salaryText: "",
    durationMonths: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

describe("contract sorting", () => {
  it("sorts NIF values numerically in both directions", () => {
    const contracts = [contract("b", "100-000-000-0"), contract("a", "020-000-000-0")];

    expect(sortContracts(contracts, "nif_asc").map(({ id }) => id)).toEqual(["a", "b"]);
    expect(sortContracts(contracts, "nif_desc").map(({ id }) => id)).toEqual(["b", "a"]);
  });

  it("restores the exact order requested for group printing", () => {
    const contracts = [contract("a", "1"), contract("b", "2"), contract("c", "3")];

    expect(orderContractsByIds(contracts, ["c", "a", "b"]).map(({ id }) => id)).toEqual([
      "c",
      "a",
      "b"
    ]);
  });
});
