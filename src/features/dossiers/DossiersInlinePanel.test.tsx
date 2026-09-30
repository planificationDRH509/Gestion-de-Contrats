import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dossier } from "../../data/types";

const mocks = vi.hoisted(() => ({
  mobile: false, list: vi.fn(), metrics: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), view: vi.fn(), created: vi.fn()
}));
vi.mock("../../lib/useIsMobileViewport", () => ({ useIsMobileViewport: () => mocks.mobile }));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("./dossiersApi", () => ({
  useDossiersList: mocks.list, useDossierContractMetrics: mocks.metrics,
  useCreateDossier: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateDossier: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDeleteDossier: () => ({ mutateAsync: mocks.remove, isPending: false })
}));
import { DossiersInlinePanel } from "./DossiersInlinePanel";

function dossier(id: string, extras: Partial<Dossier> = {}): Dossier {
  return { id, name: id, workspaceId: "w", status: "active", isEphemeral: false, priority: "normal",
    contractTargetCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: "me", ...extras };
}
const initial = () => [
  dossier("Santé – Jérémie", { focalPoint: "Marie", deadlineDate: "2020-01-10", priority: "urgence", contractTargetCount: 10 }),
  dossier("Recrutement Nord", { createdBy: "other", deadlineDate: "2099-02-01" }),
  dossier("Archives", { updatedAt: "2020-01-01", createdBy: "other" }),
  dossier("Terminé", { status: "classified", createdBy: "other" }),
  dossier("Ancien dossier personnel", { createdBy: null })
];
function setup(canManage = true) {
  return render(<MemoryRouter><DossiersInlinePanel workspaceId="w" canManage={canManage} onViewDossier={mocks.view} onDossierCreated={mocks.created} /></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.mobile = false;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  mocks.list.mockReturnValue({ data: initial(), isLoading: false, refetch: vi.fn() });
  mocks.metrics.mockReturnValue({ data: { "Santé – Jérémie": { assignedCount: 12, doneCount: 3, authorIds: ["me"] }, "Ancien dossier personnel": { assignedCount: 1, doneCount: 0, authorIds: ["me"] } } });
  mocks.create.mockImplementation(async input => dossier("created", input));
  mocks.update.mockImplementation(async input => dossier(input.id, input));
  mocks.remove.mockResolvedValue(12);
});
afterEach(cleanup);

describe("Dossiers workspace", () => {
  it("keeps creation off mobile, including an empty workspace", () => {
    mocks.mobile = true;
    const rendered = setup();
    expect(screen.queryByRole("button", { name: "Nouveau dossier" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ouvrir les contrats de Santé – Jérémie" })).toBeInTheDocument();
    rendered.unmount();
    mocks.list.mockReturnValue({ data: [], isLoading: false });
    setup();
    expect(screen.queryByRole("button", { name: /Créer un dossier|Nouveau dossier/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aucun dossier" })).toBeInTheDocument();
  });
  it("combines ownership, state and accent-insensitive search without hiding colleagues by default", async () => {
    setup();
    expect(screen.getAllByRole("button", { name: /Ouvrir les contrats/ })).toHaveLength(3);
    await userEvent.selectOptions(screen.getByLabelText("Propriétaire des dossiers"), "mine");
    expect(screen.getAllByRole("button", { name: /Ouvrir les contrats/ })).toHaveLength(2);
    await userEvent.type(screen.getByRole("searchbox"), "jeremie");
    expect(screen.getAllByRole("button", { name: /Ouvrir les contrats/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir les contrats de Santé – Jérémie" }));
    expect(mocks.view).toHaveBeenCalledWith("Santé – Jérémie");
    await userEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
    await userEvent.selectOptions(screen.getByLabelText("Propriétaire des dossiers"), "others");
    await userEvent.click(screen.getByRole("button", { name: /Archivés/ }));
    expect(screen.getByRole("button", { name: "Ouvrir les contrats de Archives" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Classés/ }));
    expect(screen.getByRole("button", { name: "Ouvrir les contrats de Terminé" })).toBeInTheDocument();
  });
  it("sorts deadlines with undated dossiers last and reports the real progress", async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText("Trier les dossiers"), "deadline");
    expect(screen.getAllByRole("button", { name: /Ouvrir les contrats/ }).map(button => button.textContent)).toEqual([
      expect.stringContaining("Santé"), expect.stringContaining("Recrutement"), expect.stringContaining("Ancien")
    ]);
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "3");
    expect(screen.getByRole("progressbar")).toHaveAttribute("max", "10");
    expect(screen.getByText("En retard")).toBeInTheDocument();
  });
  it("opens cached dossiers without modification dates and sorts by their creation dates", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mocks.list.mockReturnValue({ data: [
      dossier("Ancien", { createdAt: `${today}T08:00:00Z`, updatedAt: null as unknown as string }),
      dossier("Récent", { createdAt: `${today}T12:00:00Z`, updatedAt: null as unknown as string }),
      dossier("Sans date", { createdAt: "", updatedAt: "" })
    ], isLoading: false });
    setup();
    expect(screen.getByRole("heading", { name: "Dossiers" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Ouvrir les contrats/ }).map(button => button.textContent)).toEqual([
      expect.stringContaining("Récent"), expect.stringContaining("Ancien"), expect.stringContaining("Sans date")
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir les contrats de Récent" }));
    expect(mocks.view).toHaveBeenCalledWith("Récent");
  });
  it("creates with planning fields, clears a stale search and calls the selection callback", async () => {
    setup();
    await userEvent.type(screen.getByRole("searchbox"), "inconnu");
    await userEvent.click(screen.getByRole("button", { name: "Nouveau dossier" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Nom du dossier"), "  Campagne  ");
    await userEvent.selectOptions(within(dialog).getByLabelText("Priorité"), "urgence");
    await userEvent.click(within(dialog).getByText("Planification et détails"));
    await userEvent.type(within(dialog).getByLabelText("Objectif de contrats"), "20");
    await userEvent.type(within(dialog).getByLabelText("Durée par défaut (mois)"), "6");
    await userEvent.type(within(dialog).getByLabelText("Point focal"), "Marie");
    await userEvent.click(within(dialog).getByRole("button", { name: "Créer le dossier" }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "w", name: "Campagne", priority: "urgence", contractTargetCount: 20, defaultDurationMonths: 6, focalPoint: "Marie" }));
    expect(mocks.created).toHaveBeenCalledWith("created");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
  it("keeps form input and an actionable error when saving fails", async () => {
    mocks.create.mockRejectedValue(new Error("Nom déjà utilisé."));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Nouveau dossier" }));
    await userEvent.type(screen.getByLabelText("Nom du dossier"), "Campagne");
    await userEvent.click(screen.getByRole("button", { name: "Créer le dossier" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("Nom déjà utilisé.");
    expect(screen.getByLabelText("Nom du dossier")).toHaveValue("Campagne");
  });
  it("edits the selected dossier and preserves planning values", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Détails de Santé – Jérémie" }));
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByLabelText("Objectif de contrats")).toHaveValue(10);
    expect(screen.getByLabelText("Point focal")).toHaveValue("Marie");
    await userEvent.clear(screen.getByLabelText("Nom du dossier"));
    await userEvent.type(screen.getByLabelText("Nom du dossier"), "Nouveau nom");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: "Santé – Jérémie", name: "Nouveau nom", priority: "urgence", contractTargetCount: 10, deadlineDate: "2020-01-10" }));
  });
  it("classifies and reopens dossiers, and requires confirmation before removing one", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Détails de Santé – Jérémie" }));
    await userEvent.click(screen.getByRole("button", { name: "Classer" }));
    expect(mocks.update).toHaveBeenCalledWith({ id: "Santé – Jérémie", workspaceId: "w", status: "classified" });
    await userEvent.click(screen.getByRole("button", { name: /Classés/ }));
    await userEvent.click(screen.getByRole("button", { name: "Détails de Terminé" }));
    await userEvent.click(screen.getByRole("button", { name: "Remettre en traitement" }));
    expect(mocks.update).toHaveBeenCalledWith({ id: "Terminé", workspaceId: "w", status: "active" });
    await userEvent.click(screen.getByRole("button", { name: /En traitement/ }));
    await userEvent.click(screen.getByRole("button", { name: "Détails de Santé – Jérémie" }));
    await userEvent.click(screen.getByRole("button", { name: "Supprimer le dossier" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Supprimer le dossier" }));
    await userEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(mocks.remove).toHaveBeenCalledWith({ id: "Santé – Jérémie", workspaceId: "w" });
  });
  it("lets readers inspect dossiers without management controls and restores focus on close", async () => {
    setup(false);
    expect(screen.queryByRole("button", { name: "Nouveau dossier" })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Détails de Santé – Jérémie" });
    await userEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Voir les contrats" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Modifier|Classer|Supprimer|Ajouter un contrat/ })).not.toBeInTheDocument();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("does not report failed metrics as zero contracts", () => {
    mocks.metrics.mockReturnValue({ data: undefined, isError: true, refetch: vi.fn() });
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent("Suivi des contrats indisponible");
    expect(screen.queryByText("0 contrat")).not.toBeInTheDocument();
  });
});
