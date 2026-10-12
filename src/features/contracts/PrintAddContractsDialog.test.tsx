import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Contract } from "../../data/types";
import { PrintAddContractsDialog } from "./PrintAddContractsDialog";

const mocks = vi.hoisted(() => ({ isError: false, isPending: false, refetch: vi.fn(), add: vi.fn(), close: vi.fn() }));
vi.mock("./contractsApi", () => ({ useContractsList: () => ({ data: { items: [
  { id: "one", workspaceId: "w", firstName: "Marie", lastName: "Jean", createdAt: "2026-10-01" },
  { id: "two", workspaceId: "w", firstName: "Anne", lastName: "Paul", createdAt: "2026-10-01" }
] }, isError: mocks.isError, refetch: mocks.refetch }) }));
vi.mock("../lists/listsApi", () => ({ useContractLists: () => ({ data: [], isPending: mocks.isPending }) }));
beforeEach(() => {
  mocks.isError = false; mocks.isPending = false; vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
const show = (contracts: Contract[] = []) => render(<PrintAddContractsDialog workspaceId="w" contracts={contracts} onAdd={mocks.add} onClose={mocks.close} />);

it("keeps selections across searches and adds only checked contracts", () => {
  show();
  fireEvent.click(screen.getByRole("checkbox", { name: "Marie JEAN" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Anne" } });
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Ajouter (1)" }));
  expect(mocks.add).toHaveBeenCalledWith(["one"]);
});
it("disables additions on loading or failure and offers retry", () => {
  mocks.isPending = true;
  const view = show();
  expect(screen.getByRole("status")).toHaveTextContent("Chargement");
  expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();
  mocks.isError = true;
  view.rerender(<PrintAddContractsDialog workspaceId="w" contracts={[]} onAdd={mocks.add} onClose={mocks.close} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Impossible");
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  expect(mocks.refetch).toHaveBeenCalledOnce();
});
it("cancels without changing the batch and excludes current contracts", () => {
  show([{ id: "one", workspaceId: "w", createdAt: "2026-10-01" } as Contract]);
  expect(screen.queryByRole("checkbox", { name: "Marie JEAN" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Anne PAUL" }));
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.add).not.toHaveBeenCalled();
});
