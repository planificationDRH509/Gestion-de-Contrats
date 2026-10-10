import { beforeEach, expect, it } from "vitest";
import { LocalContractRepository } from "./local/localContractRepository";
import { getPendingOutbox } from "./local/offlineStore";
import type { CreateContractInput } from "./types";
import { getContractStartDate } from "../lib/contractDateFilters";
const input: CreateContractInput = { workspaceId: "w", applicantId: "123-456-789-0", nif: "123-456-789-0",
  firstName: "Jean", lastName: "LOUIS", gender: "Homme", address: "Delmas", position: "Analyste",
  assignment: "Service", salaryNumber: 100, salaryText: "cent", durationMonths: 12, status: "saisie", annee_fiscale: "2025-2026" };

beforeEach(() => localStorage.clear());
it.each([0, -1, 13, 24, 1.5, NaN, Infinity])("rejects duration %s before writing or queuing", async (durationMonths) => {
  const repo = new LocalContractRepository();
  await expect(repo.create({ ...input, durationMonths })).rejects.toThrow("1 à 12 mois");
  expect(getPendingOutbox()).toHaveLength(0);
  const contract = await repo.create(input);
  await expect(repo.update({ id: contract.id, durationMonths })).rejects.toThrow("1 à 12 mois");
  await expect(repo.updateDuration(input.workspaceId, [contract.id], durationMonths)).rejects.toThrow("1 à 12 mois");
  expect((await repo.getById(contract.id))?.durationMonths).toBe(12);
  expect(getPendingOutbox()).toHaveLength(1);
});
it.each(Array.from({ length: 12 }, (_, i) => i + 1))("accepts %s months within the selected fiscal year", async (durationMonths) => {
  const repo = new LocalContractRepository();
  const contract = await repo.create({ ...input, durationMonths });
  const start = getContractStartDate(contract);
  expect(start.getTime()).toBeGreaterThanOrEqual(new Date(2025, 9, 1).getTime());
  expect(start.getTime()).toBeLessThanOrEqual(new Date(2026, 8, 30).getTime());
  expect(contract.durationMonths).toBe(durationMonths);
});
it("validates a batch before creating any contracts", async () => {
  const repo = new LocalContractRepository();
  await expect(repo.createMany([input, { ...input, durationMonths: 13 }])).rejects.toThrow("1 à 12 mois");
  expect(getPendingOutbox()).toHaveLength(0);
});
