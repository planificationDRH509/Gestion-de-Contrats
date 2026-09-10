import { describe, expect, it } from "vitest";
import { buildApplicantInsertPayload } from "./applicantPayload";

const baseInput = {
  workspaceId: "workspace-1",
  gender: "Femme" as const,
  firstName: "Marie",
  lastName: "Jean",
  nif: "123-456-789-0",
  ninu: null,
  address: "Delmas"
};

describe("buildApplicantInsertPayload", () => {
  it("omits telephone when the caller did not provide it", () => {
    const payload = buildApplicantInsertPayload(baseInput, "Marie", "JEAN");

    expect(payload).not.toHaveProperty("telephone");
  });

  it("normalizes a provided telephone value", () => {
    expect(
      buildApplicantInsertPayload(
        { ...baseInput, phone: "  +509 37 12 3456  " },
        "Marie",
        "JEAN"
      )
    ).toHaveProperty("telephone", "+509 37 12 3456");

    expect(
      buildApplicantInsertPayload(
        { ...baseInput, phone: "   " },
        "Marie",
        "JEAN"
      )
    ).toHaveProperty("telephone", null);
  });
});
