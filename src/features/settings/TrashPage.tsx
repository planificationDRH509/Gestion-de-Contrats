import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ContractStatus } from "../../data/types";
import { formatCurrency } from "../../lib/format";
import { useAuth } from "../auth/auth";
import { useContractsList } from "../contracts/contractsApi";

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Brouillon",
  final: "Final",
  saisie: "Saisie",
  correction: "Correction",
  impression_partiel: "Impression partielle",
  imprime: "Imprimé",
  signe: "Signé",
  transfere: "Transféré",
  classe: "Classé"
};

function formatDeletedAt(value?: string | null) {
  if (!value) return "Date inconnue";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleString("fr-HT", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function TrashPage() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId ?? "";
  const [query, setQuery] = useState("");
  const { data, isLoading, isError, refetch } = useContractsList(
    {
      workspaceId,
      all: true,
      deletionState: "deleted",
      sort: "createdAt_desc"
    },
    { enabled: Boolean(workspaceId) }
  );

  const contracts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return [...(data?.items ?? [])]
      .filter((contract) => {
        if (!normalizedQuery) return true;
        return [
          contract.id,
          contract.firstName,
          contract.lastName,
          contract.nif ?? "",
          contract.ninu ?? "",
          contract.position,
          contract.assignment
        ]
          .join(" ")
          .toLocaleLowerCase("fr")
          .includes(normalizedQuery);
      })
      .sort((left, right) => (right.deletedAt ?? "").localeCompare(left.deletedAt ?? ""));
  }, [data?.items, query]);

  return (
    <div className="page-container settings-detail-page trash-page">
      <header className="section-header page-header trash-page-header">
        <div>
          <span className="page-eyebrow">Paramètres</span>
          <h1 className="section-title">Corbeille</h1>
          <div className="section-subtitle">
            Contrats supprimés conservés dans l’historique.
          </div>
        </div>
        <div className="trash-header-actions">
          <div className="trash-count" aria-label={`${data?.total ?? 0} contrats supprimés`}>
            <strong>{data?.total ?? 0}</strong>
            <span>contrat{(data?.total ?? 0) === 1 ? "" : "s"}</span>
          </div>
          <Link to="/app/parametres" className="button button-secondary">
            <span className="material-symbols-rounded icon">arrow_back</span>
            Retour
          </Link>
        </div>
      </header>

      <section className="card trash-panel">
        <div className="trash-toolbar">
          <label className="search-field-unified">
            <span className="material-symbols-rounded icon">search</span>
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher par nom, NIF, poste ou affectation…"
            />
          </label>
        </div>

        {isLoading ? (
          <div className="trash-empty" role="status">Chargement de la corbeille…</div>
        ) : isError ? (
          <div className="trash-empty">
            <span className="material-symbols-rounded">cloud_off</span>
            <h2>Impossible de charger la corbeille</h2>
            <p>Vérifiez la connexion puis réessayez.</p>
            <button type="button" className="button button-secondary" onClick={() => void refetch()}>
              Réessayer
            </button>
          </div>
        ) : contracts.length === 0 ? (
          <div className="trash-empty">
            <span className="material-symbols-rounded">delete_sweep</span>
            <h2>{query.trim() ? "Aucun résultat" : "La corbeille est vide"}</h2>
            <p>
              {query.trim()
                ? "Aucun contrat supprimé ne correspond à cette recherche."
                : "Les contrats supprimés apparaîtront ici."}
            </p>
          </div>
        ) : (
          <div className="trash-list">
            {contracts.map((contract) => (
              <article className="trash-contract" key={contract.id}>
                <div className="trash-contract-icon" aria-hidden="true">
                  <span className="material-symbols-rounded">description</span>
                </div>
                <div className="trash-contract-main">
                  <div className="trash-contract-heading">
                    <div>
                      <h2>{contract.firstName} {contract.lastName}</h2>
                      <p>
                        Contrat <strong>{contract.id}</strong>
                        {contract.nif ? <> · NIF {contract.nif}</> : null}
                        {contract.ninu ? <> · NINU {contract.ninu}</> : null}
                      </p>
                    </div>
                    <span className="badge trash-status-badge">
                      {STATUS_LABELS[contract.status]}
                    </span>
                  </div>
                  <div className="trash-contract-details">
                    <span>
                      <small>Poste</small>
                      <strong>{contract.position || "Non renseigné"}</strong>
                    </span>
                    <span>
                      <small>Affectation</small>
                      <strong>{contract.assignment || "Non renseignée"}</strong>
                    </span>
                    <span>
                      <small>Salaire</small>
                      <strong>{formatCurrency(contract.salaryNumber)} HTG</strong>
                    </span>
                    <span className="trash-deleted-at">
                      <small>Supprimé le</small>
                      <strong>{formatDeletedAt(contract.deletedAt)}</strong>
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
