import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildTemplateVariables,
  DraftTemplateType,
  draftTemplateOptions,
  getDefaultTemplate,
  loadTemplateByType,
  renderTemplate,
  resetTemplateByType,
  saveTemplateByType,
  templateVariables
} from "./contractTemplate";
import { Contract } from "../../data/types";
import { ensureDefaultWorkspace } from "../../data/local/localDb";
import "./DraftHtmlPage.css";

const sampleContract: Contract = {
  id: "sample-0001",
  workspaceId: "workspace_default",
  applicantId: null,
  status: "draft",
  gender: "Femme",
  firstName: "Nadine",
  lastName: "Pierre",
  nif: "",
  ninu: "",
  address: "12, Rue des Palmes, Port-au-Prince",
  position: "Assistante administrative",
  assignment: "Direction générale",
  salaryNumber: 45000,
  salaryText: "quarante-cinq mille",
  durationMonths: 12,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

function getDraftOption(type: DraftTemplateType) {
  return draftTemplateOptions.find((item) => item.type === type) ?? draftTemplateOptions[0];
}

export function DraftHtmlPage() {
  const [selectedDraft, setSelectedDraft] = useState<DraftTemplateType>("contract");
  const [template, setTemplate] = useState(() => loadTemplateByType("contract"));
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"html" | "css">("html");
  const workspace = useMemo(() => ensureDefaultWorkspace(), []);

  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const cssRef = useRef<HTMLTextAreaElement>(null);

  const selectedDraftOption = useMemo(() => getDraftOption(selectedDraft), [selectedDraft]);

  useEffect(() => {
    setTemplate(loadTemplateByType(selectedDraft));
    setMessage(null);
  }, [selectedDraft]);

  const previewHtml = useMemo(() => {
    const vars = buildTemplateVariables(sampleContract, workspace.name);
    return renderTemplate(template.html, vars as Record<string, string>);
  }, [template.html, workspace.name]);

  function flashMessage(content: string) {
    setMessage(content);
    window.setTimeout(() => setMessage(null), 3000);
  }

  function handleSave() {
    saveTemplateByType(selectedDraft, template);
    flashMessage(`Template \"${selectedDraftOption.label}\" sauvegardé.`);
  }

  function handleReset() {
    if (confirm(`Réinitialiser le template \"${selectedDraftOption.label}\" ?`)) {
      resetTemplateByType(selectedDraft);
      setTemplate(getDefaultTemplate(selectedDraft));
      flashMessage(`Template \"${selectedDraftOption.label}\" réinitialisé.`);
    }
  }

  function insertVariable(variableKey: string) {
    const target = activeTab === "html" ? htmlRef.current : cssRef.current;
    if (!target) return;

    const start = target.selectionStart;
    const end = target.selectionEnd;
    const text = target.value;
    const before = text.substring(0, start);
    const after = text.substring(end);

    const newValue = before + variableKey + after;

    setTemplate((prev) => ({
      ...prev,
      [activeTab]: newValue
    }));

    window.setTimeout(() => {
      target.focus();
      target.setSelectionRange(start + variableKey.length, start + variableKey.length);
    }, 0);
  }

  return (
    <div className="draft-container">
      <header className="page-header-premium">
        <div className="header-info">
          <h1 className="header-title">Configuration des Modèles</h1>
          <p className="header-subtitle">Personnalisez l'apparence et le contenu des contrats générés.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline-premium" onClick={handleReset}>
            <span className="material-symbols-rounded">restart_alt</span>
            Défaut
          </button>
          <button className="btn btn-primary-premium" onClick={handleSave}>
            <span className="material-symbols-rounded">save</span>
            Enregistrer
          </button>
        </div>
      </header>

      <div className="draft-type-selector">
        {draftTemplateOptions.map((option) => (
          <button
            key={option.type}
            className={`type-pill ${selectedDraft === option.type ? "active" : ""}`}
            onClick={() => setSelectedDraft(option.type)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="draft-main-grid">
        <div className="editor-section">
          <div className="editor-card-premium">
            <div className="editor-tabs">
              <button
                className={`editor-tab ${activeTab === "html" ? "active" : ""}`}
                onClick={() => setActiveTab("html")}
              >
                Structure HTML
              </button>
              <button
                className={`editor-tab ${activeTab === "css" ? "active" : ""}`}
                onClick={() => setActiveTab("css")}
              >
                Styles CSS
              </button>
              {message && <div className="save-toast">{message}</div>}
            </div>

            <div className="editor-content">
              <textarea
                ref={activeTab === "html" ? htmlRef : cssRef}
                className="code-editor-area"
                value={activeTab === "html" ? template.html : template.css}
                spellCheck={false}
                onChange={(e) => setTemplate({ ...template, [activeTab]: e.target.value })}
              />
            </div>
          </div>
        </div>

        <aside className="variables-sidebar-premium">
          <div className="sidebar-section-title">Variables Disponibles</div>
          <div className="variables-nav">
            {templateVariables.map((variable) => (
              <button
                key={variable.key}
                className="variable-nav-item"
                onClick={() => insertVariable(variable.key)}
                title={variable.label}
              >
                <span className="var-key">{variable.key}</span>
                <span className="var-label">{variable.label}</span>
                <span className="material-symbols-rounded add-icon">add</span>
              </button>
            ))}
          </div>

          <div className="preview-mini-section">
            <div className="sidebar-section-title">Aperçu en direct</div>
            <div className="mini-preview-container">
              <div className="preview-paper-scroller" data-theme="light">
                <style>{template.css}</style>
                <div className="preview-paper-content" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
