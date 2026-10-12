import { recordImportEntry } from "./contractImportBatch";
import { LEGACY_MINISTER, type MinisterRegistry } from "../../lib/ministers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContractsImportModal } from "./ContractsImportModal";
import { loadContractImportDraft, saveContractImportDraft, saveImportMapping } from "./contractImportDraft";
import { buildImportEditableRows, inferImportMapping, parsePastedContractTable } from "./contractImport";
import type { Applicant, Contract } from "../../data/types";

const mocks = vi.hoisted(() => ({ registry: undefined as MinisterRegistry | undefined, applicants: [] as Applicant[], contracts: [] as Contract[], mutate: vi.fn(), undo: vi.fn() }));
vi.mock("../settings/ministersApi", () => ({ useMinisters: () => ({ registry: mocks.registry }) }));
vi.mock("./contractsApi", () => ({
  useImportApplicantMatches: () => ({ data: mocks.applicants, isPending: false, isFetching: false, isError: false }),
  useImportContractHistory: () => ({ data: mocks.contracts, isPending: false, isFetching: false, isError: false }),
  useUndoContractImport: () => ({ mutateAsync: mocks.undo, isPending: false }),
  useImportContracts: () => ({ mutateAsync: mocks.mutate, isPending: false })
}));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: { id: "u", workspaceId: "w" } }) }));
vi.mock("../dossiers/dossiersApi", () => ({ useDossierContractMetrics: () => ({ data: {} }) }));
vi.mock("../salary-grid/salaryGridApi", () => ({ useSalaryGrid: () => ({ entries: [], data: undefined }) }));
vi.mock("../settings/settingsApi", async importOriginal => ({ ...await importOriginal<typeof import("../settings/settingsApi")>(), useFiscalYear: () => ({ fiscalYear: "2026-2027" }) }));
const text = "NIF\tNom\tPrénom\tSexe\tAdresse\tTéléphone\tSalaire\tPoste\tAffectation\n1234567890\tLouis\tJean\tHomme\t\t\t30000\tAgent\tMSPP\n1234567891\tPierre\tAnne\tFemme\t\t\t30000\tAgent\tMSPP";
const props = { isOpen: true, workspaceId: "w", currentUserId: "u", currentUserName: "User", dossiers: [], appUsers: [], existingContracts: [], onClose: vi.fn(), onImported: vi.fn() };
afterEach(cleanup);
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); mocks.registry = undefined; mocks.applicants = []; mocks.contracts = []; });
function paste(value = text) { fireEvent.change(screen.getByPlaceholderText("Collez les lignes copiées depuis Excel"), { target: { value } }); }

describe("import review", () => {
  it("restores edits, selection and removed rows without rebuilding the pasted source", () => {
    const table = parsePastedContractTable(text);
    const mapping = inferImportMapping(table.headers);
    const rows = buildImportEditableRows(table, mapping);
    rows[0].address = "Jacmel"; rows[1].excluded = true;
    saveContractImportDraft("w", "u", { clipboardText: text, mapping, editableRows: rows, selectedRowIds: [rows[0].id], bulkField: "assignment", bulkValue: "", selectedDossierId: "", responsibleUserId: "u" });
    const view = render(<ContractsImportModal {...props} />);
    expect(screen.getByLabelText("Adresse (optionnelle), ligne 2")).toHaveValue("Jacmel");
    expect(screen.getByLabelText("Sélectionner la ligne 3")).not.toBeChecked();
    expect(screen.getByLabelText("Adresse (optionnelle), ligne 3")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Adresse (optionnelle), ligne 2"), { target: { value: "Les Cayes" } });
    fireEvent.click(screen.getByText("Fermer", { selector: "button" }));
    view.rerender(<ContractsImportModal {...props} isOpen={false} />);
    view.rerender(<ContractsImportModal {...props} />);
    expect(screen.getByLabelText("Adresse (optionnelle), ligne 2")).toHaveValue("Les Cayes");
    expect(loadContractImportDraft("w", "u")?.editableRows[0].contractId).toBe(rows[0].contractId);
  });

  it("preserves absent optional fields and allows explicit erasure", () => {
    mocks.applicants = [{ id: "123-456-789-0", workspaceId: "w", nif: "123-456-789-0", firstName: "Jean", lastName: "Louis", gender: "Homme", address: "Jacmel", phone: "37123456", createdAt: "2025-01-01", updatedAt: "2025-01-01" }];
    render(<ContractsImportModal {...props} />); paste();
    expect(screen.getByLabelText("Adresse (optionnelle), ligne 2")).toHaveValue("Jacmel");
    expect(screen.getByLabelText("Téléphone (optionnel), ligne 2")).toHaveValue("37123456");
    fireEvent.click(screen.getByLabelText("Effacer Téléphone (optionnel), ligne 2"));
    expect(screen.getByLabelText("Téléphone (optionnel), ligne 2")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Voir les différences de la ligne 2" }));
    expect(screen.getByText("37123456", { selector: "p" })).toBeInTheDocument();
  });

  it("filters errors and highlights the exact invalid cell", () => {
    render(<ContractsImportModal {...props} />); paste(text.replace("1234567891", "123"));
    expect(screen.getByLabelText("NIF, ligne 3")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Prénom, ligne 3")).not.toHaveAttribute("aria-invalid");
    fireEvent.click(screen.getByRole("button", { name: /^Erreurs/ }));
    expect(screen.queryByLabelText("NIF, ligne 2")).not.toBeInTheDocument();
    expect(screen.getByLabelText("NIF, ligne 3")).toBeInTheDocument();
  });

  it("keeps the result open and persists receipts so only failed rows are retried", async () => {
    mocks.mutate.mockImplementation(async input => {
      const contract = { id: input.rows[0].contractId };
      input.onRowResult({ contractId: input.rows[0].contractId, contract });
      input.onRowResult({ contractId: input.rows[1].contractId, error: "Ligne 3 — Erreur" });
      return { contracts: [contract], failures: [{ error: "Erreur" }] };
    });
    render(<ContractsImportModal {...props} />); paste();
    fireEvent.click(screen.getByRole("button", { name: "Importer 2 contrat(s)" }));
    await waitFor(() => expect(screen.getByText("1 importée(s)")).toBeInTheDocument());
    expect(screen.getByText("1 à corriger")).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Toutes 2" }));
    expect(screen.getByLabelText("NIF, ligne 2")).toBeDisabled();
    expect(loadContractImportDraft("w", "u")?.editableRows[0].importedContractId).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importer 1 contrat(s)" })).toBeEnabled();
  });
  it("checks historical contracts beyond the displayed page and blocks the current fiscal year", () => {
    mocks.contracts = [{ id: "outside-page", workspaceId: "w", applicantId: "123-456-789-0", nif: "123-456-789-0", firstName: "Jean", lastName: "Louis", gender: "Homme", address: "Jacmel", status: "saisie", position: "Directeur", assignment: "Nord", salaryNumber: 40000, salaryText: "", durationMonths: 6, annee_fiscale: "2026-2027", createdAt: "2026-10-01", updatedAt: "2026-10-01" }];
    render(<ContractsImportModal {...props} existingContracts={[]} />); paste();
    fireEvent.click(screen.getByRole("button", { name: "Voir les différences de la ligne 2" }));
    expect(screen.getByText("Directeur", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByLabelText("NIF, ligne 2")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Importer 1 contrat(s)" })).toBeEnabled();
    fireEvent.click(screen.getByLabelText("Sélectionner la ligne 2"));
    expect(screen.getByRole("button", { name: "Importer 1 contrat(s)" })).toBeEnabled();
  });

  it("persists the duplicate choice and submits keep even when new values are invalid", async () => {
    mocks.contracts = [{ id: "old", workspaceId: "w", applicantId: "123-456-789-0", nif: "123-456-789-0", firstName: "Jean", lastName: "Louis", gender: "Homme", address: "Delmas", status: "saisie", position: "Directeur", assignment: "Nord", salaryNumber: 40000, salaryText: "", durationMonths: 6, annee_fiscale: "2026-2027", createdAt: "2026-10-01", updatedAt: "2026-10-01" }];
    mocks.mutate.mockResolvedValue({ contracts: [], failures: [] });
    const view = render(<ContractsImportModal {...props} />); paste();
    fireEvent.change(screen.getByLabelText("Salaire, ligne 2"), { target: { value: "incorrect" } });
    fireEvent.click(screen.getByRole("button", { name: "Garder l’ancien" }));
    expect(screen.getByRole("button", { name: "Importer 2 contrat(s)" })).toBeEnabled();
    fireEvent.click(screen.getByText("Fermer", { selector: "button" }));
    view.rerender(<ContractsImportModal {...props} isOpen={false} />);
    view.rerender(<ContractsImportModal {...props} />);
    expect(screen.getByRole("button", { name: "Garder l’ancien" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Importer 2 contrat(s)" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
    expect(mocks.mutate.mock.calls[0][0].rows[0]).toMatchObject({ duplicateResolution: { contractId: "old", action: "keep" }, salaryNumber: 40000 });
    fireEvent.click(screen.getByRole("button", { name: "Remplacer par le nouveau" }));
    expect(screen.getByRole("button", { name: "Importer 1 contrat(s)" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Salaire, ligne 2"), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: "Importer 2 contrat(s)" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
    expect(mocks.mutate.mock.calls[1][0].rows[0]).toMatchObject({ duplicateResolution: { contractId: "old", action: "replace" }, salaryNumber: 50000 });
  });

  it("imports valid selected rows while keeping invalid rows for later", async () => {
    mocks.mutate.mockImplementation(async input => {
      const contract = { id: input.rows[0].contractId };
      input.onRowResult({ contractId: contract.id, contract });
      return { contracts: [contract], failures: [] };
    });
    const view = render(<ContractsImportModal {...props} />); paste(text.replace("1234567891", "123"));
    expect(screen.getByRole("button", { name: "Importer 1 contrat(s)" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Importer 1 contrat(s)" }));
    await waitFor(() => expect(screen.getByText("1 importée(s)")).toBeInTheDocument());
    expect(mocks.mutate.mock.calls[0][0].rows).toHaveLength(1);
    expect(screen.queryByLabelText("NIF, ligne 2")).not.toBeInTheDocument();
    expect(screen.getByLabelText("NIF, ligne 3")).toHaveValue("123");
    fireEvent.click(screen.getByText("Fermer", { selector: "button" }));
    view.rerender(<ContractsImportModal {...props} isOpen={false} />);
    view.rerender(<ContractsImportModal {...props} />);
    expect(screen.getByRole("button", { name: "Restantes 1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("NIF, ligne 3"), { target: { value: "1234567891" } });
    fireEvent.click(screen.getByRole("button", { name: "Importer 1 contrat(s)" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
    expect(mocks.mutate.mock.calls[1][0].rows).toHaveLength(1);
    expect(mocks.mutate.mock.calls[1][0].rows[0].nif).toBe("123-456-789-1");
  });

  it("applies a duplicate decision only to selected unresolved rows", () => {
    mocks.contracts = [0, 1].map(i => ({ id: `old-${i}`, workspaceId: "w", applicantId: `123-456-789-${i}`, nif: `123-456-789-${i}`, firstName: "Jean", lastName: "Louis", gender: "Homme", address: "Delmas", status: "saisie", position: "Agent", assignment: "MSPP", salaryNumber: 30000, salaryText: "", durationMonths: 12, annee_fiscale: "2026-2027", createdAt: "2026-10-01", updatedAt: "2026-10-01" }));
    render(<ContractsImportModal {...props} />); paste();
    fireEvent.click(screen.getByLabelText("Sélectionner la ligne 3"));
    fireEvent.click(screen.getByRole("button", { name: "Garder les anciens (1)" }));
    const choices = screen.getAllByRole("button", { name: "Garder l’ancien" });
    expect(choices[0]).toHaveAttribute("aria-pressed", "true");
    expect(choices[1]).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByLabelText("Sélectionner la ligne 3"));
    fireEvent.click(screen.getByRole("button", { name: "Remplacer les anciens (2)" }));
    screen.getAllByRole("button", { name: "Remplacer par le nouveau" }).forEach(button => expect(button).toHaveAttribute("aria-pressed", "true"));
  });

  it("uses the saved column mapping for the next paste", () => {
    const custom = text.replace("NIF", "Identifiant personnel");
    const table = parsePastedContractTable(custom);
    const mapping = inferImportMapping(table.headers); mapping[0] = "nif";
    saveImportMapping("w", "u", table.headers, mapping);
    render(<ContractsImportModal {...props} />); paste(custom);
    expect(screen.getByLabelText("NIF, ligne 2")).toHaveValue("123-456-789-0");
    expect(screen.getByRole("button", { name: "Importer 2 contrat(s)" })).toBeEnabled();
  });

  it("offers saved batches for undo and resets the cancelled row for a fresh import", async () => {
    const table = parsePastedContractTable(text); const mapping = inferImportMapping(table.headers);
    const rows = buildImportEditableRows(table, mapping); rows[0].importedContractId = "saved";
    saveContractImportDraft("w", "u", { clipboardText: text, mapping, editableRows: rows, selectedRowIds: rows.map(row => row.id), bulkField: "assignment", bulkValue: "", selectedDossierId: "", responsibleUserId: "u", batchId: "batch" });
    recordImportEntry("w", "u", "batch", rows[0].contractId!, { after: { id: "saved", firstName: "Jean", lastName: "Louis" } as Contract });
    mocks.undo.mockImplementation(async () => {
      recordImportEntry("w", "u", "batch", rows[0].contractId!, { undone: true });
      return { undoneRowIds: [rows[0].contractId], errors: [] };
    });
    render(<ContractsImportModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Annuler le lot" }));
    await waitFor(() => expect(screen.getByLabelText("NIF, ligne 2")).toBeEnabled());
    expect(mocks.undo).toHaveBeenCalledWith({ workspaceId: "w", userId: "u", batchId: "batch" });
    const restored = loadContractImportDraft("w", "u")?.editableRows[0];
    expect(restored?.importedContractId).toBeUndefined();
    expect(restored?.contractId).not.toBe(rows[0].contractId);
  });

  it("collapses the source, exposes counted filters and hides bulk actions without a selection", () => {
    render(<ContractsImportModal {...props} />); paste();
    expect(document.querySelector("details.import-source")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Toutes 2" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByLabelText("Sélectionner toutes les lignes importées"));
    expect(screen.queryByRole("button", { name: "Appliquer à la sélection" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Importées 0" }));
    expect(screen.getByText("Aucune ligne")).toBeInTheDocument();
  });

  it("restores an old value in the side panel without changing row selection", () => {
    mocks.applicants = [{ id: "123-456-789-0", workspaceId: "w", nif: "123-456-789-0", firstName: "Jean", lastName: "Louis", gender: "Homme", address: "Delmas", createdAt: "2025-01-01", updatedAt: "2025-01-01" }];
    render(<ContractsImportModal {...props} />); paste();
    fireEvent.change(screen.getByLabelText("Adresse (optionnelle), ligne 2"), { target: { value: "Jacmel" } });
    fireEvent.click(screen.getByRole("button", { name: "Différences 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Voir les différences de la ligne 2" }));
    expect(screen.getByRole("complementary", { name: "Différences de la ligne 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reprendre l’ancienne valeur : Adresse (optionnelle), ligne 2" }));
    expect(screen.getByText("Aucune différence")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toutes 2" }));
    expect(screen.getByLabelText("Adresse (optionnelle), ligne 2")).toHaveValue("Delmas");
    expect(screen.getByLabelText("Sélectionner la ligne 2")).toBeChecked();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("applies the header checkbox to filtered rows without changing hidden selections", () => {
    render(<ContractsImportModal {...props} />); paste(text.replace("1234567891", "123"));
    fireEvent.click(screen.getByRole("button", { name: "Erreurs 1" }));
    fireEvent.click(screen.getByLabelText("Sélectionner toutes les lignes importées"));
    fireEvent.click(screen.getByRole("button", { name: "Toutes 2" }));
    expect(screen.getByLabelText("Sélectionner la ligne 2")).toBeChecked();
    expect(screen.getByLabelText("Sélectionner la ligne 3")).not.toBeChecked();
  });

});
it("warns on out-of-mandate imports without treating them as invalid rows", () => {
  mocks.registry = { currentMinisterId: LEGACY_MINISTER.id, ministers: [{ ...LEGACY_MINISTER, mandateStartDate: "2027-01-01" }] };
  render(<ContractsImportModal {...props} />); paste();
  expect(screen.getAllByRole("alert").filter(node => node.textContent?.includes("hors du mandat"))).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Importer 2 contrat(s)" })).toBeEnabled();
});
