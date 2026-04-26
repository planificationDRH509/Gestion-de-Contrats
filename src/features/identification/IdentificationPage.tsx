import { useState } from "react";
import { useAuth } from "../auth/auth";
import { IdentificationSpreadsheetView } from "./IdentificationSpreadsheetView";

export function IdentificationPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const workspaceId = user?.workspaceId ?? "";
  const userId = user?.id ?? "";

  return (
    <div className="page-container">
      <div className="section-header">
        <div>
          <div className="section-title">Base d'identification</div>
          <div className="section-subtitle">Gérez les informations personnelles (NIF, Prénom, Nom, NINU, Adresse, Sexe)</div>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '12px' }}>
          <div className="search-field-container" style={{ position: 'relative' }}>
             <span className="material-symbols-rounded" style={{ 
               position: 'absolute', 
               left: '10px', 
               top: '50%', 
               transform: 'translateY(-50%)', 
               fontSize: '18px', 
               color: 'var(--ink-muted)' 
             }}>search</span>
             <input 
               type="text" 
               className="input" 
               placeholder="Chercher NIF ou NINU..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               style={{ paddingLeft: '36px', width: '240px' }}
             />
          </div>
        </div>
      </div>
      
      <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <IdentificationSpreadsheetView 
          workspaceId={workspaceId} 
          userId={userId} 
          searchQuery={searchQuery}
        />
      </div>
    </div>
  );
}
