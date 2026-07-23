import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import type { AppPermission } from "./permissions";

export function RequirePermission({
  permission,
  children
}: {
  permission: AppPermission;
  children: ReactElement;
}) {
  const { can } = useAuth();
  const location = useLocation();

  if (!can(permission)) {
    return (
      <Navigate
        to="/app/contrats"
        replace
        state={{
          deniedFrom: location.pathname,
          deniedMessage: "Votre rôle ne permet pas d’accéder à cette page."
        }}
      />
    );
  }

  return children;
}
