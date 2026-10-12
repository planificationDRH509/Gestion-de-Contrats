import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Applicant } from "../../data/types";
import { buildImportEditableRows, getImportDifferences, inferImportMapping, parsePastedContractTable, validateImportEditableRows } from "./contractImport";

const mocks = vi.hoisted(() => ({ find: vi.fn(), upsert: vi.fn(), create: vi.fn(), createDossier: vi.fn() }));
vi.mock("../../data/dataProvider", () => ({ getDataProvider: () => ({
  applicants: { findManyByNifOrNinu: mocks.find, upsert: mocks.upsert },
  dossiers: { create: mocks.createDossier, list: async () => [], getById: async () => null },
  contracts: { create: mocks.create, list: async () => ({ items: [], total: 0 }), getByIds: async () => [], getById: async () => null }
}) }));
const { useImportContracts } = await import("./contractsApi");

const applicant: Applicant = {
  id: "001-002-003-4", nif: "001-002-003-4", workspaceId: "w",
  firstName: "Ancien", lastName: "DOE", gender: "Homme", address: "Ancienne adresse",
  phone: "1111", ninu: "1234567890", createdAt: "2025-01-01", updatedAt: "2025-01-01"
};
function importedRows() {
  const table = parsePastedContractTable("NIF\tNom\tPrénom\tSexe\tAdresse\tTéléphone\tNINU\tSalaire\tPoste\tAffectation\n0010020034\tDOE\tNouveau\tHomme\tNouvelle adresse\t2222\t0987654321\t45000\tAgent\tMSPP");
  return buildImportEditableRows(table, inferImportMapping(table.headers));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.find.mockResolvedValue([applicant]);
  mocks.upsert.mockResolvedValue([]);
  mocks.create.mockImplementation(async input => ({ ...input, createdAt: "2026-10-10", updatedAt: "2026-10-10" }));
  mocks.createDossier.mockResolvedValue({ id: "auto-dossier" });
});

describe("import value priority", () => {
  it("compares old and new values and applies a chosen old value to the validated import", () => {
    const rows = importedRows();
    const differences = getImportDifferences(rows, [applicant], []).get(rows[0].id)!;
    expect(differences).toContainEqual({ field: "address", oldValue: "Ancienne adresse", newValue: "Nouvelle adresse" });
    expect(rows[0].address).toBe("Nouvelle adresse");
    const restored = rows.map(row => ({ ...row, address: differences.find(item => item.field === "address")!.oldValue }));
    expect(validateImportEditableRows(restored)[0].values?.address).toBe("Ancienne adresse");
    expect(getImportDifferences(restored, [applicant], []).get(rows[0].id)?.some(item => item.field === "address")).toBe(false);
  });

  it("persists imported values over populated existing applicant values", async () => {
    mocks.find.mockResolvedValue([applicant]);
    mocks.upsert.mockResolvedValue([]);
    mocks.create.mockImplementation(async input => ({ ...input, createdAt: "2026-10-10", updatedAt: "2026-10-10" }));
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useImportContracts(), { wrapper });
    const rows = validateImportEditableRows(importedRows()).map(row => row.values!);
    await result.current.mutateAsync({ workspaceId: "w", dossierId: "d", responsibleUserId: "u", fiscalYear: "2026-2027", rows });
    expect(mocks.createDossier).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: applicant.id, firstName: "Nouveau", address: "Nouvelle adresse", phone: "2222", ninu: "0987654321" }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Nouveau", address: "Nouvelle adresse", ninu: "0987654321" }));
    unmount();
    client.clear();
  });
});


describe("automatic import dossier", () => {
  it("creates a dossier from the first selected row and attaches every contract", async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useImportContracts(), { wrapper });
    const row = validateImportEditableRows(importedRows())[0].values!;
    const onDossierCreated = vi.fn();
    await result.current.mutateAsync({ workspaceId: "w", dossierId: null, responsibleUserId: "u", fiscalYear: "2026-2027", rows: [row, { ...row, contractId: "second-contract", nif: "999-888-777-6", ninu: null }], onDossierCreated });
    expect(mocks.createDossier).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "w", name: "DOE Nouveau", createdBy: "u" }));
    expect(onDossierCreated).toHaveBeenCalledWith("auto-dossier");
    expect(mocks.create.mock.calls.map(([item]) => item.dossierId)).toEqual(["auto-dossier", "auto-dossier"]);
    unmount();
    client.clear();
  });

  it("does not create a dossier for an empty import or an identity conflict", async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useImportContracts(), { wrapper });
    const input = { workspaceId: "w", dossierId: null, responsibleUserId: "u", fiscalYear: "2026-2027" };
    await result.current.mutateAsync({ ...input, rows: [] });
    mocks.find.mockResolvedValue([{ ...applicant, deletedAt: "2026-01-01" }]);
    expect((await result.current.mutateAsync({ ...input, rows: [validateImportEditableRows(importedRows())[0].values!] })).failures[0].error).toContain("fiche supprimée");
    expect(mocks.createDossier).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    unmount();
    client.clear();
  });
});
