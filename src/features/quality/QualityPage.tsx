import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth";
import { useContractsList, useUpdateContract } from "../contracts/contractsApi";
import { useIdentificationList } from "../identification/identificationApi";
import { usePositions } from "../settings/suggestionsApi";
import {
  analyzeContractQuality,
  type QualityIssue,
  type QualitySeverity
} from "./contractQuality";

const SEVERITY_LABELS: Record<QualitySeverity, string> = {
  critical: "Critique",
  warning: "Avertissement",
  info: "Information"
};

export function QualityPage() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId ?? "";
  const { data: contractData, isLoading: contractsLoading } = useContractsList({
    workspaceId,
    page: 1,
    pageSize: 5_000,
    sort: "createdAt_desc"
  });
  const { data: identities = [], isLoading: identitiesLoading } =
    useIdentificationList(workspaceId);
  const { data: positions = [] } = usePositions(workspaceId);
  const updateContract = useUpdateContract();
  const [severity, setSeverity] = useState<QualitySeverity | "all">("all");
  const [query, setQuery] = useState("");
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);

  const issues = useMemo(
    () => analyzeContractQuality({
      contracts: contractData?.items ?? [],
      identities,
      positions
    }),
    [contractData?.items, identities, positions]
  );

  const filteredIssues = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return issues.filter((issue) => {
      if (resolvedIds.has(issue.id)) return false;
      if (severity !== "all" && issue.severity !== severity) return false;
      if (!normalizedQuery) return true;
      return [
        issue.personName,
        issue.entityId,
        issue.title,
        issue.detail
      ].join(" ").toLocaleLowerCase("fr").includes(normalizedQuery);
    });
  }, [issues, query, resolvedIds, severity]);

  const counts = useMemo(
    () => ({
      critical: issues.filter((issue) => issue.severity === "critical").length,
      warning: issues.filter((issue) => issue.severity === "warning").length,
      info: issues.filter((issue) => issue.severity === "info").length
    }),
    [issues]
  );

  async function applyAutoFix(issue: QualityIssue) {
    if (!issue.contractId || !issue.autoFix) return;
    setMessage(null);
    try {
      await updateContract.mutateAsync({
        id: issue.contractId,
        workspaceId,
        [issue.autoFix.field]: issue.autoFix.value
      });
      setResolvedIds((current) => new Set(current).add(issue.id));
      setMessage("Correction appliquée et ajoutée au journal d’audit.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Impossible d’appliquer la correction."
      );
    }
  }

  const isLoading = contractsLoading || identitiesLoading;

  return (
    <div className="page-container quality-page">
      <header className="section-header page-header">
        <div>
          <span className="page-eyebrow">Fiabilité des données</span>
          <h1 className="section-title">Contrôle qualité</h1>
          <div className="section-subtitle">
            Détection des incohérences dans les contrats et les identifications.
          </div>
        </div>
      </header>

      <section className="quality-kpis" aria-label="Résumé des anomalies">
        {(["critical", "warning", "info"] as const).map((level) => (
          <button
            key={level}
            type="button"
            className={`card quality-kpi quality-${level}${severity === level ? " active" : ""}`}
            onClick={() => setSeverity((current) => current === level ? "all" : level)}
          >
            <span className="material-symbols-rounded">
              {level === "critical"
                ? "error"
                : level === "warning"
                  ? "warning"
                  : "info"}
            </span>
            <strong>{counts[level]}</strong>
            <small>{SEVERITY_LABELS[level]}</small>
          </button>
        ))}
      </section>

      <section className="card quality-toolbar">
        <label className="search-field-unified">
          <span className="material-symbols-rounded icon">search</span>
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom, NIF, contrat ou anomalie…"
          />
        </label>
        <select
          className="select"
          value={severity}
          onChange={(event) =>
            setSeverity(event.target.value as QualitySeverity | "all")
          }
          aria-label="Filtrer par niveau"
        >
          <option value="all">Tous les niveaux</option>
          <option value="critical">Critiques</option>
          <option value="warning">Avertissements</option>
          <option value="info">Informations</option>
        </select>
      </section>

      {message ? (
        <div className="app-toast app-toast-success" role="status">
          <span className="material-symbols-rounded">task_alt</span>
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Fermer">
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="card quality-empty">Analyse des données…</div>
      ) : filteredIssues.length === 0 ? (
        <div className="card quality-empty">
          <span className="material-symbols-rounded">verified</span>
          <strong>Aucune anomalie pour ce filtre</strong>
          <span>Les données analysées sont cohérentes.</span>
        </div>
      ) : (
        <div className="quality-issue-list">
          {filteredIssues.map((issue) => (
            <article className={`card quality-issue quality-${issue.severity}`} key={issue.id}>
              <div className="quality-issue-mark">
                <span className="material-symbols-rounded">
                  {issue.severity === "critical"
                    ? "error"
                    : issue.severity === "warning"
                      ? "warning"
                      : "info"}
                </span>
              </div>
              <div className="quality-issue-copy">
                <div className="quality-issue-title">
                  <strong>{issue.title}</strong>
                  <span className={`badge quality-badge quality-${issue.severity}`}>
                    {SEVERITY_LABELS[issue.severity]}
                  </span>
                </div>
                <p>{issue.detail}</p>
                <small>
                  {issue.personName || "Personne non renseignée"} ·{" "}
                  {issue.entity === "contract" ? `Contrat ${issue.entityId}` : `NIF ${issue.entityId}`}
                </small>
              </div>
              <div className="quality-issue-actions">
                {issue.autoFix ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void applyAutoFix(issue)}
                    disabled={updateContract.isPending}
                  >
                    <span className="material-symbols-rounded">auto_fix_high</span>
                    Corriger
                  </button>
                ) : null}
                {issue.contractId ? (
                  <Link className="btn btn-outline" to={`/app/contrats/${issue.contractId}/modifier`}>
                    <span className="material-symbols-rounded">edit</span>
                    Vérifier
                  </Link>
                ) : (
                  <Link className="btn btn-outline" to={`/app/identification?q=${encodeURIComponent(issue.entityId)}`}>
                    <span className="material-symbols-rounded">badge</span>
                    Identification
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
