import { describe, it, expect, beforeEach } from "vitest";
import { LocalContractRepository } from "./localContractRepository";
import { LocalApplicantRepository } from "./localApplicantRepository";
import { ensureDefaultWorkspace } from "./localDb";
import { replaceWorkspaceCache } from "./offlineStore";

beforeEach(() => {
  localStorage.clear();
});

describe("LocalContractRepository", () => {
  it("creates and lists contracts", async () => {
    const workspace = ensureDefaultWorkspace();
    const applicants = new LocalApplicantRepository();
    const contracts = new LocalContractRepository();

    const applicant = await applicants.upsert({
      workspaceId: workspace.id,
      gender: "Homme",
      firstName: "Jean",
      lastName: "Louis",
      nif: "",
      ninu: "",
      address: "Rue 1"
    });

    const created = await contracts.create({
      workspaceId: workspace.id,
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

    const list = await contracts.list({ workspaceId: workspace.id, query: "Jean" });
    expect(list.total).toBe(1);
    expect(list.items[0].id).toBe(created.id);
  });

  it("filters contracts by status", async () => {
    const workspace = ensureDefaultWorkspace();
    const contracts = new LocalContractRepository();

    await contracts.create({
      workspaceId: workspace.id,
      applicantId: null,
      status: "saisie",
      gender: "Femme",
      firstName: "Nadine",
      lastName: "Pierre",
      nif: "",
      ninu: "",
      address: "Rue 1",
      position: "Analyste",
      assignment: "RH",
      salaryNumber: 30000,
      salaryText: "trente mille",
      durationMonths: 12
    });

    await contracts.create({
      workspaceId: workspace.id,
      applicantId: null,
      status: "imprime",
      gender: "Homme",
      firstName: "Jean",
      lastName: "Louis",
      nif: "",
      ninu: "",
      address: "Rue 2",
      position: "Technicien",
      assignment: "Maintenance",
      salaryNumber: 35000,
      salaryText: "trente-cinq mille",
      durationMonths: 12
    });

    const onlyPrinted = await contracts.list({
      workspaceId: workspace.id,
      status: "imprime"
    });

    expect(onlyPrinted.total).toBe(1);
    expect(onlyPrinted.items[0].status).toBe("imprime");
  });

  it("searches contracts by name, NIF and NINU", async () => {
    const workspaceId = "workspace_contract_search";
    const contracts = new LocalContractRepository();

    await contracts.create({
      workspaceId,
      applicantId: null,
      status: "saisie",
      gender: "Femme",
      firstName: "Élodie",
      lastName: "Saint-Fleur",
      nif: "123-456-789-0",
      ninu: "9876543210",
      address: "Rue 1",
      position: "Analyste",
      assignment: "RH",
      salaryNumber: 30000,
      salaryText: "trente mille",
      durationMonths: 12
    });

    expect((await contracts.list({ workspaceId, query: "elodie" })).total).toBe(1);
    expect((await contracts.list({ workspaceId, query: "1234567890" })).total).toBe(1);
    expect((await contracts.list({ workspaceId, query: "987 654" })).total).toBe(1);
  });

  it("preserves pending local edits when a remote snapshot is downloaded", async () => {
    const workspaceId = "workspace_snapshot_test";
    const contracts = new LocalContractRepository();
    const local = await contracts.create({
      workspaceId,
      applicantId: null,
      status: "correction",
      gender: "Homme",
      firstName: "Samuel",
      lastName: "Joseph",
      nif: "123-123-123-1",
      ninu: null,
      address: "Tabarre",
      position: "Technicien local",
      assignment: "Maintenance",
      salaryNumber: 40000,
      salaryText: "quarante mille",
      durationMonths: 12
    });

    replaceWorkspaceCache(workspaceId, {
      applicants: [],
      dossiers: [],
      tags: [],
      contracts: [{ ...local, status: "saisie", position: "Version serveur" }]
    });

    const cached = await contracts.getById(local.id);
    expect(cached?.status).toBe("correction");
    expect(cached?.position).toBe("Technicien local");
  });
});
