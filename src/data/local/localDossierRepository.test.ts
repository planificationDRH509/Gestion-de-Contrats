import { beforeEach, describe, expect, it } from "vitest";
import { ensureDefaultWorkspace } from "./localDb";
import { LocalApplicantRepository } from "./localApplicantRepository";
import { LocalContractRepository } from "./localContractRepository";
import { LocalDossierRepository } from "./localDossierRepository";

beforeEach(() => {
  localStorage.clear();
});

describe("LocalDossierRepository", () => {
  it("creates and updates a customizable dossier", async () => {
    const workspace = ensureDefaultWorkspace();
    const dossiers = new LocalDossierRepository();

    const created = await dossiers.create({
      workspaceId: workspace.id,
      name: "Dossier RH",
      isEphemeral: true,
      priority: "urgence",
      contractTargetCount: 12,
      comment: "Vérifier les pièces RH.",
      deadlineDate: "2026-06-30",
      focalPoint: "Direction RH",
      roadmapSheetNumber: "FR-27"
    });

    expect(created.name).toBe("Dossier RH");
    expect(created.isEphemeral).toBe(true);
    expect(created.priority).toBe("urgence");
    expect(created.contractTargetCount).toBe(12);
    expect(created.comment).toContain("pièces");
    expect(created.deadlineDate).toBe("2026-06-30");
    expect(created.focalPoint).toBe("Direction RH");
    expect(created.roadmapSheetNumber).toBe("FR-27");

    const updated = await dossiers.update({
      id: created.id,
      workspaceId: workspace.id,
      name: "Dossier RH 2026",
      isEphemeral: false,
      priority: "normal",
      contractTargetCount: 18,
      comment: "Validation finale",
      deadlineDate: "2026-08-15",
      focalPoint: "Direction RH - pole contrats",
      roadmapSheetNumber: "FR-28"
    });

    expect(updated.name).toBe("Dossier RH 2026");
    expect(updated.isEphemeral).toBe(false);
    expect(updated.priority).toBe("normal");
    expect(updated.contractTargetCount).toBe(18);
    expect(updated.comment).toBe("Validation finale");
    expect(updated.deadlineDate).toBe("2026-08-15");
    expect(updated.focalPoint).toContain("pole contrats");
    expect(updated.roadmapSheetNumber).toBe("FR-28");
  });

  it("deletes dossier and keeps contracts by removing the dossier link", async () => {
    const workspace = ensureDefaultWorkspace();
    const dossiers = new LocalDossierRepository();
    const applicants = new LocalApplicantRepository();
    const contracts = new LocalContractRepository();

    const dossier = await dossiers.create({
      workspaceId: workspace.id,
      name: "Dossier A"
    });

    const applicant = await applicants.upsert({
      workspaceId: workspace.id,
      gender: "Homme",
      firstName: "Jean",
      lastName: "Louis",
      nif: "",
      ninu: "",
      address: "Rue 1"
    });

    const contract = await contracts.create({
      workspaceId: workspace.id,
      dossierId: dossier.id,
      applicantId: applicant.id,
      status: "draft",
      gender: applicant.gender,
      firstName: applicant.firstName,
      lastName: applicant.lastName,
      nif: applicant.nif,
      ninu: applicant.ninu,
      address: applicant.address,
      position: "Technicien",
      assignment: "Maintenance",
      salaryNumber: 30000,
      salaryText: "trente mille",
      durationMonths: 12
    });

    const unassignedCount = await dossiers.delete(dossier.id, workspace.id);
    expect(unassignedCount).toBe(1);

    const stillThere = await contracts.getById(contract.id);
    expect(stillThere).not.toBeNull();
    expect(stillThere?.dossierId).toBeNull();

    const dossiersAfter = await dossiers.list(workspace.id);
    expect(dossiersAfter.some((item) => item.id === dossier.id)).toBe(false);
  });
});
