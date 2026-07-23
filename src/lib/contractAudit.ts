import type {
  AuditActor,
  AuditValue,
  Contract,
  ContractAuditAction,
  ContractAuditChange,
  ContractAuditHistory
} from "../data/types";
import { normalizeAppRole } from "../features/auth/permissions";

const AUTH_KEY = "contribution_auth";

export const CONTRACT_AUDIT_FIELD_LABELS: Record<string, string> = {
  nif: "NIF",
  ninu: "NINU",
  firstName: "Prénom",
  lastName: "Nom",
  gender: "Sexe",
  address: "Adresse",
  position: "Poste",
  titre: "Poste",
  assignment: "Affectation",
  lieu_affectation: "Affectation",
  salaryNumber: "Salaire en chiffre",
  salaire_en_chiffre: "Salaire en chiffre",
  salaryText: "Salaire en lettres",
  salaire: "Salaire en lettres",
  durationMonths: "Durée",
  duree_contrat: "Durée",
  dossierId: "Dossier",
  dossier_id: "Dossier",
  status: "Statut",
  commentaire: "Commentaire"
};

const TRACKED_FIELDS = Object.keys(CONTRACT_AUDIT_FIELD_LABELS) as Array<
  keyof Contract
>;

function nowIso() {
  return new Date().toISOString();
}

function createEntryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeValue(value: unknown): AuditValue {
  if (value === undefined || value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
}

function normalizeActor(value: unknown, fallbackName = "Utilisateur inconnu"): AuditActor {
  if (typeof value === "string") {
    return { name: value.trim() || fallbackName };
  }
  if (!value || typeof value !== "object") {
    return { name: fallbackName };
  }
  const actor = value as Partial<AuditActor>;
  return {
    id: typeof actor.id === "string" ? actor.id : null,
    name:
      typeof actor.name === "string" && actor.name.trim()
        ? actor.name.trim()
        : fallbackName,
    role: actor.role ? normalizeAppRole(actor.role) : null
  };
}

export function getStoredAuditActor(): AuditActor {
  if (typeof localStorage === "undefined") {
    return { name: "Utilisateur inconnu" };
  }
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return { name: "Utilisateur inconnu" };
    const parsed = JSON.parse(raw) as {
      id?: string;
      name?: string;
      username?: string;
      role?: unknown;
    };
    return {
      id: parsed.id ?? null,
      name: parsed.name?.trim() || parsed.username?.trim() || "Utilisateur inconnu",
      role: normalizeAppRole(parsed.role, parsed.username)
    };
  } catch {
    return { name: "Utilisateur inconnu" };
  }
}

export function createContractAuditHistory(
  actor: AuditActor = getStoredAuditActor(),
  at = nowIso()
): ContractAuditHistory {
  return {
    version: 2,
    createdAt: at,
    createdBy: normalizeActor(actor),
    entries: []
  };
}

export function parseContractAudit(
  value: unknown,
  fallback: { createdAt?: string; createdBy?: AuditActor | string } = {}
): ContractAuditHistory {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }

  const fallbackAt = fallback.createdAt || nowIso();
  const fallbackActor = normalizeActor(fallback.createdBy, "Utilisateur inconnu");

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if (record.version === 2 && Array.isArray(record.entries)) {
      return {
        version: 2,
        createdAt:
          typeof record.createdAt === "string" && record.createdAt
            ? record.createdAt
            : fallbackAt,
        createdBy: normalizeActor(record.createdBy, fallbackActor.name),
        entries: record.entries
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => {
            const item = entry as Record<string, unknown>;
            const action = typeof item.action === "string"
              ? item.action as ContractAuditAction
              : "modification";
            return {
              id: typeof item.id === "string" && item.id ? item.id : createEntryId(),
              action,
              at: typeof item.at === "string" && item.at ? item.at : fallbackAt,
              actor: normalizeActor(item.actor, fallbackActor.name),
              changes: Array.isArray(item.changes)
                ? item.changes
                    .filter((change) => change && typeof change === "object")
                    .map((change) => {
                      const auditChange = change as Record<string, unknown>;
                      return {
                        field: String(auditChange.field ?? ""),
                        previousValue: normalizeValue(auditChange.previousValue),
                        newValue: normalizeValue(auditChange.newValue)
                      };
                    })
                    .filter((change) => change.field)
                : []
            };
          })
      };
    }

    // Legacy SQLite shape: { createdAt, createdBy, updates: [{ changes: string[] }] }
    const createdAt =
      typeof record.createdAt === "string" && record.createdAt
        ? record.createdAt
        : fallbackAt;
    const createdBy = normalizeActor(record.createdBy, fallbackActor.name);
    const legacyUpdates = Array.isArray(record.updates) ? record.updates : [];
    return {
      version: 2,
      createdAt,
      createdBy,
      entries: legacyUpdates
        .filter((update) => update && typeof update === "object")
        .map((update) => {
          const item = update as Record<string, unknown>;
          const fields = Array.isArray(item.changes) ? item.changes : [];
          return {
            id: createEntryId(),
            action: "modification" as const,
            at:
              typeof item.updatedAt === "string" && item.updatedAt
                ? item.updatedAt
                : createdAt,
            actor: normalizeActor(item.updatedBy, createdBy.name),
            changes: fields
              .map((field) => String(field))
              .filter(Boolean)
              .map((field) => ({
                field,
                previousValue: null,
                newValue: null
              }))
          };
        })
    };
  }

  return createContractAuditHistory(fallbackActor, fallbackAt);
}

export function serializeContractAudit(history: ContractAuditHistory): string {
  return JSON.stringify(history);
}

export function buildContractAuditChanges(
  previous: Partial<Contract>,
  next: Partial<Contract>
): ContractAuditChange[] {
  return TRACKED_FIELDS.flatMap((field) => {
    if (!(field in next)) return [];
    const previousValue = normalizeValue(previous[field]);
    const newValue = normalizeValue(next[field]);
    if (previousValue === newValue) return [];
    return [{ field, previousValue, newValue }];
  });
}

export function appendContractAuditEntry(
  history: ContractAuditHistory | undefined,
  {
    action,
    changes,
    actor = getStoredAuditActor(),
    at = nowIso()
  }: {
    action: ContractAuditAction;
    changes: ContractAuditChange[];
    actor?: AuditActor;
    at?: string;
  }
): ContractAuditHistory {
  const current = history ?? createContractAuditHistory(actor, at);
  if (changes.length === 0 && action !== "deletion") return current;
  return {
    ...current,
    entries: [
      ...current.entries,
      {
        id: createEntryId(),
        action,
        at,
        actor: normalizeActor(actor),
        changes
      }
    ]
  };
}

export function inferAuditAction(changes: ContractAuditChange[]): ContractAuditAction {
  const fields = new Set(changes.map((change) => change.field));
  if (fields.size === 1 && fields.has("status")) return "status";
  if (fields.size === 1 && fields.has("dossierId")) return "dossier";
  if (fields.size === 1 && fields.has("durationMonths")) return "duration";
  if (fields.size === 1 && fields.has("commentaire")) return "comment";
  return "modification";
}
