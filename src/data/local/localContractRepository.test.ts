import { describe, it, expect, beforeEach } from "vitest";
import { LocalContractRepository } from "./localContractRepository";
import { LocalApplicantRepository } from "./localApplicantRepository";
import { ensureDefaultWorkspace } from "./localDb";

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
});
