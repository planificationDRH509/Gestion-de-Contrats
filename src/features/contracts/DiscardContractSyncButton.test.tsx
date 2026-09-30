import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Contract, OutboxItem } from "../../data/types";
import { discardContractSyncChanges } from "../../data/supabase/supabaseProvider";
import { DiscardContractSyncButton } from "./DiscardContractSyncButton";
vi.mock("../../data/supabase/supabaseProvider", () => ({ discardContractSyncChanges: vi.fn(async () => {}) }));
const contract = { id: "c", workspaceId: "w" } as Contract;
const pending: OutboxItem[] = [{ id: "q", workspaceId: "w", type: "contract.update", payload: { id: "c" }, createdAt: "now" }];
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
function show(online = true) {
  render(<QueryClientProvider client={new QueryClient()}><DiscardContractSyncButton contract={contract} pending={pending} online={online} /></QueryClientProvider>);
}
it("discards only after confirmation", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  show();
  fireEvent.click(screen.getByRole("button"));
  expect(discardContractSyncChanges).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(discardContractSyncChanges).toHaveBeenCalledWith(contract, ["q"]));
});
it("requires an online server read", () => {
  show(false);
  expect(screen.getByRole("button")).toBeDisabled();
});
