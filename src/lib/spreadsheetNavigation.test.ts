import { describe, expect, it } from "vitest";
import { getNextSpreadsheetCell } from "./spreadsheetNavigation";

describe("getNextSpreadsheetCell", () => {
  const rows = ["row-1", "row-2"];

  it("moves Enter-style navigation to the next column", () => {
    expect(getNextSpreadsheetCell(rows, "row-1", 2, 5)).toEqual({
      rowKey: "row-1",
      columnIndex: 3
    });
  });

  it("continues at the first column of the next row", () => {
    expect(getNextSpreadsheetCell(rows, "row-1", 4, 5)).toEqual({
      rowKey: "row-2",
      columnIndex: 0
    });
  });

  it("stops after the final grid cell", () => {
    expect(getNextSpreadsheetCell(rows, "row-2", 4, 5)).toBeNull();
  });
});
