import { useState } from "react";
import { useAuth } from "../auth/auth";
import { IdentificationSpreadsheetView } from "./IdentificationSpreadsheetView";

export function IdentificationPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const workspaceId = user?.workspaceId ?? "";
  const userId = user?.id ?? "";

  return (
    <div className="page-container" style={{ animation: "fade-in 0.4s ease-out" }}>
      <header className="section-header" style={{ background: 'transparent' }}>
        <div>
          <h1 className="section-title">Base d'identification</h1>
          <p className="section-subtitle">Gérez les informations personnelles (NIF, Prénom, Nom, NINU, Adresse, Sexe)</p>
        </div>
        
        <div className="search-field-unified" style={{ maxWidth: '300px' }}>
          <span className="material-symbols-rounded icon">search</span>
          <input 
            type="text" 
            className="input" 
            placeholder="Chercher NIF ou NINU..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>
      
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
