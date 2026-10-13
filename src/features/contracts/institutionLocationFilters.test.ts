import { describe, expect, it } from "vitest";
import type { InstitutionSuggestion } from "../../data/local/suggestionsDb";
import {
  NO_MATCHING_INSTITUTION_ASSIGNMENT,
  getLinkedInstitutionFilters,
  updateInstitutionFilterSelection,
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
  it("restricts communes to the selected departments", () => {
    expect(getInstitutionCommuneOptions(institutions, ["ouest"])).toEqual(["Delmas", "Pétion-Ville"]);
    expect(getInstitutionCommuneOptions(institutions, ["Nord"])).toEqual(["Cap-Haïtien"]);
    expect(getInstitutionCommuneOptions(institutions, ["Sud"])).toEqual([]);
    expect(getInstitutionCommuneOptions(institutions, ["Nord", "Ouest"])).toHaveLength(3);
  });
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


describe("linked location choices", () => {
  it("narrows institutions and communes but keeps ambiguous choices editable", () => {
    const filters = getLinkedInstitutionFilters(institutions, { institution: [], department: ["Ouest"], commune: [] });
    expect(filters.institution.options).toEqual(["Centre de Pétion-Ville", "Hôpital de Delmas"]);
    expect(filters.commune.options).toEqual(["Delmas", "Pétion-Ville"]);
    expect(filters.institution.disabled).toBe(false);
    expect(filters.commune.disabled).toBe(false);
    expect(filters.department.disabled).toBe(false);
  });

  it("transfers a redundant department selection to the commune that determines it", () => {
    const next = updateInstitutionFilterSelection(institutions,
      { institution: [], department: ["Ouest"], commune: [] }, "commune", ["Delmas"]);
    expect(next).toEqual({ institution: [], department: [], commune: ["Delmas"] });
    const filters = getLinkedInstitutionFilters(institutions, next);
    expect(filters.department).toMatchObject({ disabled: true, values: ["Ouest"] });
    expect(filters.institution).toMatchObject({ disabled: true, values: ["Hôpital de Delmas"] });
    expect(filters.commune.disabled).toBe(false);
  });

  it("does not infer missing location data and normalizes known values", () => {
    const incomplete = [...institutions, { ...institutions[0], id: "unknown", label: "Sans commune", commune: "" }];
    const filters = getLinkedInstitutionFilters(incomplete,
      { institution: ["HÔPITAL DE DELMAS", "Sans commune"], department: [], commune: [] });
    expect(filters.department).toMatchObject({ disabled: true, values: ["Ouest"] });
    expect(filters.commune.disabled).toBe(false);
  });
});
