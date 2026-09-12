import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getDefaultWorkspace, listLocalWorkspaces } from "../../data/local/workspaces";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import {
  hasPermission,
  normalizeAppRole,
  type AppPermission,
  type AppRole
} from "./permissions";
import { clearPrivateTaskOfflineData } from "../tasks/privateTaskOffline";
import {
  clearOfflineUnlockCredential,
  isNetworkAuthenticationError,
  saveOfflineUnlockCredential,
  verifyOfflineUnlockCredential
} from "./offlineUnlock";

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  // Kept as an internal data partition key for backward compatibility.
  workspaceId: string;
  role: AppRole;
  taskSessionToken?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLocked: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  unlock: (password: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
  activateTaskSession: (
    password: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  can: (permission: AppPermission) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_KEY = "contribution_auth";
const LAST_ACTIVITY_KEY = "contribution_last_activity";
export const SESSION_INACTIVITY_MS = 15 * 60 * 1000;

export function hasSessionInactivityExpired(
  lastActivityAt: number,
  now = Date.now()
): boolean {
  return now - lastActivityAt >= SESSION_INACTIVITY_MS;
}

function loadLastActivityAt(): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveLastActivityAt(value: number | null) {
  try {
    if (value === null) {
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    } else {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(value));
    }
  } catch {
    // Ignore storage write errors (private mode/quota).
  }
}

export function loadStoredAuthSession(): AuthUser | null {
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
      role: normalizeAppRole(parsed.role, parsed.username),
      taskSessionToken:
        typeof parsed.taskSessionToken === "string"
          ? parsed.taskSessionToken
          : undefined
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
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredAuthSession());
  const [isLocked, setIsLocked] = useState(() => {
    const lastActivityAt = loadLastActivityAt();
    return Boolean(
      loadStoredAuthSession() &&
        lastActivityAt &&
        hasSessionInactivityExpired(lastActivityAt)
    );
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id || isLocked) return;

    let lastActivityAt = loadLastActivityAt() ?? Date.now();
    let inactivityTimer = 0;

    const scheduleLock = () => {
      window.clearTimeout(inactivityTimer);
      const remaining = SESSION_INACTIVITY_MS - (Date.now() - lastActivityAt);
      if (remaining <= 0) {
        setIsLocked(true);
        return;
      }
      inactivityTimer = window.setTimeout(() => setIsLocked(true), remaining);
    };

    const recordActivity = () => {
      lastActivityAt = Date.now();
      saveLastActivityAt(lastActivityAt);
      scheduleLock();
    };

    const checkAfterVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      lastActivityAt = loadLastActivityAt() ?? lastActivityAt;
      scheduleLock();
    };

    saveLastActivityAt(lastActivityAt);
    scheduleLock();
    window.addEventListener("pointerdown", recordActivity);
    window.addEventListener("keydown", recordActivity);
    window.addEventListener("touchstart", recordActivity, { passive: true });
    document.addEventListener("visibilitychange", checkAfterVisibilityChange);

    return () => {
      window.clearTimeout(inactivityTimer);
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("touchstart", recordActivity);
      document.removeEventListener("visibilitychange", checkAfterVisibilityChange);
    };
  }, [isLocked, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const refreshRole = async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("app_users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (!active || error || !data) return;
      const role = normalizeAppRole(data.role, user.username);
      if (role === user.role) return;
      setUser((current) => {
        if (!current || current.id !== user.id) return current;
        const next = { ...current, role };
        saveSession(next);
        return next;
      });
    };
    void refreshRole();
    return () => {
      active = false;
    };
  }, [user?.id, user?.role, user?.username]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLocked,
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

        let taskSessionToken: string | undefined;
        const taskSession = await supabase.rpc("create_task_session", {
          p_user_id: data.id,
          p_password: password
        });
        if (!taskSession.error && typeof taskSession.data === "string") {
          taskSessionToken = taskSession.data;
        } else if (taskSession.error) {
          // Keep the main application available when the task migration has
          // not been applied yet. The task page explains how to reconnect.
          console.warn("Private task session unavailable:", taskSession.error.message);
        }

        const sessionUser: AuthUser = {
          id: data.id,
          username: data.username,
          name: data.full_name,
          workspaceId: dataPartition.id,
          role: normalizeAppRole((data as { role?: unknown }).role, data.username),
          taskSessionToken
        };
        setUser(sessionUser);
        saveSession(sessionUser);
        await saveOfflineUnlockCredential(sessionUser.id, password);
        saveLastActivityAt(Date.now());
        setIsLocked(false);
        return true;
      },
      unlock: async (password: string) => {
        if (!user?.id) {
          return {
            success: false,
            error: "Votre session a expiré. Veuillez vous reconnecter."
          };
        }

        const unlockLocally = async () => {
          const matches = await verifyOfflineUnlockCredential(user.id, password);
          if (matches === null) {
            return {
              success: false as const,
              error: "Une connexion Internet est requise pour activer le déverrouillage hors ligne."
            };
          }
          if (!matches) {
            return { success: false as const, error: "Mot de passe incorrect." };
          }
          saveLastActivityAt(Date.now());
          setIsLocked(false);
          return { success: true as const };
        };

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          return unlockLocally();
        }

        let taskSession;
        try {
          taskSession = await getSupabaseClient().rpc("create_task_session", {
            p_user_id: user.id,
            p_password: password
          });
        } catch (error) {
          if (isNetworkAuthenticationError(error)) return unlockLocally();
          return { success: false, error: "Impossible de déverrouiller la session." };
        }
        if (taskSession.error || typeof taskSession.data !== "string") {
          const message = taskSession.error?.message ?? "";
          if (isNetworkAuthenticationError(taskSession.error)) {
            return unlockLocally();
          }
          return {
            success: false,
            error: /TASK_SESSION_INVALID_CREDENTIALS/i.test(message)
              ? "Mot de passe incorrect."
              : message || "Impossible de déverrouiller la session."
          };
        }

        const nextUser = { ...user, taskSessionToken: taskSession.data };
        setUser(nextUser);
        saveSession(nextUser);
        await saveOfflineUnlockCredential(user.id, password);
        saveLastActivityAt(Date.now());
        setIsLocked(false);
        return { success: true };
      },
      changePassword: async (currentPassword: string, newPassword: string) => {
        if (!user?.id) {
          return {
            success: false,
            error: "Votre session a expiré. Veuillez vous reconnecter."
          };
        }

        const supabase = getSupabaseClient();
        const verificationSession = await supabase.rpc("create_task_session", {
          p_user_id: user.id,
          p_password: currentPassword
        });
        if (
          verificationSession.error ||
          typeof verificationSession.data !== "string"
        ) {
          const message = verificationSession.error?.message ?? "";
          if (/TASK_SESSION_INVALID_CREDENTIALS/i.test(message)) {
            return { success: false, error: "Le mot de passe actuel est incorrect." };
          }
          return {
            success: false,
            error: message || "Impossible de vérifier le mot de passe actuel."
          };
        }

        const result = await supabase.rpc("change_app_user_password", {
          p_session_token: verificationSession.data,
          p_current_password: currentPassword,
          p_new_password: newPassword
        });

        if (result.error || result.data !== true) {
          await supabase.rpc("revoke_task_session", {
            p_session_token: verificationSession.data
          });
          const message = result.error?.message ?? "";
          if (/APP_PASSWORD_CURRENT_INVALID/i.test(message)) {
            return { success: false, error: "Le mot de passe actuel est incorrect." };
          }
          if (/APP_PASSWORD_TOO_SHORT/i.test(message)) {
            return {
              success: false,
              error: "Le nouveau mot de passe doit contenir au moins 8 caractères."
            };
          }
          if (/APP_PASSWORD_UNCHANGED/i.test(message)) {
            return {
              success: false,
              error: "Le nouveau mot de passe doit être différent du mot de passe actuel."
            };
          }
          if (/Could not find the function|PGRST202|change_app_user_password/i.test(message)) {
            return {
              success: false,
              error: "La modification du mot de passe n’est pas encore activée sur le serveur."
            };
          }
          return {
            success: false,
            error: message || "Impossible de modifier le mot de passe."
          };
        }

        const taskSession = await supabase.rpc("create_task_session", {
          p_user_id: user.id,
          p_password: newPassword
        });
        const nextUser = {
          ...user,
          taskSessionToken:
            !taskSession.error && typeof taskSession.data === "string"
              ? taskSession.data
              : undefined
        };
        setUser(nextUser);
        saveSession(nextUser);
        await saveOfflineUnlockCredential(user.id, newPassword);
        await queryClient.invalidateQueries({ queryKey: ["private_tasks", user.id] });
        await queryClient.invalidateQueries({ queryKey: ["task_recipients", user.id] });
        return { success: true };
      },
      activateTaskSession: async (password: string) => {
        if (!user?.id) {
          return {
            success: false,
            error: "Votre session principale a expiré. Veuillez vous reconnecter."
          };
        }

        const taskSession = await getSupabaseClient().rpc(
          "create_task_session",
          {
            p_user_id: user.id,
            p_password: password
          }
        );

        if (taskSession.error || typeof taskSession.data !== "string") {
          const message = taskSession.error?.message ?? "";
          if (/TASK_SESSION_INVALID_CREDENTIALS/i.test(message)) {
            return {
              success: false,
              error: "Mot de passe incorrect."
            };
          }
          if (/Could not find the function|PGRST202|create_task_session/i.test(message)) {
            return {
              success: false,
              error: "La liste privée n’est pas encore activée sur le serveur."
            };
          }
          return {
            success: false,
            error: message || "Impossible d’activer la liste privée."
          };
        }

        const nextUser = {
          ...user,
          taskSessionToken: taskSession.data
        };
        setUser(nextUser);
        saveSession(nextUser);
        await queryClient.invalidateQueries({ queryKey: ["private_tasks", user.id] });
        await queryClient.invalidateQueries({ queryKey: ["task_recipients", user.id] });
        return { success: true };
      },
      logout: () => {
        if (user?.taskSessionToken) {
          void getSupabaseClient().rpc("revoke_task_session", {
            p_session_token: user.taskSessionToken
          });
        }
        queryClient.removeQueries({ queryKey: ["private_tasks"] });
        queryClient.removeQueries({ queryKey: ["task_recipients"] });
        if (user?.id) {
          void clearPrivateTaskOfflineData(user.id);
          clearOfflineUnlockCredential(user.id);
        }
        setUser(null);
        saveSession(null);
        saveLastActivityAt(null);
        setIsLocked(false);
      },
      can: (permission: AppPermission) =>
        Boolean(user && hasPermission(user.role, permission))
    }),
    [isLocked, queryClient, user]
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
