import { describe, expect, it } from "vitest";
import { buildContractListHtml } from "./printContractList";
import type { Contract } from "../../data/types";

describe("buildContractListHtml", () => {
  it("prints user-provided text literally without creating HTML elements", () => {
    const contract = { id: "1", firstName: "Marie", lastName: "Jean", durationMonths: 6, salaryNumber: 35000, position: '<img src=x onerror="alert(1)">', assignment: "Santé & prévention" } as Contract;
    const document = new DOMParser().parseFromString(buildContractListHtml([contract]), "text/html");
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("tbody")?.textContent).toContain(contract.position);
    expect(document.querySelector("tbody")?.textContent).toContain(contract.assignment);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(document.querySelectorAll(".receipt-checkbox")).toHaveLength(1);
    expect(document.querySelectorAll(".signature-space")).toHaveLength(2);
    expect(document.body.textContent).not.toContain("Salaire");
    expect(document.body.textContent).not.toContain("35,000.00");
  });
});
