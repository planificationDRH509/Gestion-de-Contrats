import { beforeEach, expect, it, vi } from "vitest";
import type { Contract } from "../../data/types";
import { cacheContracts } from "../../data/local/offlineStore";
const mocks = vi.hoisted(() => ({ find: vi.fn(), list: vi.fn() }));
vi.mock("../../data/dataProvider", () => ({ getDataProvider: () => ({
  applicants: { findByNifOrNinu: mocks.find }, contracts: { list: mocks.list }
}) }));
vi.stubEnv("VITE_DATA_PROVIDER", "supabase");
const { lookupNif } = await import("./contractsApi");
beforeEach(() => { localStorage.clear(); mocks.find.mockReset(); mocks.list.mockReset(); });
it("checks cached contracts without identification or network access, normalizing NIFs", async () => {
  cacheContracts([{ id: "c", workspaceId: "w", nif: "1234567890", annee_fiscale: "2025-2026", firstName: "Jean", lastName: "LOUIS", createdAt: "2026-01-01" } as Contract]);
  const result = await lookupNif("123-456-789-0", "w");
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.find).not.toHaveBeenCalled();
  expect(result.contracts[0]).toMatchObject({ id_contrat: "c", annee_fiscale: "2025-2026" });
  expect(result.identification?.prenom).toBe("Jean");
  expect((await lookupNif("1234567890", "other-workspace")).contracts).toEqual([]);
});
it("returns immediately for an uncached NIF even if remote requests would never finish", async () => {
  mocks.find.mockImplementation(() => new Promise(() => {}));
  mocks.list.mockImplementation(() => new Promise(() => {}));
  expect(await lookupNif("9999999999", "w")).toEqual({ identification: null, contracts: [] });
  expect(mocks.find).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});
