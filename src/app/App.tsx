import { useEffect, useMemo } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import { AppRoutes } from "./router";
import { AuthProvider } from "../features/auth/auth";

export function App() {
  const queryClient = useMemo(() => new QueryClient(), []);

  useEffect(() => {
    registerSW({ immediate: true });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
