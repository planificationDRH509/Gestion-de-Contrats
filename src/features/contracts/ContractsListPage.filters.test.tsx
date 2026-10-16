import type { Contract } from "../../data/types";
import type { ContractList } from "../lists/listModel";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lists: [] as ContractList[], list: vi.fn(() => ({ data: { items: [] as Contract[], total: 0, page: 1, pageSize: 25 }, isLoading: false })) }));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: { id: "u", workspaceId: "w" }, can: () => false }) }));
vi.mock("./contractsApi", () => ({
  useContractsList: mocks.list,
  useAssignContractsToDossier: () => ({}), useDeleteContract: () => ({}), usePrintJob: () => ({}),
  useChangeContractsStatus: () => ({}), useChangeContractsDuration: () => ({}), useUpdateContractComment: () => ({})
}));
vi.mock("../salary-grid/salaryGridApi", () => ({ useSalaryGrid: () => ({ entries: [
  { id: "nurse", masculine: "Infirmier", feminine: "Infirmière", aliases: ["Soignant"], active: true, salaries: [] }
] }) }));
vi.mock("../settings/settingsApi", () => ({ getStoredContractStartDate: () => null, useFiscalYear: () => ({ fiscalYear: "2025-2026" }) }));
vi.mock("../settings/suggestionsApi", () => ({ useInstitutions: () => ({ data: [
  { id: "a", label: "Hôpital de Delmas", department: "Ouest", commune: "Delmas" },
  { id: "b", label: "Hôpital du Cap", department: "Nord", commune: "Cap-Haïtien" }
] }), useAddresses: () => ({ data: [] }) }));
vi.mock("../dossiers/dossiersApi", () => ({
  useDossiersList: () => ({ data: [{ id: "dossier-test", workspaceId: "w", name: "Campagne", status: "active", priority: "normal", isEphemeral: false, contractTargetCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }),
  useDossierContractMetrics: () => ({ data: {} }), useUpdateDossier: () => ({}), useDeleteDossier: () => ({})
}));
vi.mock("./tagsApi", () => ({ useTags: () => ({ data: [{ id: "urgent", name: "Urgent" }] }), useCreateTag: () => ({}), useAssignTagToContract: () => ({}) }));
vi.mock("../auth/usersApi", () => ({ useAppUsers: () => ({ data: [
  { id: "u", fullName: "Louise Louis", username: "louise" },
  { id: "marie", fullName: "Marie Jean", username: "marie" },
  { id: "jean", fullName: "Jean Pierre", username: "jean" },
  { id: "other-marie", fullName: "Marie Jean", username: "marie2" }
] }) }));
vi.mock("../tasks/tasksApi", () => ({ usePrivateTasks: () => ({ data: [] }) }));
vi.mock("../lists/listsApi", () => ({ useContractLists: () => ({ data: mocks.lists }) }));
vi.mock("./pinnedContracts", () => ({ usePinnedContracts: () => ({ ids: [] }) }));
vi.mock("./ContractsImportModal", () => ({ ContractsImportModal: () => null }));
import { ContractsListPage } from "./ContractsListPage";
import { getFiscalYearForDate, getTodayDateInputValue } from "../../lib/contractDateFilters";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.list.mockReturnValue({ data: { items: [], total: 0, page: 1, pageSize: 25 }, isLoading: false });
  mocks.lists = [];
  localStorage.clear();
  sessionStorage.clear();
});
function setup() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ContractsListPage /></MemoryRouter>
  </QueryClientProvider>);
}
function expectParams(params: object) {
  expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining(params));
}

describe("contract list filters", () => {
  it("combines multiple creators with the other filters and can remove or reset them", async () => {
    setup();
    await userEvent.type(screen.getByRole("searchbox", { name: "Rechercher par nom, NIF ou NINU" }), "Louis");
    await userEvent.click(screen.getByRole("button", { name: "Aujourd'hui" }));
    await userEvent.click(screen.getByRole("button", { name: /Filtres/ }));
    await userEvent.click(screen.getByRole("button", { name: /Toutes les durées/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "6 mois" }));
    await userEvent.click(screen.getByRole("button", { name: /Tous les utilisateurs/ }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Rechercher dans Utilisateurs" }), "marie");
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    await userEvent.click(screen.getByRole("checkbox", { name: "Marie Jean (@marie)" }));
    expectParams({ createdByIds: ["marie"], onlyMine: false, query: "Louis", durations: [6], dateFilterMode: "day", page: 1 });
    expect(screen.getByRole("button", { name: "Tous les contrats" })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("searchbox", { name: "Rechercher dans Utilisateurs" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Jean Pierre" }));
    await userEvent.click(screen.getByRole("button", { name: /État/ }));
    await userEvent.click(screen.getByRole("button", { name: /Signé/ }));
    expectParams({ createdByIds: ["marie", "jean"], status: "signe", durations: [6], query: "Louis", dateFilterMode: "day" });
    await userEvent.click(screen.getByTitle("Retirer le filtre utilisateurs"));
    expectParams({ createdByIds: undefined, onlyMine: false, status: "signe", durations: [6], page: 1 });
    await userEvent.click(screen.getByRole("button", { name: /Tous les utilisateurs/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Marie Jean (@marie2)" }));
    expectParams({ createdByIds: ["other-marie"] });
    await userEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expectParams({ createdByIds: undefined, status: undefined, durations: undefined, query: undefined, dateFilterMode: undefined, page: 1 });
    expect(screen.queryByTitle("Retirer le filtre utilisateurs")).not.toBeInTheDocument();
  });

  it("clears the creator selection when returning to Mes contrats without clearing other filters", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Aujourd'hui" }));
    await userEvent.click(screen.getByRole("button", { name: /Filtres/ }));
    await userEvent.click(screen.getByRole("button", { name: /Tous les utilisateurs/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Jean Pierre" }));
    await userEvent.click(screen.getByRole("button", { name: "Tous les contrats" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Mes contrats" }));
    expectParams({ onlyMine: true, createdByIds: undefined, dateFilterMode: "day", page: 1 });
    expect(screen.queryByTitle("Retirer le filtre utilisateurs")).not.toBeInTheDocument();
  });

  it("reads the persisted Listé state and filters by status", async () => {
    const contract = {
      id: "c1", workspaceId: "w", firstName: "Jean", lastName: "Louis", nif: "1234567890",
      gender: "Homme", address: "Delmas", position: "Infirmier", assignment: "Hôpital",
      salaryNumber: 1000, salaryText: "Mille", durationMonths: 6, status: "liste",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    } as Contract;
    mocks.list.mockReturnValue({ data: { items: [contract], total: 1, page: 1, pageSize: 25 }, isLoading: false });
    mocks.lists = [{ id: "lot", workspaceId: "w", durationMonths: 6, visaNumber: null, sealedAt: null, version: 1, createdAt: contract.createdAt, history: [], members: [{ ...contract, nif: contract.nif! }] }];
    setup();
    expect(screen.getAllByText("Listé")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Listé/ })).toBeDisabled();
    expect(screen.queryByText("Signé")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Filtres/ }));
    await userEvent.click(screen.getByRole("button", { name: /État/ }));
    await userEvent.click(screen.getByRole("button", { name: /Signé/ }));
    expectParams({ status: "signe" });
    mocks.lists = [];
    mocks.list.mockReturnValue({ data: { items: [{ ...contract, status: "saisie" }], total: 1, page: 1, pageSize: 25 }, isLoading: false });
    await userEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expect(screen.queryByText("Listé")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Saisie/ })).toBeInTheDocument();
  });

  it("filters Listé from the database even when lists are not cached", async () => {
    mocks.lists = [{ id: "lot", members: [{ id: "c1" }, { id: "c2" }] } as ContractList];
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Filtres/ }));
    await userEvent.click(screen.getByRole("button", { name: /État/ }));
    await userEvent.click(screen.getByRole("button", { name: /Listé/ }));
    expectParams({ status: "liste", page: 1 });
    mocks.lists = [];
    await userEvent.type(screen.getByRole("searchbox", { name: "Rechercher par nom, NIF ou NINU" }), "Jean");
    expectParams({ status: "liste" });
    await userEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expectParams({ status: undefined });
  });

  it("selects a fiscal year independently of dates and restores the current year on reset", async () => {
    setup();
    const currentYear = getFiscalYearForDate(new Date());
    expectParams({ fiscalYear: currentYear, dateFilterMode: undefined });
    await userEvent.click(screen.getByRole("button", { name: /Filtres/ }));
    const yearSelect = screen.getByRole("combobox", { name: "Exercice fiscal" });
    expect(yearSelect).toHaveValue(currentYear);
    await userEvent.selectOptions(yearSelect, "2024-2025");
    expectParams({ fiscalYear: "2024-2025", dateFilterMode: undefined, page: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Aujourd'hui" }));
    expectParams({ fiscalYear: "2024-2025", dateFilterMode: "day" });
    await userEvent.click(screen.getByRole("button", { name: "Aujourd'hui" }));
    expectParams({ fiscalYear: "2024-2025", dateFilterMode: undefined });
    await userEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expectParams({ fiscalYear: currentYear, dateFilterMode: undefined, page: 1 });
    expect(yearSelect).toHaveValue(currentYear);
  });

  it("shows the total across pages and updates it with filters and scope", async () => {
    mocks.list.mockImplementation((params?: { query?: string; onlyMine?: boolean }) => ({
      data: { items: [], total: params?.query ? 0 : params?.onlyMine ? 72 : 130, page: 1, pageSize: 25 },
      isLoading: false
    }));
    setup();
    const badge = screen.getByRole("status", { name: "Nombre de contrats" });
    expect(badge).toHaveTextContent("72");
    await userEvent.click(screen.getByRole("button", { name: "Mes contrats" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Tous les contrats" }));
    expect(badge).toHaveTextContent("130");
    await userEvent.type(screen.getByRole("searchbox", { name: "Rechercher par nom, NIF ou NINU" }), "Jean");
    expect(badge).toHaveTextContent("0");
    await userEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expect(badge).toHaveTextContent("130");
  });

  it("opens current fiscal year contracts in a dossier without retaining unrelated filters", async () => {
    setup();
    await userEvent.type(screen.getByRole("searchbox", { name: "Rechercher par nom, NIF ou NINU" }), "Jean");
    await userEvent.click(screen.getByRole("button", { name: "Aujourd'hui" }));
    await userEvent.click(screen.getByRole("button", { name: /Dossiers/ }));
    await userEvent.click(screen.getByRole("button", { name: /Autres dossiers/ }));
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir les contrats de Campagne" }));
    expectParams({ dossierId: "dossier-test", onlyMine: false, query: undefined, dateFilterMode: undefined, fiscalYear: getFiscalYearForDate(new Date()), page: 1 });
    expect(screen.getByRole("button", { name: "Tous les contrats" })).toBeInTheDocument();
  });

  it("selects the contract scope from the view button and remembers it on remount", async () => {
    setup();
    expectParams({ onlyMine: true });
    const trigger = screen.getByRole("button", { name: "Mes contrats" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await userEvent.click(trigger);
    expect(screen.getByRole("menuitemradio", { name: "Mes contrats" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Tous les contrats" }));
    expectParams({ onlyMine: false, page: 1 });
    expect(localStorage.getItem("contracts_view_all")).toBe("true");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    cleanup();
    setup();
    const savedTrigger = screen.getByRole("button", { name: "Tous les contrats" });
    expectParams({ onlyMine: false });
    await userEvent.click(savedTrigger);
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Mes contrats" }));
    expectParams({ onlyMine: true, page: 1 });
    expect(localStorage.getItem("contracts_view_all")).toBe("false");
    expect(screen.getByRole("button", { name: "Mes contrats" })).toHaveFocus();
  });

  it("keeps Date in the filter panel and toggles today directly from the toolbar", async () => {
    setup();
    expect(screen.queryByRole("button", { name: /event Date/ })).not.toBeInTheDocument();
    const today = screen.getByRole("button", { name: "Aujourd'hui" });
    await userEvent.click(today);
    expectParams({ dateFilterMode: "day", dateFilterDate: getTodayDateInputValue(), page: 1 });
    expect(today).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(today);
    expectParams({ dateFilterMode: undefined, fiscalYear: getFiscalYearForDate(new Date()), dateFilterDate: undefined, page: 1 });
    expect(today).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: /Filtres/ }));
    await userEvent.click(screen.getByRole("button", { name: /event Date/ }));
    await userEvent.click(screen.getByRole("button", { name: /Semaine actuelle/ }));
    expectParams({ dateFilterMode: "week" });
    await userEvent.click(today);
    expectParams({ dateFilterMode: "day", dateFilterDate: getTodayDateInputValue(), page: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expect(today).toHaveAttribute("aria-pressed", "false");
  });
  it("combines durations with other filters and supports removal and reset", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Filtres/ }));
    await userEvent.click(screen.getByRole("button", { name: /Toutes les durées/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "6 mois" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "12 mois" }));
    expectParams({ durations: [6, 12], page: 1 });
    await userEvent.click(screen.getByRole("button", { name: /État/ }));
    await userEvent.click(screen.getByRole("button", { name: /Imp\. Part\./ }));
    expectParams({ durations: [6, 12], status: "impression_partiel" });
    await userEvent.click(screen.getByTitle("Retirer le filtre durée"));
    expectParams({ durations: undefined, status: "impression_partiel", page: 1 });
    await userEvent.click(screen.getByRole("button", { name: /Toutes les durées/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "9 mois" }));
    await userEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expectParams({ durations: undefined, status: undefined, page: 1 });
    expect(screen.queryByTitle("Retirer le filtre durée")).not.toBeInTheDocument();
  });
  it("resets the tag even when it is the only active filter", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /label Tag/ }));
    await userEvent.click(screen.getByRole("button", { name: /Urgent/ }));
    expectParams({ tagId: "urgent" });
    await userEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expectParams({ tagId: undefined, page: 1 });
    expect(screen.queryByTitle("Retirer le filtre tag")).not.toBeInTheDocument();
  });

  it("filters by feminine job titles and partial printing status", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Filtres/ }));
    await userEvent.click(screen.getByRole("button", { name: /Toutes les fonctions/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Infirmière" }));
    expectParams({ positions: ["Infirmière"], page: 1 });
    await userEvent.click(screen.getByRole("button", { name: /État/ }));
    await userEvent.click(screen.getByRole("button", { name: /Imp\. Part\./ }));
    expectParams({ positions: ["Infirmière"], status: "impression_partiel", page: 1 });
  });

  it("locks the location implied by a commune and releases it when removed", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Filtres/ }));
    await userEvent.click(screen.getByRole("button", { name: /Toutes les communes/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Delmas" }));
    expectParams({ assignments: ["Hôpital de Delmas"] });
    expect(screen.getByRole("button", { name: /Ouest/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Hôpital de Delmas/ })).toBeDisabled();
    await userEvent.click(screen.getByTitle("Retirer le filtre commune"));
    expect(screen.getByRole("button", { name: /Tous les départements/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Toutes les institutions/ })).toBeEnabled();
    expectParams({ assignments: undefined });
    await userEvent.click(screen.getByRole("button", { name: /Tous les départements/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Nord" }));
    expectParams({ assignments: ["Hôpital du Cap"], page: 1 });
    expect(screen.getByRole("button", { name: /Cap-Haïtien/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Hôpital du Cap/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expect(screen.getByRole("button", { name: /Toutes les communes/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Toutes les institutions/ })).toBeEnabled();
  });

  it("derives commune and department from institutions and permits multiple institutions", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Filtres/ }));
    await userEvent.click(screen.getByRole("button", { name: /Toutes les institutions/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Hôpital de Delmas" }));
    expect(screen.getByRole("button", { name: /Ouest/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Delmas expand/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Hôpital du Cap" }));
    expectParams({ assignments: ["Hôpital de Delmas", "Hôpital du Cap"] });
    expect(screen.getByRole("button", { name: /Tous les départements/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Toutes les communes/ })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /Tous les départements/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Nord" }));
    expectParams({ assignments: ["Hôpital du Cap"] });
    expect(screen.getByRole("button", { name: /Hôpital du Cap/ })).toBeDisabled();
  });
});
