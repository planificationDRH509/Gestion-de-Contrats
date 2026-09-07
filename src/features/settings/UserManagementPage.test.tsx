import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAppUsers: vi.fn(),
  insert: vi.fn()
}));

vi.mock("../../data/supabase/supabaseClient", () => ({
  getSupabaseClient: () => ({
    from: () => ({ insert: mocks.insert })
  })
}));

vi.mock("../auth/auth", () => ({
  useAuth: () => ({
    user: {
      id: "admin-id",
      username: "admin",
      name: "Administrateur",
      workspaceId: "workspace_default",
      role: "admin"
    },
    can: () => true
  })
}));

vi.mock("../auth/usersApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/usersApi")>();
  return { ...actual, fetchAppUsers: mocks.fetchAppUsers };
});

import { UserManagementPage } from "./UserManagementPage";

function fillNewAccountForm() {
  fireEvent.change(screen.getByLabelText("Nom complet"), {
    target: { value: "Jean Dupont" }
  });
  fireEvent.change(screen.getByLabelText("Nom d’utilisateur"), {
    target: { value: "jdupont" }
  });
  fireEvent.change(screen.getByLabelText("Mot de passe"), {
    target: { value: "mot-de-passe" }
  });
}

describe("UserManagementPage", () => {
  beforeEach(() => {
    mocks.fetchAppUsers.mockReset();
    mocks.fetchAppUsers.mockResolvedValue({
      hasRoleColumn: true,
      users: [
        {
          id: "admin-id",
          username: "admin",
          fullName: "Administrateur",
          role: "admin",
          createdAt: null,
          updatedAt: null
        }
      ]
    });
    mocks.insert.mockReset();
    mocks.insert.mockResolvedValue({ error: null });
  });

  afterEach(() => cleanup());

  it("re-enables account creation after a network failure", async () => {
    mocks.insert
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ error: null });

    render(<UserManagementPage />);
    await screen.findByText("@admin · Vous");
    fillNewAccountForm();

    fireEvent.click(screen.getByRole("button", { name: /Créer le compte/ }));

    expect(
      await screen.findByText(
        "Impossible de joindre le serveur. Vérifiez la connexion puis réessayez."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Créer le compte/ })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /Créer le compte/ }));

    expect(await screen.findByText("Utilisateur créé avec succès.")).toBeInTheDocument();
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(2));
  });

  it("explains when the username is already used", async () => {
    mocks.insert.mockResolvedValue({
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "app_users_username_key"'
      }
    });

    render(<UserManagementPage />);
    await screen.findByText("@admin · Vous");
    fillNewAccountForm();
    fireEvent.click(screen.getByRole("button", { name: /Créer le compte/ }));

    expect(
      await screen.findByText(
        "Ce nom d’utilisateur existe déjà. Choisissez-en un autre."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Créer le compte/ })).toBeEnabled();
  });
});
