import { beforeEach, expect, it } from "vitest";
import { loadImportMapping, saveImportMapping } from "./contractImportDraft";
beforeEach(() => localStorage.clear());
it("reuses a mapping only for the same ordered columns and user/workspace", () => {
  const headers = ["Identifiant", "Nom complet", "Montant"];
  saveImportMapping("w", "u", headers, ["nif", "lastName", "salaryNumber"]);
  expect(loadImportMapping("w", "u", [" IDENTIFIANT ", "Nom   complet", "MONTANT"])).toEqual(["nif", "lastName", "salaryNumber"]);
  expect(loadImportMapping("other", "u", headers)).toBeNull();
  expect(loadImportMapping("w", "other", headers)).toBeNull();
  expect(loadImportMapping("w", "u", [...headers].reverse())).toBeNull();
});
it("ignores corrupt stored mappings", () => {
  saveImportMapping("w", "u", ["NIF"], ["nif"]);
  const key = Object.keys(localStorage)[0];
  localStorage.setItem(key, '["nonexistent-field"]');
  expect(loadImportMapping("w", "u", ["NIF"])).toBeNull();
});
