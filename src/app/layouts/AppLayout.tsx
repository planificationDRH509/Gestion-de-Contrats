import { useState, useEffect, useCallback, useRef } from "react";
import { useMinisters } from "../../features/settings/ministersApi";
import { Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "./Sidebar";
import {
  getSupabaseSyncState,
  syncSupabaseOutbox,
  syncSupabaseWorkspace
} from "../../data/supabase/supabaseProvider";
import { useAuth } from "../../features/auth/auth";
import { GlobalContractSearch } from "../components/GlobalContractSearch";
import { SessionLockScreen } from "../../features/auth/SessionLockScreen";
import { useIsMobileViewport } from "../../lib/useIsMobileViewport";
import { flushPrivateTaskOutbox } from "../../features/tasks/privateTaskSync";

const SIDEBAR_KEY = "sidebar-collapsed";
const SIDEBAR_W_KEY = "sidebar-width";
const DEFAULT_W = 280;
const MIN_W = 200;
const MAX_W = 480;

export function AppLayout() {
  useMinisters();
  const { user, isLocked } = useAuth();
  const isMobile = useIsMobileViewport();
  const location = useLocation();
  const queryClient = useQueryClient();
  const mainRef = useRef<HTMLDivElement>(null);
  const workspaceId = user?.workspaceId ?? "";
  const isSupabase = (import.meta.env.VITE_DATA_PROVIDER ?? "local") === "supabase";
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_W_KEY);
      return saved ? parseInt(saved, 10) : DEFAULT_W;
    } catch {
      return DEFAULT_W;
    }
  });

  const [isResizing, setIsResizing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState(() => getSupabaseSyncState(workspaceId));
  const synchronizationRunning = useRef(false);
  const forcedSynchronizationPending = useRef(false);
  const synchronizationNeedsRetry = useRef(false);

  useEffect(() => {
    if (!isSupabase || !user?.taskSessionToken || isLocked) return;
    const currentUser = { id: user.id, taskSessionToken: user.taskSessionToken };
    const flush = async () => {
      if (!navigator.onLine) return;
      try {
        if (await flushPrivateTaskOutbox(currentUser)) {
          await queryClient.invalidateQueries({ queryKey: ["private_tasks", currentUser.id] });
        }
      } catch (error) { console.error("Synchronisation des tâches impossible.", error); }
    };
    let queuedTimer: number | undefined;
    const queued = () => {
      window.clearTimeout(queuedTimer);
      queuedTimer = window.setTimeout(() => void flush(), 300);
    };
    const timer = window.setInterval(() => void flush(), 30_000);
    window.addEventListener("contribution-private-task-queued", queued);
    window.addEventListener("online", flush);
    void flush();
    return () => {
      window.clearInterval(timer); window.clearTimeout(queuedTimer);
      window.removeEventListener("online", flush);
      window.removeEventListener("contribution-private-task-queued", queued);
    };
  }, [isSupabase, isLocked, user?.id, user?.taskSessionToken, queryClient]);

  const refreshSyncState = useCallback(() => {
    setIsOnline(navigator.onLine);
    setSyncState(getSupabaseSyncState(workspaceId));
  }, [workspaceId]);

  const synchronize = useCallback(async (force = false, verify = false) => {
    if (!isSupabase || !workspaceId || !navigator.onLine) {
      refreshSyncState();
      return;
    }
    if (synchronizationRunning.current) {
      if (force) forcedSynchronizationPending.current = true;
      return;
    }
    synchronizationRunning.current = true;
    try {
      // Upload first; a failure downloading the full snapshot must not hide ACKs.
      const hadPendingChanges = getSupabaseSyncState(workspaceId).pendingCount > 0;
      await syncSupabaseOutbox();
      if (hadPendingChanges) void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contracts"] }),
        queryClient.invalidateQueries({ queryKey: ["contract"] }),
        queryClient.invalidateQueries({ queryKey: ["contract-lists"] }),
        queryClient.invalidateQueries({ queryKey: ["nif-lookup"] }),
        queryClient.invalidateQueries({ queryKey: ["identification"] }),
        queryClient.invalidateQueries({ queryKey: ["dossiers"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: ["pinned-contracts"] }),
        queryClient.invalidateQueries({ queryKey: ["suggestions"] }),
        queryClient.invalidateQueries({ queryKey: ["salary-grid"] }),
        queryClient.invalidateQueries({ queryKey: ["institution-prepositions"] }),
        queryClient.invalidateQueries({ queryKey: ["ministers"] })
      ]);
      const refreshed = await syncSupabaseWorkspace(workspaceId, {
        force, verify: verify || synchronizationNeedsRetry.current
      });
      if (refreshed) {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ["contracts"] }),
          queryClient.invalidateQueries({ queryKey: ["contract"] }),
          queryClient.invalidateQueries({ queryKey: ["nif-lookup"] }),
          queryClient.invalidateQueries({ queryKey: ["suggestions"] }),
          queryClient.invalidateQueries({ queryKey: ["task_contract_suggestions"] }),
          queryClient.invalidateQueries({ queryKey: ["dossiers"] }),
          queryClient.invalidateQueries({ queryKey: ["identification"] }),
          queryClient.invalidateQueries({ queryKey: ["tags"] }),
          queryClient.invalidateQueries({ queryKey: ["contract-lists"] })
        ]);
      }
      synchronizationNeedsRetry.current = false;
    } catch (error) {
      synchronizationNeedsRetry.current = true;
      console.error("Synchronisation hors ligne impossible.", error);
    } finally {
      synchronizationRunning.current = false;
      refreshSyncState();
      if (forcedSynchronizationPending.current) {
        forcedSynchronizationPending.current = false;
        void synchronize(true);
      }
    }
  }, [isSupabase, queryClient, refreshSyncState, workspaceId]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void synchronize(false, true);
    };
    const handleOffline = () => refreshSyncState();
    let queuedTimer: number | undefined;
    const handleSyncState = (event: Event) => {
      refreshSyncState();
      // IndexedDB was refreshed by another tab. Its revision may already match
      // the server, so a subsequent sync will not invalidate these queries.
      if ((event as CustomEvent).detail?.external) {
        void Promise.all([
          "contracts", "contract", "contract-lists", "nif-lookup", "identification",
          "dossiers", "tags", "suggestions", "task_contract_suggestions"
        ].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
      }
      if ((event as CustomEvent).detail?.queued && navigator.onLine) {
        window.clearTimeout(queuedTimer);
        queuedTimer = window.setTimeout(() => void synchronize(false), 1000);
      }
    };
    // Local reads no longer poll the server. Check its revision even when the
    // outbox is empty so other devices' changes reach an idle open page.
    const retryTimer = window.setInterval(() => {
      const state = getSupabaseSyncState(workspaceId);
      if (navigator.onLine && !state.isSyncing && document.visibilityState === "visible") {
        void synchronize(false, true);
      }
    }, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void synchronize(false, true);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("contribution-offline-sync", handleSyncState);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    refreshSyncState();
    // Let the local page render before checking for changes on other devices.
    const initialSyncTimer = navigator.onLine
      ? window.setTimeout(() => void synchronize(false, true), 750)
      : null;

    return () => {
      window.clearInterval(retryTimer);
      window.clearTimeout(queuedTimer);
      if (initialSyncTimer !== null) window.clearTimeout(initialSyncTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("contribution-offline-sync", handleSyncState);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [queryClient, refreshSyncState, synchronize]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(collapsed));
    } catch {}
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_W_KEY, String(sidebarWidth));
    } catch {}
  }, [sidebarWidth]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = e.clientX;
      if (newWidth >= MIN_W && newWidth <= MAX_W) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    } else {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const toggle = () => setCollapsed((c) => !c);

  const style = {
    "--sidebar-w": collapsed ? "var(--sidebar-w-collapsed)" : `${sidebarWidth}px`
  } as React.CSSProperties;

  return (
    <div
      className={`app-shell${collapsed ? " sidebar-collapsed" : ""}${isLocked ? " session-locked" : ""}`}
      style={style}
    >
      <Sidebar 
        collapsed={collapsed} 
        onToggle={toggle} 
        onResizeStart={startResizing}
        isResizing={isResizing}
        isOnline={isOnline}
        syncState={syncState}
        onSync={() => void synchronize(true)}
      />
      <div className="main" ref={mainRef}>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      {!isMobile ? <GlobalContractSearch /> : null}
      {isLocked ? <SessionLockScreen /> : null}
    </div>
  );
}
