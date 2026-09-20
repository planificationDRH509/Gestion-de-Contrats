import { getDataProvider } from "../../data/dataProvider";
import { createListExcelWorkbook } from "./listExcelExport";
import { listName, sortedMembers, type ContractList } from "./listModel";
import emblemUrl from "./excel/emblem.png";

function snapshot(list: ContractList) {
  return JSON.stringify([list.id, list.workspaceId, list.version, list.durationMonths, list.visaNumber, list.sealedAt, sortedMembers(list.members)]);
}

export async function downloadListExcel(readCurrentList: () => Promise<ContractList>) {
  const list = await readCurrentList();
  const provider = getDataProvider();
  const [contracts, institutions, emblemResponse] = await Promise.all([
    provider.contracts.getByIds(list.members.map(member => member.id), list.workspaceId),
    provider.suggestions.getInstitutions(list.workspaceId),
    fetch(emblemUrl)
  ]);
  if (!emblemResponse.ok) throw new Error("Le modèle Excel n’a pas pu être chargé. Réessayez l’export.");
  const emblem = new Uint8Array(await emblemResponse.arrayBuffer());
  const blob = createListExcelWorkbook(list, contracts, institutions, emblem);
  if (snapshot(await readCurrentList()) !== snapshot(list)) {
    throw new Error("La liste a changé pendant l’export. Vérifiez son contenu puis réessayez.");
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${listName(list).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").slice(0, 150)}.xlsx`;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    // Let the browser consume the download before releasing its object URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
