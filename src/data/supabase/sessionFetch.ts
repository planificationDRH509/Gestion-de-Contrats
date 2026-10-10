import { acknowledgeAccountSuspension, pendingAccountSuspensions, readAccountLockout } from "../../features/auth/accountLockout";
import { networkFetch } from "../../lib/networkFetch";

/** Attach the opaque application session only to this project's REST API. */
export function createSessionFetch(supabaseUrl: string): typeof fetch {
  const projectOrigin = new URL(supabaseUrl).origin;
  let suspensionFlush: Promise<void> | undefined;
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    headers.delete("x-app-session");
    if (url.origin === projectOrigin && url.pathname.startsWith("/rest/v1/")) {
      // Flush durable lockouts before any login, read or queued data write.
      suspensionFlush ??= (async () => {
        for (const pending of pendingAccountSuspensions()) {
          if (!pending.token) throw new Error("Suspension en attente de connexion.");
          const response = await networkFetch(`${projectOrigin}/rest/v1/rpc/report_offline_suspension`, {
            method: "POST", headers: new Headers({
              apikey: headers.get("apikey") ?? "",
              Authorization: headers.get("Authorization") ?? "",
              "Content-Type": "application/json"
            }), body: JSON.stringify({ p_session_token: pending.token })
          });
          if (!response.ok || await response.json() !== true) throw new Error("Suspension non synchronisée.");
          acknowledgeAccountSuspension(pending.userId, pending.token);
        }
      })().finally(() => { suspensionFlush = undefined; });
      await suspensionFlush;
      try {
        const session = JSON.parse(localStorage.getItem("contribution_auth") ?? "null");
        if (typeof session?.taskSessionToken === "string" && !readAccountLockout(session.id).suspended) {
          headers.set("x-app-session", session.taskSessionToken);
        }
      } catch {
        // Missing or invalid storage must leave the request unauthenticated.
      }
    }
    return networkFetch(input, { ...init, headers });
  };
}
