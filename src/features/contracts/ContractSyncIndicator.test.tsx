import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Contract, OutboxItem } from "../../data/types";
import { ContractSyncIndicator } from "./ContractSyncIndicator";
import { contractSyncInfo } from "../../data/local/outboxDependencies";
const contract = { id: "c", workspaceId: "w", nif: "n", applicantId: "n", tags: [] } as unknown as Contract;
const pending = (type: OutboxItem["type"], payload: Record<string, unknown>, lastError?: string): OutboxItem =>
  ({ id: "q", workspaceId: "w", type, payload, createdAt: "now", lastError });
it("distinguishes device-only creation, pending changes and confirmed cloud data", () => {
  expect(contractSyncInfo(contract, [pending("contract.create", { id: "c" })]).icon).toBe("devices");
  expect(contractSyncInfo(contract, [pending("contract.update", { contractIds: ["c"] })]).icon).toBe("cloud_upload");
  expect(contractSyncInfo(contract, []).icon).toBe("cloud_done");
  expect(contractSyncInfo(contract, [pending("tag.assign", { contractId: "c", tagId: "t" })]).pending).toBe(true);
  expect(contractSyncInfo(contract, [pending("applicant.upsert", { nif: "n" }, "Conflit NIF")]).error).toBe("Conflit NIF");
  expect(contractSyncInfo(contract, [], false).icon).toBe("devices");
});
it("opens the sync detail and offers a retry without navigating away", () => {
  const onRetry = vi.fn(async () => {});
  render(<ContractSyncIndicator contract={contract} pending={[pending("contract.create", { id: "c" }, "Conflit à vérifier")]}
    online cloudEnabled onRetry={onRetry} />);
  fireEvent.click(screen.getByRole("button", { name: "Sur cet appareil" }));
  expect(screen.getByText("Conflit à vérifier")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Réessayer la synchronisation" }));
  expect(onRetry).toHaveBeenCalledOnce();
});
