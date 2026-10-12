import type { Contract } from "../../data/types";
import { compareContracts } from "../../lib/contractSorting";
import { normalizeListSearch, type ContractList } from "../lists/listModel";

const normalize = (value: unknown) => normalizeListSearch(String(value ?? "")).trim().replace(/\s+/g, " ");
const fields = [
  ["dossierId", 5], ["assignment", 2], ["position", 2],
  ["salaryNumber", 1], ["durationMonths", 1], ["annee_fiscale", 1]
] as const;

export function rankPrintCandidates(candidates: Contract[], selected: Contract[], lists: ContractList[], workspaceId: string, search = "") {
  const references = selected.filter(contract => contract.workspaceId === workspaceId && !contract.deletedAt);
  const selectedIds = new Set(references.map(contract => contract.id));
  const values = fields.map(([field]) => new Set(references.map(contract => normalize(contract[field])).filter(Boolean)));
  const tags = new Set(references.flatMap(contract => (contract.tags ?? []).filter(tag => !tag.deletedAt).map(tag => tag.id)));
  const sameListIds = new Set(lists.filter(list => list.workspaceId === workspaceId && list.members.some(member => selectedIds.has(member.id))).flatMap(list => list.members.map(member => member.id)));
  const dates = references.map(contract => Date.parse(contract.createdAt)).filter(Number.isFinite).sort((a, b) => a - b);
  const tokens = normalize(search).split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  return candidates.filter(contract => {
    if (contract.workspaceId !== workspaceId || contract.deletedAt || selectedIds.has(contract.id) || seen.has(contract.id)) return false;
    seen.add(contract.id);
    const haystack = normalize([contract.firstName, contract.lastName, contract.nif, contract.ninu, contract.position, contract.assignment, contract.annee_fiscale, contract.durationMonths, ...((contract.tags ?? []).map(tag => tag.name))].join(" "));
    return tokens.every(token => haystack.includes(token));
  }).map(contract => {
    let score = fields.reduce((total, [field, weight], index) => total + (values[index].has(normalize(contract[field])) ? weight : 0), 0);
    if (sameListIds.has(contract.id)) score += 5;
    if (contract.tags?.some(tag => !tag.deletedAt && tags.has(tag.id))) score += 2;
    const date = Date.parse(contract.createdAt);
    if (Number.isFinite(date) && dates.length) {
      let left = 0;
      let right = dates.length;
      while (left < right) {
        const middle = Math.floor((left + right) / 2);
        if (dates[middle] < date) left = middle + 1;
        else right = middle;
      }
      const distance = Math.min(Math.abs(date - (dates[left] ?? Infinity)), Math.abs(date - (dates[left - 1] ?? Infinity))) / 86_400_000;
      score += distance <= 1 ? 3 : distance <= 7 ? 2 : distance <= 31 ? 1 : 0;
    }
    return { contract, score };
  }).sort((a, b) => b.score - a.score || compareContracts(a.contract, b.contract, "name_asc")).map(({ contract }) => contract);
}
