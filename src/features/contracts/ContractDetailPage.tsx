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
    <div>
      <div className="section-header">
        <div>
          <div className="section-title">Aperçu du contrat</div>
          {dossier && (
            <div style={{ marginTop: "4px" }}>
              <span
                className="badge dossier-badge"
                style={
                  dossier.priority === "urgence"
                    ? {
                        borderColor: "#f59e0b",
                        color: "#b45309",
                        backgroundColor: "#fff7ed"
                      }
                    : {
                        borderColor: "#86efac",
                        color: "#166534",
                        backgroundColor: "#f0fdf4"
                      }
                }
              >
                Dossier: {dossier.name}
                {dossier.isEphemeral ? " · Éphémère" : ""}
                {dossier.priority === "urgence" ? " · Urgence" : ""}
              </span>
            </div>
          )}
        </div>
        <div className="toolbar">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>
            Retour
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/app/contrats/print?ids=${data.id}`)}
          >
            Imprimer
          </button>
        </div>
      </div>

      <ContractDocument contract={data} />
    </div>
  );
}
