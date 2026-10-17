import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { loadDb, saveDb } from "../../data/local/localDb";
import type { Applicant, Contract } from "../../data/types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), applicant: vi.fn() }));
vi.mock("../../data/dataProvider", () => ({ getDataProvider: () => ({
  contracts: { update: mocks.update }, applicants: { upsert: mocks.applicant }
}) }));
vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: { id: "author", workspaceId: "w" } }) }));
vi.stubEnv("VITE_DATA_PROVIDER", "supabase");
const { useUpdateContract } = await import("./contractsApi");

const person: Applicant = { id: "123-456-789-0", nif: "123-456-789-0", ninu: "0123456789", workspaceId: "w",
  firstName: "Marie", lastName: "JEAN", gender: "Femme", address: "Delmas", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
const contract: Contract = { ...person, id: "contract", applicantId: person.id, status: "saisie", position: "Agent",
  assignment: "MSPP", salaryNumber: 30000, salaryText: "trente mille", durationMonths: 12, annee_fiscale: "2025-2026" };

beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  localStorage.setItem("contribution_auth", JSON.stringify({ id: "author", workspaceId: "w", role: "admin" }));
  const db = loadDb(); db.contracts = [contract, { ...contract, id: "linked", annee_fiscale: "2024-2025" }]; db.applicants = [person]; saveDb(db);
});
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  for (const item of loadDb().contracts) client.setQueryData(["contract", item.id], item);
  client.setQueryData(["identification", "w"], [person]);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useUpdateContract(), { wrapper }) };
}

it("saves identity and contractual fields together and refreshes every linked detail", async () => {
  const { result, client, unmount } = setup();
  await act(async () => { await result.current.mutateAsync({ id: contract.id, workspaceId: "w", salaryNumber: 45000,
    applicant: { ...person, nif: "999-888-777-6" } }); });
  const db = loadDb();
  expect(db.contracts.find(item => item.id === contract.id)).toMatchObject({ nif: "999-888-777-6", ninu: person.ninu, salaryNumber: 45000 });
  expect(db.contracts.find(item => item.id === "linked")).toMatchObject({ nif: "999-888-777-6", ninu: person.ninu });
  expect(db.outbox.map(item => item.type)).toEqual(["applicant.upsert", "contract.update"]);
  expect(db.outbox[1].payload.baseContract).toMatchObject({ nif: person.nif, salaryNumber: 30000 });
  expect(mocks.applicant).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  expect(client.getQueryState(["contract", "linked"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["identification", "w"])?.isInvalidated).toBe(true);
  unmount(); client.clear();
});

it("rolls back displayed values and leaves both identity and contract intact on a duplicate NINU", async () => {
  const db = loadDb(); db.applicants.push({ ...person, id: "555-555-555-5", nif: "555-555-555-5", ninu: "5555555555" }); saveDb(db);
  const before = loadDb();
  const { result, client, unmount } = setup();
  await act(async () => { await expect(result.current.mutateAsync({ id: contract.id, workspaceId: "w", salaryNumber: 45000,
    applicant: { ...person, ninu: "5555555555" } })).rejects.toThrow(/NINU/); });
  expect(loadDb().applicants).toEqual(before.applicants);
  expect(loadDb().contracts).toEqual(before.contracts);
  expect(loadDb().outbox).toEqual([]);
  expect(client.getQueryData(["contract", contract.id])).toMatchObject({ salaryNumber: 30000, ninu: person.ninu });
  unmount(); client.clear();
});
