import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useIsMobileViewport } from "../../lib/useIsMobileViewport";

export function DesktopOnlyContractFeature({ children }: { children: ReactNode }) {
  const isMobile = useIsMobileViewport();

  if (isMobile) {
    return <Navigate to="/app/contrats" replace />;
  }

  return <>{children}</>;
}
