import { afterEach, describe, expect, it } from "vitest";
import { acknowledgeAccountSuspension, readAccountLockout, recordOfflineSuccess,
  recordOnlineSuccess, recordPasswordFailure } from "./accountLockout";
afterEach(() => localStorage.clear());
describe("persistent password lockout", () => {
  it("resets consecutive failures on success before the eighth error", () => {
    for (let i=0;i<7;i++) recordPasswordFailure("u","token");
    expect(recordOfflineSuccess("u")).toBe(true);
    expect(recordPasswordFailure("u","token").failures).toBe(1);
  });
  it("only an online success after reporting can clear a suspension", () => {
    for (let i=0;i<8;i++) recordPasswordFailure("u","token");
    expect(recordOfflineSuccess("u")).toBe(false);
    expect(recordOnlineSuccess("u","new-token")).toBe(false);
    acknowledgeAccountSuspension("u","token");
    expect(readAccountLockout("u").suspended).toBe(true);
    expect(recordOfflineSuccess("u")).toBe(false);
    expect(recordOnlineSuccess("u","new-token")).toBe(true);
    expect(readAccountLockout("u")).toMatchObject({ failures:0, suspended:false });
  });
});
