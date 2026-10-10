import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContractsImportModal } from "./ContractsImportModal";
import { loadContractImportDraft, saveContractImportDraft } from "./contractImportDraft";
import { buildImportEditableRows, inferImportMapping, parsePastedContractTable } from "./contractImport";
import type { Applicant, Contract } from "../../data/types";

const mocks = vi.hoisted(() => ({ applicants: [] as Applicant[], contracts: [] as Contract[], mutate: vi.fn() }));
vi.mock("./contractsApi", () => ({
  useImportApplicantMatches: () => ({ data: mocks.applicants, isPending: false, isFetching: false, isError: false }),
  useImportContractHistory: () => ({ data: mocks.contracts, isPending: false, isFetching: false, isError: false }),
  useImportContracts: () => ({ mutateAsync: mocks.mutate, isPending: false })
}));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: { id: "u", workspaceId: "w" } }) }));
vi.mock("../dossiers/dossiersApi", () => ({ useDossierContractMetrics: () => ({ data: {} }) }));
vi.mock("../salary-grid/salaryGridApi", () => ({ useSalaryGrid: () => ({ entries: [], data: undefined }) }));
vi.mock("../settings/settingsApi", () => ({ useFiscalYear: () => ({ fiscalYear: "2026-2027" }) }));
const text = "NIF\tNom\tPrénom\tSexe\tAdresse\tTéléphone\tSalaire\tPoste\tAffectation\n1234567890\tLouis\tJean\tHomme\t\t\t30000\tAgent\tMSPP\n1234567891\tPierre\tAnne\tFemme\t\t\t30000\tAgent\tMSPP";
const props = { isOpen: true, workspaceId: "w", currentUserId: "u", currentUserName: "User", dossiers: [], appUsers: [], existingContracts: [], onClose: vi.fn(), onImported: vi.fn() };
afterEach(cleanup);
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); mocks.applicants = []; mocks.contracts = []; });
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
    expect(screen.getByRole("button", { name: "Importer 1 contrat(s)" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Sélectionner la ligne 2"));
    expect(screen.getByRole("button", { name: "Importer 1 contrat(s)" })).toBeEnabled();
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
