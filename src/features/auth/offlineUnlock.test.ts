import { afterEach, describe, expect, it } from "vitest";
import {
  clearOfflineUnlockCredential,
  isNetworkAuthenticationError,
  saveOfflineUnlockCredential,
  verifyOfflineUnlockCredential
} from "./offlineUnlock";

describe("offline session unlock", () => {
  const userId = "offline-user";

  afterEach(() => clearOfflineUnlockCredential(userId));

  it("verifies locally the password authenticated by the server", async () => {
    await saveOfflineUnlockCredential(userId, "mot-de-passe-solide");

    await expect(
      verifyOfflineUnlockCredential(userId, "mot-de-passe-solide")
    ).resolves.toBe(true);
    await expect(
      verifyOfflineUnlockCredential(userId, "mauvais-mot-de-passe")
    ).resolves.toBe(false);
  });

  it("does not store the password in clear text", async () => {
    const password = "secret-qui-ne-doit-pas-etre-stocke";
    await saveOfflineUnlockCredential(userId, password);

    const stored = Object.values(localStorage).join(" ");
    expect(stored).not.toContain(password);
  });

  it("reports when no local verifier is available", async () => {
    await expect(
      verifyOfflineUnlockCredential(userId, "mot-de-passe")
    ).resolves.toBeNull();
  });

  it("recognizes network failures without treating credential errors as offline", () => {
    expect(isNetworkAuthenticationError({ message: "Failed to fetch" })).toBe(true);
    expect(
      isNetworkAuthenticationError({ message: "TASK_SESSION_INVALID_CREDENTIALS" })
    ).toBe(false);
  });
});
