import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { AuthProvider, useAuth } from "./auth";
import { ACCOUNT_SUSPENDED_MESSAGE, readAccountLockout, recordServerSuspension } from "./accountLockout";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  profile: vi.fn(),
  filter: vi.fn(),
  verifyAccount: vi.fn(),
  prepareTasks: vi.fn(),
  clearTasks: vi.fn(),
  saveOfflineCredential: vi.fn(),
  verifyOfflineCredential: vi.fn()
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
          maybeSingle: () => columns === "role, is_suspended"
            ? mocks.profile()
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
  saveOfflineUnlockCredential: mocks.saveOfflineCredential,
  verifyOfflineUnlockCredential: mocks.verifyOfflineCredential
}));

function UnlockHarness() {
  const { isLocked, user, unlock, logout, login } = useAuth();
  const [message, setMessage] = useState("");

  return (
    <>
      <span data-testid="lock-state">{isLocked ? "locked" : "unlocked"}</span>
      <span data-testid="task-token">{user?.taskSessionToken}</span>
      <button type="button" onClick={() => void unlock("secret").then((result) => setMessage(result.error ?? ""))}>
        Déverrouiller
      </button>
      <button type="button" onClick={() => void logout()}>Changer de compte</button>
      <button type="button" onClick={() => void login("admin", "secret")}>Connexion</button>
      <span data-testid="unlock-message">{message}</span>
    </>
  );
}

describe("automatic session unlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.verifyOfflineCredential.mockResolvedValue(null);
    mocks.profile.mockResolvedValue({ data: { role: "admin", is_suspended: false }, error: null });
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
    localStorage.clear();
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

  it.each([true, false])("unlocks locally without waiting for the server (online: %s)", async online => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
    mocks.verifyOfflineCredential.mockResolvedValue(true);
    mocks.rpc.mockImplementation(() => new Promise(() => {}));
    mocks.profile.mockImplementation(() => new Promise(() => {}));
    mount();
    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
    const started = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
    await waitFor(() => expect(screen.getByTestId("lock-state")).toHaveTextContent("unlocked"));
    expect(mocks.verifyOfflineCredential).toHaveBeenCalledWith("user-1", "secret");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.prepareTasks).not.toHaveBeenCalled();
    expect(mocks.saveOfflineCredential).not.toHaveBeenCalled();
    expect(screen.getByTestId("task-token")).toHaveTextContent("old-task-token");
    expect(Number(localStorage.getItem("contribution_last_activity"))).toBeGreaterThanOrEqual(started);
  });

  it("rejects a wrong local password online without asking the server or counting it twice", async () => {
    mocks.verifyOfflineCredential.mockResolvedValue(false);
    mocks.rpc.mockResolvedValue({ data: { taskSessionToken: "new-token" }, error: null });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
    await waitFor(() => expect(screen.getByTestId("unlock-message")).toHaveTextContent("Mot de passe incorrect."));
    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
    expect(readAccountLockout("user-1").failures).toBe(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("falls back to the server and installs a verifier when the local credential is missing", async () => {
    mocks.rpc.mockResolvedValue({ data: { taskSessionToken: "new-task-token" }, error: null });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
    await waitFor(() => expect(screen.getByTestId("lock-state")).toHaveTextContent("unlocked"));
    expect(mocks.rpc).toHaveBeenCalledWith("authenticate_app_user", { p_user_id: "user-1", p_password: "secret" });
    expect(mocks.verifyOfflineCredential.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);
    expect(mocks.saveOfflineCredential).toHaveBeenCalledWith("user-1", "secret");
    expect(screen.getByTestId("task-token")).toHaveTextContent("new-task-token");
  });

  it("stays locked offline when no local credential is available", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
    await waitFor(() => expect(screen.getByTestId("unlock-message")).toHaveTextContent("Une connexion Internet est requise"));
    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(readAccountLockout("user-1").failures).toBe(0);
  });

  it("never bypasses a known suspension with the correct local credential", async () => {
    recordServerSuspension("user-1");
    mocks.verifyOfflineCredential.mockResolvedValue(true);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
    await waitFor(() => expect(screen.getByTestId("unlock-message")).toHaveTextContent(ACCOUNT_SUSPENDED_MESSAGE));
    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
    expect(mocks.verifyOfflineCredential).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed without querying passwords when the authentication RPC is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    mocks.verifyAccount.mockResolvedValue({ data: { id: "user-1" }, error: null });
    mount();

    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));

    await waitFor(() => expect(screen.getByTestId("unlock-message")).toHaveTextContent("Impossible de vérifier le mot de passe."));
    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
    expect(mocks.verifyAccount).not.toHaveBeenCalled();
    expect(mocks.filter).not.toHaveBeenCalledWith("id", "password", "secret");
    expect(screen.getByTestId("task-token")).toHaveTextContent("old-task-token");
  });

  it("authenticates through the login RPC and saves the server-issued session", async () => {
    mocks.rpc.mockResolvedValue({ data: {
      id: "user-1", username: "admin", full_name: "Administrateur", role: "admin",
      workspaces: ["workspace_default"], taskSessionToken: "server-issued-token"
    }, error: null });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Connexion" }));
    await waitFor(() => expect(screen.getByTestId("task-token")).toHaveTextContent("server-issued-token"));
    expect(mocks.rpc).toHaveBeenCalledWith("login_app_user", { p_username: "admin", p_password: "secret" });
    expect(mocks.verifyAccount).not.toHaveBeenCalled();
    expect(localStorage.getItem("contribution_auth")).not.toContain("secret");
    expect(screen.getByTestId("lock-state")).toHaveTextContent("unlocked");
  });

  it("keeps the session locked when the account password is wrong", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "TASK_SESSION_INVALID_CREDENTIALS" } });
    mocks.verifyAccount.mockResolvedValue({ data: null, error: null });
    mount();

    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));

    await waitFor(() => expect(screen.getByTestId("unlock-message")).toHaveTextContent("Mot de passe incorrect."));
    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
  });

  it("preserves the encrypted cache and stays locked when it cannot be prepared", async () => {
    mocks.rpc.mockResolvedValue({ data: { taskSessionToken: "new-task-token" }, error: null });
    mocks.prepareTasks.mockRejectedValue(new Error("Cache indisponible"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mount();

    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));

    await waitFor(() => expect(screen.getByTestId("unlock-message")).toHaveTextContent("Impossible de déverrouiller les données locales."));
    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
    expect(screen.getByTestId("task-token")).toHaveTextContent("old-task-token");
  });

  it("rejects unlocking a suspended account", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "APP_ACCOUNT_SUSPENDED" } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
    await waitFor(() => expect(screen.getByTestId("unlock-message")).toHaveTextContent(ACCOUNT_SUSPENDED_MESSAGE));
    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
  });

  it("clears a revoked session on the next account check", async () => {
    mount();
    await waitFor(() => expect(mocks.profile).toHaveBeenCalled());
    mocks.profile.mockResolvedValue({ data: null, error: null });
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(screen.getByTestId("task-token")).toBeEmptyDOMElement());
    expect(localStorage.getItem("contribution_auth")).toBeNull();
  });

  it("persists suspension on the eighth offline failure and rejects the correct password afterwards", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.verifyOfflineCredential.mockResolvedValue(false);
    mount();
    for (let attempt = 1; attempt <= 8; attempt++) {
      fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
      await waitFor(() => expect(readAccountLockout("user-1").failures).toBe(attempt));
    }
    expect(screen.getByTestId("unlock-message")).toHaveTextContent(ACCOUNT_SUSPENDED_MESSAGE);
    expect(readAccountLockout("user-1")).toMatchObject({ suspended: true, pending: true, token: "old-task-token" });
    cleanup();
    mocks.verifyOfflineCredential.mockResolvedValue(true);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
    await waitFor(() => expect(screen.getByTestId("unlock-message")).toHaveTextContent(ACCOUNT_SUSPENDED_MESSAGE));
    expect(mocks.verifyOfflineCredential).toHaveBeenCalledTimes(8);
    expect(screen.getByTestId("lock-state")).toHaveTextContent("locked");
    fireEvent.click(screen.getByRole("button", { name: "Changer de compte" }));
    await waitFor(() => expect(screen.getByTestId("task-token")).toBeEmptyDOMElement());
    expect(readAccountLockout("user-1").pending).toBe(true);
  });

  it.each([true, false])("serializes overlapping local password checks (online: %s)", async online => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
    let finish!: (value: boolean) => void;
    mocks.verifyOfflineCredential.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
    fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
    expect(mocks.verifyOfflineCredential).toHaveBeenCalledTimes(1);
    finish(false);
    await waitFor(() => expect(readAccountLockout("user-1").failures).toBe(1));
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
