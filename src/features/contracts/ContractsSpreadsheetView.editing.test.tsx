import { LEGACY_MINISTER, type MinisterRegistry } from "../../lib/ministers";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheContracts } from "../../data/local/offlineStore";
import { loadDb, saveDb } from "../../data/local/localDb";
import { queueOutbox, setOutboxError } from "../../data/local/localOutbox";
import { getPendingOutbox } from "../../data/local/offlineStore";
import type { Contract, OutboxItem } from "../../data/types";

const mocks = vi.hoisted(() => ({
  registry: undefined as MinisterRegistry | undefined, create: vi.fn(), update: vi.fn(), applicant: vi.fn(), lookup: vi.fn(), empty: [],
  pending: [] as OutboxItem[], comment: vi.fn(), remove: vi.fn(), dossierList: vi.fn(), matches: vi.fn()
}));
vi.mock("../settings/ministersApi", () => ({ useMinisters: () => ({ registry: mocks.registry }) }));
vi.mock("./contractsApi", () => ({
  useCreateContract: () => ({ mutateAsync: mocks.create }),
  useUpdateContract: () => ({ mutateAsync: mocks.update }),
  useApplicantUpsert: () => ({ mutateAsync: mocks.applicant }),
  useUpdateContractComment: () => ({ mutateAsync: mocks.comment }),
  useDeleteContract: () => ({ mutate: mocks.remove }),
  useImportApplicantMatches: () => ({ data: mocks.matches() }),
  lookupNif: mocks.lookup
}));
vi.mock("../../lib/usePendingSync", () => ({ usePendingSync: () => mocks.pending }));
vi.mock("./DiscardContractSyncButton", () => ({ DiscardContractSyncButton: () => null }));
vi.mock("../settings/suggestionsApi", () => ({ useAddresses: () => ({ data: mocks.empty }), useInstitutions: () => ({ data: mocks.empty }) }));
vi.mock("../salary-grid/salaryGridApi", () => ({ useSalaryGrid: () => ({ entries: mocks.empty }) }));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: { id: "me", workspaceId: "w" } }) }));
vi.mock("../dossiers/dossiersApi", () => ({ useDossiersList: () => ({ data: mocks.dossierList() }), useDossierContractMetrics: () => ({ data: {} }) }));
vi.mock("../settings/settingsApi", async importOriginal => ({ ...await importOriginal<typeof import("../settings/settingsApi")>(), getStoredFiscalYear: () => "2025-2026" }));
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
  mocks.registry = undefined;
  mocks.pending = [];
  mocks.dossierList.mockReturnValue(mocks.empty);
  mocks.matches.mockReturnValue(mocks.empty);
  mocks.lookup.mockResolvedValue({ identification: null, contracts: [] });
  mocks.applicant.mockResolvedValue({ id: "person" });
  mocks.create.mockResolvedValue({ id: "saved" });
  mocks.update.mockResolvedValue({ id: "existing" });
});
afterEach(cleanup);

describe("spreadsheet editing", () => {
  it("keeps new rows usable while recent contracts are still loading", () => {
    render(<ContractsSpreadsheetView contracts={[]} workspaceId="w" userId="me" isLoading={true} canDelete />);
    expect(cell(0, 0)).toBeEnabled();
    expect(screen.queryByText("Chargement des contrats…")).not.toBeInTheDocument();
  });

  it("toggles the phone column for every row and remembers visibility across remounts", () => {
    const view = setup([existing]);
    expect(screen.queryByRole("textbox", { name: "Téléphone" })).not.toBeInTheDocument();
    expect(document.querySelectorAll(".contracts-sheet-state-cell button")).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Actions de la ligne" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Afficher le téléphone" }));
    expect(screen.getAllByRole("textbox", { name: "Téléphone" })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Ligne" }));
    expect(screen.getAllByRole("textbox", { name: "Téléphone" })).toHaveLength(5);
    view.unmount();
    const reopened = setup([existing]);
    expect(screen.getAllByRole("textbox", { name: "Téléphone" })).toHaveLength(4);
    fireEvent.click(screen.getAllByRole("button", { name: "Actions de la ligne" }).at(-1)!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Masquer le téléphone" }));
    expect(screen.queryByRole("textbox", { name: "Téléphone" })).not.toBeInTheDocument();
    reopened.unmount();
    setup([existing]);
    expect(screen.queryByRole("textbox", { name: "Téléphone" })).not.toBeInTheDocument();
  });

  it("saves a pasted phone number with the applicant and preserves it when hidden", async () => {
    setup();
    fireEvent.click(screen.getAllByRole("button", { name: "Actions de la ligne" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Afficher le téléphone" }));
    paste(cell(0, 0), `${validRow()}\t+509 37 00 00 00`);
    expect(cell(0, 10)).toHaveValue("+509 37 00 00 00");
    fireEvent.click(screen.getAllByRole("button", { name: "Actions de la ligne" })[1]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Masquer le téléphone" }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les lignes collées (1)" }));
    await waitFor(() => expect(mocks.applicant).toHaveBeenCalledWith(expect.objectContaining({ phone: "+509 37 00 00 00" })));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
  });

  it("loads and edits an existing phone without erasing it when another field changes", async () => {
    mocks.matches.mockReturnValue([{ id: "person", nif: existing.nif, phone: "+509 37 00 00 00" }]);
    setup([existing]);
    fireEvent.click(screen.getAllByRole("button", { name: "Actions de la ligne" }).at(-1)!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Afficher le téléphone" }));
    const phone = document.querySelector<HTMLInputElement>('[data-sheet-row="existingRow_existing"][data-sheet-col="10"]')!;
    expect(phone).toHaveValue("+509 37 00 00 00");
    fireEvent.change(phone, { target: { value: "+509 38 11 22 33" } });
    fireEvent.blur(phone);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ applicant: expect.objectContaining({ phone: "+509 38 11 22 33" }) })));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.applicant).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Actions de la ligne" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Masquer le téléphone" }));
    const name = document.querySelector<HTMLInputElement>('[data-sheet-row="existingRow_existing"][data-sheet-col="1"]')!;
    fireEvent.change(name, { target: { value: "Jacques" } });
    fireEvent.blur(name);
    await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ applicant: expect.objectContaining({ firstName: "Jacques", phone: "+509 38 11 22 33" }) })));
  });

  it("navigates to the visible phone before saving and keeps duration arrows working", async () => {
    setup();
    fireEvent.click(screen.getAllByRole("button", { name: "Actions de la ligne" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Afficher le téléphone" }));
    paste(cell(0, 0), validRow());
    cell(0, 9).focus();
    fireEvent.keyDown(cell(0, 9), { key: "ArrowUp" });
    expect(cell(0, 9)).toHaveValue("7");
    fireEvent.keyDown(cell(0, 9), { key: "Enter" });
    await waitFor(() => expect(cell(0, 10)).toHaveFocus());
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.change(cell(0, 10), { target: { value: "37000000" } });
    fireEvent.keyDown(cell(0, 10), { key: "Enter" });
    await waitFor(() => expect(mocks.applicant).toHaveBeenCalledWith(expect.objectContaining({ phone: "37000000", nif: "123-456-789-0" })));
  });

  it("opens existing comments from the menu and closes the menu with Escape", async () => {
    setup([existing]);
    const trigger = screen.getAllByRole("button", { name: "Actions de la ligne" }).at(-1)!;
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Ajouter un commentaire" }));
    fireEvent.change(screen.getByPlaceholderText("Ajouter un commentaire..."), { target: { value: "À vérifier" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(mocks.comment).toHaveBeenCalledWith({ id: "existing", workspaceId: "w", commentaire: "À vérifier" }));
  });

  it("saves a new row comment in its draft and preserves it when a later edit is cancelled", () => {
    setup();
    fireEvent.change(cell(0, 1), { target: { value: "Marie" } });
    fireEvent.change(cell(0, 2), { target: { value: "Jean" } });
    const openComment = () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Actions de la ligne" })[0]);
      fireEvent.click(screen.getByRole("menuitem", { name: /commentaire/ }));
    };
    openComment();
    expect(screen.getByRole("dialog", { name: /^Commentaire du contrat Marie Jean$/i })).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText("Ajouter un commentaire..."), { target: { value: "Pièce à compléter" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    openComment();
    expect(screen.getByPlaceholderText("Ajouter un commentaire...")).toHaveValue("Pièce à compléter");
    fireEvent.change(screen.getByPlaceholderText("Ajouter un commentaire..."), { target: { value: "Modification annulée" } });
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    openComment();
    expect(screen.getByPlaceholderText("Ajouter un commentaire...")).toHaveValue("Pièce à compléter");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.comment).not.toHaveBeenCalled();
  });

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

  it("adjusts duration with vertical arrows without moving focus or saving", async () => {
    setup([existing]);
    const duration = cell(0, 9);
    duration.focus();
    fireEvent.keyDown(duration, { key: "ArrowUp" });
    expect(duration).toHaveValue("13");
    fireEvent.keyDown(duration, { key: "ArrowDown" });
    expect(duration).toHaveValue("12");
    fireEvent.change(duration, { target: { value: "1" } });
    fireEvent.keyDown(duration, { key: "ArrowDown" });
    expect(duration).toHaveValue("1");
    fireEvent.change(duration, { target: { value: "60" } });
    fireEvent.keyDown(duration, { key: "ArrowUp" });
    expect(duration).toHaveValue("60");
    await act(async () => {});
    expect(duration).toHaveFocus();
    expect(mocks.create).not.toHaveBeenCalled();
    const savedDuration = document.querySelector<HTMLInputElement>('[data-sheet-row="existingRow_existing"][data-sheet-col="9"]')!;
    savedDuration.focus();
    fireEvent.keyDown(savedDuration, { key: "ArrowUp" });
    expect(savedDuration).toHaveValue("13");
    expect(savedDuration).toHaveFocus();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("shows bulk saving only for pasted rows and leaves manually entered rows untouched", async () => {
    setup();
    fireEvent.change(cell(0, 1), { target: { value: "Saisie manuelle" } });
    expect(screen.queryByRole("button", { name: /Enregistrer les lignes collées/ })).not.toBeInTheDocument();
    paste(cell(1, 0), validRow());
    expect(screen.getByRole("button", { name: "Enregistrer les lignes collées (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Annuler la saisie" }));
    expect(screen.queryByRole("button", { name: /Enregistrer les lignes collées/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rétablir la saisie" }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les lignes collées (1)" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Enregistrer les lignes collées/ })).not.toBeInTheDocument());
    expect(cell(0, 1)).toHaveValue("Saisie manuelle");
  });

  it("stages an Excel paste, validates it, then creates every row exactly once", async () => {
    setup();
    paste(cell(0, 0), `${validRow()}\r\n${validRow("9876543210", "Anne")}\r\n`);
    expect(cell(0, 0)).toHaveValue("123-456-789-0");
    expect(cell(1, 1)).toHaveValue("Anne");
    expect(cell(0, 8)).toHaveValue("45000.5");
    fireEvent.blur(cell(0, 9));
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer les lignes collées \(2\)/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(cell(0, 0)).toHaveValue(""));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Marie", salaryNumber: 45000.5, durationMonths: 6 }));
    expect(screen.getByRole("button", { name: "Annuler la saisie" })).toBeDisabled();
  });

  it("shows the locally saved row below immediately while suggestions never finish", async () => {
    const { learnSuggestions } = await import("../../data/local/suggestionsDb");
    vi.mocked(learnSuggestions).mockImplementationOnce(() => new Promise(() => {}));
    setup();
    mocks.create.mockImplementationOnce(async payload => {
      const saved = { ...existing, ...payload, id: "queued-new" };
      cacheContracts([saved]);
      return saved;
    });
    paste(cell(0, 0), validRow());
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer les lignes collées \(1\)/ }));
    await waitFor(() => expect(cell(0, 0)).toHaveValue(""));
    expect(mocks.applicant).toHaveBeenCalledWith(expect.objectContaining({ queueLocally: true }));
    expect(Array.from(document.querySelectorAll<HTMLTextAreaElement>("#sheet-recent-contracts textarea")).some(field => field.value === "Marie")).toBe(true);
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
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer les lignes collées \(1\)/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer les lignes collées \(1\)/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer les lignes collées \(1\)/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: "existing", firstName: "Marie", lastName: "JEAN" })));
  });

  it("rejects overflowing pastes atomically and flags duplicate NIFs within the pasted batch", () => {
    setup();
    paste(cell(0, 9), "12\t13");
    expect(screen.getByRole("alert")).toHaveTextContent("dernière colonne");
    expect(cell(0, 9)).toHaveValue("12");
    paste(cell(0, 0), `${validRow()}\n${validRow()}`);
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer les lignes collées \(2\)/ }));
    expect(cell(0, 0)).toHaveAttribute("aria-invalid", "true");
    expect(cell(1, 0)).toHaveAttribute("aria-invalid", "true");
    expect(mocks.applicant).not.toHaveBeenCalled();
  });
});
it("warns for a draft start outside the current mandate without preventing its creation", async () => {
  mocks.registry = { currentMinisterId: LEGACY_MINISTER.id, ministers: [{ ...LEGACY_MINISTER, mandateStartDate: "2027-01-01" }] };
  setup();
  paste(cell(0, 0), validRow());
  expect(screen.getByRole("alert")).toHaveTextContent("Début du contrat (06/04/2026) hors du mandat");
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer les lignes collées (1)" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
});


it("returns old corrections once beside new drafts even with recent rows collapsed, through reload and ACK", async () => {
  localStorage.setItem("contribution_auth", JSON.stringify({ id: "me", workspaceId: "w" }));
  cacheContracts([existing]);
  const view = setup();
  await act(() => new Promise(resolve => setTimeout(resolve, 0)));
  fireEvent.change(cell(0, 1), { target: { value: "Brouillon préservé" } });
  const toggle = screen.getByRole("button", { name: /Contrats récents/ });
  if (toggle.getAttribute("aria-expanded") === "true") fireEvent.click(toggle);
  const first = queueOutbox("w", "contract.update", { id: existing.id, salaryNumber: 45000 });
  setOutboxError(first.id, "Salaire hors grille");
  const second = queueOutbox("w", "contract.update", { id: existing.id, position: "Comptable" });
  setOutboxError(second.id, "Poste incorrect");
  mocks.pending = getPendingOutbox();
  view.rerender(<ContractsSpreadsheetView workspaceId="w" userId="me" contracts={[existing]} isLoading={false} canDelete />);
  const corrections = () => document.querySelectorAll(".contracts-sheet-row-correction");
  expect(corrections()).toHaveLength(1);
  expect(corrections()[0]).toBeVisible();
  expect(corrections()[0].closest("#sheet-recent-contracts")).toBeNull();
  expect(document.querySelectorAll('[data-sheet-row="existingRow_existing"][data-sheet-col="0"]')).toHaveLength(1);
  expect(cell(0, 1)).toHaveValue("Brouillon préservé");
  await waitFor(() => expect(localStorage.getItem("contract_unsaved_draft:spreadsheet:w:me")).toContain("Brouillon préservé"));
  view.unmount();
  const reopened = setup();
  expect(corrections()).toHaveLength(1);
  expect(cell(0, 1)).toHaveValue("Brouillon préservé");
  const salary = corrections()[0].querySelector('[data-sheet-col="8"]')!;
  fireEvent.change(salary, { target: { value: "50000" } });
  fireEvent.blur(salary);
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: existing.id, salaryNumber: 50000 })));
  expect(mocks.create).not.toHaveBeenCalled();
  mocks.pending = mocks.pending.map(item => ({ ...item, lastError: null }));
  reopened.rerender(<ContractsSpreadsheetView workspaceId="w" userId="me" contracts={[]} isLoading={false} canDelete />);
  expect(corrections()).toHaveLength(1);
  // Simulate the server acknowledgement of the submitted salary.
  const acknowledged = loadDb();
  acknowledged.outbox = [];
  acknowledged.contracts.find(contract => contract.id === existing.id)!.salaryNumber = 50000;
  saveDb(acknowledged);
  mocks.pending = [];
  reopened.rerender(<ContractsSpreadsheetView workspaceId="w" userId="me" contracts={[]} isLoading={false} canDelete />);
  expect(corrections()).toHaveLength(0);
  expect(cell(0, 1)).toHaveValue("Brouillon préservé");
});

it("does not return another account's errors, reference errors or temporary failures as correction rows", () => {
  cacheContracts([existing, { ...existing, id: "other-workspace", workspaceId: "elsewhere" }]);
  mocks.pending = [
    { id: "other-user", workspaceId: "w", actorId: "someone-else", type: "contract.update", payload: { id: existing.id }, lastError: "Salaire incorrect", correctionPending: true, createdAt: "1" },
    { id: "temporary", workspaceId: "w", actorId: "me", type: "contract.update", payload: { id: existing.id }, lastError: "Failed to fetch", createdAt: "1" },
    { id: "reference", workspaceId: "w", actorId: "me", type: "reference.change", payload: { id: existing.id }, lastError: "Salaire incorrect", createdAt: "1" }
  ];
  setup();
  expect(document.querySelectorAll(".contracts-sheet-row-correction")).toHaveLength(0);
});


it("keeps a newer unsaved correction visible if an earlier save is acknowledged", async () => {
  cacheContracts([existing]);
  mocks.pending = [{ id: "q", actorId: "me", workspaceId: "w", type: "contract.update", createdAt: "1", correctionPending: true, payload: { id: existing.id } }];
  const view = setup();
  await act(() => new Promise(resolve => setTimeout(resolve, 0)));
  const row = () => document.querySelector(".contracts-sheet-row-correction")!;
  fireEvent.change(row().querySelector('[data-sheet-col="1"]')!, { target: { value: "Nouvelle saisie" } });
  mocks.pending = [];
  view.rerender(<ContractsSpreadsheetView workspaceId="w" userId="me" contracts={[]} isLoading={false} canDelete />);
  expect(row()).toBeVisible();
  expect(row().querySelector('[data-sheet-col="1"]')).toHaveValue("Nouvelle saisie");
  view.unmount();
  setup();
  expect(row()).toBeVisible();
  expect(row().querySelector('[data-sheet-col="1"]')).toHaveValue("Nouvelle saisie");
});

it("retains the recovery draft while the updated projection is not yet durably saved", async () => {
  let finishSave!: (contract: Contract) => void;
  mocks.update.mockImplementationOnce(() => new Promise<Contract>(resolve => { finishSave = resolve; }));
  const view = setup([existing]);
  await act(() => new Promise(resolve => setTimeout(resolve, 0)));
  const salary = document.querySelector<HTMLInputElement>('[data-sheet-row="existingRow_existing"][data-sheet-col="8"]')!;
  fireEvent.change(salary, { target: { value: "50000" } });
  fireEvent.blur(salary);
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ salaryNumber: 50000 })));

  // The cache announces the in-memory value before its IndexedDB write resolves.
  const projected = { ...existing, salaryNumber: 50000 };
  view.rerender(<ContractsSpreadsheetView workspaceId="w" userId="me" contracts={[projected]} isLoading={false} canDelete />);
  const draftKey = "contract_unsaved_draft:spreadsheet:w:me";
  expect(JSON.parse(localStorage.getItem(draftKey)!).value.draftById.existing.salaryNumber).toBe("50000");

  await act(async () => { finishSave(projected); });
  await waitFor(() => expect(localStorage.getItem(draftKey)).toBeNull());
});
