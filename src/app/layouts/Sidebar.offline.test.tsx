import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import type { SupabaseSyncState } from "../../data/supabase/supabaseProvider";

vi.mock("../../features/auth/auth", () => ({
  useAuth: () => ({
    user: { id: "u", workspaceId: "w", name: "Agent", username: "agent", role: "admin" },
    logout: vi.fn(),
    can: () => true
  })
}));
vi.stubEnv("VITE_DATA_PROVIDER", "supabase");
const { Sidebar } = await import("./Sidebar");

it("shows the offline state instead of a stale sync error", () => {
  const syncState: SupabaseSyncState = {
    isOnline: false,
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: "Failed to fetch",
    cached: { contracts: 2, applicants: 1, dossiers: 0, tags: 0 }
  };
  const props = { collapsed: false, syncState, onToggle: vi.fn(), onSync: vi.fn() };
  const view = render(<MemoryRouter><Sidebar {...props} isOnline={false} /></MemoryRouter>);

  expect(screen.getByText(/Hors ligne · 2 contrats/)).toBeInTheDocument();
  expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  expect(screen.queryByText("Synchronisation à vérifier")).not.toBeInTheDocument();
  expect(screen.queryByText("Disponible hors ligne")).not.toBeInTheDocument();

  view.rerender(<MemoryRouter><Sidebar {...props} isOnline /></MemoryRouter>);
  expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
});
