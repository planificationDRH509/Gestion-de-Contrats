import { useEffect, useMemo, useRef, useState } from "react";
import {
  DraftTemplateType,
  draftTemplateOptions,
  loadTemplateByType,
  saveTemplateByType,
  templateVariables,
  renderTemplate
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
  nif: "000-000-000-0",
  ninu: "0000000000",
  address: "12, Rue des Palmes, Port-au-Prince",
  position: "Assistante administrative",
  assignment: "Direction générale",
  salaryNumber: 45000,
  salaryText: "quarante-cinq mille",
  durationMonths: 12,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export function DraftHtmlPage() {
  const [selectedDraft, setSelectedDraft] = useState<DraftTemplateType>("contract");
  const [template, setTemplate] = useState(() => loadTemplateByType("contract"));
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [message, setMessage] = useState<string | null>(null);
  
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const workspace = useMemo(() => ensureDefaultWorkspace(), []);

  useEffect(() => {
    setTemplate(loadTemplateByType(selectedDraft));
    setMessage(null);
  }, [selectedDraft]);

  const previewHtml = useMemo(() => {
    return renderTemplate(template.html, sampleContract);
  }, [template.html]);

  const handleSave = async () => {
    try {
      saveTemplateByType(selectedDraft, template);
      setMessage("Enregistré avec succès !");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage("Erreur lors de l'enregistrement");
    }
  };

  const handleReset = () => {
    if (window.confirm("Réinitialiser ce modèle aux valeurs par défaut ?")) {
      const defaultTpl = loadTemplateByType(selectedDraft);
      setTemplate(defaultTpl);
    }
  };

  function insertVariable(variableKey: string) {
    if (activeTab !== "editor") setActiveTab("editor");
    setTimeout(() => {
      const target = htmlRef.current;
      if (!target) return;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const text = target.value;
      const newValue = text.substring(0, start) + variableKey + text.substring(end);
      setTemplate({ ...template, html: newValue });
      setTimeout(() => {
        target.focus();
        target.setSelectionRange(start + variableKey.length, start + variableKey.length);
      }, 0);
    }, 100);
  }

  return (
    <div className="page-container">
      <div className="section-header">
        <div>
          <h1 className="section-title">Modèles de Documents</h1>
          <div className="section-subtitle">Éditez le code HTML/CSS de vos contrats.</div>
        </div>
        <div className="toolbar">
          <button className="btn btn-outline" onClick={handleReset}>
            <span className="material-symbols-rounded">restart_alt</span>
            Défaut
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            <span className="material-symbols-rounded">save</span>
            Enregistrer
          </button>
        </div>
      </div>

      <div className="model-selector-bar">
        {draftTemplateOptions.map((opt) => (
          <button
            key={opt.type}
            className={`model-selector-btn ${selectedDraft === opt.type ? "active" : ""}`}
            onClick={() => setSelectedDraft(opt.type)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="editor-layout-grid">
        <aside className="toolbox-sidebar">
          <h3 className="toolbox-title">Variables</h3>
          <p className="toolbox-help">Cliquez pour insérer</p>
          <div className="variables-grid">
            {templateVariables.map((v) => (
              <button key={v.key} className="variable-item" onClick={() => insertVariable(v.key)}>
                <span className="v-key">{v.key}</span>
                <span className="v-label">{v.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="editor-workspace">
          <div className="workspace-tabs">
            <button className={`w-tab ${activeTab === "editor" ? "active" : ""}`} onClick={() => setActiveTab("editor")}>
              <span className="material-symbols-rounded">code</span>
              Éditeur de Code
            </button>
            <button className={`w-tab ${activeTab === "preview" ? "active" : ""}`} onClick={() => setActiveTab("preview")}>
              <span className="material-symbols-rounded">visibility</span>
              Aperçu en Direct
            </button>
            {message && <div className="save-indicator">{message}</div>}
          </div>

          <div className="workspace-view">
            {activeTab === "editor" ? (
              <textarea
                ref={htmlRef}
                className="code-editor"
                value={template.html}
                onChange={(e) => setTemplate({ ...template, html: e.target.value })}
                spellCheck={false}
                placeholder="Introduisez votre code HTML et <style> ici..."
              />
            ) : (
              <div className="live-preview-container">
                <div className="paper-preview">
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
