import { describe, expect, it } from "vitest";
import {
  appendContractAuditEntry,
  buildContractAuditChanges,
  parseContractAudit
} from "./contractAudit";

describe("contract audit history", () => {
  it("migrates the legacy historique_saisie shape", () => {
    const history = parseContractAudit(JSON.stringify({
      createdAt: "2026-01-01T10:00:00.000Z",
      createdBy: "Marie",
      updates: [{
        updatedAt: "2026-01-02T10:00:00.000Z",
        updatedBy: "Jean",
        changes: ["status", "titre"]
      }]
    }));

    expect(history.version).toBe(2);
    expect(history.createdBy.name).toBe("Marie");
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].actor.name).toBe("Jean");
    expect(history.entries[0].changes.map((change) => change.field)).toEqual([
      "status",
      "titre"
    ]);
  });

  it("records previous and new values", () => {
    const changes = buildContractAuditChanges(
      { status: "saisie", salaryNumber: 40_000 },
      { status: "correction", salaryNumber: 45_000 }
    );
    const history = appendContractAuditEntry(undefined, {
      action: "modification",
      actor: { id: "u1", name: "Contrôleur" },
      at: "2026-01-02T10:00:00.000Z",
      changes
    });

    expect(history.entries[0].changes).toEqual([
      { field: "salaryNumber", previousValue: 40_000, newValue: 45_000 },
      { field: "status", previousValue: "saisie", newValue: "correction" }
    ]);
  });
});
