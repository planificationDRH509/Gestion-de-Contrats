import { expect, it } from "vitest";
import { mergeOfflinePatch, OfflineConflict } from "./offlineConflict";

it("merges only local changes and preserves a field changed on the server", () => {
  const base = { salary: 100, position: "Old", note: "" };
  expect(mergeOfflinePatch({ ...base, note: "Local" }, base, { ...base, salary: 200 }, ["salary", "position", "note"]))
    .toEqual({ note: "Local" });
});
it("records both values when the same field changed on both devices", () => {
  const base = { salary: 100 };
  try {
    mergeOfflinePatch({ salary: 150 }, base, { salary: 200 }, ["salary"]);
    throw new Error("Conflict expected");
  } catch (error) {
    expect(error).toBeInstanceOf(OfflineConflict);
    expect(error).toMatchObject({ fields: ["salary"], remote: { salary: 200 } });
  }
});
it("accepts a lost acknowledgement when the server already has the desired values", () => {
  expect(mergeOfflinePatch({ salary: 150 }, { salary: 100 }, { salary: 150 }, ["salary"])).toEqual({});
});
it("does not overwrite the server for a legacy operation with no base version", () => {
  expect(() => mergeOfflinePatch({ salary: 100 }, undefined, { salary: 200 }, ["salary"])).toThrow(OfflineConflict);
});

it("resolves overlapping changes using edit time instead of upload time", () => {
  const base = { salary: 100, position: "Old" };
  const remote = { salary: 200, position: "Remote", modifiedAt: "2026-01-01T10:00:00Z", updatedAt: "2026-01-05T00:00:00Z" };
  expect(mergeOfflinePatch({ salary: 150 }, base, remote, ["salary", "position"], "2026-01-01T11:00:00Z"))
    .toEqual({ salary: 150 });
  expect(mergeOfflinePatch({ salary: 150 }, base, remote, ["salary"], "2026-01-01T09:00:00Z"))
    .toEqual({});
});

it("automatically resolves a legacy operation without a base when its edit date is known", () => {
  expect(mergeOfflinePatch({ salary: 150 }, undefined, { salary: 200, updatedAt: "2026-01-01T10:00:00Z" }, ["salary"], "2026-01-01T11:00:00Z"))
    .toEqual({ salary: 150 });
});

it("keeps the persisted value on identical clocks", () => {
  expect(mergeOfflinePatch({ salary: 150 }, undefined, { salary: 200, modifiedAt: "2026-01-01T10:00:00Z" }, ["salary"], "2026-01-01T10:00:00Z"))
    .toEqual({});
});
