import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendPrintHistory: vi.fn(),
  contracts: [
    {
      id: "contract-1",
      workspaceId: "workspace-1",
      status: "saisie"
    }
  ],
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
  ContractDocument: ({ contract, pageSelection }: { contract: { id: string }; pageSelection: string }) => (
    <div data-testid="contract-document" data-contract-id={contract.id} data-page-selection={pageSelection}>Contrat</div>
  )
}));

vi.mock("../../lib/printHistory", () => ({
  appendPrintHistory: mocks.appendPrintHistory
}));

import { ContractsPrintPage } from "./ContractsPrintPage";

describe("ContractsPrintPage", () => {
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

  it("does not automatically print again when contract data refreshes", () => {
    const view = render(
      <StrictMode>
        <ContractsPrintPage />
      </StrictMode>
    );

    act(() => vi.advanceTimersByTime(300));
    expect(window.print).toHaveBeenCalledOnce();

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
    expect(window.print).toHaveBeenCalledOnce();
  });

  it("still allows a deliberate reprint from the button", () => {
    render(<ContractsPrintPage />);

    act(() => vi.advanceTimersByTime(300));
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
    expect(screen.getByRole("radio", { name: "Les 4 pages" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Page 4 seulement" }));
    screen.getAllByTestId("contract-document").forEach((document) => {
      expect(document).toHaveAttribute("data-page-selection", "fourth");
    });

    fireEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    expect(window.print).toHaveBeenCalledOnce();
  });

  it("renders a group in the same order as the requested ids", () => {
    mocks.searchParams = "ids=contract-2,contract-1";
    mocks.contracts = [
      { id: "contract-1", workspaceId: "workspace-1", status: "saisie" },
      { id: "contract-2", workspaceId: "workspace-1", status: "saisie" }
    ];

    render(<ContractsPrintPage />);

    expect(screen.getAllByTestId("contract-document").map((document) =>
      document.getAttribute("data-contract-id")
    )).toEqual(["contract-2", "contract-1"]);
  });

  it("marks a one-page group print as partial", () => {
    mocks.searchParams = "ids=contract-1,contract-2";
    mocks.contracts = [
      mocks.contracts[0],
      { id: "contract-2", workspaceId: "workspace-1", status: "saisie" }
    ];
    render(<ContractsPrintPage />);

    fireEvent.click(screen.getByRole("radio", { name: "Page 1 seulement" }));
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
