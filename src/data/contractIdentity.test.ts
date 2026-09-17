import { beforeEach, expect, it } from "vitest";
import { LocalContractRepository } from "./local/localContractRepository";
import { cacheContracts, getPendingOutbox } from "./local/offlineStore";
import type { CreateContractInput } from "./types";
const input: CreateContractInput = { workspaceId: "w", applicantId: "123-456-789-0", nif: "123-456-789-0",
  firstName: "Jean", lastName: "LOUIS", gender: "Homme", address: "Delmas", position: "Analyste",
  assignment: "Service", salaryNumber: 100, salaryText: "cent", durationMonths: 12, status: "saisie", annee_fiscale: "2025-2026" };
beforeEach(() => localStorage.clear());
it("rejects cached and pending duplicates regardless of NIF formatting", async () => {
  const repo = new LocalContractRepository();
  await repo.create(input);
  await expect(repo.create({ ...input, nif: "1234567890" })).rejects.toThrow("existe déjà");
  expect(getPendingOutbox()).toHaveLength(1);
});
it("allows renewal in a different fiscal year and ignores deleted/other workspace contracts", async () => {
  const repo = new LocalContractRepository();
  const old = await repo.create(input);
  await expect(repo.create({ ...input, annee_fiscale: "2026-2027" })).resolves.toBeDefined();
  await expect(repo.create({ ...input, workspaceId: "other" })).resolves.toBeDefined();
  localStorage.clear();
  cacheContracts([{ ...old, deletedAt: "2026-09-16T00:00:00Z" }]);
  await expect(repo.create(input)).resolves.toBeDefined();
});
