import React, { createContext, useContext, useMemo, useState } from "react";
import { listLocalWorkspaces, getDefaultWorkspace } from "../../data/local/workspaces";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  allowedWorkspaces: string[]; // Added this
};

type AuthContextValue = {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  switchWorkspace: (workspaceId: string, workspaceName: string) => void;
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
      typeof parsed.workspaceId !== "string" ||
      typeof parsed.workspaceName !== "string" ||
      !Array.isArray(parsed.allowedWorkspaces)
    ) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return parsed as AuthUser;
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

        const allowedWorkspaces = data.workspaces || [];
        // Default to first allowed workspace or the global default
        const defaultWp = listLocalWorkspaces().find(w => allowedWorkspaces.includes(w.id)) || getDefaultWorkspace();

        const sessionUser: AuthUser = {
          id: data.id,
          username: data.username,
          name: data.full_name,
          workspaceId: defaultWp.id,
          workspaceName: defaultWp.name,
          allowedWorkspaces: allowedWorkspaces
        };
        setUser(sessionUser);
        saveSession(sessionUser);
        return true;
      },
      logout: () => {
        setUser(null);
        saveSession(null);
      },
      switchWorkspace: (workspaceId: string, workspaceName: string) => {
        if (!user) return;
        // Check if user is allowed to access this workspace
        if (!user.allowedWorkspaces.includes(workspaceId)) {
          console.warn(`Tentative d'accès non autorisée à l'espace: ${workspaceName}`);
          return;
        }
        const updatedUser = { ...user, workspaceId, workspaceName };
        setUser(updatedUser);
        saveSession(updatedUser);
      }
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
