import React, { createContext, useContext, useMemo, useState } from "react";
import { getDefaultWorkspace, listLocalWorkspaces } from "../../data/local/workspaces";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import {
  hasPermission,
  normalizeAppRole,
  type AppPermission,
  type AppRole
} from "./permissions";

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  // Kept as an internal data partition key for backward compatibility.
  workspaceId: string;
  role: AppRole;
};

type AuthContextValue = {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  can: (permission: AppPermission) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_KEY = "contribution_auth";

function loadSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.id !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.workspaceId !== "string"
    ) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return {
      id: parsed.id,
      username: parsed.username,
      name: parsed.name,
      workspaceId: parsed.workspaceId,
      role: normalizeAppRole(parsed.role, parsed.username)
    };
  } catch {
    localStorage.removeItem(AUTH_KEY);
    return null;
  }
}

function saveSession(user: AuthUser | null) {
  try {
    if (!user) {
      localStorage.removeItem(AUTH_KEY);
      return;
    }
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  } catch {
    // Ignore storage write errors (private mode/quota).
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadSession());

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: async (username: string, password: string) => {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from("app_users")
          .select("*")
          .eq("username", username)
          .eq("password", password)
          .single();

        if (error || !data) {
          console.error("Login error:", error);
          return false;
        }

        // Existing accounts keep their historical data partition, while the
        // workspace concept is no longer exposed in the product.
        const legacyWorkspaceIds = data.workspaces || [];
        const dataPartition =
          listLocalWorkspaces().find((item) => legacyWorkspaceIds.includes(item.id)) ||
          getDefaultWorkspace();

        const sessionUser: AuthUser = {
          id: data.id,
          username: data.username,
          name: data.full_name,
          workspaceId: dataPartition.id,
          role: normalizeAppRole((data as { role?: unknown }).role, data.username)
        };
        setUser(sessionUser);
        saveSession(sessionUser);
        return true;
      },
      logout: () => {
        setUser(null);
        saveSession(null);
      },
      can: (permission: AppPermission) =>
        Boolean(user && hasPermission(user.role, permission))
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé dans AuthProvider");
  }
  return ctx;
}
