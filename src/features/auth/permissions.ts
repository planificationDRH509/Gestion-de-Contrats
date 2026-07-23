export const APP_ROLES = ["admin", "agent", "controller", "reader"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrateur",
  agent: "Agent de saisie",
  controller: "Contrôleur",
  reader: "Lecture seule"
};

export type AppPermission =
  | "contracts.view"
  | "contracts.create"
  | "contracts.edit"
  | "contracts.delete"
  | "contracts.change_status"
  | "contracts.print"
  | "contracts.import"
  | "contracts.export"
  | "dossiers.manage"
  | "identification.manage"
  | "statistics.view"
  | "audit.view"
  | "quality.view"
  | "settings.manage"
  | "users.manage";

const ROLE_PERMISSIONS: Record<AppRole, ReadonlySet<AppPermission>> = {
  admin: new Set<AppPermission>([
    "contracts.view",
    "contracts.create",
    "contracts.edit",
    "contracts.delete",
    "contracts.change_status",
    "contracts.print",
    "contracts.import",
    "contracts.export",
    "dossiers.manage",
    "identification.manage",
    "statistics.view",
    "audit.view",
    "quality.view",
    "settings.manage",
    "users.manage"
  ]),
  agent: new Set<AppPermission>([
    "contracts.view",
    "contracts.create",
    "contracts.edit",
    "contracts.print",
    "contracts.import",
    "contracts.export",
    "dossiers.manage",
    "identification.manage",
    "statistics.view"
  ]),
  controller: new Set<AppPermission>([
    "contracts.view",
    "contracts.edit",
    "contracts.change_status",
    "contracts.print",
    "contracts.export",
    "statistics.view",
    "audit.view",
    "quality.view"
  ]),
  reader: new Set<AppPermission>([
    "contracts.view",
    "contracts.print",
    "statistics.view"
  ])
};

export function normalizeAppRole(value: unknown, username?: string): AppRole {
  if (typeof value === "string" && APP_ROLES.includes(value as AppRole)) {
    return value as AppRole;
  }
  return username?.trim().toLocaleLowerCase("fr") === "admin" ? "admin" : "agent";
}

export function hasPermission(role: AppRole, permission: AppPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
