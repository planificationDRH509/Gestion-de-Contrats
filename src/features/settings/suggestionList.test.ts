import { describe, expect, it } from "vitest";
import { filterAndSortSuggestions } from "./suggestionList";

const items = [
  { label: "École nationale", location: "Ouest" },
  { label: "Centre médical", location: "Sud" },
  { label: "Hôpital 10", location: "Nord" },
  { label: "Hôpital 2", location: "Nord" }
];

describe("filterAndSortSuggestions", () => {
  it("sorts labels alphabetically in French with numeric ordering", () => {
    expect(
      filterAndSortSuggestions(items, "", (item) => [item.label]).map(
        (item) => item.label
      )
    ).toEqual([
      "Centre médical",
      "École nationale",
      "Hôpital 2",
      "Hôpital 10"
    ]);
  });

  it("filters without depending on accents or casing", () => {
    expect(
      filterAndSortSuggestions(items, "ECOLE", (item) => [item.label]).map(
        (item) => item.label
      )
    ).toEqual(["École nationale"]);
  });

  it("searches all supplied metadata using every query term", () => {
    expect(
      filterAndSortSuggestions(items, "hopital nord", (item) => [
        item.label,
        item.location
      ]).map((item) => item.label)
    ).toEqual(["Hôpital 2", "Hôpital 10"]);
  });
});
