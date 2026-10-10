import { networkFetch } from "../../lib/networkFetch";

/** Attach the opaque application session only to this project's REST API. */
export function createSessionFetch(supabaseUrl: string): typeof fetch {
  const projectOrigin = new URL(supabaseUrl).origin;
  return (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    headers.delete("x-app-session");
    if (url.origin === projectOrigin && url.pathname.startsWith("/rest/v1/")) {
      try {
        const session = JSON.parse(localStorage.getItem("contribution_auth") ?? "null");
        if (typeof session?.taskSessionToken === "string") {
          headers.set("x-app-session", session.taskSessionToken);
        }
      } catch {
        // Missing or invalid storage must leave the request unauthenticated.
      }
    }
    return networkFetch(input, { ...init, headers });
  };
}
