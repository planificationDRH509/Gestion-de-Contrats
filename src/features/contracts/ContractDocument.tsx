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

  const pages = useMemo(() => {
    const chunks = html.split("<!-- pagebreak -->").map((page) => page.trim());
    if (chunks.length >= 4) return chunks;
    return [...chunks, ...Array.from({ length: 4 - chunks.length }, () => "")];
  }, [html]);

  return (
    <div data-theme="light">
      <style>{template.css}</style>
      {pages.map((pageHtml, index) => (
        <section className="contract-page" key={`${contract.id}-${index}`}>
          <div dangerouslySetInnerHTML={{ __html: pageHtml }} />
        </section>
      ))}
    </div>
  );
}
