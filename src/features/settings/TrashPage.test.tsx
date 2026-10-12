import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Contract } from "../../data/types";

const mocks = vi.hoisted(() => ({
  items: [] as Contract[], canDelete: true, permanentlyDelete: vi.fn()
}));
vi.mock("../auth/auth", () => ({
  useAuth: () => ({ user: { id: "admin", workspaceId: "workspace" }, can: () => mocks.canDelete })
}));
vi.mock("../../data/dataProvider", () => ({
  getDataProvider: () => ({ contracts: {
    list: async () => ({ items: mocks.items, total: mocks.items.length, page: 1, pageSize: 10 }),
    permanentlyDelete: mocks.permanentlyDelete
  } })
}));
vi.stubEnv("VITE_DATA_PROVIDER", "local");
const { TrashPage } = await import("./TrashPage");
const contract: Contract = {
  id: "trash-1", workspaceId: "workspace", applicantId: null, status: "saisie",
  gender: "Femme", firstName: "Marie", lastName: "JEAN", address: "Delmas", nif: "111-222-333-4",
  position: "Analyste", assignment: "Direction", salaryNumber: 30000, salaryText: "TRENTE MILLE",
  durationMonths: 12, createdAt: "2026-10-01", updatedAt: "2026-10-11", deletedAt: "2026-10-11"
};
let queryClient: QueryClient;
beforeEach(() => {
  mocks.items = [contract];
  mocks.canDelete = true;
  mocks.permanentlyDelete.mockReset().mockImplementation(async () => { mocks.items = []; });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); });

async function renderPage() {
  render(<QueryClientProvider client={queryClient}><MemoryRouter><TrashPage /></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("heading", { name: "Marie JEAN" });
}
function deleteButton() { return screen.getByRole("button", { name: /Supprimer définitivement/ }); }

it("asks for confirmation and removes the deleted contract and cached details", async () => {
  queryClient.setQueryData(["contract", contract.id], contract);
  await renderPage();
  fireEvent.click(deleteButton());
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Marie JEAN (trash-1)"));
  await screen.findByRole("heading", { name: "La corbeille est vide" });
  expect(mocks.permanentlyDelete).toHaveBeenCalledWith(contract.id, contract.workspaceId);
  expect(queryClient.getQueryData(["contract", contract.id])).toBeUndefined();
  expect(screen.getByLabelText("0 contrats supprimés")).toBeVisible();
});

it("keeps the contract when confirmation is cancelled", async () => {
  vi.mocked(window.confirm).mockReturnValue(false);
  await renderPage();
  fireEvent.click(deleteButton());
  expect(mocks.permanentlyDelete).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Marie JEAN" })).toBeVisible();
});

it("shows failures without removing the contract or changing the count", async () => {
  mocks.permanentlyDelete.mockRejectedValue(new Error("Suppression refusée."));
  await renderPage();
  fireEvent.click(deleteButton());
  expect(await screen.findByRole("alert")).toHaveTextContent("Suppression refusée.");
  expect(screen.getByRole("heading", { name: "Marie JEAN" })).toBeVisible();
  expect(screen.getByLabelText("1 contrats supprimés")).toBeVisible();
  expect(deleteButton()).toBeEnabled();
});

it("does not offer permanent deletion without the deletion permission", async () => {
  mocks.canDelete = false;
  await renderPage();
  expect(screen.queryByRole("button", { name: /Supprimer définitivement/ })).not.toBeInTheDocument();
});

it("prevents another deletion while the request is running", async () => {
  let complete!: () => void;
  mocks.permanentlyDelete.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
  await renderPage();
  fireEvent.click(deleteButton());
  await waitFor(() => expect(deleteButton()).toBeDisabled());
  fireEvent.click(deleteButton());
  expect(mocks.permanentlyDelete).toHaveBeenCalledOnce();
  complete();
  await waitFor(() => expect(deleteButton()).toBeEnabled());
});
