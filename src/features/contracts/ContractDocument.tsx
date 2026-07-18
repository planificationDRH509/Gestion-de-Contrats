import { useEffect, useMemo, useState } from "react";
import { Contract } from "../../data/types";
import { useAuth } from "../auth/auth";
import {
  buildTemplateVariables,
  loadTemplate,
  renderTemplate,
  subscribeTemplate
} from "../settings/contractTemplate";

export function ContractDocument({ contract }: { contract: Contract }) {
  const { user } = useAuth();
  const [template, setTemplate] = useState(() => loadTemplate());

  useEffect(() => {
    return subscribeTemplate(() => setTemplate(loadTemplate()));
  }, []);

  const html = useMemo(() => {
    const variables = buildTemplateVariables(contract, user?.workspaceName);
    return renderTemplate(template.html, variables as Record<string, string>);
  }, [contract, template.html, user?.workspaceName]);

  return (
    <div className="contract-document" data-theme="light">
      <style>{template.css}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
