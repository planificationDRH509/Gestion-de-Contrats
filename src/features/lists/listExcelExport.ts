import type { Contract } from "../../data/types";
import type { InstitutionSuggestion } from "../../data/local/suggestionsDb";
import { createExcelPackageBlob, escapeExcelXml as xml } from "../../lib/excelExport";
import { getContractFiscalYear, getContractStartDate, getFiscalYearEndYear } from "../../lib/contractDateFilters";
import { formatFirstName, formatLastName } from "../../lib/format";
import { normalizeSuggestionGrammarValue, stripSuggestionPrefix } from "../../lib/suggestionPrefixes";
import { getStoredContractStartDate } from "../settings/settingsApi";
import { listName, listTotals, sortedMembers, type ContractList } from "./listModel";
import styles from "./excel/styles.json";

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const widths = [4.35, 24.67, 17.35, 17.85, 20.5, 21, 47.85, 13, 13.35, 11.5, 13.17, 14.85, 14.85, 18.5, 17.85];
const headers = ["No", "Nom", "Prénom", "NIF", "NINU", "Titre Emploi", "Institutions", "Départements",
  "Formation\nUniversitaire/Technique", "Nbre d’années\nd’expérience", "Description de\ntâches", "Début", "Fin", "Rémunération", "Remarque de la\nCSCCA"];
const letters = "ABCDEFGHIJKLMNO";
type Style = keyof typeof styles.ids;

function cell(ref: string, value: string | number, style: Style, formula?: string) {
  const start = `<c r="${ref}" s="${styles.ids[style]}"`;
  // All user data is literal text. Only the fixed total formulas below can execute.
  return typeof value === "number"
    ? `${start}>${formula ? `<f>${xml(formula)}</f>` : ""}<v>${value}</v></c>`
    : `${start} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function serialDate(date: Date) {
  return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/** Use the same fiscal year and configured start day as the printed contract. */
export function listContractDates(contract: Contract) {
  const endYear = getFiscalYearEndYear(contract);
  const configured = getStoredContractStartDate(contract.workspaceId, contract.durationMonths);
  const start = configured
    ? new Date(configured.getMonth() >= 9 ? endYear - 1 : endYear, configured.getMonth(), configured.getDate())
    : getContractStartDate(contract);
  return [serialDate(start), serialDate(new Date(endYear, 8, 30))];
}

function institutionKey(value: string) {
  return normalizeSuggestionGrammarValue(stripSuggestionPrefix(value, "institution")).replace(/^(?:l'|le |la |les )/, "");
}

/** Refuse a partial or stale export instead of silently omitting a contract. */
export function orderedListContracts(list: ContractList, contracts: Contract[]) {
  if (!list.members.length) throw new Error("Ajoutez des contrats avant d’exporter cette liste.");
  const byId = new Map(contracts.map(contract => [contract.id, contract]));
  if (new Set(list.members.map(member => member.id)).size !== list.members.length) {
    throw new Error("La liste contient des contrats en double. Actualisez-la avant l’export.");
  }
  return sortedMembers(list.members).map(member => {
    const contract = byId.get(member.id);
    if (!contract || contract.deletedAt || contract.workspaceId !== list.workspaceId) {
      throw new Error("Certains contrats ne sont pas disponibles. Actualisez la liste puis réessayez l’export.");
    }
    if (contract.durationMonths !== list.durationMonths || !Number.isFinite(contract.salaryNumber)
      || contract.salaryNumber !== member.salaryNumber || contract.firstName !== member.firstName
      || contract.lastName !== member.lastName || (contract.nif ?? "") !== member.nif || contract.position !== member.position) {
      throw new Error("Les contrats ont changé. Actualisez la liste puis réessayez l’export.");
    }
    return contract;
  });
}

/** MSPP layout based on “Lot 25 Delice Darbicha.xlsx”; never includes its sample personnel. */
export function createListExcelWorkbook(list: ContractList, contracts: Contract[], institutions: InstitutionSuggestion[], emblem: Uint8Array) {
  const ordered = orderedListContracts(list, contracts);
  const years = [...new Set(ordered.map(getContractFiscalYear))].sort();
  const rows: string[] = [];
  const merges: string[] = [];
  const row = (number: number, height: number, content = "") => rows.push(`<row r="${number}" ht="${height}" customHeight="1">${content}</row>`);
  const merged = (number: number, text: string, style: Style, height: number) => {
    merges.push(`A${number}:O${number}`);
    row(number, height, cell(`A${number}`, text, style));
  };
  for (let i = 1; i <= 4; i++) row(i, 22);
  merged(5, "MINISTÈRE DE LA SANTÉ PUBLIQUE ET DE LA POPULATION", "title", 22);
  merged(6, "Tableau résumé de contrat d’Agents Publics", "subtitle", 20);
  merged(7, `${years.length > 1 ? "EXERCICES" : "EXERCICE"} ${years.join(" / ")}`, "subtitle", 18);
  merged(8, "CODE BUDGÉTAIRE : ………………………………    DISPONIBILITÉS BUDGÉTAIRES À LA DATE DE SIGNATURE DU CONTRAT : ………………………………    DATE : ……/……/…………", "metadata", 24);
  merged(9, `${listName(list)}   ·   ${ordered.length} contrat(s)   ·   ${list.durationMonths} mois   ·   ${list.sealedAt ? "Scellée" : "En préparation"}`, "subtitle", 30);
  row(10, 24, headers.map((label, index) => {
    merges.push(`${letters[index]}10:${letters[index]}11`);
    return cell(`${letters[index]}10`, label, "header");
  }).join(""));
  row(11, 20);

  ordered.forEach((contract, index) => {
    const number = index + 12;
    const institution = institutions.find(item => [item.label, item.labelFeminine].some(label => label && institutionKey(label) === institutionKey(contract.assignment)));
    const [start, end] = listContractDates(contract);
    const values = [index + 1, formatLastName(contract.lastName), formatFirstName(contract.firstName), contract.nif ?? "", contract.ninu ?? "",
      stripSuggestionPrefix(contract.position, "position"), stripSuggestionPrefix(contract.assignment, "institution"), institution?.department ?? "",
      "", "", "", start, end, Math.round(contract.salaryNumber * 100) / 100, ""];
    const height = Math.max(38.25, ...values.map((value, col) => typeof value === "string" ? Math.ceil(value.length / Math.max(1, widths[col] - 3)) * 14 : 0));
    row(number, height, values.map((value, col) => cell(`${letters[col]}${number}`, value,
      col === 3 || col === 4 ? "identifier" : col === 11 || col === 12 ? "date" : col === 13 ? "money" : "body")).join(""));
  });
  const totalRow = 12 + ordered.length;
  const totals = listTotals(list);
  row(totalRow, 22, cell(`M${totalRow}`, "Total", "header") + cell(`N${totalRow}`, totals.monthly, "total", `SUM(N12:N${totalRow - 1})`) + cell(`O${totalRow}`, "HTG / mois", "header"));
  const signatureRow = totalRow + 4;
  merges.push(`B${signatureRow}:F${signatureRow}`, `H${signatureRow}:O${signatureRow}`);
  row(signatureRow, 24, cell(`B${signatureRow}`, "Signature du Ministre : ………………………………", "signature")
    + cell(`H${signatureRow}`, "Visa du Contrôleur Financier : ……………………………………………………", "signature"));
  const lastRow = signatureRow + 1;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${MAIN}" xmlns:r="${REL}">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:O${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="11" topLeftCell="A12" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>
  <sheetData>${rows.join("")}</sheetData>
  <mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.15" footer="0.15"/>
  <pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
  <headerFooter><oddFooter>&amp;RPage &amp;P / &amp;N</oddFooter></headerFooter>
  <drawing r:id="rId1"/>
</worksheet>`;
  const imageOffsetPx = widths.reduce((sum, width) => sum + width * 7 + 5, 0) / 2
    - widths.slice(0, 6).reduce((sum, width) => sum + width * 7 + 5, 0) - 52;
  return createExcelPackageBlob([
    { name: "[Content_Types].xml", data: `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>` },
    { name: "_rels/.rels", data: `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Liste" sheetId="1" r:id="rId1"/></sheets>
      <definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'Liste'!$A$1:$O$${lastRow}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'Liste'!$10:$11</definedName></definedNames>
      <calcPr calcMode="auto" fullCalcOnLoad="1"/></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
    { name: "xl/styles.xml", data: styles.xml },
    { name: "xl/worksheets/_rels/sheet1.xml.rels", data: `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/drawing" Target="../drawings/drawing1.xml"/></Relationships>` },
    { name: "xl/drawings/drawing1.xml", data: `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <xdr:oneCellAnchor><xdr:from><xdr:col>6</xdr:col><xdr:colOff>${Math.round(imageOffsetPx * 9525)}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="990600" cy="990600"/>
      <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Armoiries d’Haïti"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${REL}" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>` },
    { name: "xl/drawings/_rels/drawing1.xml.rels", data: `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/image" Target="../media/emblem.png"/></Relationships>` },
    { name: "xl/media/emblem.png", data: emblem }
  ]);
}
