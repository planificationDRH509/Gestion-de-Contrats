import { describe, expect, it } from "vitest";
import {
  filterTaskRecipients,
  findActiveContractTag,
  findActiveMention,
  insertContractTag,
  insertRecipientMention
} from "./taskMentions";

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
  });
});
