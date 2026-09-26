// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_PINNED_CONTRACTS, nextPinnedContracts, readPinnedContracts } from "./pinnedContracts";

describe("personal contract pins", () => {
  beforeEach(() => localStorage.clear());

  it("keeps cached pins separate for each user", () => {
    localStorage.setItem("contribution_pinned_contracts:user-a", JSON.stringify(["contract-1"]));
    localStorage.setItem("contribution_pinned_contracts:user-b", JSON.stringify(["contract-2"]));
    expect(readPinnedContracts("user-a")).toEqual(["contract-1"]);
    expect(readPinnedContracts("user-b")).toEqual(["contract-2"]);
  });

  it("limits additions to ten while allowing removal", () => {
    const ten = Array.from({ length: MAX_PINNED_CONTRACTS }, (_, index) => `contract-${index}`);
    expect(() => nextPinnedContracts(ten, "contract-10")).toThrow("jusqu’à 10 contrats");
    expect(nextPinnedContracts(ten, "contract-0")).toEqual(ten.slice(1));
    expect(nextPinnedContracts(ten.slice(1), "contract-10")).toHaveLength(MAX_PINNED_CONTRACTS);
  });
});
