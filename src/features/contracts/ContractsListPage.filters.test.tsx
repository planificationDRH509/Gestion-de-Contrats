import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(() => ({ data: { items: [], total: 0, page: 1, pageSize: 25 }, isLoading: false })) }));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: { id: "u", workspaceId: "w" }, can: () => false }) }));
vi.mock("./contractsApi", () => ({
  useContractsList: mocks.list,
  useAssignContractsToDossier: () => ({}), useDeleteContract: () => ({}), usePrintJob: () => ({}),
  useChangeContractsStatus: () => ({}), useChangeContractsDuration: () => ({}), useUpdateContractComment: () => ({})
}));
vi.mock("../salary-grid/salaryGridApi", () => ({ useSalaryGrid: () => ({ entries: [
  { id: "nurse", masculine: "Infirmier", feminine: "Infirmière", aliases: ["Soignant"], active: true, salaries: [] }
] }) }));
vi.mock("../settings/settingsApi", () => ({ useFiscalYear: () => ({ fiscalYear: "2025-2026" }) }));
vi.mock("../settings/suggestionsApi", () => ({ useInstitutions: () => ({ data: [
  { id: "a", label: "Hôpital de Delmas", department: "Ouest", commune: "Delmas" },
  { id: "b", label: "Hôpital du Cap", department: "Nord", commune: "Cap-Haïtien" }
] }), useAddresses: () => ({ data: [] }) }));
vi.mock("../dossiers/dossiersApi", () => ({ useDossiersList: () => ({ data: [] }), useDossierContractMetrics: () => ({ data: {} }) }));
vi.mock("./tagsApi", () => ({ useTags: () => ({ data: [{ id: "urgent", name: "Urgent" }] }), useCreateTag: () => ({}), useAssignTagToContract: () => ({}) }));
vi.mock("../auth/usersApi", () => ({ useAppUsers: () => ({ data: [] }) }));
vi.mock("../tasks/tasksApi", () => ({ usePrivateTasks: () => ({ data: [] }) }));
vi.mock("../lists/listsApi", () => ({ useContractLists: () => ({ data: [] }) }));
vi.mock("./pinnedContracts", () => ({ usePinnedContracts: () => ({ ids: [] }) }));
vi.mock("./ContractsImportModal", () => ({ ContractsImportModal: () => null }));
import { ContractsListPage } from "./ContractsListPage";

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });
function setup() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ContractsListPage /></MemoryRouter>
  </QueryClientProvider>);
}
function expectParams(params: object) {
  expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining(params));
}

describe("contract list filters", () => {
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

  it("removes an incompatible commune when changing departments", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Filtres/ }));
    await userEvent.click(screen.getByRole("button", { name: /Toutes les communes/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Delmas" }));
    expectParams({ assignments: ["Hôpital de Delmas"] });
    await userEvent.click(screen.getByRole("button", { name: /Tous les départements/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Nord" }));
    expectParams({ assignments: ["Hôpital du Cap"], page: 1 });
    expect(screen.queryByTitle("Retirer le filtre commune")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Toutes les communes/ }));
    expect(screen.queryByRole("checkbox", { name: "Delmas" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Cap-Haïtien" })).toBeInTheDocument();
  });
});
