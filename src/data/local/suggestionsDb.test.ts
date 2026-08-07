import { describe, expect, it } from "vitest";
import {
  formatInstitutionLocation,
  getInstitutionAddressRankingBoost
} from "./suggestionsDb";

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

  it("uses the structured commune and department to rank institutions", () => {
    expect(
      getInstitutionAddressRankingBoost(
        { addressKeywords: [], commune: "Pétion-Ville", department: "Ouest" },
        "12, rue Grégoire, Pétion Ville, Ouest"
      )
    ).toBeGreaterThan(0);

    expect(
      getInstitutionAddressRankingBoost(
        { addressKeywords: [], commune: "Jacmel", department: "Sud-Est" },
        "Cap-Haïtien, Nord"
      )
    ).toBe(0);
  });

  it("distinguishes overlapping department names", () => {
    expect(
      getInstitutionAddressRankingBoost(
        { addressKeywords: [], department: "Nord-Ouest" },
        "Port-de-Paix, Nord-Ouest"
      )
    ).toBeGreaterThan(0);
    expect(
      getInstitutionAddressRankingBoost(
        { addressKeywords: [], department: "Ouest" },
        "Port-de-Paix, Nord-Ouest"
      )
    ).toBe(0);
  });
});

describe("formatInstitutionLocation", () => {
  it("displays the commune before the department", () => {
    expect(formatInstitutionLocation({ commune: "Delmas", department: "Ouest" }))
      .toBe("Delmas · Ouest");
  });

  it("supports a partially known location", () => {
    expect(formatInstitutionLocation({ department: "Nord" })).toBe("Nord");
    expect(formatInstitutionLocation({})).toBeUndefined();
  });
});
