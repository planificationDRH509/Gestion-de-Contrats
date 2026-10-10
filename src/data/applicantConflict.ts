import type { Applicant } from "./types";

export function applicantConflictMessage(field: "NIF" | "NINU", value: string, owner: Applicant) {
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ");
  const ownerNif = owner.nif || owner.id;
  return `Le ${field} ${value} appartient déjà à ${name || "une autre personne"} (NIF ${ownerNif}).`;
}

export function applicantDatabaseConflictMessage(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const error = cause as Record<string, unknown>;
  const details = [error.message, error.details, error.hint].filter((value) => typeof value === "string").join(" ");
  const key = details.match(/Key \(([^)]+)\)=\(([^)]+)\)/i);
  const fields = key?.[1].split(",").map((field) => field.trim().replace(/"/g, "").toLowerCase()) ?? [];
  const values = key?.[2].split(",").map((value) => value.trim()) ?? [];
  const index = fields.findIndex((field) => field === "nif" || field === "ninu");
  const constraint = String(error.constraint ?? "") + " " + details;
  const field = index >= 0 ? fields[index].toUpperCase()
    : /(?:^|[^a-z])ninu(?:[^a-z]|$)/i.test(constraint) ? "NINU"
    : /(?:^|[^a-z])nif(?:[^a-z]|$)/i.test(constraint) ? "NIF" : null;
  if (error.code !== "23505" && !/duplicate key|unique constraint/i.test(details)) return null;
  if (!field) return "Conflit d’identification : le serveur ne précise pas le champ en doublon.";
  return `Le ${field}${index >= 0 ? ` ${values[index]}` : ""} existe déjà dans la base${field === "NINU" ? " pour un autre NIF" : ""}.`;
}
