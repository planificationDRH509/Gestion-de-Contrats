import { afterEach, describe, expect, it } from "vitest";
import {
  SESSION_INACTIVITY_MS,
  hasSessionInactivityExpired,
  loadStoredAuthSession
} from "./auth";

describe("stored authentication session", () => {
  afterEach(() => {
    localStorage.removeItem("contribution_auth");
  });

  it("restores the private task token after a page reload", () => {
    localStorage.setItem(
      "contribution_auth",
      JSON.stringify({
        id: "user-1",
        username: "admin",
        name: "Administrateur",
        workspaceId: "workspace-1",
        role: "admin",
        taskSessionToken: "private-task-session-token"
      })
    );

    expect(loadStoredAuthSession()).toMatchObject({
      id: "user-1",
      taskSessionToken: "private-task-session-token"
    });
  });

  it("expires a session after fifteen minutes without activity", () => {
    const lastActivityAt = 1_000;

    expect(
      hasSessionInactivityExpired(
        lastActivityAt,
        lastActivityAt + SESSION_INACTIVITY_MS - 1
      )
    ).toBe(false);
    expect(
      hasSessionInactivityExpired(
        lastActivityAt,
        lastActivityAt + SESSION_INACTIVITY_MS
      )
    ).toBe(true);
  });
});
