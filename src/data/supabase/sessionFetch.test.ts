import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionFetch } from "./sessionFetch";

const fetchMock = vi.hoisted(() => vi.fn().mockResolvedValue(new Response("[]")));
vi.mock("../../lib/networkFetch", () => ({ networkFetch: fetchMock }));

afterEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe("application session transport", () => {
  const request = createSessionFetch("https://project.supabase.co");

  it("reads the latest token for each REST request and preserves Supabase headers", async () => {
    localStorage.setItem("contribution_auth", JSON.stringify({ taskSessionToken: "first-token" }));
    await request("https://project.supabase.co/rest/v1/contrat", { headers: { apikey: "publishable" } });
    let headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("x-app-session")).toBe("first-token");
    expect(headers.get("apikey")).toBe("publishable");
    localStorage.setItem("contribution_auth", JSON.stringify({ taskSessionToken: "renewed-token" }));
    await request("https://project.supabase.co/rest/v1/contrat");
    headers = fetchMock.mock.calls[1][1].headers;
    expect(headers.get("x-app-session")).toBe("renewed-token");
    localStorage.removeItem("contribution_auth");
    await request("https://project.supabase.co/rest/v1/contrat");
    expect(fetchMock.mock.calls[2][1].headers.has("x-app-session")).toBe(false);
  });

  it("does not send the token to other origins or non-REST endpoints", async () => {
    localStorage.setItem("contribution_auth", JSON.stringify({ taskSessionToken: "secret-token" }));
    for (const url of ["https://other.example/rest/v1/contrat", "https://project.supabase.co/auth/v1/token"]) {
      await request(url, { headers: { "x-app-session": "stale" } });
      expect(fetchMock.mock.lastCall?.[1].headers.has("x-app-session")).toBe(false);
    }
  });

  it("does not trust a locally forged role or user ID as authentication", async () => {
    localStorage.setItem("contribution_auth", JSON.stringify({ id: "admin", role: "admin" }));
    await request("https://project.supabase.co/rest/v1/app_users");
    expect(fetchMock.mock.lastCall?.[1].headers.has("x-app-session")).toBe(false);
    localStorage.setItem("contribution_auth", "invalid-json");
    await request("https://project.supabase.co/rest/v1/app_users");
    expect(fetchMock.mock.lastCall?.[1].headers.has("x-app-session")).toBe(false);
  });
});
