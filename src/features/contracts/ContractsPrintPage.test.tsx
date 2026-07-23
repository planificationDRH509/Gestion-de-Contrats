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
  mutate: vi.fn(),
  navigate: vi.fn()
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams("ids=contract-1")]
}));

vi.mock("../auth/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", workspaceId: "workspace-1" }
  })
}));

vi.mock("./contractsApi", () => ({
  useChangeContractsStatus: () => ({ mutate: mocks.mutate }),
  useContractsByIds: () => ({ data: mocks.contracts, isLoading: false })
}));

vi.mock("./ContractDocument", () => ({
  ContractDocument: () => <div>Contrat</div>
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
});
