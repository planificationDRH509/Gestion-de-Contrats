import { describe, expect, it } from "vitest";
import type { Dossier } from "../data/types";
import { getUserDossierGroups } from "./dossier";

const now = new Date("2026-09-29T12:00:00Z");
const dossier = (id: string, createdBy?: string | null, overrides: Partial<Dossier> = {}): Dossier => ({
  id, name: id, workspaceId: "workspace", createdBy, status: "active",
  isEphemeral: false, priority: "normal", contractTargetCount: 0,
  createdAt: now.toISOString(), updatedAt: now.toISOString(), ...overrides
});

describe("personal dossier groups", () => {
  it("shows only the current user's active dossiers directly and preserves every dossier once", () => {
    const items = [
      dossier("mine", "me"), dossier("shared", "other"), dossier("legacy", null),
      dossier("archived-mine", "me", { updatedAt: "2026-01-01" }),
      dossier("archived-other", "other", { updatedAt: "2026-01-01" }),
      dossier("classified", "me", { status: "classified", updatedAt: "2026-01-01" })
    ];
    const groups = getUserDossierGroups(items, "me", {}, now);
    expect(groups.active.map(item => item.id)).toEqual(["mine"]);
    expect(groups.others.map(item => item.id)).toEqual(["shared", "legacy"]);
    expect(groups.archived.map(item => item.id)).toEqual(["archived-mine", "archived-other"]);
    expect(groups.classified.map(item => item.id)).toEqual(["classified"]);
    expect(Object.values(groups).flat()).toHaveLength(items.length);
    expect(getUserDossierGroups(items, "other", {}, now).active.map(item => item.id)).toEqual(["shared"]);
  });

  it("does not treat dossiers with an unknown creator as personal without a session", () => {
    const items = [dossier("unknown"), dossier("mine", "me")];
    const groups = getUserDossierGroups(items, undefined, {}, now);
    expect(groups.active).toEqual([]);
    expect(groups.others).toEqual(items);
  });
});

it("highlights legacy dossiers only for authors of their contracts", () => {
  const items = [dossier("legacy-mine", null), dossier("legacy-other"), dossier("empty"),
    dossier("known-other", "other"), dossier("known-mine", "me"),
    dossier("old", null, { updatedAt: "2026-01-01" }),
    dossier("classified", null, { status: "classified" })];
  const metrics = {
    "legacy-mine": { authorIds: ["other", "me"] },
    "legacy-other": { authorIds: ["other"] },
    "known-other": { authorIds: ["me"] },
    old: { authorIds: ["me"] }, classified: { authorIds: ["me"] }
  };
  const groups = getUserDossierGroups(items, "me", metrics, now);
  expect(groups.active.map(item => item.id)).toEqual(["legacy-mine", "known-mine"]);
  expect(groups.others.map(item => item.id)).toEqual(["legacy-other", "empty", "known-other"]);
  expect(groups.archived.map(item => item.id)).toEqual(["old"]);
  expect(groups.classified.map(item => item.id)).toEqual(["classified"]);
  expect(getUserDossierGroups(items, "other", metrics, now).active.map(item => item.id))
    .toEqual(["legacy-mine", "legacy-other", "known-other"]);
});
