import { beforeEach, describe, expect, it } from "vitest";
import { LocalApplicantRepository } from "./localApplicantRepository";
import { ensureDefaultWorkspace, loadDb } from "./localDb";

describe("LocalApplicantRepository offline mutations", () => {
  beforeEach(() => {
    localStorage.clear();
    ensureDefaultWorkspace();
  });

  it("keeps identification edits locally and queues them for synchronization", async () => {
    const repository = new LocalApplicantRepository();
    const workspaceId = "workspace_offline_test";

    const created = await repository.upsert({
      workspaceId,
      gender: "Femme",
      firstName: "mireille",
      lastName: "jean",
      nif: "111-222-333-4",
      ninu: "1234567890",
      phone: "+509 37 12 3456",
      address: "Delmas"
    });

    expect(created.id).toBe("111-222-333-4");
    expect(await repository.list(workspaceId)).toHaveLength(1);

    const updated = await repository.upsert({
      id: created.id,
      workspaceId,
      gender: "Femme",
      firstName: "Mireille",
      lastName: "Pierre",
      nif: "999-888-777-6",
      ninu: "1234567890",
      address: "Pétion-Ville"
    });

    expect(updated.id).toBe("999-888-777-6");
    expect(await repository.getById(created.id)).toBeNull();
    expect((await repository.getById(updated.id))?.lastName).toBe("PIERRE");
    expect((await repository.getById(updated.id))?.phone).toBe("+509 37 12 3456");
    expect(loadDb().outbox.filter((item) => item.type === "applicant.upsert")).toHaveLength(1);

    await repository.softDelete(updated.id, workspaceId);

    expect(await repository.list(workspaceId)).toHaveLength(0);
    expect(loadDb().outbox.some((item) => item.type === "applicant.delete")).toBe(true);
  });

  it("stores, updates and clears an optional phone number", async () => {
    const repository = new LocalApplicantRepository();
    const workspaceId = "workspace_phone_test";
    const baseInput = {
      workspaceId,
      gender: "Homme" as const,
      firstName: "Jean",
      lastName: "Louis",
      nif: "100-000-000-4",
      ninu: null,
      address: "Delmas"
    };

    const created = await repository.upsert({ ...baseInput, phone: "  3712-3456  " });
    expect(created.phone).toBe("3712-3456");

    const preserved = await repository.upsert({ ...baseInput, id: created.id });
    expect(preserved.phone).toBe("3712-3456");

    const cleared = await repository.upsert({ ...baseInput, id: created.id, phone: null });
    expect(cleared.phone).toBeNull();
  });

  it.each(["NIF", "NINU"])("names the conflicting %s, value and owner", async (field) => {
    const repository = new LocalApplicantRepository();
    const base = { workspaceId: "w", gender: "Homme" as const, firstName: "Jean", lastName: "Louis", address: "Delmas" };
    const owner = await repository.upsert({ ...base, nif: "111-222-333-4", ninu: "1234567890" });
    const other = await repository.upsert({ ...base, nif: "999-888-777-6", ninu: "0987654321" });
    const value = field === "NIF" ? owner.nif! : owner.ninu!;
    await expect(repository.upsert({ ...base, id: other.id,
      nif: field === "NIF" ? owner.nif : other.nif,
      ninu: field === "NINU" ? owner.ninu : other.ninu
    })).rejects.toThrow(`Le ${field} ${value} appartient déjà à Jean LOUIS (NIF 111-222-333-4).`);
  });

  it("upserts an import batch", async () => {
    const repository = new LocalApplicantRepository();
    const workspaceId = "workspace_batch_test";

    const saved = await repository.upsertMany([
      {
        workspaceId,
        gender: "Homme",
        firstName: "Jean",
        lastName: "Louis",
        nif: "100-000-000-1",
        ninu: null,
        address: "Delmas"
      },
      {
        workspaceId,
        gender: "Femme",
        firstName: "Anne",
        lastName: "Pierre",
        nif: "100-000-000-2",
        ninu: null,
        address: "Pétion-Ville"
      }
    ]);

    expect(saved).toHaveLength(2);
    expect(await repository.list(workspaceId)).toHaveLength(2);
  });

  it("finds soft-deleted NIF and NINU owners during an import check", async () => {
    const repository = new LocalApplicantRepository();
    const workspaceId = "workspace_deleted_import_test";
    const applicant = await repository.upsert({
      workspaceId,
      gender: "Homme",
      firstName: "Jean",
      lastName: "Louis",
      nif: "100-000-000-3",
      ninu: "1234567890",
      address: "Delmas"
    });
    await repository.softDelete(applicant.id, workspaceId);

    const matches = await repository.findManyByNifOrNinu(
      workspaceId,
      ["100-000-000-3"],
      ["1234567890"]
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].deletedAt).toBeTruthy();
  });
});
