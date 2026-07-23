import { useState } from "react";
import { useAuth } from "../auth/auth";
import { IdentificationSpreadsheetView, type IdentificationSpreadsheetZoomMode } from "./IdentificationSpreadsheetView";
import { useSearchParams } from "react-router-dom";

const SHEET_ZOOM_OPTIONS = [50, 75, 90, 100, 125, 150, 175, 200] as const;

export function IdentificationPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [sheetZoomMode, setSheetZoomMode] = useState<IdentificationSpreadsheetZoomMode>(
    () => (localStorage.getItem("identification_sheet_zoom_mode") === "fit" ? "fit" : "custom")
  );
  const [sheetZoomPercent, setSheetZoomPercent] = useState(() => {
    const value = Number(localStorage.getItem("identification_sheet_zoom_percent"));
    return SHEET_ZOOM_OPTIONS.includes(value as any) ? value : 100;
  });
  const workspaceId = user?.workspaceId ?? "";
  const userId = user?.id ?? "";

  function updateZoomMode(value: IdentificationSpreadsheetZoomMode) {
    setSheetZoomMode(value);
    localStorage.setItem("identification_sheet_zoom_mode", value);
  }

  function updateZoomPercent(value: number) {
    setSheetZoomMode("custom");
    setSheetZoomPercent(value);
    localStorage.setItem("identification_sheet_zoom_mode", "custom");
    localStorage.setItem("identification_sheet_zoom_percent", String(value));
  }

  return (
    <div className="page-container identification-page">
      <header className="section-header page-header">
        <div>
          <span className="page-eyebrow">Répertoire</span>
          <h1 className="section-title">Base d'identification</h1>
        </div>
        
        <div className="new-contract-header-actions">
          <div className="sheet-top-controls" aria-label="Options du tableur">
            <button
              type="button"
              className={`icon-btn ${sheetZoomMode === "fit" ? "primary" : ""}`}
              title="Ajuster les colonnes à la largeur disponible"
              aria-label="Ajuster les colonnes"
              onClick={() => updateZoomMode("fit")}
            >
              <span className="material-symbols-rounded">fit_screen</span>
            </button>
            <label className="sheet-control-select" title="Zoom du tableur">
              <span className="material-symbols-rounded">zoom_in</span>
              <select
                value={sheetZoomMode === "fit" ? "fit" : String(sheetZoomPercent)}
                onChange={(event) => {
                  if (event.target.value === "fit") {
                    updateZoomMode("fit");
                    return;
                  }
                  updateZoomPercent(Number(event.target.value));
                }}
                aria-label="Zoom du tableur"
              >
                <option value="fit">Ajuster</option>
                {SHEET_ZOOM_OPTIONS.map((value) => (
                  <option key={value} value={value}>{value}%</option>
                ))}
              </select>
            </label>
          </div>
          <div className="search-field-unified" style={{ maxWidth: '300px' }}>
            <span className="material-symbols-rounded icon">search</span>
            <input 
              type="text" 
              className="input" 
              placeholder="Rechercher par nom, NIF ou NINU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>
      
      <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <IdentificationSpreadsheetView 
          workspaceId={workspaceId} 
          userId={userId} 
          searchQuery={searchQuery}
          zoomMode={sheetZoomMode}
          zoomPercent={sheetZoomPercent}
        />
      </div>
    </div>
  );
}
