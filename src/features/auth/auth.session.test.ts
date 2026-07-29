import { afterEach, describe, expect, it } from "vitest";
import { loadStoredAuthSession } from "./auth";

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
});
