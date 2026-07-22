import { describe, expect, it } from "vitest";
import { getInstitutionAddressRankingBoost } from "./suggestionsDb";

describe("getInstitutionAddressRankingBoost", () => {
  it("recognizes the institution area inside a complete applicant address", () => {
    expect(
      getInstitutionAddressRankingBoost(
        { addressKeywords: ["petion-ville"] },
        "12, rue Grégoire, Pétion Ville"
      )
    ).toBeGreaterThan(0);
  });

  it("does not boost institutions from another area or generic institutions", () => {
    expect(
      getInstitutionAddressRankingBoost(
        { addressKeywords: ["Delmas"] },
        "Tabarre 27"
      )
    ).toBe(0);
    expect(
      getInstitutionAddressRankingBoost(
        { addressKeywords: [] },
        "Delmas 33"
      )
    ).toBe(0);
  });
});
