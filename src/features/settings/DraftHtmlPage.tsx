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
      <div className="section-header">
        <div>
          <div className="section-title">Modèles HTML</div>
          <div className="helper-text">Gérez plusieurs drafts depuis un seul espace.</div>
        </div>
        <div className="form-actions" style={{ marginTop: 0 }}>
          <button className="btn btn-outline" type="button" onClick={handleReset}>
            <span className="material-symbols-rounded icon">restart_alt</span>
            Défaut
          </button>
          <button className="btn btn-primary" type="button" onClick={handleSave}>
            <span className="material-symbols-rounded icon">save</span>
            Enregistrer
          </button>
        </div>
      </div>

      <div className="draft-switcher">
        {draftTemplateOptions.map((option) => (
          <button
            key={option.type}
            type="button"
            className={`draft-switcher-btn ${selectedDraft === option.type ? "active" : ""}`}
            onClick={() => setSelectedDraft(option.type)}
          >
            <span className="draft-switcher-title">{option.label}</span>
            <span className="draft-switcher-description">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="draft-page-grid">
        <div className="card editor-card">
          <div className="editor-heading">
            <div className="editor-title">{selectedDraftOption.label}</div>
            <div className="helper-text">{selectedDraftOption.description}</div>
          </div>

          <div className="editor-header">
            <div className="tab-group">
              <button
                className={`tab-btn ${activeTab === "html" ? "active" : ""}`}
                onClick={() => setActiveTab("html")}
                type="button"
              >
                Structure (HTML)
              </button>
              <button
                className={`tab-btn ${activeTab === "css" ? "active" : ""}`}
                onClick={() => setActiveTab("css")}
                type="button"
              >
                Style (CSS)
              </button>
            </div>
            {message && <span className="badge draft-status-badge">{message}</span>}
          </div>

          {activeTab === "html" ? (
            <div className="code-field">
              <textarea
                ref={htmlRef}
                className="code-textarea"
                value={template.html}
                spellCheck={false}
                placeholder={`Rédigez la structure HTML du draft \"${selectedDraftOption.label}\"...`}
                onChange={(e) => setTemplate({ ...template, html: e.target.value })}
              />
            </div>
          ) : (
            <div className="code-field">
              <textarea
                ref={cssRef}
                className="code-textarea"
                value={template.css}
                spellCheck={false}
                placeholder={`Rédigez le style CSS du draft \"${selectedDraftOption.label}\"...`}
                onChange={(e) => setTemplate({ ...template, css: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="sidebar-container">
          <div className="card sidebar-card" style={{ padding: 0 }}>
            <div className="vars-panel">
              <div className="vars-header-row">
                <div className="vars-header">Variables à insérer</div>
                <div className="helper-text">Cliquez pour insérer au curseur.</div>
              </div>

              <div className="vars-list">
                {templateVariables.map((variable) => (
                  <button
                    key={variable.key}
                    className="var-pill"
                    type="button"
                    onClick={() => insertVariable(variable.key)}
                    title={variable.label}
                  >
                    <span className="var-pill-key">{variable.key}</span>
                    <span className="var-pill-label">{variable.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="preview-container-wrap">
              <div className="preview-title-row">
                <div className="vars-header">Aperçu</div>
                <span className="badge">{selectedDraftOption.label}</span>
              </div>

              <div className="preview-container">
                <div className="letter-preview-scroll" data-theme="light">
                  <style>{template.css}</style>
                  <div className="letter-paper" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
