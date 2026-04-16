import React, { useEffect, useMemo } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { registerSW } from "virtual:pwa-register";
import { AppRoutes } from "./router";
import { AuthProvider } from "../features/auth/auth";
import { cachePersister } from "./persistence";
import type { ReactNode } from "react";

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class AppErrorBoundary extends React.Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "Erreur inattendue."
    };
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          textAlign: "center",
          fontFamily: "Inter, sans-serif",
          background: "#f7f5f2",
          color: "#1f2937"
        }}
      >
        <section>
          <h1 style={{ marginBottom: "12px" }}>Erreur de chargement</h1>
          <p style={{ marginBottom: "8px" }}>
            L'application a rencontre une erreur au demarrage.
          </p>
          <p style={{ opacity: 0.8 }}>{this.state.message}</p>
        </section>
      </main>
    );
  }
}

export function App() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 1000 * 60 * 60 * 24 * 30, // Persist in memory for 30 days
            staleTime: 1000 * 60 * 60, // Data is fresh for 1 hour (less noise)
            retry: 1,
            refetchOnWindowFocus: false,
            // Re-fetch even if we think we are offline (will fail but show cache)
            networkMode: 'always', 
          },
          mutations: {
            networkMode: 'always',
          }
        },
      }),
    []
  );
  const basename = import.meta.env.BASE_URL;

  useEffect(() => {
    registerSW({ immediate: true });
  }, []);

  return (
    <AppErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: cachePersister,
          maxAge: 1000 * 60 * 60 * 24 * 7, // Persist for 7 days
          buster: "v1",
        }}
        onSuccess={() => {
          // Resume mutations after restoration
          queryClient.resumePausedMutations();
        }}
      >
        <AuthProvider>
          <BrowserRouter basename={basename}>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </PersistQueryClientProvider>
    </AppErrorBoundary>
  );
}
