import { Contract } from "../../data/types";
import { createId } from "../../lib/uuid";

const DRAFT_KEY = "contribution_contract_draft";

export type DraftContract = Contract & { isDraft: true };

export function saveDraftContract(contract: Omit<Contract, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const draft: DraftContract = {
    ...contract,
    id: createId(),
    createdAt: now,
    updatedAt: now,
    isDraft: true
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

export function loadDraftContract(): DraftContract | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as DraftContract;
}

export function clearDraftContract() {
  localStorage.removeItem(DRAFT_KEY);
}
