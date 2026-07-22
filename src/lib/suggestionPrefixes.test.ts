import { describe, expect, it } from "vitest";
import {
  applySuggestionPrefix,
  getAutomaticSuggestionPrefix
} from "./suggestionPrefixes";

describe("automatic suggestion prefixes", () => {
  it("always elides before hôpital", () => {
    expect(getAutomaticSuggestionPrefix("Hôpital Saint-Antoine", "institution")).toBe("à l'");
    expect(applySuggestionPrefix("Hopital Général", "institution")).toBe("à l'Hopital Général");
  });

  it("uses au before masculine institution names", () => {
    expect(applySuggestionPrefix("Département Sanitaire", "institution")).toBe(
      "au Département Sanitaire"
    );
    expect(applySuggestionPrefix("Centre de Santé", "institution")).toBe("au Centre de Santé");
  });

  it("uses à la before feminine institution names", () => {
    expect(applySuggestionPrefix("Direction Départementale", "institution")).toBe(
      "à la Direction Départementale"
    );
    expect(applySuggestionPrefix("Maternité Isaïe Jeanty", "institution")).toBe(
      "à la Maternité Isaïe Jeanty"
    );
  });

  it("uses aux before plural institution names", () => {
    expect(applySuggestionPrefix("Hôpitaux Universitaires", "institution")).toBe(
      "aux Hôpitaux Universitaires"
    );
  });

  it("keeps manual overrides and already-prefixed values", () => {
    expect(applySuggestionPrefix("Mission Médicale", "institution", "dans la")).toBe(
      "dans la Mission Médicale"
    );
    expect(applySuggestionPrefix("au Département Sanitaire", "institution")).toBe(
      "au Département Sanitaire"
    );
  });

  it("handles positions and addresses", () => {
    expect(applySuggestionPrefix("Infirmière", "position")).toBe("d'Infirmière");
    expect(applySuggestionPrefix("Médecin", "position")).toBe("de Médecin");
    expect(applySuggestionPrefix("Hinche", "address")).toBe("à l'Hinche");
    expect(applySuggestionPrefix("Delmas", "address")).toBe("à Delmas");
  });
});
