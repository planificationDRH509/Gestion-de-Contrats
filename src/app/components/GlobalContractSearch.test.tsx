import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalContractSearch } from "./GlobalContractSearch";

const useContractsListMock = vi.fn();

vi.mock("../../features/auth/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", workspaceId: "workspace-1" }
  })
}));

vi.mock("../../features/contracts/contractsApi", () => ({
  useContractsList: (...args: unknown[]) => useContractsListMock(...args)
}));

const contract = {
  id: "contract-1",
  workspaceId: "workspace-1",
  applicantId: null,
  status: "saisie" as const,
  gender: "Femme" as const,
  firstName: "Élodie",
  lastName: "Pierre",
  nif: "123-456-789-0",
  ninu: "987654",
  address: "Port-au-Prince",
  position: "Infirmière",
  assignment: "Hôpital général",
  salaryNumber: 1000,
  salaryText: "mille",
  durationMonths: 12,
  annee_fiscale: "2025-2026",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("GlobalContractSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useContractsListMock.mockImplementation(
      (_params: unknown, options?: { enabled?: boolean }) =>
        options?.enabled
          ? { data: { items: [contract], total: 1, page: 1, pageSize: 12 }, isFetching: false, isError: false }
          : { data: undefined, isFetching: false, isError: false }
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function renderSearch() {
    return render(
      <MemoryRouter initialEntries={["/app/taches"]}>
        <GlobalContractSearch />
        <Routes>
          <Route path="/app/taches" element={<span>Page des tâches</span>} />
          <Route path="/app/contrats/:contractId" element={<span>Détail du contrat</span>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("ouvre la recherche globale avec Ctrl+F et la ferme avec Échap", () => {
    renderSearch();

    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    act(() => vi.advanceTimersByTime(0));
    const input = screen.getByRole("combobox", { name: "Rechercher un contrat" });
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Recherche rapide de contrats" })).not.toBeInTheDocument();
  });

  it("réutilise la recherche de contrats et ouvre le résultat sélectionné", () => {
    renderSearch();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });

    fireEvent.change(screen.getByRole("combobox", { name: "Rechercher un contrat" }), {
      target: { value: "elodie" }
    });
    act(() => vi.advanceTimersByTime(180));

    expect(useContractsListMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1", query: "elodie", pageSize: 12 }),
      { enabled: true }
    );

    fireEvent.click(screen.getByRole("option", { name: /Élodie Pierre/i }));
    expect(screen.getByText("Détail du contrat")).toBeInTheDocument();
  });
  it("opens from navigation, contains keyboard focus and restores it on close", () => {
    renderSearch();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    act(() => window.dispatchEvent(new Event("contribution-open-search")));
    act(() => vi.advanceTimersByTime(0));
    const input = screen.getByRole("combobox");
    const close = screen.getByRole("button", { name: "Fermer la recherche" });
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(input).toHaveFocus();
    close.focus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("does not open an old result while a new query is pending", () => {
    renderSearch();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "elodie" } });
    act(() => vi.advanceTimersByTime(180));
    expect(screen.getByRole("option")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "autre" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByText("Page des tâches")).toBeInTheDocument();
  });

});
