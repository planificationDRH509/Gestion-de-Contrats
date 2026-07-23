import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  AuditActor,
  Contract,
  ContractAuditAction,
  ContractAuditChange
} from "../../data/types";
import { CONTRACT_AUDIT_FIELD_LABELS } from "../../lib/contractAudit";
import { useAuth } from "../auth/auth";
import { useAppUsers } from "../auth/usersApi";
import { useContractsList } from "../contracts/contractsApi";

type AuditEvent = {
  id: string;
  contract: Contract;
  action: ContractAuditAction;
  at: string;
  actor: AuditActor;
  changes: ContractAuditChange[];
};

const ACTION_LABELS: Record<ContractAuditAction, string> = {
  creation: "Création",
  modification: "Modification",
  status: "Changement de statut",
  dossier: "Changement de dossier",
  duration: "Changement de durée",
  comment: "Commentaire",
  deletion: "Suppression"
};

const STATUS_LABELS: Record<string, string> = {
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

function formatValue(field: string, value: ContractAuditChange["newValue"]) {
  if (value === null || value === "") return "Vide";
  if (field === "status") return STATUS_LABELS[String(value)] ?? String(value);
  if (field === "salaryNumber") {
    return `${Number(value).toLocaleString("fr-HT")} HTG`;
  }
  if (field === "durationMonths") return `${value} mois`;
  return String(value);
}

function describeChanges(changes: ContractAuditChange[]) {
  if (changes.length === 0) return "Enregistrement initial";
  return changes.map((change) => {
    const label = CONTRACT_AUDIT_FIELD_LABELS[change.field] ?? change.field;
    if (change.previousValue === null && change.newValue === null) {
      return label;
    }
    return `${label} : ${formatValue(change.field, change.previousValue)} → ${formatValue(change.field, change.newValue)}`;
  }).join(" · ");
}

function displayActorName(actor: AuditActor, usersById: Map<string, string>) {
  const mappedName = actor.id ? usersById.get(actor.id) : null;
  if (mappedName) return mappedName;
  const rawName = actor.name.trim();
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(rawName)) {
    return `Ancien utilisateur · ${rawName.slice(0, 8)}`;
  }
  return rawName || "Utilisateur inconnu";
}

export function AuditPage() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId ?? "";
  const { data, isLoading } = useContractsList({
    workspaceId,
    page: 1,
    pageSize: 5_000,
    sort: "createdAt_desc"
  });
  const { data: users = [] } = useAppUsers();
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<ContractAuditAction | "all">("all");
  const [actorId, setActorId] = useState("all");

  const usersById = useMemo(
    () => {
      const mapping = new Map(users.map((item) => [item.id, item.fullName]));
      if (user) mapping.set(user.id, user.name);
      return mapping;
    },
    [user, users]
  );

  const events = useMemo(() => {
    const result: AuditEvent[] = [];
    for (const contract of data?.items ?? []) {
      const history = contract.auditHistory;
      result.push({
        id: `${contract.id}:creation`,
        contract,
        action: "creation",
        at: history?.createdAt ?? contract.createdAt,
        actor: history?.createdBy ?? {
          id: contract.createdBy ?? null,
          name: contract.createdBy
            ? usersById.get(contract.createdBy) ?? contract.createdBy
            : "Utilisateur inconnu"
        },
        changes: []
      });
      for (const entry of history?.entries ?? []) {
        result.push({
          id: entry.id,
          contract,
          action: entry.action,
          at: entry.at,
          actor: entry.actor,
          changes: entry.changes
        });
      }
    }
    return result.sort((left, right) => right.at.localeCompare(left.at));
  }, [data?.items, usersById]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return events.filter((event) => {
      if (action !== "all" && event.action !== action) return false;
      if (actorId !== "all" && event.actor.id !== actorId) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        event.contract.id,
        event.contract.nif ?? "",
        event.contract.firstName,
        event.contract.lastName,
        event.actor.name,
        event.actor.id ? usersById.get(event.actor.id) ?? "" : "",
        describeChanges(event.changes)
      ].join(" ").toLocaleLowerCase("fr");
      return searchable.includes(normalizedQuery);
    });
  }, [action, actorId, events, query, usersById]);

  return (
    <div className="page-container audit-page">
      <header className="section-header page-header">
        <div>
          <span className="page-eyebrow">Traçabilité</span>
          <h1 className="section-title">Journal d’audit</h1>
          <div className="section-subtitle">
            Créations et modifications enregistrées dans historique_saisie.
          </div>
        </div>
        <div className="audit-summary-card">
          <strong>{filteredEvents.length}</strong>
          <span>événement{filteredEvents.length > 1 ? "s" : ""}</span>
        </div>
      </header>

      <section className="card audit-filters">
        <label className="search-field-unified">
          <span className="material-symbols-rounded icon">search</span>
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Contrat, NIF, personne ou modification…"
          />
        </label>
        <select
          className="select"
          value={action}
          onChange={(event) =>
            setAction(event.target.value as ContractAuditAction | "all")
          }
          aria-label="Filtrer par action"
        >
          <option value="all">Toutes les actions</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          className="select"
          value={actorId}
          onChange={(event) => setActorId(event.target.value)}
          aria-label="Filtrer par utilisateur"
        >
          <option value="all">Tous les utilisateurs</option>
          {users.map((item) => (
            <option key={item.id} value={item.id}>{item.fullName}</option>
          ))}
        </select>
      </section>

      {isLoading ? (
        <div className="card audit-empty">Chargement du journal…</div>
      ) : filteredEvents.length === 0 ? (
        <div className="card audit-empty">
          <span className="material-symbols-rounded">history_toggle_off</span>
          Aucun événement ne correspond aux filtres.
        </div>
      ) : (
        <div className="audit-timeline">
          {filteredEvents.map((event) => {
            const actorName = displayActorName(event.actor, usersById);
            return (
              <article className="card audit-event" key={event.id}>
                <div className={`audit-event-icon audit-action-${event.action}`}>
                  <span className="material-symbols-rounded">
                    {event.action === "creation"
                      ? "add_circle"
                      : event.action === "deletion"
                        ? "delete"
                        : event.action === "status"
                          ? "published_with_changes"
                          : "edit_note"}
                  </span>
                </div>
                <div className="audit-event-body">
                  <div className="audit-event-heading">
                    <div>
                      <strong>{ACTION_LABELS[event.action]}</strong>
                      <span>
                        {event.contract.firstName} {event.contract.lastName}
                      </span>
                    </div>
                    <time dateTime={event.at}>
                      {new Date(event.at).toLocaleString("fr-HT", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      })}
                    </time>
                  </div>
                  <p>{describeChanges(event.changes)}</p>
                  <div className="audit-event-meta">
                    <span>
                      <span className="material-symbols-rounded">person</span>
                      {actorName}
                    </span>
                    <span>
                      <span className="material-symbols-rounded">badge</span>
                      {event.contract.nif || "NIF absent"}
                    </span>
                    <Link to={`/app/contrats/${event.contract.id}`}>
                      Contrat {event.contract.id}
                      <span className="material-symbols-rounded">arrow_forward</span>
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
