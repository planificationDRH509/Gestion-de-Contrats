import { describe, expect, it } from "vitest";
import {
  buildPositionSalaryItems,
  findFeaturedPositionSalaryItem,
} from "./positionSalarySuggestions";

describe("position salary suggestions", () => {
  const positions = [
    {
      id: "position_1",
      label: "Médecin",
      salaries: [45_000, 60_000, 45_000],
      order: 0,
    },
  ];

  it("creates a distinct selectable post entry for every unique salary", () => {
    const items = buildPositionSalaryItems(positions);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.label)).toEqual(["Médecin", "Médecin"]);
    expect(items.map((item) => item.salaryNumber)).toEqual([45_000, 60_000]);
    expect(items[0].sublabel).toContain("HTG");
    expect(items[1].sublabel).toContain("HTG");
  });

  it("restores the exact last salary variant instead of a default salary", () => {
    const items = buildPositionSalaryItems(positions);

    expect(findFeaturedPositionSalaryItem(items, "Médecin", "60000")?.salaryNumber).toBe(60_000);
  });
});
