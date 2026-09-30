import { useSalaryGrid } from "../salary-grid/salaryGridApi";
import { useEffect, useMemo, useState } from "react";
import { Contract } from "../../data/types";
import { useInstitutions } from "../settings/suggestionsApi";
import { useInstitutionPrepositions } from "../institutions/institutionPrepositionsApi";
import {
  buildTemplateVariables,
  loadTemplate,
  renderTemplate,
  subscribeTemplate
} from "../settings/contractTemplate";

export type ContractPageSelection = "all" | "first" | "fourth";

export function ContractDocument({
  contract,
  pageSelection = "all"
}: {
  contract: Contract;
  pageSelection?: ContractPageSelection;
}) {
  const { entries: salaryGrid } = useSalaryGrid();
  const { data: institutions } = useInstitutions(contract.workspaceId);
  const { rules: prepositions } = useInstitutionPrepositions();
  const [template, setTemplate] = useState(() => loadTemplate());

  useEffect(() => {
    return subscribeTemplate(() => setTemplate(loadTemplate()));
  }, []);

  const html = useMemo(() => {
    const variables = buildTemplateVariables(contract, salaryGrid, institutions, prepositions);
    return renderTemplate(template.html, variables as Record<string, string>);
  }, [contract, template.html, salaryGrid, institutions, prepositions]);

  return (
    <div
      className="contract-document"
      data-theme="light"
      data-contract-page-selection={pageSelection}
    >
      <style>{template.css}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
