import React, { createContext, useContext, useMemo, useState } from "react";
import { getDefaultWorkspace } from "../../data/local/workspaces";

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
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
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as AuthUser;
}

function saveSession(user: AuthUser | null) {
  if (!user) {
    localStorage.removeItem(AUTH_KEY);
    return;
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadSession());

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: async (username: string, password: string) => {
        if (username !== "admin" || password !== "admin") {
          return false;
        }
        const workspace = getDefaultWorkspace();
        const sessionUser: AuthUser = {
          id: "local-admin",
          username: "admin",
          name: "Administrateur",
          workspaceId: workspace.id,
          workspaceName: workspace.name
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
