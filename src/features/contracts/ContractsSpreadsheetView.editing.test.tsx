import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contract } from "../../data/types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), applicant: vi.fn(), lookup: vi.fn(), empty: [],
  comment: vi.fn(), remove: vi.fn(), dossierList: vi.fn()
}));
vi.mock("./contractsApi", () => ({
  useCreateContract: () => ({ mutateAsync: mocks.create }),
  useUpdateContract: () => ({ mutateAsync: mocks.update }),
  useApplicantUpsert: () => ({ mutateAsync: mocks.applicant }),
  useUpdateContractComment: () => ({ mutateAsync: mocks.comment }),
  useDeleteContract: () => ({ mutate: mocks.remove }),
  lookupNif: mocks.lookup
}));
vi.mock("../../lib/usePendingSync", () => ({ usePendingSync: () => mocks.empty }));
vi.mock("./DiscardContractSyncButton", () => ({ DiscardContractSyncButton: () => null }));
vi.mock("../settings/suggestionsApi", () => ({ useAddresses: () => ({ data: mocks.empty }), useInstitutions: () => ({ data: mocks.empty }) }));
vi.mock("../salary-grid/salaryGridApi", () => ({ useSalaryGrid: () => ({ entries: mocks.empty }) }));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: { id: "me", workspaceId: "w" } }) }));
vi.mock("../dossiers/dossiersApi", () => ({ useDossiersList: () => ({ data: mocks.dossierList() }), useDossierContractMetrics: () => ({ data: {} }) }));
vi.mock("../settings/settingsApi", () => ({ getStoredFiscalYear: () => "2025-2026" }));
vi.mock("../../data/local/suggestionsDb", () => ({
  getLastChoice: () => "", saveLastChoice: vi.fn(), learnSuggestions: vi.fn(),
  getPinnedChoices: () => mocks.empty, getRecentChoices: () => mocks.empty,
  recordRecentChoice: vi.fn(), togglePinnedChoice: vi.fn(),
  formatInstitutionLocation: () => "", getInstitutionAddressRankingBoost: () => 0
}));
import { ContractsSpreadsheetView } from "./ContractsSpreadsheetView";

const validRow = (nif = "1234567890", first = "Marie") => [nif, first, "Jean", "F", "", "Delmas", "Comptable", "Direction", "45 000,50", "6"].join("\t");
const existing = {
  id: "existing", workspaceId: "w", createdBy: "me", createdAt: "2026-01-01", updatedAt: "2026-01-01",
  firstName: "Pierre", lastName: "Paul", gender: "Homme", nif: "111-222-333-4", ninu: "",
  address: "Delmas", position: "Comptable", assignment: "Direction", salaryNumber: 45000,
  salaryText: "", durationMonths: 12, status: "saisie", annee_fiscale: "2025-2026"
} as Contract;
function setup(contracts: Contract[] = []) {
  return render(<ContractsSpreadsheetView workspaceId="w" userId="me" contracts={contracts} isLoading={false} canDelete />);
}
function cell(row: number, column: number) {
  return document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`.contracts-sheet-row-new [data-sheet-col="${column}"]`)[row];
}
function paste(target: HTMLElement, text: string) {
  fireEvent.paste(target, { clipboardData: { getData: () => text } });
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.dossierList.mockReturnValue(mocks.empty);
  mocks.lookup.mockResolvedValue({ identification: null, contracts: [] });
  mocks.applicant.mockResolvedValue({ id: "person" });
  mocks.create.mockResolvedValue({ id: "saved" });
  mocks.update.mockResolvedValue({ id: "existing" });
});
afterEach(cleanup);

describe("spreadsheet editing", () => {
  it("keeps default fields visible and updates inherited blank rows while preserving started rows", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Valeurs par défaut" }));
    const address = screen.getByRole("textbox", { name: "Adresse par défaut" });
    expect(address).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "Activer adresse par défaut" }));
    fireEvent.change(address, { target: { value: "D" } });
    fireEvent.change(address, { target: { value: "Delmas" } });
    expect(cell(0, 5)).toHaveValue("Delmas");
    fireEvent.change(cell(0, 1), { target: { value: "Marie" } });
    fireEvent.change(address, { target: { value: "Pétion-Ville" } });
    expect(cell(0, 5)).toHaveValue("Delmas");
    expect(cell(1, 5)).toHaveValue("Pétion-Ville");
    fireEvent.click(screen.getByRole("button", { name: "Tout désactiver" }));
    expect(cell(0, 5)).toHaveValue("Delmas");
    expect(cell(1, 5)).toHaveValue("");
    expect(address).toBeDisabled();
    expect(address).toHaveValue("Pétion-Ville");
  });

  it("fills only missing values in started rows and allows undo", () => {
    setup();
    fireEvent.change(cell(0, 1), { target: { value: "Marie" } });
    fireEvent.change(cell(1, 1), { target: { value: "Anne" } });
    fireEvent.change(cell(1, 5), { target: { value: "Cap-Haïtien" } });
    fireEvent.click(screen.getByRole("button", { name: "Valeurs par défaut" }));
    fireEvent.click(screen.getByRole("switch", { name: "Activer adresse par défaut" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Adresse par défaut" }), { target: { value: "Delmas" } });
    expect(cell(0, 5)).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Compléter les champs vides" }));
    expect(cell(0, 5)).toHaveValue("Delmas");
    expect(cell(1, 5)).toHaveValue("Cap-Haïtien");
    fireEvent.click(screen.getByRole("button", { name: "Annuler la saisie" }));
    expect(cell(0, 5)).toHaveValue("");
    expect(cell(1, 5)).toHaveValue("Cap-Haïtien");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("takes the dossier duration once and preserves a manual override after refresh", () => {
    mocks.dossierList.mockReturnValue([{ id: "batch", name: "Lot A", defaultDurationMonths: 6, status: "active" }]);
    const view = setup();
    fireEvent.click(screen.getByRole("button", { name: "Valeurs par défaut" }));
    fireEvent.click(screen.getByRole("switch", { name: "Activer dossier par défaut" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Dossier par défaut" }), { target: { value: "batch" } });
    const duration = screen.getByRole("spinbutton", { name: "Durée par défaut (mois)" });
    expect(duration).toHaveValue(6);
    fireEvent.change(duration, { target: { value: "" } });
    fireEvent.change(duration, { target: { value: "10" } });
    expect(cell(0, 9)).toHaveValue("10");
    mocks.dossierList.mockReturnValue([{ id: "batch", name: "Lot A", defaultDurationMonths: 6, status: "active" }]);
    view.rerender(<ContractsSpreadsheetView workspaceId="w" userId="me" contracts={[]} isLoading={false} canDelete />);
    expect(duration).toHaveValue(10);
    expect(cell(0, 9)).toHaveValue("10");
    fireEvent.change(duration, { target: { value: "90" } });
    fireEvent.blur(duration);
    expect(duration).toHaveValue(60);
  });

  it("preserves the active default duration when an existing contract is saved", async () => {
    setup([existing]);
    fireEvent.click(screen.getByRole("button", { name: "Valeurs par défaut" }));
    fireEvent.click(screen.getByRole("switch", { name: "Activer durée par défaut" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Durée par défaut (mois)" }), { target: { value: "6" } });
    const field = document.querySelector<HTMLInputElement>('[data-sheet-row="existingRow_existing"][data-sheet-col="1"]')!;
    fireEvent.change(field, { target: { value: "Jacques" } });
    fireEvent.blur(field);
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(cell(0, 9)).toHaveValue("6");
  });

  it("stages an Excel paste, validates it, then creates every row exactly once", async () => {
    setup();
    paste(cell(0, 0), `${validRow()}\r\n${validRow("9876543210", "Anne")}\r\n`);
    expect(cell(0, 0)).toHaveValue("123-456-789-0");
    expect(cell(1, 1)).toHaveValue("Anne");
    expect(cell(0, 8)).toHaveValue("45000.5");
    fireEvent.blur(cell(0, 9));
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer \(2\)/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(cell(0, 0)).toHaveValue(""));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Marie", salaryNumber: 45000.5, durationMonths: 6 }));
    expect(screen.getByRole("button", { name: "Annuler la saisie" })).toBeDisabled();
  });

  it("undoes and redoes a paste, including newly added rows, without saving", () => {
    setup();
    paste(cell(0, 0), Array.from({ length: 5 }, (_, index) => validRow(`123456789${index}`)).join("\n"));
    expect(document.querySelectorAll('.contracts-sheet-row-new')).toHaveLength(5);
    fireEvent.keyDown(cell(0, 0), { key: "z", ctrlKey: true });
    expect(document.querySelectorAll('.contracts-sheet-row-new')).toHaveLength(3);
    expect(cell(0, 0)).toHaveValue("");
    expect(cell(0, 0)).not.toHaveAttribute("aria-invalid");
    fireEvent.keyDown(cell(0, 0), { key: "z", metaKey: true, shiftKey: true });
    expect(document.querySelectorAll('.contracts-sheet-row-new')).toHaveLength(5);
    expect(cell(4, 0)).toHaveValue("123-456-789-4");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("identifies invalid cells and focuses the first error without writing", async () => {
    setup();
    paste(cell(0, 0), validRow("12345678901", ""));
    expect(cell(0, 0)).toHaveValue("12345678901");
    expect(cell(0, 0)).toHaveAttribute("aria-invalid", "true");
    expect(cell(0, 1)).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer \(1\)/ }));
    await waitFor(() => expect(cell(0, 0)).toHaveFocus());
    expect(mocks.applicant).not.toHaveBeenCalled();
    fireEvent.change(cell(0, 0), { target: { value: "9876543210" } });
    expect(cell(0, 0)).not.toHaveAttribute("aria-invalid");
  });

  it("keeps a duplicate NIF editable and ignores stale lookups after correction", async () => {
    setup();
    let resolveFirst!: (value: unknown) => void;
    mocks.lookup.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }));
    fireEvent.change(cell(0, 0), { target: { value: "1234567890" } });
    fireEvent.change(cell(0, 0), { target: { value: "9876543210" } });
    await act(async () => resolveFirst({ identification: { prenom: "Old", nom: "Wrong", adresse: "Old" }, contracts: [{ annee_fiscale: "2025-2026" }] }));
    expect(cell(0, 0)).toHaveValue("987-654-321-0");
    expect(cell(0, 1)).toHaveValue("");
    expect(cell(0, 0)).not.toHaveAttribute("aria-invalid");
    // Saving a pasted duplicate runs the same duplicate check without overwriting the paste.
    mocks.lookup.mockResolvedValue({ identification: null, contracts: [{ annee_fiscale: "2025-2026" }] });
    paste(cell(0, 0), validRow());
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer \(1\)/ }));
    await screen.findByText("Un contrat existe déjà pour 2025-2026.");
    expect(cell(0, 0)).not.toBeDisabled();
    fireEvent.change(cell(0, 0), { target: { value: "9876543210" } });
    expect(cell(0, 0)).toHaveValue("987-654-321-0");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps failed drafts and moves focus to the next NIF only after a successful creation", async () => {
    setup();
    paste(cell(0, 0), validRow());
    mocks.create.mockRejectedValueOnce(new Error("Connexion indisponible"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fireEvent.keyDown(cell(0, 9), { key: "Enter" });
    await screen.findByText("Connexion indisponible");
    expect(cell(0, 1)).toHaveValue("Marie");
    fireEvent.keyDown(cell(0, 9), { key: "Enter" });
    await waitFor(() => expect(cell(1, 0)).toHaveFocus());
    expect(cell(0, 0)).toHaveValue("");
    expect(mocks.create).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it("refreshes identity after a corrected NIF without overwriting text entered during the lookup", async () => {
    setup();
    paste(cell(0, 0), validRow());
    let resolveLookup!: (value: unknown) => void;
    mocks.lookup.mockReturnValueOnce(new Promise(resolve => { resolveLookup = resolve; }));
    fireEvent.change(cell(0, 0), { target: { value: "9876543210" } });
    fireEvent.change(cell(0, 1), { target: { value: "Correction manuelle" } });
    await act(async () => resolveLookup({ identification: { prenom: "Anne", nom: "Paul", adresse: "Nord", sexe: "Femme", ninu: null }, contracts: [] }));
    expect(cell(0, 1)).toHaveValue("Correction manuelle");
    expect(cell(0, 2)).toHaveValue("Paul");
    expect(cell(0, 5)).toHaveValue("Nord");
  });

  it("stages existing-row pastes and allows undo before the explicit update", async () => {
    setup([existing]);
    const field = document.querySelector<HTMLInputElement>('[data-sheet-row="existingRow_existing"][data-sheet-col="1"]')!;
    paste(field, "Marie\tJean");
    fireEvent.blur(field);
    await act(async () => {});
    expect(mocks.update).not.toHaveBeenCalled();
    expect(field).toHaveValue("Marie");
    fireEvent.click(screen.getByRole("button", { name: "Annuler la saisie" }));
    expect(field).toHaveValue("Pierre");
    fireEvent.click(screen.getByRole("button", { name: "Rétablir la saisie" }));
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer \(1\)/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: "existing", firstName: "Marie", lastName: "JEAN" })));
  });

  it("rejects overflowing pastes atomically and flags duplicate NIFs within the pasted batch", () => {
    setup();
    paste(cell(0, 9), "12\t13");
    expect(screen.getByRole("alert")).toHaveTextContent("dernière colonne");
    expect(cell(0, 9)).toHaveValue("12");
    paste(cell(0, 0), `${validRow()}\n${validRow()}`);
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer \(2\)/ }));
    expect(cell(0, 0)).toHaveAttribute("aria-invalid", "true");
    expect(cell(1, 0)).toHaveAttribute("aria-invalid", "true");
    expect(mocks.applicant).not.toHaveBeenCalled();
  });
});
