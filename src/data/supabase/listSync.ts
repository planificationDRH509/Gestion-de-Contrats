import type { AuthUser } from "../../features/auth/auth";
import type { ContractList } from "../../features/lists/listModel";
import type { OutboxItem } from "../types";
import type { QueuedListOperation } from "../local/localListRepository";
import type { Json } from "./database.types";
import { getSupabaseClient } from "./supabaseClient";
import { cacheContractLists } from "../local/localListRepository";

function session(): AuthUser | null {
  try { return JSON.parse(localStorage.getItem("contribution_auth") ?? "null") as AuthUser | null; }
  catch { return null; }
}

export async function syncQueuedList(item: OutboxItem): Promise<void> {
  const user = session();
  const payload = item.payload as QueuedListOperation;
  // Never replay a previous user's actions under the current user's identity.
  if (!user?.taskSessionToken || user.id !== payload.actorId || user.workspaceId !== item.workspaceId) {
    throw new Error("Reconnectez le compte ayant modifié ces listes pour les synchroniser.");
  }
  const { error } = await getSupabaseClient().rpc("sync_contract_list", {
    p_session_token: user.taskSessionToken, p_workspace_id: item.workspaceId,
    p_request_id: item.id, p_operation: payload.operation as Json,
    p_expected_lists: payload.expectedLists as Json,
    p_expected_memberships: payload.expectedMemberships as Json
  });
  if (error) throw new Error(error.message);
}

export async function downloadContractLists(workspaceId: string): Promise<void> {
  const user = session();
  if (!user?.taskSessionToken || user.workspaceId !== workspaceId) return;
  const { data, error } = await getSupabaseClient().rpc("read_contract_lists", {
    p_session_token: user.taskSessionToken, p_workspace_id: workspaceId
  });
  if (error) throw error;
  cacheContractLists(workspaceId, data as unknown as ContractList[]);
}
