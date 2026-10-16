import { withBrowserLock } from "../../lib/browserLock";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { claimPrivateTaskOperation, completePrivateTaskOfflineOperation, markPrivateTaskMissing, privateTaskOperationTarget } from "./privateTaskOffline";
import { isTransientSyncFailure } from "../../data/local/syncFailures";

function isOffline() { return typeof navigator !== "undefined" && !navigator.onLine; }

export async function flushPrivateTaskOutbox(user: { id: string; taskSessionToken: string }) {
  return withBrowserLock(`private-task-sync:${user.id}`, async () => {
    if (isOffline()) return 0;
    let count = 0;
    const blockedTasks = new Set<string>();
    let firstError: unknown;
    while (!isOffline()) {
      const operation = await claimPrivateTaskOperation(user.id, user.taskSessionToken, blockedTasks);
      if (!operation) break;
      const { sent: _sent, missing: _missing, ...request } = operation;
      let data: unknown;
      try {
        const response = await getSupabaseClient().rpc("sync_private_task", {
          p_session_token: user.taskSessionToken, p_request_id: operation.id, p_operation: request
        });
        if (response.error) {
          if (response.error.code === "P0001" && response.error.message === "TASK_NOT_FOUND") {
            await markPrivateTaskMissing(user.id, user.taskSessionToken, operation.id);
          }
          throw response.error;
        }
        data = response.data;
      } catch (error) {
        if (isTransientSyncFailure(error)) throw error;
        firstError ??= error;
        blockedTasks.add(privateTaskOperationTarget(operation));
        continue;
      }
      await completePrivateTaskOfflineOperation(user.id, user.taskSessionToken, operation.id,
        operation.type === "create" && operation.tempTaskId && typeof data === "string"
          ? { tempTaskId: operation.tempTaskId, remoteTaskId: data } : undefined);
      count += 1;
    }
    if (firstError !== undefined) throw firstError;
    return count;
  });
}

