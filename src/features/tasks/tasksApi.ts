import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import type {
  Contract,
  PersonalTask,
  TaskRecipient,
  TaskStatus
} from "../../data/types";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { getDataProvider } from "../../data/dataProvider";
import { readCachedContracts } from "../../data/local/localContractRepository";
import { isOfflineFailure } from "../../data/local/offlineStore";
import { useAuth } from "../auth/auth";
import {
  completePrivateTaskOfflineOperation,
  queueOfflineTaskCreation,
  queueOfflineTaskDeletion,
  queueOfflineTaskStatus,
  readCachedPrivateTasks,
  readCachedTaskRecipients,
  readPrivateTaskOfflineState,
  replaceCachedPrivateTasks,
  replaceCachedTaskRecipients
} from "./privateTaskOffline";

export type TaskContractSuggestion = {
  id: string;
  nif: string;
  personName: string;
  position: string;
  fiscalYear: string | null;
};

type PrivateTaskRow = {
  id: string;
  content: string;
  status?: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  created_by_name: string;
  created_by_username: string;
};

const provider = getDataProvider();

function requireTaskToken(token: string | undefined) {
  if (!token) {
    throw new Error("TASK_SESSION_REQUIRED");
  }
  return token;
}

function requireTaskUser(
  user:
    | {
        id: string;
        name: string;
        username: string;
        taskSessionToken?: string;
      }
    | null
) {
  if (!user) throw new Error("TASK_SESSION_REQUIRED");
  return {
    ...user,
    taskSessionToken: requireTaskToken(user.taskSessionToken)
  };
}

function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

function mapTask(row: PrivateTaskRow): PersonalTask {
  const status: TaskStatus =
    row.status === "in_progress" || row.status === "done" || row.status === "todo"
      ? row.status
      : row.completed
        ? "done"
        : "todo";

  return {
    id: row.id,
    content: row.content,
    status,
    completed: status === "done",
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdByUsername: row.created_by_username
  };
}

function mapContractSuggestion(contract: Contract): TaskContractSuggestion | null {
  const nif = contract.nif?.trim() || contract.applicantId?.trim() || "";
  if (!nif) return null;
  return {
    id: contract.id,
    nif,
    personName: `${contract.firstName} ${contract.lastName}`.trim(),
    position: contract.position,
    fiscalYear: contract.annee_fiscale ?? null
  };
}

async function fetchRemoteTasks(sessionToken: string) {
  const { data, error } = await getSupabaseClient().rpc(
    "list_private_tasks",
    { p_session_token: sessionToken }
  );
  if (error) throw error;
  return ((data ?? []) as PrivateTaskRow[]).map(mapTask);
}

async function flushPrivateTaskOutbox(user: {
  id: string;
  taskSessionToken: string;
}) {
  if (isOffline()) return 0;
  let flushedCount = 0;

  while (true) {
    const state = await readPrivateTaskOfflineState(user.id, user.taskSessionToken);
    const operation = state.outbox[0];
    if (!operation) return flushedCount;

    if (operation.type === "create") {
      const { data, error } = await getSupabaseClient().rpc(
        "create_private_task",
        {
          p_session_token: user.taskSessionToken,
          p_content: operation.content,
          p_assignee_id: operation.assigneeId
        }
      );
      if (error) throw error;

      await completePrivateTaskOfflineOperation(
        user.id,
        user.taskSessionToken,
        operation.id,
        operation.tempTaskId && data
          ? { tempTaskId: operation.tempTaskId, remoteTaskId: data }
          : undefined
      );
      if (operation.tempTaskId && data && operation.status !== "todo") {
        await queueOfflineTaskStatus(
          user.id,
          user.taskSessionToken,
          data,
          operation.status
        );
      }
      flushedCount += 1;
      continue;
    }

    if (operation.type === "status") {
      const { data, error } = await getSupabaseClient().rpc(
        "set_private_task_status",
        {
          p_session_token: user.taskSessionToken,
          p_task_id: operation.taskId,
          p_status: operation.status
        }
      );
      if (error) throw error;
      if (!data) throw new Error("Tâche introuvable.");
    } else {
      const { error } = await getSupabaseClient().rpc(
        "delete_private_task",
        {
          p_session_token: user.taskSessionToken,
          p_task_id: operation.taskId
        }
      );
      if (error) throw error;
    }

    await completePrivateTaskOfflineOperation(
      user.id,
      user.taskSessionToken,
      operation.id
    );
    flushedCount += 1;
  }
}

export function getTaskErrorMessage(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : String((error as { message?: unknown } | null)?.message ?? error ?? "");

  if (/TASK_SESSION_(INVALID|REQUIRED)/.test(message)) {
    return "Votre session privée a expiré. Déconnectez-vous puis reconnectez-vous.";
  }
  if (/Could not find the function|PGRST202|create_private_task/i.test(message)) {
    return "La liste de tâches n’est pas encore activée dans Supabase.";
  }
  if (/TASK_RECIPIENT_NOT_FOUND/.test(message)) {
    return "Ce compte n’est plus disponible.";
  }
  if (/TASK_STATUS_INVALID/.test(message)) {
    return "Cet état de tâche n’est pas valide.";
  }
  return message || "Une erreur inattendue est survenue.";
}

export function usePrivateTasks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["private_tasks", user?.id],
    queryFn: async () => {
      const currentUser = requireTaskUser(user);
      const cachedTasks = await readCachedPrivateTasks(
        currentUser.id,
        currentUser.taskSessionToken
      );
      if (isOffline()) return cachedTasks;

      try {
        await flushPrivateTaskOutbox(currentUser);
        const remoteTasks = await fetchRemoteTasks(currentUser.taskSessionToken);
        await replaceCachedPrivateTasks(
          currentUser.id,
          currentUser.taskSessionToken,
          remoteTasks
        );
        return remoteTasks;
      } catch (error) {
        if (isOfflineFailure(error) || isOffline()) return cachedTasks;
        throw error;
      }
    },
    enabled: Boolean(user?.id && user.taskSessionToken),
    staleTime: 0,
    refetchInterval: isOffline() ? false : 15_000,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: true
  });
}

export function useTaskRecipients() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["task_recipients", user?.id],
    queryFn: async () => {
      const currentUser = requireTaskUser(user);
      const cachedRecipients = await readCachedTaskRecipients(
        currentUser.id,
        currentUser.taskSessionToken
      );
      if (isOffline()) return cachedRecipients;

      try {
        const { data, error } = await getSupabaseClient().rpc(
          "list_task_recipients",
          { p_session_token: currentUser.taskSessionToken }
        );
        if (error) throw error;
        const recipients = (data ?? []).map((row) => ({
          id: row.id,
          username: row.username,
          fullName: row.full_name
        })) satisfies TaskRecipient[];
        await replaceCachedTaskRecipients(
          currentUser.id,
          currentUser.taskSessionToken,
          recipients
        );
        return recipients;
      } catch (error) {
        if (isOfflineFailure(error) || isOffline()) return cachedRecipients;
        throw error;
      }
    },
    enabled: Boolean(user?.id && user.taskSessionToken),
    staleTime: 60_000,
    refetchOnReconnect: "always"
  });
}

export function useTaskContractSuggestions(query: string | null) {
  const { user } = useAuth();
  const params = {
    workspaceId: user?.workspaceId ?? "",
    query: query ?? "",
    sort: "createdAt_desc" as const,
    page: 1,
    pageSize: 8
  };

  return useQuery({
    queryKey: ["task_contract_suggestions", user?.workspaceId, query],
    queryFn: async () => {
      const cached = readCachedContracts(params).items
        .map(mapContractSuggestion)
        .filter((item): item is TaskContractSuggestion => Boolean(item));
      if (isOffline()) return cached;

      try {
        const result = await provider.contracts.list(params);
        return result.items
          .map(mapContractSuggestion)
          .filter((item): item is TaskContractSuggestion => Boolean(item));
      } catch (error) {
        if (isOfflineFailure(error) || cached.length > 0) return cached;
        throw error;
      }
    },
    enabled: query !== null && Boolean(user?.workspaceId),
    initialData: query !== null && user?.workspaceId
      ? () =>
          readCachedContracts(params).items
            .map(mapContractSuggestion)
            .filter((item): item is TaskContractSuggestion => Boolean(item))
      : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    refetchOnReconnect: true
  });
}

export function useCreatePrivateTask() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      content,
      assigneeId
    }: {
      content: string;
      assigneeId: string | null;
    }) => {
      const currentUser = requireTaskUser(user);
      if (isOffline()) {
        return queueOfflineTaskCreation(currentUser.taskSessionToken, {
          userId: currentUser.id,
          userName: currentUser.name,
          username: currentUser.username,
          content,
          assigneeId
        });
      }

      try {
        const { data, error } = await getSupabaseClient().rpc(
          "create_private_task",
          {
            p_session_token: currentUser.taskSessionToken,
            p_content: content,
            p_assignee_id: assigneeId
          }
        );
        if (error) throw error;
        return { id: data, queued: false };
      } catch (error) {
        if (!isOfflineFailure(error)) throw error;
        return queueOfflineTaskCreation(currentUser.taskSessionToken, {
          userId: currentUser.id,
          userName: currentUser.name,
          username: currentUser.username,
          content,
          assigneeId
        });
      }
    },
    onSuccess: async (result) => {
      if (result.queued && user?.id && user.taskSessionToken) {
        const cachedTasks = await readCachedPrivateTasks(
          user.id,
          user.taskSessionToken
        );
        queryClient.setQueryData(["private_tasks", user.id], cachedTasks);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["private_tasks", user?.id] });
    }
  });
}

export function useSetTaskStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      status
    }: {
      taskId: string;
      status: TaskStatus;
    }) => {
      const currentUser = requireTaskUser(user);
      if (isOffline() || taskId.startsWith("offline-task-")) {
        await queueOfflineTaskStatus(
          currentUser.id,
          currentUser.taskSessionToken,
          taskId,
          status
        );
        return true;
      }

      try {
        const { data, error } = await getSupabaseClient().rpc(
          "set_private_task_status",
          {
            p_session_token: currentUser.taskSessionToken,
            p_task_id: taskId,
            p_status: status
          }
        );
        if (error) throw error;
        if (!data) throw new Error("Tâche introuvable.");
        return data;
      } catch (error) {
        if (!isOfflineFailure(error)) throw error;
        await queueOfflineTaskStatus(
          currentUser.id,
          currentUser.taskSessionToken,
          taskId,
          status
        );
        return true;
      }
    },
    onMutate: async ({ taskId, status }) => {
      const queryKey = ["private_tasks", user?.id] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PersonalTask[]>(queryKey);

      queryClient.setQueryData<PersonalTask[]>(queryKey, (current) =>
        current?.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status,
                completed: status === "done",
                completedAt: status === "done" ? new Date().toISOString() : null
              }
            : task
        )
      );

      return { previous, queryKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["private_tasks", user?.id]
      });
    }
  });
}

export function useDeletePrivateTask() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const currentUser = requireTaskUser(user);
      if (isOffline() || taskId.startsWith("offline-task-")) {
        await queueOfflineTaskDeletion(
          currentUser.id,
          currentUser.taskSessionToken,
          taskId
        );
        return true;
      }

      try {
        const { data, error } = await getSupabaseClient().rpc(
          "delete_private_task",
          {
            p_session_token: currentUser.taskSessionToken,
            p_task_id: taskId
          }
        );
        if (error) throw error;
        if (!data) throw new Error("Tâche introuvable.");
        return data;
      } catch (error) {
        if (!isOfflineFailure(error)) throw error;
        await queueOfflineTaskDeletion(
          currentUser.id,
          currentUser.taskSessionToken,
          taskId
        );
        return true;
      }
    },
    onSuccess: async () => {
      if (user?.id && user.taskSessionToken && isOffline()) {
        const cachedTasks = await readCachedPrivateTasks(
          user.id,
          user.taskSessionToken
        );
        queryClient.setQueryData(["private_tasks", user.id], cachedTasks);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["private_tasks", user?.id] });
    }
  });
}
