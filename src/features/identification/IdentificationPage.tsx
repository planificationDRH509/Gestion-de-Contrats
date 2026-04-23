import { useAuth } from "../auth/auth";
import { IdentificationSpreadsheetView } from "./IdentificationSpreadsheetView";

export function IdentificationPage() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId ?? "";
  const userId = user?.id ?? "";

  return (
    <div className="page-container">
      <div className="section-header">
        <div className="section-title">Base d'identification</div>
        <div className="section-subtitle">Gérez les informations personnelles (NIF, Prénom, Nom, NINU, Adresse, Sexe)</div>
      </div>
      
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <IdentificationSpreadsheetView workspaceId={workspaceId} userId={userId} />
      </div>
    </div>
  );
}
