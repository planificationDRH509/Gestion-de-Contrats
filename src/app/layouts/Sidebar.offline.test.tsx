import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseSyncState } from "../../data/supabase/supabaseProvider";

const auth = vi.hoisted(() => ({ isLocked: false }));
vi.mock("../../features/auth/auth", () => ({
  useAuth: () => ({
    user: { id: "u", workspaceId: "w", name: "Agent", username: "agent", role: "admin" },
    isLocked: auth.isLocked,
    logout: vi.fn(),
    can: () => true
  })
}));
vi.mock("../../features/sync/SyncIssuesModal", () => ({
  SyncIssuesModal: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Synchronisation">
    <span>Failed to fetch</span><button onClick={onClose}>Fermer</button>
  </div>
}));
import { Sidebar } from "./Sidebar";

const syncState: SupabaseSyncState = {
    isOnline: false,
    isSyncing: false,
    pendingCount: 2,
    lastSyncedAt: null,
    lastError: "Failed to fetch",
    cached: { contracts: 2, applicants: 1, dossiers: 0, tags: 0 }
  };

beforeEach(() => { vi.stubEnv("VITE_DATA_PROVIDER", "supabase"); auth.isLocked = false; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it("keeps stale errors out of the sidebar and opens them only after clicking the card", () => {
  const props = { collapsed: false, syncState, onToggle: vi.fn(), onSync: vi.fn() };
  const view = render(<MemoryRouter><Sidebar {...props} isOnline={false} /></MemoryRouter>);

  expect(screen.getByText(/Hors ligne · 2 contrats/)).toBeInTheDocument();
  expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  expect(screen.queryByText("Synchronisation à vérifier")).not.toBeInTheDocument();
  expect(screen.queryByText("Disponible hors ligne")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Afficher la synchronisation" })).toBeEnabled();

  view.rerender(<MemoryRouter><Sidebar {...props} isOnline /></MemoryRouter>);
  expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  expect(screen.getByText("Synchronisation à vérifier")).toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Afficher la synchronisation" });
  expect(trigger).not.toHaveAttribute("title", "Failed to fetch");
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: "Synchronisation" })).toBeInTheDocument();
  expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
  expect(props.onSync).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("lets a collapsed sidebar open errors during synchronization", () => {
  const onSync = vi.fn();
  render(<MemoryRouter><Sidebar collapsed isOnline syncState={{ ...syncState, isSyncing: true }} onToggle={vi.fn()} onSync={onSync} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Afficher la synchronisation" }));
  expect(screen.getByRole("dialog", { name: "Synchronisation" })).toBeInTheDocument();
  expect(onSync).not.toHaveBeenCalled();
});

it("closes the error dialog when the session locks", () => {
  const props = { collapsed: false, syncState, onToggle: vi.fn(), onSync: vi.fn() };
  const view = render(<MemoryRouter><Sidebar {...props} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Afficher la synchronisation" }));
  auth.isLocked = true;
  view.rerender(<MemoryRouter><Sidebar {...props} /></MemoryRouter>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Afficher la synchronisation" })).toBeDisabled();
});
