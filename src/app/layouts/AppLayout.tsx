import { useState, useEffect, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

const SIDEBAR_KEY = "sidebar-collapsed";
const SIDEBAR_W_KEY = "sidebar-width";
const DEFAULT_W = 280;
const MIN_W = 200;
const MAX_W = 480;

export function AppLayout() {
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

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
      />
      <div className="main">
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
