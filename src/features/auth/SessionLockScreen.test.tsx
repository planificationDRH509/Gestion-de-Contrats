import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionLockScreen } from "./SessionLockScreen";

const unlock = vi.fn();
const logout = vi.fn();

vi.mock("./auth", () => ({
  useAuth: () => ({
    user: { name: "Jean Dupont" },
    unlock,
    logout
  })
}));

describe("SessionLockScreen", () => {
  afterEach(cleanup);

  beforeEach(() => {
    unlock.mockReset();
    logout.mockReset();
    unlock.mockResolvedValue({ success: true });
  });

  it("demande le mot de passe pour déverrouiller la session", async () => {
    render(<SessionLockScreen />);

    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "mot-de-passe" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Déverrouiller/ }));

    await waitFor(() => {
      expect(unlock).toHaveBeenCalledWith("mot-de-passe");
    });
  });

  it("affiche une erreur lorsque le mot de passe est incorrect", async () => {
    unlock.mockResolvedValue({ success: false, error: "Mot de passe incorrect." });
    render(<SessionLockScreen />);

    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "incorrect" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Déverrouiller/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Mot de passe incorrect.");
    expect(screen.getByLabelText("Mot de passe")).toHaveValue("");
  });
});
