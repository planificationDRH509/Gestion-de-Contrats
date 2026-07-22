import { useEffect, useMemo, useState } from "react";
import { Contract } from "../../data/types";
import {
  buildTemplateVariables,
  loadTemplate,
  renderTemplate,
  subscribeTemplate
} from "../settings/contractTemplate";

export function ContractDocument({ contract }: { contract: Contract }) {
  const [template, setTemplate] = useState(() => loadTemplate());

  useEffect(() => {
    return subscribeTemplate(() => setTemplate(loadTemplate()));
  }, []);

  const html = useMemo(() => {
    const variables = buildTemplateVariables(contract);
    return renderTemplate(template.html, variables as Record<string, string>);
  }, [contract, template.html]);

  return (
    <div className="contract-document" data-theme="light">
      <style>{template.css}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
