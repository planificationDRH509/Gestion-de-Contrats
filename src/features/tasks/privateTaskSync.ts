import { withBrowserLock } from "../../lib/browserLock";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { claimPrivateTaskOperation, completePrivateTaskOfflineOperation } from "./privateTaskOffline";

function isOffline() { return typeof navigator !== "undefined" && !navigator.onLine; }

export async function flushPrivateTaskOutbox(user: { id: string; taskSessionToken: string }) {
  return withBrowserLock(`private-task-sync:${user.id}`, async () => {
    if (isOffline()) return 0;
    let count = 0;
    while (!isOffline()) {
      const operation = await claimPrivateTaskOperation(user.id, user.taskSessionToken);
      if (!operation) break;
      const { sent: _sent, ...request } = operation;
      const { data, error } = await getSupabaseClient().rpc("sync_private_task", {
        p_session_token: user.taskSessionToken, p_request_id: operation.id, p_operation: request
      });
      if (error) throw error;
      await completePrivateTaskOfflineOperation(user.id, user.taskSessionToken, operation.id,
        operation.type === "create" && operation.tempTaskId && typeof data === "string"
          ? { tempTaskId: operation.tempTaskId, remoteTaskId: data } : undefined);
      count += 1;
    }
    return count;
  });
}

