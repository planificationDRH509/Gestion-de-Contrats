import { beforeEach, expect, it, vi } from "vitest";
import type { OutboxItem } from "../types";
import { outboxKeys, outboxWriteKeys } from "../local/outboxDependencies";
import { readReferenceRestoration } from "./referenceRestoration";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), salary: vi.fn(), ministers: vi.fn(), prepositions: vi.fn(), suggestions: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("../../features/salary-grid/salaryGridCache", () => ({ cacheSalaryGrid: mocks.salary }));
vi.mock("../../features/settings/ministersCache", () => ({ cacheMinisters: mocks.ministers }));
vi.mock("../../features/institutions/institutionPrepositions", () => ({ cacheInstitutionPrepositions: mocks.prepositions }));
vi.mock("../local/suggestionsDb", () => ({ cacheSuggestions: mocks.suggestions }));

const user = { id: "u", workspaceId: "w", taskSessionToken: "test-session" };
function reference(scope: string, patches: unknown[] = []): OutboxItem {
  return { id: `q-${scope}`, workspaceId: "w", actorId: "u", createdAt: "1", type: "reference.change", payload: { scope, patches } };
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("contribution_auth", JSON.stringify(user));
});

it("fetches confirmed reference data without changing caches before the caller accepts the snapshot", async () => {
  const entries = [{ id: "salary", version: 7 }];
  mocks.rpc.mockResolvedValue({ data: entries, error: null });
  const restoration = await readReferenceRestoration([reference("salary")], "w");
  expect(mocks.rpc).toHaveBeenCalledWith("read_salary_grid", { p_session_token: "test-session" });
  expect(mocks.salary).not.toHaveBeenCalled();
  restoration.apply();
  expect(mocks.salary).toHaveBeenCalledWith(entries);
});

it("keeps cached baselines untouched when one required server read fails", async () => {
  mocks.rpc.mockImplementation(async name => name === "read_salary_grid" ? { data: [], error: null } : { data: null, error: new Error("Unavailable") });
  await expect(readReferenceRestoration([reference("salary"), reference("prepositions")], "w")).rejects.toThrow("Unavailable");
  expect(mocks.salary).not.toHaveBeenCalled();
  expect(mocks.prepositions).not.toHaveBeenCalled();
});

it("rejects applying a fetched snapshot after the account or session changes", async () => {
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  const restoration = await readReferenceRestoration([reference("salary")], "w");
  localStorage.setItem("contribution_auth", JSON.stringify({ ...user, taskSessionToken: "new-session" }));
  expect(() => restoration.apply()).toThrow("La session a changé");
  expect(mocks.salary).not.toHaveBeenCalled();
});

it("refuses another actor's or workspace's reference before reading the server", async () => {
  await expect(readReferenceRestoration([{ ...reference("salary"), actorId: "other" }], "w")).rejects.toThrow("Reconnectez");
  await expect(readReferenceRestoration([reference("salary")], "other")).rejects.toThrow("Reconnectez");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("fetches every suggestion page within the selected workspace and preserves server versions", async () => {
  const rows = [{ id: "a", label: "A", version: 3, order_index: 0 }, { id: "b", label: "B", version: 8, order_index: 1 }];
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
  query.range.mockImplementation(async from => ({ data: rows.slice(from, from + 1), error: null, count: 2 }));
  mocks.from.mockReturnValue(query);
  const restoration = await readReferenceRestoration([reference("addresses")], "w");
  expect(query.eq).toHaveBeenCalledWith("workspace_id", "w");
  expect(query.eq).toHaveBeenCalledWith("type", "address");
  expect(query.range).toHaveBeenCalledTimes(2);
  expect(mocks.suggestions).not.toHaveBeenCalled();
  restoration.apply();
  expect(mocks.suggestions).toHaveBeenCalledWith({ addresses: [expect.objectContaining({ id: "a", version: 3 }), expect.objectContaining({ id: "b", version: 8 })] }, "w");
});

it("identifies only unconfirmed new ministers and exposes precise contract read dependencies", async () => {
  const registry = { ministers: [{ id: "old" }], currentMinisterId: "old" };
  mocks.rpc.mockResolvedValue({ data: registry, error: null });
  const creation = reference("ministers", [{ id: "new", before: null, after: { id: "new" } }, { id: "old", before: { id: "old" }, after: { id: "old" } }]);
  const restoration = await readReferenceRestoration([creation], "w");
  expect(restoration.missingMinisterIds).toEqual(["new"]);
  const contract = { id: "c", workspaceId: "w", createdAt: "1", type: "contract.create", payload: { id: "c", ministerId: "new" } } as OutboxItem;
  const writes = outboxWriteKeys(creation);
  expect(outboxKeys(contract).some(key => writes.includes(key))).toBe(true);
  expect(outboxWriteKeys(contract).some(key => writes.includes(key))).toBe(false);
  expect(outboxKeys({ ...contract, payload: { id: "c", ministerId: "different" } }).some(key => writes.includes(key))).toBe(false);
  restoration.apply();
  expect(mocks.ministers).toHaveBeenCalledWith(registry);
});

it("rejects an unavailable minister registry instead of accepting an empty baseline", async () => {
  mocks.rpc.mockResolvedValue({ data: { ministers: [], currentMinisterId: "missing" }, error: null });
  await expect(readReferenceRestoration([reference("ministers")], "w")).rejects.toThrow("Liste des ministres indisponible");
  expect(mocks.ministers).not.toHaveBeenCalled();
});

it("tracks print references without letting a failed print receipt block contract edits", () => {
  const receipt: OutboxItem = { id: "print", workspaceId: "w", createdAt: "1", type: "print.create", payload: { contractIds: ["c1", "c2"] } };
  expect(outboxKeys(receipt)).toEqual(["w:contract:c1", "w:contract:c2"]);
  expect(outboxWriteKeys(receipt)).toEqual([]);
});
