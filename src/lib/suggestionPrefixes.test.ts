import { describe, expect, it } from "vitest";
import {
  applySuggestionPrefix,
  getAutomaticSuggestionPrefix,
  stripSuggestionPrefix
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
    expect(applySuggestionPrefix("à l’Hôpital Général", "institution", "à l’")).toBe(
      "à l’Hôpital Général"
    );
    expect(applySuggestionPrefix("dans la Direction Générale", "institution", "à la")).toBe(
      "dans la Direction Générale"
    );
  });

  it("handles positions and addresses", () => {
    expect(applySuggestionPrefix("Infirmière", "position")).toBe("d'Infirmière");
    expect(applySuggestionPrefix("Médecin", "position")).toBe("de Médecin");
    expect(applySuggestionPrefix("Le Responsable", "position")).toBe("du Responsable");
    expect(applySuggestionPrefix("La Responsable", "position")).toBe("de la Responsable");
    expect(applySuggestionPrefix("Les Responsables", "position")).toBe("des Responsables");
    expect(applySuggestionPrefix("Hinche", "address")).toBe("à Hinche");
    expect(applySuggestionPrefix("Aquin", "address")).toBe("à Aquin");
    expect(applySuggestionPrefix("Delmas", "address")).toBe("à Delmas");
    expect(applySuggestionPrefix("Les Cayes", "address")).toBe("aux Cayes");
  });

  it("contracts leading articles instead of duplicating them", () => {
    expect(applySuggestionPrefix("Le Centre Hospitalier", "institution")).toBe(
      "au Centre Hospitalier"
    );
    expect(applySuggestionPrefix("La Direction Générale", "institution")).toBe(
      "à la Direction Générale"
    );
    expect(applySuggestionPrefix("Les Hôpitaux Universitaires", "institution")).toBe(
      "aux Hôpitaux Universitaires"
    );
    expect(applySuggestionPrefix("l’Hôpital Saint-Antoine", "institution")).toBe(
      "à l’Hôpital Saint-Antoine"
    );
  });

  it("strips every supported prefix before recomposing a contract phrase", () => {
    expect(stripSuggestionPrefix("d’Infirmière", "position")).toBe("Infirmière");
    expect(stripSuggestionPrefix("de Médecin", "position")).toBe("Médecin");
    expect(stripSuggestionPrefix("de la Responsable", "position")).toBe("Responsable");
    expect(stripSuggestionPrefix("à titre d’Infirmière", "position")).toBe("Infirmière");
    expect(stripSuggestionPrefix("au poste de Médecin", "position")).toBe("Médecin");
    expect(stripSuggestionPrefix("à la Direction Générale", "institution")).toBe(
      "Direction Générale"
    );
    expect(stripSuggestionPrefix("dans l’Hôpital Général", "institution")).toBe(
      "Hôpital Général"
    );
    expect(stripSuggestionPrefix("près de Port-au-Prince", "address")).toBe(
      "Port-au-Prince"
    );
    expect(stripSuggestionPrefix("au sein de l’Hôpital Général", "institution")).toBe(
      "l’Hôpital Général"
    );
    expect(stripSuggestionPrefix("de la Direction Générale", "institution")).toBe(
      "Direction Générale"
    );
  });
});
