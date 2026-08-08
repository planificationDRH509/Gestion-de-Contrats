import { describe, expect, it } from "vitest";
import type { InstitutionSuggestion } from "../../data/local/suggestionsDb";
import {
  NO_MATCHING_INSTITUTION_ASSIGNMENT,
  combineAssignmentAndInstitutionLocationFilters,
  contractMatchesInstitutionLocation,
  getInstitutionCommuneOptions,
  getInstitutionDepartmentOptions
} from "./institutionLocationFilters";

const institutions: InstitutionSuggestion[] = [
  {
    id: "delmas",
    label: "Hôpital de Delmas",
    department: "Ouest",
    commune: "Delmas",
    addressKeywords: [],
    order: 0
  },
  {
    id: "cap",
    label: "Hôpital du Cap",
    department: "Nord",
    commune: "Cap-Haïtien",
    addressKeywords: [],
    order: 1
  },
  {
    id: "petion-ville",
    label: "Centre de Pétion-Ville",
    department: " Ouest ",
    commune: "Pétion-Ville",
    addressKeywords: [],
    order: 2
  }
];

describe("institution location filters", () => {
  it("builds unique, sorted department and commune options", () => {
    expect(getInstitutionDepartmentOptions(institutions)).toEqual(["Nord", "Ouest"]);
    expect(getInstitutionCommuneOptions(institutions)).toEqual([
      "Cap-Haïtien",
      "Delmas",
      "Pétion-Ville"
    ]);
  });

  it("combines assignment, department and commune filters cumulatively", () => {
    expect(
      combineAssignmentAndInstitutionLocationFilters(
        institutions,
        ["Hôpital de Delmas", "Hôpital du Cap"],
        ["Ouest"],
        ["Delmas"]
      )
    ).toEqual(["Hôpital de Delmas"]);
  });

  it("returns an impossible assignment when the selected location has no institution", () => {
    expect(
      combineAssignmentAndInstitutionLocationFilters(
        institutions,
        [],
        ["Sud"],
        []
      )
    ).toEqual([NO_MATCHING_INSTITUTION_ASSIGNMENT]);
  });

  it("matches contract assignments without depending on accents or casing", () => {
    expect(
      contractMatchesInstitutionLocation(
        "CENTRE DE PETION-VILLE",
        institutions,
        ["ouest"],
        ["Petion-Ville"]
      )
    ).toBe(true);
    expect(
      contractMatchesInstitutionLocation(
        "Hôpital du Cap",
        institutions,
        ["Ouest"],
        []
      )
    ).toBe(false);
  });
});
