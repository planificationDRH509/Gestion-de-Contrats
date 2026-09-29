import { useEffect, useState } from "react";
import { getPendingOutbox } from "../data/local/offlineStore";

/** Keep row indicators current after uploads, corrections and cross-tab updates. */
export function usePendingSync() {
  const [pending, setPending] = useState(getPendingOutbox);
  useEffect(() => {
    const refresh = () => setPending(getPendingOutbox());
    window.addEventListener("contribution-offline-sync", refresh);
    refresh();
    return () => window.removeEventListener("contribution-offline-sync", refresh);
  }, []);
  return pending;
}
