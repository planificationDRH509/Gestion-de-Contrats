import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), list: vi.fn() }));
vi.mock("../../data/dataProvider", () => ({ getDataProvider: () => ({
  applicants: { findByNifOrNinu: mocks.find }, contracts: { list: mocks.list }
}) }));
import { lookupNif } from "./contractsApi";
beforeEach(() => { mocks.find.mockReset(); mocks.list.mockReset(); });
it("checks every matching contract without requiring an identification record", async () => {
  mocks.find.mockResolvedValue(null);
  mocks.list.mockResolvedValue({ items: [{ id: "c", nif: "1234567890", annee_fiscale: "2025-2026", firstName: "Jean", lastName: "LOUIS" }] });
  const result = await lookupNif("123-456-789-0", "w");
  expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "w", all: true }));
  expect(result.contracts[0]).toMatchObject({ id_contrat: "c", annee_fiscale: "2025-2026" });
  expect(result.identification?.prenom).toBe("Jean");
});
