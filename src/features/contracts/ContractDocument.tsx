import { useSalaryGrid } from "../salary-grid/salaryGridApi";
import { memo, useEffect, useMemo, useState } from "react";
import { Contract } from "../../data/types";
import { useInstitutions } from "../settings/suggestionsApi";
import { useInstitutionPrepositions } from "../institutions/institutionPrepositionsApi";
import {
  buildTemplateVariables,
  loadTemplate,
  renderTemplate,
  subscribeTemplate
} from "../settings/contractTemplate";

export const CONTRACT_PAGES = [1, 2, 3, 4] as const;
export type ContractPageSelection = readonly (typeof CONTRACT_PAGES[number])[];

export function ContractDocument({
  contract,
  pageSelection = CONTRACT_PAGES
}: {
  contract: Contract;
  pageSelection?: ContractPageSelection;
}) {
  return <ContractDocuments contracts={[contract]} workspaceId={contract.workspaceId} pageSelection={pageSelection} />;
}

// A print batch shares its template, stylesheet and reference-data subscriptions.
export function ContractDocuments({
  contracts,
  workspaceId,
  pageSelection = CONTRACT_PAGES
}: {
  contracts: Contract[];
  workspaceId: string;
  pageSelection?: ContractPageSelection;
}) {
  const { entries: salaryGrid } = useSalaryGrid();
  const { data: institutions } = useInstitutions(workspaceId);
  const { rules: prepositions } = useInstitutionPrepositions();
  const [template, setTemplate] = useState(() => loadTemplate());

  useEffect(() => {
    return subscribeTemplate(() => setTemplate(loadTemplate()));
  }, []);

  const documents = useMemo(() => contracts.map((contract) => {
    const variables = buildTemplateVariables(contract, salaryGrid, institutions, prepositions);
    return { id: contract.id, html: renderTemplate(template.html, variables as Record<string, string>) };
  }), [contracts, template.html, salaryGrid, institutions, prepositions]);

  return (
    <>
      {documents.map((document, index) => (
        <RenderedContractDocument
          key={document.id}
          contractId={document.id}
          html={document.html}
          css={index === 0 ? template.css : undefined}
          pageSelection={pageSelection}
        />
      ))}
    </>
  );
}

const RenderedContractDocument = memo(function RenderedContractDocument({
  contractId,
  html,
  css,
  pageSelection
}: {
  contractId: string;
  html: string;
  css?: string;
  pageSelection: ContractPageSelection;
}) {
  return (
    <div
      id={`print-contract-${contractId}`}
      tabIndex={-1}
      className="contract-document"
      data-theme="light"
      data-contract-page-selection={pageSelection.join(" ")}
      data-first-selected-page={Math.min(...pageSelection)}
    >
      {css !== undefined && <style>{css}</style>}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
});
