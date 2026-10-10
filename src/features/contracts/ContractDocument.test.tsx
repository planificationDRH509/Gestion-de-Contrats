import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Contract } from "../../data/types";

const mocks = vi.hoisted(() => ({
  salary: vi.fn(() => ({ entries: [] })),
  institutions: vi.fn(() => ({ data: [] })),
  prepositions: vi.fn(() => ({ rules: [] })),
  loadTemplate: vi.fn(() => ({ html: "<p>{{name}}</p>", css: ".contract-document { color: black; }" })),
  subscribeTemplate: vi.fn(() => () => {}),
  variables: vi.fn((contract: { id: string }) => ({ name: contract.id }))
}));
vi.mock("../salary-grid/salaryGridApi", () => ({ useSalaryGrid: mocks.salary }));
vi.mock("../settings/ministersApi", () => ({ useMinisters: () => ({ registry: undefined }) }));
vi.mock("../settings/suggestionsApi", () => ({ useInstitutions: mocks.institutions }));
vi.mock("../institutions/institutionPrepositionsApi", () => ({ useInstitutionPrepositions: mocks.prepositions }));
vi.mock("../settings/contractTemplate", () => ({
  loadTemplate: mocks.loadTemplate,
  subscribeTemplate: mocks.subscribeTemplate,
  buildTemplateVariables: mocks.variables,
  renderTemplate: (html: string, variables: { name: string }) => html.replace("{{name}}", variables.name)
}));
import { ContractDocuments } from "./ContractDocument";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ContractDocuments", () => {
  it("shares a stylesheet and reference subscriptions for 60 contracts while preserving order and content", () => {
    const contracts = Array.from({ length: 60 }, (_, i) => ({ id: `contract-${i}`, workspaceId: "w" } as Contract));
    const view = render(<ContractDocuments contracts={contracts} workspaceId="w" />);
    expect(view.container.querySelectorAll("style")).toHaveLength(1);
    expect(Array.from(view.container.querySelectorAll(".contract-document p"), node => node.textContent)).toEqual(contracts.map(c => c.id));
    for (const hook of [mocks.salary, mocks.institutions, mocks.prepositions, mocks.loadTemplate, mocks.subscribeTemplate]) {
      expect(hook).toHaveBeenCalledOnce();
    }
    expect(mocks.variables).toHaveBeenCalledTimes(60);
  });
});
