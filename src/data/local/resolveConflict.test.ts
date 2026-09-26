import { beforeEach, expect, it } from "vitest";
import { loadDb, saveDb, flushLocalDbWrites } from "./localDb";
import { resolveOfflineConflict } from "./resolveConflict";

beforeEach(() => localStorage.clear());

it("does not turn unchanged local fields into overwrites while resolving another field", async () => {
  const db = loadDb();
  db.outbox = [{ id: "q", workspaceId: "w", type: "contract.update", createdAt: "1",
    payload: { id: "c", salaryNumber: 150, assignment: "Old", baseContract: { id: "c", salaryNumber: 100, assignment: "Old" } },
    conflict: { fields: ["salaryNumber"], remote: { id: "c", salaryNumber: 200, assignment: "Server" } } }];
  saveDb(db); await flushLocalDbWrites();
  await resolveOfflineConflict("q", { salaryNumber: "local" });
  const pending = loadDb().outbox[0];
  expect(pending.payload.salaryNumber).toBe(150);
  expect(pending.payload).not.toHaveProperty("assignment");
  expect(pending.payload.baseContract).toMatchObject({ assignment: "Server" });
  expect(pending.id).not.toBe("q");
});

it("keeps a remote value explicitly selected by the user", async () => {
  const db = loadDb();
  db.outbox = [{ id: "q", workspaceId: "w", type: "contract.update", createdAt: "1",
    payload: { id: "c", salaryNumber: 150, baseContract: { id: "c", salaryNumber: 100 } },
    conflict: { fields: ["salaryNumber"], remote: { id: "c", salaryNumber: 200 } } }];
  saveDb(db); await flushLocalDbWrites();
  await resolveOfflineConflict("q", { salaryNumber: "remote" });
  expect(loadDb().outbox[0].payload.salaryNumber).toBe(200);
});
