import { useNavigate, useParams } from "react-router-dom";
import { useContract } from "./contractsApi";
import { ContractDocument } from "./ContractDocument";
import { useAuth } from "../auth/auth";
import { useDossiersList } from "../dossiers/dossiersApi";

export function ContractDetailPage() {
  const { contractId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading } = useContract(contractId);
  const { data: dossiers = [] } = useDossiersList(user?.workspaceId ?? "");

  if (isLoading) {
    return <div className="card">Chargement…</div>;
  }

  if (!data) {
    return <div className="card">Contrat introuvable.</div>;
  }

  const dossier = data.dossierId
    ? dossiers.find((item) => item.id === data.dossierId) ?? null
    : null;

  return (
  return (
    <div className="page-container">
      <div className="section-header">
        <div>
          <h1 className="section-title">Aperçu du Contrat</h1>
          <div className="section-subtitle">Consultation du document finalisé.</div>
          {dossier && (
            <div style={{ marginTop: "12px" }}>
              <span className={`badge ${dossier.priority === "urgence" ? "warning" : "success"}`} style={{ borderRadius: '8px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>folder_open</span>
                Dossier: {dossier.name}
                {dossier.isEphemeral && " · Éphémère"}
                {dossier.priority === "urgence" && " · URGENCE"}
              </span>
            </div>
          )}
        </div>
        <div className="toolbar">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>
            <span className="material-symbols-rounded">arrow_back</span>
            Retour
          </button>
          <div className="nav-divider" style={{ height: '24px', margin: '0 8px' }} />
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/app/contrats/print?ids=${data.id}`)}
          >
            <span className="material-symbols-rounded">print</span>
            Imprimer
          </button>
        </div>
      </div>

      <div className="preview-stage" data-theme="light">
        <div className="paper-sheet">
          <ContractDocument contract={data} />
        </div>
      </div>
    </div>
  );
}
