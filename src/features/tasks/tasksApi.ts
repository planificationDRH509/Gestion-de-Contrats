import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import type {
  PersonalTask,
  TaskRecipient,
  TaskStatus
} from "../../data/types";
import { getSupabaseClient } from "../../data/supabase/supabaseClient";
import { useAuth } from "../auth/auth";

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

function requireTaskToken(token: string | undefined) {
  if (!token) {
    throw new Error("TASK_SESSION_REQUIRED");
  }
  return token;
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
      const token = requireTaskToken(user?.taskSessionToken);
      const { data, error } = await getSupabaseClient().rpc(
        "list_private_tasks",
        { p_session_token: token }
      );
      if (error) throw error;
      return ((data ?? []) as PrivateTaskRow[]).map(mapTask);
    },
    enabled: Boolean(user?.id && user.taskSessionToken),
    staleTime: 0,
    refetchInterval: 15_000,
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
      const token = requireTaskToken(user?.taskSessionToken);
      const { data, error } = await getSupabaseClient().rpc(
        "list_task_recipients",
        { p_session_token: token }
      );
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        username: row.username,
        fullName: row.full_name
      })) satisfies TaskRecipient[];
    },
    enabled: Boolean(user?.id && user.taskSessionToken),
    staleTime: 60_000,
    refetchOnReconnect: "always"
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
      const token = requireTaskToken(user?.taskSessionToken);
      const { data, error } = await getSupabaseClient().rpc(
        "create_private_task",
        {
          p_session_token: token,
          p_content: content,
          p_assignee_id: assigneeId
        }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
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
      const token = requireTaskToken(user?.taskSessionToken);
      const { data, error } = await getSupabaseClient().rpc(
        "set_private_task_status",
        {
          p_session_token: token,
          p_task_id: taskId,
          p_status: status
        }
      );
      if (error) throw error;
      if (!data) throw new Error("Tâche introuvable.");
      return data;
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
      const token = requireTaskToken(user?.taskSessionToken);
      const { data, error } = await getSupabaseClient().rpc(
        "delete_private_task",
        {
          p_session_token: token,
          p_task_id: taskId
        }
      );
      if (error) throw error;
      if (!data) throw new Error("Tâche introuvable.");
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["private_tasks", user?.id] });
    }
  });
}
