import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../features/auth/auth";
import type { Contract } from "../types";
import { loadDb, saveDb } from "./localDb";
import { cacheContractLists, mutateContractListOffline, readCachedContractLists } from "./localListRepository";
import { LocalContractRepository } from "./localContractRepository";
import { getPendingOutbox, upsertApplicantOffline } from "./offlineStore";
import { syncSupabaseOutbox } from "../supabase/supabaseProvider";

const sync = vi.hoisted(() => ({ replay: vi.fn() }));
vi.mock("../supabase/listSync", () => ({ syncQueuedList: sync.replay, downloadContractLists: vi.fn() }));
const user: AuthUser = { id: "u", name: "Admin", username: "admin", workspaceId: "w", role: "admin" };
const contract: Contract = { id: "c1", workspaceId: "w", applicantId: "n1", nif: "n1", firstName: "Ana", lastName: "LOUIS",
  gender: "Femme", address: "Test", position: "Poste", assignment: "Lieu", salaryNumber: 100, salaryText: "Cent",
  durationMonths: 6, status: "saisie", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
const get = (id: string) => readCachedContractLists("w").find(list => list.id === id)!;
const create = () => mutateContractListOffline(user, { action: "create", durationMonths: 6 });
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("contribution_auth", JSON.stringify(user));
  sync.replay.mockReset().mockResolvedValue(undefined);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  const db = loadDb();
  db.contracts = [contract, { ...contract, id: "c2", nif: "n2", applicantId: "n2" }, { ...contract, id: "other", durationMonths: 12 }];
  db.applicants = [{ id: "n1", workspaceId: "w", nif: "n1", firstName: "Ana", lastName: "LOUIS", gender: "Femme", address: "Test", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
  saveDb(db);
});

describe("durable offline lists", () => {
  it("creates, assigns, moves, sets a visa, seals, reopens and deletes", async () => {
    const a = (await create())!, b = (await create())!;
    await mutateContractListOffline(user, { action: "assign", listId: a, contractIds: ["c1", "c2"] });
    await mutateContractListOffline(user, { action: "assign", listId: b, contractIds: ["c2"] });
    expect(get(a).members.map(m => m.id)).toEqual(["c1"]);
    await mutateContractListOffline(user, { action: "visa", listId: b, version: get(b).version, visaNumber: " V-1 " });
    await mutateContractListOffline(user, { action: "seal", listId: b, version: get(b).version });
    expect(get(b).sealedAt).toBeTruthy(); expect(get(b).visaNumber).toBe("V-1");
    await mutateContractListOffline(user, { action: "reopen", listId: b, version: get(b).version, reason: "Corriger" });
    await mutateContractListOffline(user, { action: "assign", listId: null, contractIds: ["c2"] });
    await mutateContractListOffline(user, { action: "delete", listId: b, version: get(b).version });
    expect(get(b)).toBeUndefined();
    expect(getPendingOutbox()).toHaveLength(9);
    // Load fresh modules to simulate closing and reopening the app offline.
    vi.resetModules();
    const restored = await import("./localListRepository");
    expect(restored.readCachedContractLists("w")).toEqual([get(a)]);
    expect(JSON.parse(localStorage.getItem("contribution_local_db")!).outbox).toHaveLength(9);
  });

  it("rolls back a whole selection when one contract is incompatible", async () => {
    await expect(mutateContractListOffline(user, { action: "create", durationMonths: 6, contractIds: ["c1", "other"] })).rejects.toThrow(/même durée/);
    expect(readCachedContractLists("w")).toEqual([]); expect(getPendingOutbox()).toEqual([]);
  });

  it("enforces sealed lists, admin reopening, workspace and stale confirmations", async () => {
    const id = (await mutateContractListOffline(user, { action: "create", durationMonths: 6, contractIds: ["c1"] }))!;
    const version = get(id).version;
    await mutateContractListOffline(user, { action: "seal", listId: id, version });
    await expect(mutateContractListOffline(user, { action: "assign", listId: null, contractIds: ["c1"] })).rejects.toThrow(/scellée/);
    await expect(mutateContractListOffline({ ...user, role: "agent" }, { action: "reopen", listId: id, version: get(id).version, reason: "Test" })).rejects.toThrow(/administrateur/);
    await expect(mutateContractListOffline(user, { action: "reopen", listId: id, version, reason: "Test" })).rejects.toThrow(/changé/);
    await expect(mutateContractListOffline({ ...user, workspaceId: "other" }, { action: "assign", listId: id, contractIds: ["c1"] })).rejects.toThrow(/introuvable/);
    const contracts = new LocalContractRepository();
    await expect(contracts.update({ id: "c1", salaryNumber: 200 })).rejects.toThrow(/scellée/);
    await expect(contracts.softDelete("c1", "w")).rejects.toThrow(/scellée/);
    expect(() => upsertApplicantOffline({ workspaceId: "w", id: "n1", nif: "n1", firstName: "Autre", lastName: "LOUIS", gender: "Femme", address: "Test" })).toThrow(/scellée/);
    await expect(contracts.updateStatus("w", ["c1"], "signe")).resolves.toBe(1);
  });

  it("does not overwrite local changes when downloading a server snapshot", async () => {
    const id = (await create())!;
    cacheContractLists("w", []);
    expect(get(id)).toBeDefined();
  });

  it("keeps identity edits on either side of sealing in their original order", async () => {
    const id = (await mutateContractListOffline(user, { action: "create", durationMonths: 6, contractIds: ["c1"] }))!;
    const edit = (firstName: string) => upsertApplicantOffline({ workspaceId: "w", id: "n1", nif: "n1", firstName, lastName: "LOUIS", gender: "Femme", address: "Test" });
    edit("Marie");
    await mutateContractListOffline(user, { action: "seal", listId: id, version: get(id).version });
    await mutateContractListOffline(user, { action: "reopen", listId: id, version: get(id).version, reason: "Corriger" });
    edit("Jeanne");
    expect(getPendingOutbox().map(item => item.type)).toEqual(["list.operation", "applicant.upsert", "list.operation", "list.operation", "applicant.upsert"]);
    const edits = getPendingOutbox().filter(item => item.type === "applicant.upsert");
    expect(edits.map(item => item.payload.firstName)).toEqual(["Marie", "Jeanne"]);
    expect(edits[1].payload.baseApplicant).toMatchObject({ firstName: "Marie" });
  });

  it("retries the same operation after a network interruption and only removes acknowledged items", async () => {
    await create(); const original = getPendingOutbox()[0];
    sync.replay.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await syncSupabaseOutbox();
    expect(getPendingOutbox()).toHaveLength(1);
    await syncSupabaseOutbox();
    expect(sync.replay.mock.calls.map(([item]) => item.id)).toEqual([original.id, original.id]);
    expect(getPendingOutbox()).toHaveLength(0);
  });

  it("retains conflicts and blocks dependent list changes", async () => {
    await create(); await create();
    sync.replay.mockRejectedValueOnce(new Error("Conflit de liste"));
    await syncSupabaseOutbox();
    expect(sync.replay).toHaveBeenCalledOnce();
    expect(getPendingOutbox()).toHaveLength(2);
    expect(getPendingOutbox()[0].lastError).toBe("Conflit de liste");
  });
});
