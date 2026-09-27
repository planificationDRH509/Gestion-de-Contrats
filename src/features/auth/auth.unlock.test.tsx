import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { AuthProvider, useAuth } from "./auth";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  filter: vi.fn(),
  verifyAccount: vi.fn(),
  prepareTasks: vi.fn(),
  clearTasks: vi.fn(),
  saveOfflineCredential: vi.fn()
}));

vi.mock("../../data/supabase/supabaseClient", () => ({
  getSupabaseClient: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: (columns: string) => {
        const query = {
          eq: (column: string, value: string) => {
            mocks.filter(columns, column, value);
            return query;
          },
          maybeSingle: () => columns === "role"
            ? Promise.resolve({ data: { role: "admin" }, error: null })
            : mocks.verifyAccount()
        };
        return query;
      }
    })
  })
}));

vi.mock("../tasks/privateTaskOffline", () => ({
  preparePrivateTaskSession: mocks.prepareTasks,
  clearPrivateTaskOfflineData: mocks.clearTasks
}));

vi.mock("./offlineUnlock", async (importOriginal) => ({
  ...await importOriginal<typeof import("./offlineUnlock")>(),
  saveOfflineUnlockCredential: mocks.saveOfflineCredential
}));

function UnlockHarness() {
  const { isLocked, user, unlock, logout } = useAuth();
  const [message, setMessage] = useState("");

  return (
    <>
      <span data-testid="lock-state">{isLocked ? "locked" : "unlocked"}</span>
      <span data-testid="task-token">{user?.taskSessionToken}</span>
      <button type="button" onClick={() => void unlock("secret").then((result) => setMessage(result.error ?? ""))}>
        Déverrouiller
      </button>
      <button type="button" onClick={() => void logout()}>Changer de compte</button>
      <span data-testid="unlock-message">{message}</span>
    </>
  );
}

describe("automatic session unlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("contribution_auth", JSON.stringify({
      id: "user-1",
      username: "admin",
      name: "Administrateur",
      workspaceId: "workspace-1",
      role: "admin",
      taskSessionToken: "old-task-token"
    }));
    localStorage.setItem("contribution_last_activity", String(Date.now() - 16 * 60_000));
    mocks.prepareTasks.mockResolvedValue(undefined);
    mocks.clearTasks.mockResolvedValue(undefined);
    mocks.saveOfflineCredential.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    localStorage.removeItem("contribution_auth");
    localStorage.removeItem("contribution_last_activity");
    vi.restoreAllMocks();
  });

  function mount() {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider><UnlockHarness /></AuthProvider>
      </QueryClientProvider>
    );
  }

  it("accepts the account password when the private task RPC is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    mocks.verifyAccount.mockResolvedValue({ data: { id: "user-1" }, error: null });
    mount();

    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));

    await waitFor(() => expect(screen.getByTestId("lock-state")).toHaveTextContent("unlocked"));
    expect(mocks.verifyAccount).toHaveBeenCalledOnce();
    expect(mocks.filter).toHaveBeenCalledWith("id", "id", "user-1");
    expect(mocks.filter).toHaveBeenCalledWith("id", "password", "secret");
    expect(screen.getByTestId("task-token")).toHaveTextContent("old-task-token");
  });

  it("keeps the session locked when the account password is wrong", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    mocks.verifyAccount.mockResolvedValue({ data: null, error: null });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));

    await waitFor(() => expect(screen.getByTestId("unlock-message")).toHaveTextContent("Mot de passe incorrect."));
    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
  });

  it("unlocks even if the private task cache cannot be prepared", async () => {
    mocks.rpc.mockResolvedValue({ data: "new-task-token", error: null });
    mocks.prepareTasks.mockRejectedValue(new Error("Cache indisponible"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mount();

    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));

    await waitFor(() => expect(screen.getByTestId("lock-state")).toHaveTextContent("unlocked"));
    expect(screen.getByTestId("task-token")).toHaveTextContent("old-task-token");
  });

  it("can leave the lock screen if the private task cache is unreadable", async () => {
    mocks.clearTasks.mockRejectedValue(new Error("Cache indisponible"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mount();

    fireEvent.click(screen.getByRole("button", { name: "Changer de compte" }));

    await waitFor(() => expect(screen.getByTestId("task-token")).toBeEmptyDOMElement());
    expect(localStorage.getItem("contribution_auth")).toBeNull();
  });
});
