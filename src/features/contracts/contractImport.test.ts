import { describe, expect, it } from "vitest";
import {
  buildImportPreview,
  buildImportEditableRows,
  inferImportMapping,
  parseImportMoney,
  parsePastedContractTable,
  validateImportEditableRows,
  validateImportMapping
} from "./contractImport";

describe("contractImport", () => {
  it("parses Excel clipboard rows and infers system fields", () => {
    const table = parsePastedContractTable(
      [
        "NIF\tNom\tPrénom\tSexe\tAdresse\tSalaire\tPoste\tAffectation\tDurée",
        "0010020034\tDOE\tJean\tM\tRue 1\t45,000\tAgent\tMSPP\t12"
      ].join("\n")
    );

    const mapping = inferImportMapping(table.headers);
    const mappingIssues = validateImportMapping(mapping);
    const previewRows = buildImportPreview(table, mapping);

    expect(mappingIssues.missingFields).toEqual([]);
    expect(previewRows[0].errors).toEqual([]);
    expect(previewRows[0].values).toMatchObject({
      nif: "001-002-003-4",
      lastName: "DOE",
      firstName: "Jean",
      gender: "Homme",
      salaryNumber: 45000,
      durationMonths: 12
    });
    expect(previewRows[0].values?.salaryText).toContain("QUARANTE");
  });

  it("detects invalid rows and duplicate NIFs", () => {
    const table = parsePastedContractTable(
      [
        "NIF\tNom\tPrénom\tSexe\tAdresse\tSalaire\tPoste\tAffectation",
        "0010020034\tDOE\tJean\tHomme\tRue 1\t45000\tAgent\tMSPP",
        "0010020034\tSMITH\tAnne\tX\tRue 2\t45000\tAgent\tMSPP"
      ].join("\n")
    );

    const previewRows = buildImportPreview(table, inferImportMapping(table.headers));

    expect(previewRows[0].warnings).toContain("Doublon possible: NIF répété dans le collage.");
    expect(previewRows[1].errors).toContain("Le sexe est invalide.");
  });

  it("parses common imported salary formats", () => {
    expect(parseImportMoney("45,000")).toBe(45000);
    expect(parseImportMoney("45.000,50")).toBe(45000.5);
    expect(parseImportMoney("45000,50")).toBe(45000.5);
  });

  it("removes the l' preposition in assignment values", () => {
    const table = parsePastedContractTable(
      [
        "NIF\tNom\tPrénom\tSexe\tAdresse\tSalaire\tPoste\tAffectation",
        "0010020034\tDOE\tJean\tHomme\tRue 1\t45000\tAgent\tà l'hôpital"
      ].join("\n")
    );
    const rows = buildImportEditableRows(table, inferImportMapping(table.headers));

    expect(rows[0].assignment).toBe("hôpital");
  });

  it("removes leading prepositions in address values too", () => {
    const table = parsePastedContractTable(
      [
        "NIF\tNom\tPrénom\tSexe\tAdresse\tSalaire\tPoste\tAffectation",
        "0010020034\tDOE\tJean\tHomme\tà l'Hôpital Général\t45000\tAgent\tMSPP"
      ].join("\n")
    );
    const rows = buildImportEditableRows(table, inferImportMapping(table.headers));

    expect(rows[0].address).toBe("Hôpital Général");
  });

  it("allows rows to be edited or excluded before validation", () => {
    const table = parsePastedContractTable(
      [
        "NIF\tNom\tPrénom\tSexe\tAdresse\tSalaire\tPoste\tAffectation",
        "0010020034\tDOE\tJean\tX\tRue 1\t45000\tAgent\tMSPP",
        "0010020035\tSMITH\tAnne\tFemme\tRue 2\t45000\tAgent\tMSPP"
      ].join("\n")
    );
    const rows = buildImportEditableRows(table, inferImportMapping(table.headers));
    const invalidRows = validateImportEditableRows(rows);

    expect(invalidRows[0].errors).toContain("Le sexe est invalide.");

    const editedRows = rows.map((row) =>
      row.sourceRowNumber === 2 ? { ...row, gender: "Homme", assignment: "HUEH" } : row
    );
    const validRows = validateImportEditableRows(editedRows);

    expect(validRows[0].errors).toEqual([]);
    expect(validRows[0].values).toMatchObject({ gender: "Homme", assignment: "HUEH" });

    const excludedRows = editedRows.map((row) =>
      row.sourceRowNumber === 3 ? { ...row, excluded: true } : row
    );
    const validatedRows = validateImportEditableRows(excludedRows);

    expect(validatedRows[1]).toMatchObject({ excluded: true, values: null, errors: [] });
  });

  it("caps the practical import size at 250 rows for the editor", () => {
    const lines = ["NIF\tNom\tPrénom\tSexe\tAdresse\tSalaire\tPoste\tAffectation"];
    for (let index = 0; index < 260; index += 1) {
      lines.push(
        `${String(1000000000 + index)}\tDOE\tJean\tHomme\tRue ${index}\t45000\tAgent\tMSPP`
      );
    }
    const table = parsePastedContractTable(lines.join("\n"));
    const rows = buildImportEditableRows(table, inferImportMapping(table.headers)).slice(0, 250);

    expect(rows).toHaveLength(250);
  });
});
