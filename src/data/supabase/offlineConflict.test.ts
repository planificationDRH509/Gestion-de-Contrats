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
