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
    expect(loadDb().outbox.filter((item) => item.type === "applicant.upsert")).toHaveLength(2);

    await repository.softDelete(updated.id, workspaceId);

    expect(await repository.list(workspaceId)).toHaveLength(0);
    expect(loadDb().outbox.some((item) => item.type === "applicant.delete")).toBe(true);
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
});
