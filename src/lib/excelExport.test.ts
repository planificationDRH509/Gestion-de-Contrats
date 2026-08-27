import { describe, expect, it } from "vitest";
import { createExcelClipboardText, createExcelWorkbookBlob } from "./excelExport";

function readBlob(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

describe("Excel salary values", () => {
  it("keeps numeric values as plain digits in clipboard data", () => {
    expect(createExcelClipboardText([["Salaire en chiffre"], [45_000]])).toBe(
      "Salaire en chiffre\r\n45000"
    );
  });

  it("stores numeric values as number cells in the workbook", async () => {
    const workbook = createExcelWorkbookBlob("Contrats", [
      ["Salaire en chiffre"],
      [45_000]
    ]);
    const workbookBytes = new Uint8Array(await readBlob(workbook));
    const workbookText = new TextDecoder().decode(workbookBytes);

    expect(workbookText).toContain('<c r="A2"><v>45000</v></c>');
    expect(workbookText).not.toContain('<c r="A2" t="inlineStr">');
  });
});
