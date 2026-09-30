import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Contract, OutboxItem } from "../../data/types";
import { discardableContractChanges } from "../../data/local/outboxDependencies";
import { discardContractSyncChanges } from "../../data/supabase/supabaseProvider";

export function DiscardContractSyncButton({ contract, pending, online, iconOnly = false, menuItem = false }: {
  contract: Contract; pending: OutboxItem[]; online: boolean; iconOnly?: boolean; menuItem?: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const changes = discardableContractChanges(contract, pending);
  if (!changes.length || pending.some(item => !item.syncedAt && item.workspaceId === contract.workspaceId &&
    item.type === "contract.create" && item.payload.id === contract.id)) return null;
  return <button type="button" role={menuItem ? "menuitem" : undefined} className={menuItem ? "contracts-sheet-row-menu-item" : iconOnly ? "icon-btn" : "btn btn-outline"}
    title="Abandonner les modifications" aria-label="Abandonner les modifications" disabled={busy || !online}
    onMouseDown={event => event.preventDefault()}
    onClick={async event => {
      event.stopPropagation();
      if (!window.confirm("Abandonner les modifications en attente de ce contrat et reprendre la version du serveur ?")) return;
      setBusy(true);
      try {
        await discardContractSyncChanges(contract, changes.map(item => item.id));
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["contracts"] }),
          queryClient.invalidateQueries({ queryKey: ["contract"] })
        ]);
      } catch (error) { window.alert(error instanceof Error ? error.message : "Annulation impossible."); }
      finally { setBusy(false); }
    }}>
    {(iconOnly || menuItem) && <span className="material-symbols-rounded" aria-hidden="true">undo</span>}
    {(!iconOnly || menuItem) && "Abandonner les modifications"}
  </button>;
}
