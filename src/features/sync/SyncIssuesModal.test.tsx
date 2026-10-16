import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { SyncIssue } from "../../data/supabase/syncIssues";
import { SyncIssuesModal } from "./SyncIssuesModal";

const mocks = vi.hoisted(() => ({ issues: [] as SyncIssue[], read: vi.fn(), resolve: vi.fn(), sync: vi.fn(), close: vi.fn(), canEdit: true }));
vi.mock("../../data/supabase/syncIssues", () => ({
  getSyncIssues: mocks.read,
  resolveSyncIssue: mocks.resolve
}));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ can: () => mocks.canEdit }) }));

const first: SyncIssue = { id: "q1", workspaceId: "w", title: "Contrat · Marie JEAN", message: "Des modifications concurrentes concernent les mêmes données.", actions: ["retry", "refresh-local", "refresh-server"], fingerprint: "first-snapshot", affectedCount: 1 };
const second: SyncIssue = { id: "q2", workspaceId: "w", title: "Contrat · Anne PAUL", message: "Dossier inaccessible.", actions: ["retry", "delete-local", "ignore"], fingerprint: "second-snapshot", affectedCount: 3 };

beforeEach(() => {
  mocks.issues = [first, second];
  mocks.read.mockReset().mockImplementation(() => mocks.issues);
  mocks.resolve.mockReset().mockResolvedValue(undefined);
  mocks.sync.mockReset().mockResolvedValue(undefined);
  mocks.close.mockReset();
  mocks.canEdit = true;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function show(props: Partial<Parameters<typeof SyncIssuesModal>[0]> = {}) {
  const client = new QueryClient();
  client.setQueryData(["contract", "c1"], { id: "c1" });
  return {
    client,
    ...render(<QueryClientProvider client={client}><MemoryRouter><SyncIssuesModal workspaceId="w" isOnline isSyncing={false} pendingCount={2}
      onSync={mocks.sync} onClose={mocks.close} {...props} /></MemoryRouter></QueryClientProvider>)
  };
}

it("shows every error without uploading anything and uses only the actions offered for each one", () => {
  show();
  expect(screen.getByText("2 erreurs")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: first.title })).toHaveTextContent(first.message);
  expect(screen.getByRole("article", { name: second.title })).toHaveTextContent(second.message);
  expect(within(screen.getByRole("article", { name: second.title })).queryByRole("button", { name: "Actualiser le serveur" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Supprimer sur le serveur" })).not.toBeInTheDocument();
  expect(mocks.read).toHaveBeenCalledWith("w");
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
});

it("links corrections to the affected contract only for an allowed editor", () => {
  mocks.issues = [{ ...first, target: { kind: "contract", id: "c1" } }];
  const view = show();
  expect(screen.getByRole("link", { name: "Corriger" })).toHaveAttribute("href", "/app/contrats/c1/modifier");
  fireEvent.click(screen.getByRole("link", { name: "Corriger" }));
  expect(mocks.close).toHaveBeenCalledOnce();
  view.unmount();
  mocks.canEdit = false;
  show();
  expect(screen.queryByRole("link", { name: "Corriger" })).not.toBeInTheDocument();
});

it("resolves the selected snapshot then removes only that error and refreshes displayed data", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mocks.resolve.mockImplementation(async () => { mocks.issues = [second]; });
  const { client } = show();
  fireEvent.click(within(screen.getByRole("article", { name: first.title })).getByRole("button", { name: "Actualiser en local" }));
  await waitFor(() => expect(screen.queryByRole("article", { name: first.title })).not.toBeInTheDocument());
  expect(mocks.resolve).toHaveBeenCalledWith("w", "q1", "refresh-local", "first-snapshot");
  expect(screen.getByRole("article", { name: second.title })).toBeInTheDocument();
  expect(client.getQueryState(["contract", "c1"])?.isInvalidated).toBe(true);
});

it("confirms deletion and related operations before resolving", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  show();
  const remove = within(screen.getByRole("article", { name: second.title })).getByRole("button", { name: "Supprimer en local" });
  fireEvent.click(remove);
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("3 opérations liées"));
  expect(mocks.resolve).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(remove);
  await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith("w", "q2", "delete-local", "second-snapshot"));
});

it("refreshes restored data even when resuming synchronization loses the connection", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mocks.resolve.mockImplementation(async () => {
    mocks.issues = [second];
    throw new Error("Connexion interrompue.");
  });
  const { client } = show();
  fireEvent.click(within(screen.getByRole("article", { name: first.title })).getByRole("button", { name: "Actualiser en local" }));
  await waitFor(() => expect(screen.queryByRole("article", { name: first.title })).not.toBeInTheDocument());
  expect(client.getQueryState(["contract", "c1"])?.isInvalidated).toBe(true);
  expect(screen.getByRole("alert")).toHaveTextContent("Connexion interrompue.");
  expect(screen.getByRole("article", { name: second.title })).toBeInTheDocument();
});

it("retains a failed error and prevents simultaneous resolutions", async () => {
  let reject!: (error: Error) => void;
  mocks.resolve.mockReturnValue(new Promise<void>((_, fail) => { reject = fail; }));
  show();
  fireEvent.click(within(screen.getByRole("article", { name: first.title })).getByRole("button", { name: "Réessayer" }));
  expect(screen.getByRole("button", { name: "Fermer" })).toBeDisabled();
  const otherRetry = within(screen.getByRole("article", { name: second.title })).getByRole("button", { name: "Réessayer" });
  expect(otherRetry).toBeDisabled();
  fireEvent.click(otherRetry);
  expect(mocks.resolve).toHaveBeenCalledTimes(1);
  await act(async () => { reject(new Error("Accès refusé.")); });
  expect(within(screen.getByRole("article", { name: first.title })).getByRole("alert")).toHaveTextContent("Accès refusé.");
  expect(screen.getByRole("article", { name: second.title })).toBeInTheDocument();
  expect(otherRetry).toBeEnabled();
});

it("refreshes the list when another synchronization resolves an error", () => {
  show();
  mocks.issues = [second];
  act(() => { window.dispatchEvent(new CustomEvent("contribution-offline-sync")); });
  expect(screen.queryByRole("article", { name: first.title })).not.toBeInTheDocument();
  expect(screen.getByText("1 erreur")).toBeInTheDocument();
});

it("allows reading errors offline and disables the server actions", () => {
  show({ isOnline: false });
  expect(screen.getByRole("status")).toHaveTextContent("Hors ligne");
  expect(screen.getByRole("button", { name: "Synchroniser" })).toBeDisabled();
  expect(screen.getAllByRole("button", { name: "Réessayer" }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
  expect(screen.getByRole("button", { name: "Fermer" })).toBeEnabled();
});

it("permits manual synchronization with no errors and restores focus when closed", async () => {
  mocks.issues = [];
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const view = show();
  expect(screen.getByText("Aucune erreur de synchronisation.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Synchroniser" }));
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce());
  view.unmount();
  expect(trigger).toHaveFocus();
  trigger.remove();
});
