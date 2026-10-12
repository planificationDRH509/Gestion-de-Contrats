import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../settings/ministersApi", () => ({ useMinisters: () => ({ registry: undefined }) }));

const mocks = vi.hoisted(() => ({
  appendPrintHistory: vi.fn(),
  printList: vi.fn(() => vi.fn()),
  contracts: [
    {
      id: "contract-1",
      workspaceId: "workspace-1",
      status: "saisie"
    }
  ] as { id: string; workspaceId: string; status: string; firstName?: string; lastName?: string; ministerId?: string }[],
  canChangeStatus: true,
  mutate: vi.fn(),
  navigate: vi.fn(),
  searchParams: "ids=contract-1"
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams(mocks.searchParams)]
}));

vi.mock("../auth/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", workspaceId: "workspace-1" },
    can: () => mocks.canChangeStatus
  })
}));

vi.mock("./contractsApi", () => ({
  useChangeContractsStatus: () => ({ mutate: mocks.mutate }),
  useContractsByIds: () => ({ data: mocks.contracts, isLoading: false })
}));

vi.mock("./ContractDocument", () => ({
  CONTRACT_PAGES: [1, 2, 3, 4],
  ContractDocuments: ({ contracts, pageSelection }: { contracts: { id: string }[]; pageSelection: number[] }) => contracts.map(contract => (
    <div key={contract.id} data-testid="contract-document" data-contract-id={contract.id} data-page-selection={pageSelection.join(" ")}>Contrat</div>
  ))
}));

vi.mock("./printContractList", () => ({ printContractList: mocks.printList }));

vi.mock("../../lib/printHistory", () => ({
  appendPrintHistory: mocks.appendPrintHistory
}));

import { ContractsPrintPage } from "./ContractsPrintPage";

describe("ContractsPrintPage", () => {
  it("prevents printing and marking printed when a referenced minister is unavailable", () => {
    mocks.contracts = [{ id: "contract-1", workspaceId: "workspace-1", status: "saisie", ministerId: "unknown" }];
    render(<ContractsPrintPage />);
    expect(screen.getByRole("button", { name: "Imprimer" })).toBeDisabled();
    act(() => window.dispatchEvent(new Event("afterprint")));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.appendPrintHistory).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.contracts = [
      {
        id: "contract-1",
        workspaceId: "workspace-1",
        status: "saisie"
      }
    ];
    mocks.appendPrintHistory.mockReset();
    mocks.printList.mockClear();
    mocks.mutate.mockReset();
    mocks.navigate.mockReset();
    mocks.canChangeStatus = true;
    mocks.searchParams = "ids=contract-1";
    vi.spyOn(window, "print").mockImplementation(() => undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows the single-contract preview without automatically printing, including after refresh", () => {
    const view = render(
      <StrictMode>
        <ContractsPrintPage />
      </StrictMode>
    );

    act(() => vi.advanceTimersByTime(300));
    expect(window.print).not.toHaveBeenCalled();

    mocks.contracts = mocks.contracts.map((contract) => ({
      ...contract,
      status: "imprime"
    }));
    view.rerender(
      <StrictMode>
        <ContractsPrintPage />
      </StrictMode>
    );

    act(() => vi.advanceTimersByTime(300));
    expect(window.print).not.toHaveBeenCalled();
  });

  it("still allows a deliberate reprint from the button", () => {
    render(<ContractsPrintPage />);

    act(() => vi.advanceTimersByTime(300));
    expect(window.print).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Imprimer" }));

    expect(window.print).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    expect(window.print).toHaveBeenCalledTimes(2);
  });

  it("waits for the page choice before printing a group", () => {
    mocks.searchParams = "ids=contract-1,contract-2";
    mocks.contracts = [
      mocks.contracts[0],
      { id: "contract-2", workspaceId: "workspace-1", status: "saisie" }
    ];
    render(<ContractsPrintPage />);

    act(() => vi.advanceTimersByTime(300));
    expect(window.print).not.toHaveBeenCalled();
    for (const page of [1, 2, 3, 4]) expect(screen.getByRole("button", { name: `Page ${page}` })).toHaveAttribute("aria-pressed", "true");

    for (const page of [1, 2, 3]) fireEvent.click(screen.getByRole("button", { name: `Page ${page}` }));
    screen.getAllByTestId("contract-document").forEach((document) => {
      expect(document).toHaveAttribute("data-page-selection", "4");
    });

    fireEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    expect(window.print).toHaveBeenCalledOnce();
  });

  it("allows multiple pages for a single contract and disables printing an empty selection", () => {
    render(<ContractsPrintPage />);
    expect(screen.queryByText("Pages de chaque contrat :")).not.toBeInTheDocument();
    for (const page of [1, 3]) fireEvent.click(screen.getByRole("button", { name: `Page ${page}` }));
    expect(screen.getByTestId("contract-document")).toHaveAttribute("data-page-selection", "2 4");
    for (const page of [2, 4]) fireEvent.click(screen.getByRole("button", { name: `Page ${page}` }));
    expect(screen.getByRole("button", { name: "Imprimer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    expect(window.print).not.toHaveBeenCalled();
    for (const page of [4, 2]) fireEvent.click(screen.getByRole("button", { name: `Page ${page}` }));
    expect(screen.getByTestId("contract-document")).toHaveAttribute("data-page-selection", "2 4");
    expect(screen.getByRole("button", { name: "Imprimer" })).toBeEnabled();
  });

  it("sorts both the preview and index by surname, then given name, regardless of requested ids", () => {
    mocks.searchParams = "ids=contract-1,contract-3,contract-2";
    mocks.contracts = [
      { id: "contract-1", workspaceId: "workspace-1", status: "saisie", lastName: "Zola", firstName: "Annie" },
      { id: "contract-3", workspaceId: "workspace-1", status: "saisie", lastName: "Albert", firstName: "Zoé" },
      { id: "contract-2", workspaceId: "workspace-1", status: "saisie", lastName: "ALBERT", firstName: "Anne" }
    ];
    render(<ContractsPrintPage />);
    expect(screen.getAllByTestId("contract-document").map(document => document.getAttribute("data-contract-id"))).toEqual(["contract-2", "contract-3", "contract-1"]);
    expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["1Anne ALBERT", "2Zoé ALBERT", "3Annie ZOLA"]);
  });

  it("marks a one-page group print as partial", () => {
    mocks.searchParams = "ids=contract-1,contract-2";
    mocks.contracts = [
      mocks.contracts[0],
      { id: "contract-2", workspaceId: "workspace-1", status: "saisie" }
    ];
    render(<ContractsPrintPage />);

    for (const page of [2, 3, 4]) fireEvent.click(screen.getByRole("button", { name: `Page ${page}` }));
    act(() => window.dispatchEvent(new Event("afterprint")));

    expect(window.confirm).toHaveBeenCalledWith(
      'Voulez-vous changer l’état de ces 2 contrats en « Impression partielle » ?'
    );
    expect(mocks.mutate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contractIds: ["contract-1", "contract-2"],
      status: "impression_partiel"
    });
    expect(mocks.appendPrintHistory).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      mocks.contracts,
      { partial: true }
    );
  });

  it("excludes removed contracts from preview, print status and history, then restores their order", () => {
    mocks.searchParams = "ids=contract-2,contract-1";
    mocks.contracts = [mocks.contracts[0], { id: "contract-2", workspaceId: "workspace-1", status: "saisie" }];
    render(<ContractsPrintPage />);
    fireEvent.click(screen.getByRole("button", { name: "Retirer contract-2 de l’impression" }));
    expect(screen.getByRole("link", { name: "contract-2" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByTestId("contract-document")).toHaveLength(1);
    expect(screen.getByTestId("contract-document")).toHaveAttribute("data-contract-id", "contract-1");
    act(() => window.dispatchEvent(new Event("afterprint")));
    expect(mocks.mutate).toHaveBeenCalledWith({ workspaceId: "workspace-1", contractIds: ["contract-1"], status: "imprime" });
    expect(mocks.appendPrintHistory).toHaveBeenCalledWith("user-1", "workspace-1", [mocks.contracts[0]], { partial: false });
    fireEvent.click(screen.getByRole("button", { name: "Réintégrer contract-2" }));
    expect(screen.getAllByTestId("contract-document").map(element => element.getAttribute("data-contract-id"))).toEqual(["contract-1", "contract-2"]);
  });

  it("keeps an excluded last contract available for restoration without printing or changing its status", () => {
    render(<ContractsPrintPage />);
    fireEvent.click(screen.getByRole("button", { name: "Retirer contract-1 de l’impression" }));
    expect(screen.queryByTestId("contract-document")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imprimer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    act(() => window.dispatchEvent(new Event("afterprint")));
    expect(window.print).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.appendPrintHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Réintégrer contract-1" }));
    expect(screen.getByRole("button", { name: "Imprimer" })).toBeEnabled();
    expect(screen.getByTestId("contract-document")).toBeInTheDocument();
  });

  it("shows the requested details for an excluded contract and closes them with Escape", () => {
    Object.assign(mocks.contracts[0], { firstName: "Marie", lastName: "Jean", durationMonths: 6, salaryNumber: 35000, assignment: "Direction générale", position: "Infirmière" });
    render(<ContractsPrintPage />);
    fireEvent.click(screen.getByRole("button", { name: "Retirer Marie JEAN de l’impression" }));
    const details = screen.getByRole("button", { name: "Détails de Marie JEAN" });
    fireEvent.click(details);
    expect(details).toHaveAttribute("aria-expanded", "true");
    const region = screen.getByRole("region", { name: "Détails de Marie JEAN" });
    for (const text of ["6 mois", "35,000.00", "Direction générale", "Infirmière"]) expect(region).toHaveTextContent(text);
    fireEvent.keyDown(details, { key: "Escape" });
    expect(details).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("hides and restores the index without changing the print selection", () => {
    render(<ContractsPrintPage />);
    const index = screen.getByRole("navigation", { name: "Contrats sélectionnés" });
    fireEvent.click(screen.getByRole("button", { name: "Masquer la liste" }));
    expect(index).not.toBeVisible();
    expect(screen.getByTestId("contract-document")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Afficher la liste" }));
    expect(index).toBeVisible();
  });

  it("prints the retained list independently of page selection, status and contract history", () => {
    mocks.searchParams = "ids=contract-1,contract-2";
    mocks.contracts = [mocks.contracts[0], { id: "contract-2", workspaceId: "workspace-1", status: "saisie" }];
    render(<ContractsPrintPage />);
    fireEvent.click(screen.getByRole("button", { name: "Retirer contract-2 de l’impression" }));
    fireEvent.click(screen.getByRole("button", { name: "Imprimer la Liste" }));
    expect(mocks.printList).toHaveBeenCalledWith([mocks.contracts[0]], expect.any(Function));
    act(() => window.dispatchEvent(new Event("afterprint")));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.appendPrintHistory).not.toHaveBeenCalled();
    for (const page of [1, 2, 3, 4]) fireEvent.click(screen.getByRole("button", { name: `Page ${page}` }));
    expect(screen.getByRole("button", { name: "Imprimer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Imprimer la Liste" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Retirer contract-1 de l’impression" }));
    expect(screen.getByRole("button", { name: "Imprimer la Liste" })).toBeDisabled();
  });

  it("asks before changing the contract status after printing", () => {
    render(<ContractsPrintPage />);

    act(() => window.dispatchEvent(new Event("afterprint")));

    expect(window.confirm).toHaveBeenCalledWith(
      'Voulez-vous changer l’état de ce contrat en « Imprimé » ?'
    );
    expect(mocks.mutate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contractIds: ["contract-1"],
      status: "imprime"
    });
    expect(mocks.appendPrintHistory).toHaveBeenCalledOnce();
  });

  it("keeps the current status when the confirmation is refused", () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<ContractsPrintPage />);

    act(() => window.dispatchEvent(new Event("afterprint")));

    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.appendPrintHistory).toHaveBeenCalledOnce();
  });

  it("does not offer a status change to a read-only account", () => {
    mocks.canChangeStatus = false;
    render(<ContractsPrintPage />);

    act(() => window.dispatchEvent(new Event("afterprint")));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.appendPrintHistory).toHaveBeenCalledOnce();
  });
});
