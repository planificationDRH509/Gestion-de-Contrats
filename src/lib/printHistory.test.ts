import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contract } from "../data/types";
import { appendPrintHistory, groupPrintHistory, loadPrintHistory, type PrintHistoryEntry } from "./printHistory";

const contract = (id: string) => ({ id, firstName: "Marie", lastName: id, position: "Infirmière", nif: id } as Contract);
beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("grouped print history", () => {
  it("persists one complete group for each batch, including overlapping contracts", () => {
    appendPrintHistory("u", "w", [contract("a"), contract("b")]);
    appendPrintHistory("u", "w", [contract("b"), contract("c")]);
    const groups = groupPrintHistory(loadPrintHistory("u", "w"));
    expect(groups.map(group => group.entries.map(entry => entry.contractId))).toEqual([["a", "b"], ["b", "c"]]);
    expect(groups.every(group => group.isBatch)).toBe(true);
    expect(loadPrintHistory("other", "w")).toEqual([]);
  });

  it("refreshes an existing batch on reprint instead of duplicating it", () => {
    appendPrintHistory("u", "w", [contract("a"), contract("b")]);
    const originalBatch = loadPrintHistory("u", "w")[0].batchId;
    appendPrintHistory("u", "w", [contract("a"), contract("b")], { partial: true });
    const groups = groupPrintHistory(loadPrintHistory("u", "w"));
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].entries.every(entry => entry.partial && entry.batchId === originalBatch)).toBe(true);
  });

  it("groups legacy rows from the same print operation but leaves manual entries separate", () => {
    const printedAt = "2026-10-11T12:00:00.000Z";
    const entries = ["a", "b", "manual-c"].map(id => ({ id, contractId: id, firstName: "Marie", lastName: id, position: "", printedAt } as PrintHistoryEntry));
    const groups = groupPrintHistory(entries);
    expect(groups.map(group => group.entries.length)).toEqual([2, 1]);
    expect(groups.map(group => group.isBatch)).toEqual([true, false]);
  });

  it("does not merge separate single prints with the same timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    appendPrintHistory("u", "w", [contract("a")]);
    appendPrintHistory("u", "w", [contract("b")]);
    const groups = groupPrintHistory(loadPrintHistory("u", "w"));
    expect(groups).toHaveLength(2);
    expect(groups.every(group => !group.isBatch)).toBe(true);
  });

  it("keeps single-contract prints deduplicated", () => {
    appendPrintHistory("u", "w", [contract("a")]);
    appendPrintHistory("u", "w", [contract("a")]);
    const groups = groupPrintHistory(loadPrintHistory("u", "w"));
    expect(groups).toHaveLength(1);
    expect(groups[0].isBatch).toBe(false);
  });
});
