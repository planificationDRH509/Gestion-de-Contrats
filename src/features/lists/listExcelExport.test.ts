import { beforeEach, describe, expect, it } from "vitest";
import type { Contract } from "../../data/types";
import { createListExcelWorkbook } from "./listExcelExport";
import type { ContractList } from "./listModel";
import { setStoredContractStartDates } from "../settings/settingsApi";

function contract(id: string, overrides: Partial<Contract> = {}): Contract {
  return { id, workspaceId: "w", applicantId: null, status: "final", gender: "Femme", firstName: "Ana", lastName: "Étienne",
    nif: "001-234-567-8", ninu: "00123456789012345678", address: "Delmas", position: "Infirmière", assignment: "à la Direction générale",
    salaryNumber: 25000.25, salaryText: "", durationMonths: 9, annee_fiscale: "2025-2026", createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z", ...overrides };
}
function list(contracts: Contract[], overrides: Partial<ContractList> = {}): ContractList {
  return { id: "lot", workspaceId: "w", durationMonths: 9, visaNumber: "V-001", version: 1, sealedAt: null, createdAt: "2026-06-01T00:00:00Z", history: [],
    members: contracts.map(c => ({ ...c, nif: c.nif ?? "" })), ...overrides };
}
async function parts(blob: Blob) {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(blob);
  });
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameSize = view.getUint16(offset + 26, true);
    const extraSize = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameSize));
    const start = offset + 30 + nameSize + extraSize;
    files.set(name, decoder.decode(bytes.slice(start, start + size))); offset = start + size;
  }
  const sheet = new DOMParser().parseFromString(files.get("xl/worksheets/sheet1.xml")!, "application/xml");
  expect(sheet.querySelector("parsererror")).toBeNull();
  return { files, sheet, value: (ref: string) => sheet.querySelector(`c[r="${ref}"]`)?.textContent };
}
const emblem = new Uint8Array([137, 80, 78, 71]);
beforeEach(() => localStorage.clear());

describe("Excel des listes", () => {
  it("exports all 15 columns alphabetically, preserving identifiers and using institution departments", async () => {
    const contracts = [contract("z", { lastName: "Louis", firstName: "Louvens", salaryNumber: 100.15 }), contract("a")];
    const result = await parts(createListExcelWorkbook(list(contracts), contracts, [{id: "i", label: "Direction générale", department: "Ouest", order: 0, addressKeywords: []}], emblem));
    expect(result.value("B12")).toBe("ÉTIENNE"); expect(result.value("C13")).toBe("Louvens");
    expect(result.value("D12")).toBe("001-234-567-8"); expect(result.value("E12")).toBe("00123456789012345678");
    expect(result.sheet.querySelector('c[r="E12"]')?.getAttribute("t")).toBe("inlineStr");
    expect(result.value("G12")).toBe("Direction générale"); expect(result.value("H12")).toBe("Ouest");
    for (const ref of ["I12", "J12", "K12", "O12"]) expect(result.value(ref)).toBe("");
    expect(result.value("N12")).toBe("25000.25");
    expect(result.sheet.querySelector('c[r="N14"] f')?.textContent).toBe("SUM(N12:N13)");
    expect(result.sheet.querySelector('c[r="N14"] v')?.textContent).toBe("25100.4");
    expect(result.sheet.querySelector('c[r="N15"]')).toBeNull();
    expect(result.files.get("xl/worksheets/sheet1.xml")).not.toContain("Montant sur");
    expect(result.value("A9")).toContain("LOT-2-ÉTIENNE-Ana");
    expect(result.files.get("xl/worksheets/sheet1.xml")).not.toContain("V-001");
    expect(result.value("H18")).toBe("Visa du Contrôleur Financier : ……………………………………………………");
    expect(result.sheet.querySelectorAll('row[r="12"] c')).toHaveLength(15);
    expect(result.files.get("xl/worksheets/sheet1.xml")).not.toMatch(/SINAL|CANNY|Nouveau|Doc en Annexe/);
  });

  it("uses actual fiscal years, typed dates and configured contract start dates", async () => {
    setStoredContractStartDates("w", {9: "2026-01-12"});
    const contracts = [contract("a", { annee_fiscale: "2026-2027" })];
    const result = await parts(createListExcelWorkbook(list(contracts), contracts, [], emblem));
    const serial = (year: number, month: number, day: number) => String((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000);
    expect(result.value("A7")).toBe("EXERCICE 2026-2027");
    expect(result.value("L12")).toBe(serial(2027, 1, 12)); expect(result.value("M12")).toBe(serial(2027, 9, 30));
    expect(result.files.get("xl/styles.xml")).toContain("dd/mm/yyyy");
  });

  it("handles mixed fiscal years and leaves unknown departments and optional visa blank", async () => {
    const contracts = [contract("a"), contract("b", { annee_fiscale: "2026-2027" })];
    const result = await parts(createListExcelWorkbook(list(contracts, { visaNumber: null }), contracts, [], emblem));
    expect(result.value("A7")).toBe("EXERCICES 2025-2026 / 2026-2027");
    expect(result.value("H12")).toBe(""); expect(result.value("A9")).not.toContain("Visa");
  });

  it("keeps user text literal and escapes XML without creating formulas or invalid controls", async () => {
    const contracts = [contract("a", {ninu: '=HYPERLINK("x")', assignment: "Hôpital & <Centre>\u0001"})];
    const result = await parts(createListExcelWorkbook(list(contracts), contracts, [], emblem));
    expect(result.value("E12")).toBe('=HYPERLINK("x")'); expect(result.value("G12")).toBe("Hôpital & <Centre>");
    expect(result.sheet.querySelectorAll("f")).toHaveLength(1);
  });

  it("supports a sealed lot larger than the reference and repeats table headings on landscape pages", async () => {
    const contracts = Array.from({length: 125}, (_, i) => contract(String(i)));
    const result = await parts(createListExcelWorkbook(list(contracts, {sealedAt: "2026-09-01"}), contracts, [], emblem));
    expect(result.sheet.querySelector('c[r="N137"] f')?.textContent).toBe("SUM(N12:N136)");
    expect(result.value("A9")).toContain("Scellée");
    expect(result.sheet.querySelector("pageSetup")?.getAttribute("orientation")).toBe("landscape");
    expect(result.sheet.querySelector("pageSetup")?.getAttribute("fitToHeight")).toBe("0");
    expect(result.files.get("xl/workbook.xml")).toContain("'Liste'!$10:$11");
    expect(result.files.has("xl/media/emblem.png")).toBe(true);
    expect(result.files.get("xl/styles.xml")).toContain("Times New Roman");
  });

  it("refuses missing, deleted, foreign, changed or incompatible contracts and empty lists", () => {
    const c = contract("a"); const lot = list([c]);
    expect(() => createListExcelWorkbook(list([]), [], [], emblem)).toThrow(/Ajoutez/);
    expect(() => createListExcelWorkbook(lot, [], [], emblem)).toThrow(/disponibles/);
    for (const changes of [{deletedAt: "2026-09-20"}, {workspaceId: "another"}, {durationMonths: 6}, {salaryNumber: 1}, {nif: "changed"}, {salaryNumber: Infinity}]) {
      expect(() => createListExcelWorkbook(lot, [{...c, ...changes}], [], emblem)).toThrow();
    }
  });
});
