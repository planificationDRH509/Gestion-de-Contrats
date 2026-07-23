import { describe, expect, it } from "vitest";
import { matchesContractSearch, matchesPersonSearch } from "./personSearch";

const person = {
  firstName: "Élodie",
  lastName: "Saint-Fleur",
  nif: "123-456-789-0",
  ninu: "9876543210"
};

describe("person search", () => {
  it("matches first name, last name and a full name without requiring accents", () => {
    expect(matchesPersonSearch(person, "elodie")).toBe(true);
    expect(matchesPersonSearch(person, "saint fleur")).toBe(true);
    expect(matchesPersonSearch(person, "Elodie Saint")).toBe(true);
  });

  it("matches NIF and NINU with or without separators", () => {
    expect(matchesPersonSearch(person, "1234567890")).toBe(true);
    expect(matchesPersonSearch(person, "123-456")).toBe(true);
    expect(matchesPersonSearch(person, "987 654 3210")).toBe(true);
  });

  it("keeps contract-specific fields searchable", () => {
    expect(matchesContractSearch({ ...person, position: "Technicien", assignment: "Nord" }, "technicien")).toBe(true);
  });
});
