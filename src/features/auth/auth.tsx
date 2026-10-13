import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getDefaultWorkspace, listLocalWorkspaces } from "../../data/local/workspaces";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import {
  hasPermission,
  normalizeAppRole,
  type AppPermission,
  type AppRole
} from "./permissions";
import { clearPrivateTaskOfflineData, preparePrivateTaskSession } from "../tasks/privateTaskOffline";
import {
  clearOfflineUnlockCredential,
  isNetworkAuthenticationError,
  saveOfflineUnlockCredential,
  verifyOfflineUnlockCredential
} from "./offlineUnlock";

import { authenticatePassword } from "./passwordAuthentication";
import { ACCOUNT_SUSPENDED_MESSAGE, LOCKOUT_CHANGED_EVENT, readAccountLockout,
  pendingAccountSuspensions, recordPasswordFailure, recordOfflineSuccess, recordOnlineSuccess, recordServerSuspension } from "./accountLockout";

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
  logout: () => Promise<void>;
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
    const session = loadStoredAuthSession();
    return Boolean(
      session && (readAccountLockout(session.id).suspended || !session.taskSessionToken ||
        (lastActivityAt && hasSessionInactivityExpired(lastActivityAt)))
    );
  });
  const queryClient = useQueryClient();
  const unlocking = useRef(false);

  useEffect(() => {
    const enforceLock = () => {
      if (user?.id && readAccountLockout(user.id).suspended) setIsLocked(true);
    };
    enforceLock();
    window.addEventListener(LOCKOUT_CHANGED_EVENT, enforceLock);
    window.addEventListener("storage", enforceLock);
    return () => {
      window.removeEventListener(LOCKOUT_CHANGED_EVENT, enforceLock);
      window.removeEventListener("storage", enforceLock);
    };
  }, [user?.id]);

  useEffect(() => {
    const reportPending = () => {
      if (!navigator.onLine) return;
      const pending = pendingAccountSuspensions()[0];
      if (pending?.token) {
        // The transport flushes every pending report before this idempotent RPC.
        void Promise.resolve(getSupabaseClient().rpc("report_offline_suspension", {
          p_session_token: pending.token
        })).catch(() => undefined);
      }
    };
    reportPending();
    const timer = window.setInterval(reportPending, 30_000);
    window.addEventListener("online", reportPending);
    window.addEventListener(LOCKOUT_CHANGED_EVENT, reportPending);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", reportPending);
      window.removeEventListener(LOCKOUT_CHANGED_EVENT, reportPending);
    };
  }, []);

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
        .select("role, is_suspended")
        .eq("id", user.id)
        .maybeSingle();
      if (!active || error) return;
      if (!data || data.is_suspended) {
        clearOfflineUnlockCredential(user.id);
        saveSession(null);
        saveLastActivityAt(null);
        setUser(null);
        queryClient.clear();
        setIsLocked(false);
        return;
      }
      const role = normalizeAppRole(data.role, user.username);
      if (role === user.role) return;
      setUser((current) => {
        if (!current || current.id !== user.id) return current;
        const next = { ...current, role };
        saveSession(next);
        return next;
      });
    };
    const checkAccount = () => { void refreshRole().catch(() => undefined); };
    checkAccount();
    const timer = window.setInterval(checkAccount, 30_000);
    window.addEventListener("focus", checkAccount);
    window.addEventListener("online", checkAccount);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkAccount);
      window.removeEventListener("online", checkAccount);
    };
  }, [queryClient, user?.id, user?.role, user?.username]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLocked,
      login: async (username: string, password: string) => {
        if (!navigator.onLine) throw new Error("Une connexion Internet est requise.");
        const supabase = getSupabaseClient();
        const result = await supabase.rpc("login_app_user", {
          p_username: username,
          p_password: password
        });
        const data = result.data as {
          id: string; username: string; full_name: string; role: string;
          workspaces: string[]; taskSessionToken: string; error?: string;
        } | null;

        if (data?.error === "APP_ACCOUNT_SUSPENDED") throw new Error(ACCOUNT_SUSPENDED_MESSAGE);
        if (result.error || !data || typeof data.taskSessionToken !== "string") {
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
          role: normalizeAppRole((data as { role?: unknown }).role, data.username),
          taskSessionToken: data.taskSessionToken
        };
        if (!recordOnlineSuccess(sessionUser.id, data.taskSessionToken)) throw new Error(ACCOUNT_SUSPENDED_MESSAGE);
        const previous = loadStoredAuthSession();
        if (previous?.id === sessionUser.id && previous.taskSessionToken) await preparePrivateTaskSession(previous.id, previous.taskSessionToken);
        setUser(sessionUser);
        saveSession(sessionUser);
        await saveOfflineUnlockCredential(sessionUser.id, password);
        saveLastActivityAt(Date.now());
        setIsLocked(false);
        return true;
      },
      unlock: async (password: string) => {
        if (unlocking.current) return { success: false, error: "Vérification en cours." };
        unlocking.current = true;
        try {
          if (!user?.id) {
            return {
              success: false,
              error: "Votre session a expiré. Veuillez vous reconnecter."
            };
          }

          if (readAccountLockout(user.id).suspended) return { success: false, error: ACCOUNT_SUSPENDED_MESSAGE };
          // An inactivity lock protects an existing session. Verify its local
          // credential first, without waiting for Internet or rotating the token.
          const localMatches = user.taskSessionToken
            ? await verifyOfflineUnlockCredential(user.id, password)
            : null;

          const unlockLocally = async () => {
            if (readAccountLockout(user.id).suspended) return { success: false, error: ACCOUNT_SUSPENDED_MESSAGE };
            if (!user.taskSessionToken) return { success: false, error: "Une connexion Internet est requise." };
            if (localMatches === null) {
              return {
                success: false as const,
                error: "Une connexion Internet est requise pour activer le déverrouillage hors ligne."
              };
            }
            if (!localMatches) {
              const state = recordPasswordFailure(user.id, user.taskSessionToken);
              return { success: false as const, error: state.suspended ? ACCOUNT_SUSPENDED_MESSAGE : "Mot de passe incorrect." };
            }
            if (!recordOfflineSuccess(user.id)) return { success: false, error: ACCOUNT_SUSPENDED_MESSAGE };
            saveLastActivityAt(Date.now());
            setIsLocked(false);
            return { success: true as const };
          };

          if (localMatches !== null || (typeof navigator !== "undefined" && !navigator.onLine)) {
            return await unlockLocally();
          }

          let taskSessionToken: string | undefined;
          try {
            const taskSession = await authenticatePassword(user.id, password);
            if (!taskSession.error && typeof taskSession.data === "string") {
              taskSessionToken = taskSession.data;
            } else if (isNetworkAuthenticationError(taskSession.error)) {
              return await unlockLocally();
            } else if (/APP_ACCOUNT_SUSPENDED/i.test(taskSession.error?.message ?? "")) {
              recordServerSuspension(user.id);
              return { success: false, error: ACCOUNT_SUSPENDED_MESSAGE };
            } else if (/TASK_SESSION_INVALID_CREDENTIALS/i.test(taskSession.error?.message ?? "")) {
              const state = recordPasswordFailure(user.id, user.taskSessionToken, taskSession.failedAttempts);
              return { success: false, error: state.suspended ? ACCOUNT_SUSPENDED_MESSAGE : "Mot de passe incorrect." };
            }
          } catch (error) {
            if (isNetworkAuthenticationError(error)) return await unlockLocally();
          }

          // Online authentication must fail closed if the server cannot verify it.
          if (!taskSessionToken) {
            return { success: false, error: "Impossible de vérifier le mot de passe." };
          }

          if (!recordOnlineSuccess(user.id, taskSessionToken)) return { success: false, error: ACCOUNT_SUSPENDED_MESSAGE };
          if (taskSessionToken && user.taskSessionToken) {
            try {
              await preparePrivateTaskSession(user.id, user.taskSessionToken);
            } catch (error) {
              console.warn("Private task cache could not be prepared:", error);
              return { success: false, error: "Impossible de déverrouiller les données locales." };
            }
          }
          const nextUser = taskSessionToken
            ? { ...user, taskSessionToken }
            : user;
          setUser(nextUser);
          saveSession(nextUser);
          await saveOfflineUnlockCredential(user.id, password);
          saveLastActivityAt(Date.now());
          setIsLocked(false);
          return { success: true };
        } finally { unlocking.current = false; }
      },
      changePassword: async (currentPassword: string, newPassword: string) => {
        if (!user?.id) {
          return {
            success: false,
            error: "Votre session a expiré. Veuillez vous reconnecter."
          };
        }

        const supabase = getSupabaseClient();
        const verificationSession = await authenticatePassword(user.id, currentPassword);
        if (
          verificationSession.error ||
          typeof verificationSession.data !== "string"
        ) {
          const message = verificationSession.error?.message ?? "";
          if (/APP_ACCOUNT_SUSPENDED/.test(message)) {
            recordServerSuspension(user.id);
            return { success: false, error: ACCOUNT_SUSPENDED_MESSAGE };
          }
          if (/TASK_SESSION_INVALID_CREDENTIALS/i.test(message)) {
            return { success: false, error: "Le mot de passe actuel est incorrect." };
          }
          return {
            success: false,
            error: message || "Impossible de vérifier le mot de passe actuel."
          };
        }

        if (user.taskSessionToken) await preparePrivateTaskSession(user.id, user.taskSessionToken);
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

        const taskSession = await authenticatePassword(user.id, newPassword);
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

        const taskSession = await authenticatePassword(user.id, password);

        if (taskSession.error || typeof taskSession.data !== "string") {
          const message = taskSession.error?.message ?? "";
          if (/APP_ACCOUNT_SUSPENDED/.test(message)) {
            recordServerSuspension(user.id);
            return { success: false, error: ACCOUNT_SUSPENDED_MESSAGE };
          }
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

        if (user.taskSessionToken) await preparePrivateTaskSession(user.id, user.taskSessionToken);
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
      logout: async () => {
        if (user?.taskSessionToken) {
          try {
            await clearPrivateTaskOfflineData(user.id, user.taskSessionToken);
          } catch (error) {
            // An unreadable task cache must not prevent switching accounts.
            console.warn("Private task cache could not be cleared:", error);
          }
        }
        if (user?.taskSessionToken) {
          void getSupabaseClient().rpc("revoke_task_session", {
            p_session_token: user.taskSessionToken
          });
        }
        queryClient.removeQueries({ queryKey: ["private_tasks"] });
        queryClient.removeQueries({ queryKey: ["task_recipients"] });
        if (user?.id) {
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
