import { describe, expect, it } from "vitest";
import {
  extractContractTags,
  filterTaskRecipients,
  findActiveContractTag,
  findActiveMention,
  indexTasksByContractNif,
  insertContractTag,
  insertRecipientMention,
  normalizeContractNif
} from "./taskMentions";
import type { PersonalTask } from "../../data/types";

const recipients = [
  { id: "1", username: "jdupont", fullName: "Jean Dupont" },
  { id: "2", username: "marie", fullName: "Marie Noël" }
];

describe("task mentions", () => {
  it("detects an @ mention at the caret", () => {
    expect(findActiveMention("Préparer le dossier @je", 23)).toEqual({
      start: 20,
      end: 23,
      query: "je"
    });
  });

  it("does not treat an email address as a mention", () => {
    expect(findActiveMention("contacter test@example.com", 26)).toBeNull();
  });

  it("inserts the selected username and preserves the rest", () => {
    const mention = findActiveMention("Voir @je demain", 8);
    expect(mention).not.toBeNull();
    expect(insertRecipientMention("Voir @je demain", mention!, recipients[0])).toEqual({
      value: "Voir @jdupont  demain",
      caret: 14
    });
  });

  it("filters on either full name or username", () => {
    expect(filterTaskRecipients(recipients, "noël")).toEqual([recipients[1]]);
    expect(filterTaskRecipients(recipients, "jdu")).toEqual([recipients[0]]);
  });

  it("detects and inserts a contract tag introduced by #", () => {
    const tag = findActiveContractTag("Vérifier #123", 13);
    expect(tag).toEqual({ start: 9, end: 13, query: "123" });
    expect(insertContractTag("Vérifier #123", tag!, "123-456-789-0")).toEqual({
      value: "Vérifier #123-456-789-0 ",
      caret: 24
    });

    const emptyTag = findActiveContractTag("Voir #", 6);
    expect(insertContractTag("Voir #", emptyTag!, "123 456/789")).toEqual({
      value: "Voir #123-456-789 ",
      caret: 18
    });
  });

  it("indexes private tasks by normalized contract NIF", () => {
    const tasks = [
      {
        id: "task-1",
        content: "Vérifier #123-456-789 puis signer",
        status: "in_progress",
        completed: false,
        completedAt: null,
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z",
        createdBy: "user-1",
        createdByName: "Jean Dupont",
        createdByUsername: "jdupont"
      },
      {
        id: "task-2",
        content: "Comparer #123-456-789 et #987-654",
        status: "todo",
        completed: false,
        completedAt: null,
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z",
        createdBy: "user-1",
        createdByName: "Jean Dupont",
        createdByUsername: "jdupont"
      }
    ] satisfies PersonalTask[];

    expect(normalizeContractNif("123-456 789")).toBe("123456789");
    expect(extractContractTags(tasks[0].content)).toEqual(["123-456-789"]);

    const index = indexTasksByContractNif(tasks);
    expect(index.get("123456789")?.map((task) => task.id)).toEqual([
      "task-1",
      "task-2"
    ]);
    expect(index.get("987654")?.map((task) => task.id)).toEqual(["task-2"]);
  });
});
