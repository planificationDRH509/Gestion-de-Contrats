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
          <h1 className="section-title">Studio des Modèles</h1>
          <div className="section-subtitle">Gérez et visualisez vos modèles de contrats en temps réel.</div>
        </div>
        <div className="toolbar">
          <button className="btn btn-outline" onClick={handleReset}>
            <span className="material-symbols-rounded">restart_alt</span>
            Réinitialiser
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            <span className="material-symbols-rounded">save</span>
            Enregistrer les modifications
          </button>
        </div>
      </div>

      <div className="draft-workbench">
        <aside className="workbench-sidebar">
          <div className="sidebar-label">SÉLECTEUR DE MODÈLE</div>
          <div className="type-pills">
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

          <div className="sidebar-divider" />
          
          <div className="sidebar-label">VARIABLES (CLIQUER POUR INSÉRER)</div>
          <div className="variables-list-studio">
            {templateVariables.map((variable) => (
              <button
                key={variable.key}
                className="studio-var-item"
                onClick={() => insertVariable(variable.key)}
              >
                <span className="var-key">{variable.key}</span>
                <span className="var-label">{variable.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="workbench-content">
          <div className="workbench-tabs">
            <button
              className={`workbench-tab ${activeTab === "html" ? "active" : ""}`}
              onClick={() => setActiveTab("html")}
            >
              <span className="material-symbols-rounded">code</span>
              Édition du Code
            </button>
            <button
              className={`workbench-tab ${activeTab === "preview" ? "active" : ""}`}
              onClick={() => setActiveTab("preview")}
            >
              <span className="material-symbols-rounded">visibility</span>
              Aperçu Final
            </button>
            {message && <div className="status-toast">{message}</div>}
          </div>

          <div className="workbench-view">
            {activeTab === "html" ? (
              <div className="editor-wrapper">
                <textarea
                  ref={htmlRef}
                  className="studio-editor"
                  value={template.html}
                  spellCheck={false}
                  placeholder="Écrivez votre HTML ici... (Incluez vos balises <style> pour le CSS)"
                  onChange={(e) => setTemplate({ ...template, html: e.target.value })}
                />
              </div>
            ) : (
              <div className="preview-wrapper-studio">
                <div className="preview-scroll-area" data-theme="light">
                  <div className="paper-sheet" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
