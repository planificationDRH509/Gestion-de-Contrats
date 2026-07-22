import { beforeEach, describe, expect, it } from "vitest";
import { Contract } from "../../data/types";
import {
  buildTemplateVariables,
  getDefaultTemplate,
  renderTemplate
} from "./contractTemplate";
import { setStoredContractStartDates } from "./settingsApi";

const contract: Contract = {
  id: "contract-reference",
  workspaceId: "workspace_default",
  applicantId: null,
  status: "draft",
  gender: "Femme",
  firstName: "Sainte-Mise",
  lastName: "Morquette",
  nif: "007-933-419-5",
  ninu: "1106724896",
  address: "Jeremie",
  position: "Auxiliaire-Infirmière",
  assignment: "l’Hôpital Saint-Antoine de Jeremie",
  salaryNumber: 31900,
  salaryText: "TRENTE ET UN MILLE NEUF CENTS",
  durationMonths: 9,
  createdAt: "2026-01-05T12:00:00.000Z",
  updatedAt: "2026-01-05T12:00:00.000Z"
};

describe("reference contract template", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defines the four fixed reference pages and their exact transitions", () => {
    const template = getDefaultTemplate("contract");

    expect(template.html.match(/class="contract-sheet/g)).toHaveLength(4);
    expect(template.html).toContain('data-page="1"');
    expect(template.html).toContain('data-page="4"');
    expect(template.html).toMatch(/data-page="2">\s*<p>\{\{Elle_Il\}\} fournira/);
    expect(template.html).toMatch(/data-page="3">\s*<p><strong>Article 10/);
    expect(template.html).toMatch(/data-page="4">\s*<p><strong>Article 17/);
    expect(template.css).toContain("width: 8.5in");
    expect(template.css).toContain("height: 11in");
    expect(template.css).toContain("height: 10.99in !important");
    expect(template.css).toContain("max-height: 10.99in !important");
    expect(template.css).toContain("padding: 53.4pt 72pt 49pt");
    expect(template.css).toContain("p.contract-title");
    expect(template.css).toContain('.contract-sheet[data-page="3"] p');
    expect(template.css).toContain("margin-bottom: 7.4pt");
  });

  it("renders dates and duration in the same presentation as the reference", () => {
    const template = getDefaultTemplate("contract");
    const variables = buildTemplateVariables(contract);
    const html = renderTemplate(template.html, variables);

    expect(variables.duration_months_padded).toBe("09");
    expect(variables.created_date_long).toBe("05 Janvier 2026");
    expect(html).toContain("Sainte-Mise MORQUETTE");
    expect(html).toContain("(09) mois");
    expect(html).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it("uses the configured duration date for the start and signature", () => {
    setStoredContractStartDates(contract.workspaceId, { 9: "2026-01-12" });

    const template = getDefaultTemplate("contract");
    const variables = buildTemplateVariables(contract);
    const html = renderTemplate(template.html, variables);

    expect(variables.date_debut).toBe("12 Janvier 2026");
    expect(variables.created_date_long).toBe("12 Janvier 2026");
    expect(html).toContain("débutant le <strong>12 Janvier 2026</strong>");
    expect(html).toContain(
      "Fait à Port-au-Prince, en triple original, <strong>le 12 Janvier 2026</strong>"
    );
  });

  it("removes the legacy workspace marker from saved templates", () => {
    const html = renderTemplate(
      '<header><h1>Document</h1><div class="draft-badge">{{workspace_name}}</div></header>',
      {}
    );

    expect(html).toBe("<header><h1>Document</h1></header>");
  });
});
