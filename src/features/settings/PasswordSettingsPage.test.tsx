import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PasswordSettingsPage } from "./PasswordSettingsPage";

const changePassword = vi.fn();

vi.mock("../auth/auth", () => ({
  useAuth: () => ({ changePassword })
}));

describe("PasswordSettingsPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    changePassword.mockReset();
    changePassword.mockResolvedValue({ success: true });
  });

  function renderPage() {
    render(
      <MemoryRouter>
        <PasswordSettingsPage />
      </MemoryRouter>
    );
  }

  it("refuse une confirmation différente", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Mot de passe actuel"), {
      target: { value: "ancien-secret" }
    });
    fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), {
      target: { value: "nouveau-secret" }
    });
    fireEvent.change(screen.getByLabelText("Confirmer le nouveau mot de passe"), {
      target: { value: "autre-secret" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Modifier le mot de passe/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "La confirmation ne correspond pas au nouveau mot de passe."
    );
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("modifie le mot de passe et vide le formulaire", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Mot de passe actuel"), {
      target: { value: "ancien-secret" }
    });
    fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), {
      target: { value: "nouveau-secret" }
    });
    fireEvent.change(screen.getByLabelText("Confirmer le nouveau mot de passe"), {
      target: { value: "nouveau-secret" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Modifier le mot de passe/ }));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith("ancien-secret", "nouveau-secret");
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Votre mot de passe a été modifié avec succès."
    );
    expect(screen.getByLabelText("Mot de passe actuel")).toHaveValue("");
  });
});
