import { describe, expect, it } from "vitest";
import { hasPermission, normalizeAppRole } from "./permissions";

describe("role permissions", () => {
  it("reserves user management for administrators", () => {
    expect(hasPermission("admin", "users.manage")).toBe(true);
    expect(hasPermission("agent", "users.manage")).toBe(false);
    expect(hasPermission("controller", "users.manage")).toBe(false);
    expect(hasPermission("reader", "users.manage")).toBe(false);
  });

  it("gives controllers access to audit and quality without account creation", () => {
    expect(hasPermission("controller", "audit.view")).toBe(true);
    expect(hasPermission("controller", "quality.view")).toBe(true);
    expect(hasPermission("controller", "contracts.create")).toBe(false);
  });

  it("keeps legacy sessions usable", () => {
    expect(normalizeAppRole(undefined, "admin")).toBe("admin");
    expect(normalizeAppRole(undefined, "jean")).toBe("agent");
  });
});
