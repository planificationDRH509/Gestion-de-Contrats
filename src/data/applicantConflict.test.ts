import { describe, expect, it } from "vitest";
import { applicantDatabaseConflictMessage } from "./applicantConflict";

describe("database identity errors", () => {
  it.each(["nif", "ninu"])("identifies %s in composite unique keys", (field) => {
    expect(applicantDatabaseConflictMessage({ code: "23505", details: `Key (workspace_id, ${field})=(workspace, 1234567890) already exists.` })).toContain(`Le ${field.toUpperCase()} 1234567890 existe déjà`);
  });
  it("identifies the field from the constraint when details are missing", () => {
    expect(applicantDatabaseConflictMessage({ code: "23505", message: 'duplicate key value violates unique constraint "identification_ninu_key"' })).toContain("Le NINU existe déjà");
  });
  it("does not invent a field when the server omits it", () => {
    expect(applicantDatabaseConflictMessage({ code: "23505" })).toContain("ne précise pas le champ");
    expect(applicantDatabaseConflictMessage({ message: "offline" })).toBeNull();
  });
});
