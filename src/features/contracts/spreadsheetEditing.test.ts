import { describe, expect, it } from "vitest";
import {
  normalizePastedValue, parseSpreadsheetClipboard, spreadsheetErrors, SpreadsheetHistory,
  type SpreadsheetDraft
} from "./spreadsheetEditing";

const draft: SpreadsheetDraft = {
  nif: "123-456-789-0", firstName: "Marie", lastName: "Jean", gender: "Femme",
  ninu: "", address: "Delmas", position: "Comptable", assignment: "Direction",
  salaryNumber: "45000", salaryText: "", durationMonths: "12", comment: ""
};

describe("spreadsheet clipboard", () => {
  it("keeps the first row, blank cells, accents and quoted Excel newlines", () => {
    expect(parseSpreadsheetClipboard('Marie\t\t"Direction\ndépartementale"\r\nJean\t"dit ""Paul"""\tNord\r\n')).toEqual([
      ["Marie", "", "Direction\ndépartementale"], ["Jean", 'dit "Paul"', "Nord"]
    ]);
  });
  it("preserves internal blank rows and rejects malformed or excessive pastes", () => {
    expect(parseSpreadsheetClipboard("A\n\nB\n")).toEqual([["A"], [""], ["B"]]);
    expect(() => parseSpreadsheetClipboard('A\t"B')).toThrow(/guillemets/);
    expect(() => parseSpreadsheetClipboard(Array(501).fill("A").join("\n"))).toThrow(/500/);
  });
  it("normalizes Excel numeric formats and gender shortcuts without truncating identities", () => {
    expect(normalizePastedValue("salaryNumber", "45 000,50")).toBe("45000.5");
    expect(normalizePastedValue("salaryNumber", "45,000.50 HTG")).toBe("45000.5");
    expect(normalizePastedValue("gender", "f")).toBe("Femme");
    expect(normalizePastedValue("nif", "1234567890")).toBe("123-456-789-0");
    expect(normalizePastedValue("nif", "12345678901")).toBe("12345678901");
    expect(normalizePastedValue("ninu", "12345678901")).toBe("12345678901");
    expect(normalizePastedValue("salaryNumber", "=SUM(A1:A2)")).toBe("=SUM(A1:A2)");
  });
  it("returns every invalid field, including malformed salary and duration", () => {
    expect(spreadsheetErrors(draft)).toEqual({});
    expect(spreadsheetErrors({ ...draft, nif: "12345678901", firstName: " ", ninu: "12345678901", salaryNumber: "45000oops", durationMonths: "0" })).toEqual({
      nif: expect.any(String), firstName: expect.any(String), ninu: expect.any(String), salaryNumber: expect.any(String), durationMonths: expect.any(String)
    });
    expect(spreadsheetErrors({ ...draft, salaryNumber: "=45000", durationMonths: "6.5" })).toHaveProperty("salaryNumber");
    expect(spreadsheetErrors({ ...draft, salaryNumber: "45 000,50" })).toEqual({});
  });
});

describe("spreadsheet undo history", () => {
  it("undoes a whole paste and restores it as one operation", () => {
    const history = new SpreadsheetHistory();
    const changes = [{ rowKey: "newRow_1", before: draft, after: { ...draft, firstName: "Paul" } }, { rowKey: "newRow_2", before: null, after: draft }];
    history.record({ changes, focus: { rowKey: "newRow_1", columnIndex: 0 } });
    expect(history.undo()?.changes).toEqual(changes);
    expect(history.past).toHaveLength(0);
    expect(history.redo()?.changes).toEqual(changes);
  });
  it("groups typing but discards redo when a new edit is made", () => {
    const history = new SpreadsheetHistory();
    const focus = { rowKey: "newRow_1", columnIndex: 1 };
    history.record({ changes: [{ rowKey: focus.rowKey, before: null, after: draft }], focus, group: "cell" });
    history.record({ changes: [{ rowKey: focus.rowKey, before: draft, after: { ...draft, firstName: "Paul" } }], focus, group: "cell" });
    expect(history.past).toHaveLength(1);
    expect(history.undo()?.changes[0].before).toBeNull();
    history.record({ changes: [{ rowKey: focus.rowKey, before: draft, after: { ...draft, firstName: "Pierre" } }], focus });
    expect(history.redo()).toBeUndefined();
  });
  it("never resurrects saved rows while preserving unsaved rows in the same paste", () => {
    const history = new SpreadsheetHistory();
    history.record({ changes: [{ rowKey: "newRow_1", before: null, after: draft }, { rowKey: "newRow_2", before: null, after: draft }], focus: { rowKey: "newRow_1", columnIndex: 0 } });
    history.forget("newRow_1");
    expect(history.undo()?.changes.map(change => change.rowKey)).toEqual(["newRow_2"]);
    history.forget("newRow_2");
    expect(history.redo()).toBeUndefined();
  });
});
