import { beforeEach, expect, it } from "vitest";
import { loadDb, saveDb } from "./localDb";
import { outboxEditTime } from "./outboxEditTime";
import type { OutboxItem } from "../types";

beforeEach(() => localStorage.clear());
const item: OutboxItem = { id: "q", workspaceId: "w", type: "applicant.upsert", createdAt: "2026-01-01T00:00:00Z",
  correctionPending: true, payload: { nif: "nif", firstName: "Jean", address: "New" } };
function cache(address: string) {
  const db = loadDb();
  db.applicants.push({ id: "nif", workspaceId: "w", firstName: "Jean", lastName: "LOUIS", address, gender: "Homme",
    createdAt: item.createdAt, updatedAt: "2026-01-03T00:00:00Z" });
  saveDb(db);
}
it("recovers the original date of an old identity correction without changing its queue position", () => {
  cache("New");
  expect(outboxEditTime(item)).toBe("2026-01-03T00:00:00.000Z");
});
it("does not borrow the date of a later different correction", () => {
  cache("Different");
  expect(outboxEditTime(item)).toBe("2026-01-01T00:00:00.000Z");
});
it("preserves the explicit edit clock even if the cached record changed", () => {
  cache("New");
  expect(outboxEditTime({ ...item, modifiedAt: "2026-01-02T00:00:00Z" })).toBe("2026-01-02T00:00:00Z");
});
