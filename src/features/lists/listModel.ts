import { formatFirstName, formatLastName } from "../../lib/format";

export type ListMember = {
  id: string;
  firstName: string;
  lastName: string;
  nif: string;
  position: string;
  salaryNumber: number;
  durationMonths: number;
};
export type ContractList = {
  id: string;
  workspaceId: string;
  durationMonths: number;
  visaNumber: string | null;
  sealedAt: string | null;
  version: number;
  createdAt: string;
  members: ListMember[];
  history: { at: string; actor: string; action: string; reason?: string }[];
};
export type ListOperation = {
  action: "create" | "assign" | "visa" | "seal" | "reopen" | "delete";
  listId?: string | null;
  durationMonths?: number;
  visaNumber?: string;
  contractIds?: string[];
  version?: number;
  reason?: string;
};
const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });
export function sortedMembers(members: ListMember[]) {
  return [...members].sort((a, b) => collator.compare(a.lastName.trim(), b.lastName.trim())
    || collator.compare(a.firstName.trim(), b.firstName.trim()) || a.id.localeCompare(b.id));
}
export function listName(list: ContractList) {
  const first = sortedMembers(list.members)[0];
  return first ? `LOT-${list.members.length}-${formatLastName(first.lastName)}-${formatFirstName(first.firstName)}` : "LOT-0";
}
export function listTotals(list: ContractList) {
  const monthlyCents = list.members.reduce((sum, member) => sum + Math.round(member.salaryNumber * 100), 0);
  return { monthly: monthlyCents / 100, total: monthlyCents * list.durationMonths / 100 };
}
export function listError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "Erreur inconnue.");
  if (/TASK_SESSION/.test(message)) return "Votre session a expiré. Reconnectez-vous pour accéder aux listes.";
  if (/PGRST202|Could not find the function/.test(message)) return "La mise à jour des listes doit être appliquée à la base de données.";
  return message;
}
