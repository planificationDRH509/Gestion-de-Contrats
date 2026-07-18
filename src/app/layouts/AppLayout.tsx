import { useState, useEffect, useCallback, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "./Sidebar";
import {
  getSupabaseSyncState,
  syncSupabaseWorkspace
} from "../../data/supabase/supabaseProvider";
import { useAuth } from "../../features/auth/auth";

const SIDEBAR_KEY = "sidebar-collapsed";
const SIDEBAR_W_KEY = "sidebar-width";
const DEFAULT_W = 280;
const MIN_W = 200;
const MAX_W = 480;

export function AppLayout() {
  const { user } = useAuth();
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

  const refreshSyncState = useCallback(() => {
    setIsOnline(navigator.onLine);
    setSyncState(getSupabaseSyncState(workspaceId));
  }, [workspaceId]);

  const synchronize = useCallback(async () => {
    if (!isSupabase || !workspaceId || !navigator.onLine) {
      refreshSyncState();
      return;
    }
    try {
      await syncSupabaseWorkspace(workspaceId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contracts"] }),
        queryClient.invalidateQueries({ queryKey: ["dossiers"] }),
        queryClient.invalidateQueries({ queryKey: ["identification"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] })
      ]);
    } catch (error) {
      console.error("Synchronisation hors ligne impossible.", error);
    } finally {
      refreshSyncState();
    }
  }, [isSupabase, queryClient, refreshSyncState, workspaceId]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void synchronize();
    };
    const handleOffline = () => refreshSyncState();
    const handleSyncState = () => refreshSyncState();
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void synchronize();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("contribution-offline-sync", handleSyncState);
    document.addEventListener("visibilitychange", handleVisibility);

    refreshSyncState();
    if (navigator.onLine) void synchronize();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("contribution-offline-sync", handleSyncState);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshSyncState, synchronize]);

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
      className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`} 
      style={style}
    >
      <Sidebar 
        collapsed={collapsed} 
        onToggle={toggle} 
        onResizeStart={startResizing}
        isResizing={isResizing}
        isOnline={isOnline}
        syncState={syncState}
        onSync={() => void synchronize()}
      />
      <div className="main" ref={mainRef}>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
