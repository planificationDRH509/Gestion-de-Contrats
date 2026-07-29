import { del, get, set } from "idb-keyval";
import type {
  PersonalTask,
  TaskRecipient,
  TaskStatus
} from "../../data/types";

export type PrivateTaskOfflineOperation =
  | {
      id: string;
      type: "create";
      tempTaskId: string | null;
      content: string;
      assigneeId: string | null;
      status: TaskStatus;
      createdAt: string;
    }
  | {
      id: string;
      type: "status";
      taskId: string;
      status: TaskStatus;
      createdAt: string;
    }
  | {
      id: string;
      type: "delete";
      taskId: string;
      createdAt: string;
    };

export type PrivateTaskOfflineState = {
  version: 1;
  tasks: PersonalTask[];
  recipients: TaskRecipient[];
  outbox: PrivateTaskOfflineOperation[];
  cachedAt: string | null;
};

type EncryptedTaskEnvelope = {
  version: 1;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
};

type OfflineCreateInput = {
  userId: string;
  userName: string;
  username: string;
  content: string;
  assigneeId: string | null;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
let transactionQueue: Promise<unknown> = Promise.resolve();

function storageKey(userId: string) {
  return `private-task-cache:${userId}`;
}

function emptyState(): PrivateTaskOfflineState {
  return {
    version: 1,
    tasks: [],
    recipients: [],
    outbox: [],
    cachedAt: null
  };
}

function createOfflineId(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

async function deriveEncryptionKey(sessionToken: string) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(`private-tasks:${sessionToken}`)
  );
  return globalThis.crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function readState(
  userId: string,
  sessionToken: string
): Promise<PrivateTaskOfflineState> {
  const envelope = await get<EncryptedTaskEnvelope>(storageKey(userId));
  if (!envelope) return emptyState();

  try {
    const key = await deriveEncryptionKey(sessionToken);
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(envelope.iv).buffer },
      key,
      envelope.ciphertext
    );
    const parsed = JSON.parse(textDecoder.decode(plaintext)) as PrivateTaskOfflineState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.outbox)) {
      return emptyState();
    }
    return {
      ...parsed,
      recipients: Array.isArray(parsed.recipients) ? parsed.recipients : []
    };
  } catch {
    // A cache encrypted by an older/expired session cannot be reused.
    return emptyState();
  }
}

async function writeState(
  userId: string,
  sessionToken: string,
  state: PrivateTaskOfflineState
) {
  const key = await deriveEncryptionKey(sessionToken);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(JSON.stringify(state))
  );
  await set(storageKey(userId), {
    version: 1,
    iv,
    ciphertext
  });
}

async function transact<T>(
  userId: string,
  sessionToken: string,
  mutator: (state: PrivateTaskOfflineState) => T | Promise<T>
): Promise<T> {
  let result!: T;
  const transaction = transactionQueue.then(async () => {
    const state = await readState(userId, sessionToken);
    result = await mutator(state);
    await writeState(userId, sessionToken, state);
  });
  transactionQueue = transaction.catch(() => undefined);
  await transaction;
  return result;
}

export async function readCachedPrivateTasks(
  userId: string,
  sessionToken: string
) {
  return (await readState(userId, sessionToken)).tasks;
}

export async function readPrivateTaskOfflineState(
  userId: string,
  sessionToken: string
) {
  return readState(userId, sessionToken);
}

export async function readCachedTaskRecipients(
  userId: string,
  sessionToken: string
) {
  return (await readState(userId, sessionToken)).recipients;
}

export async function replaceCachedTaskRecipients(
  userId: string,
  sessionToken: string,
  recipients: TaskRecipient[]
) {
  await transact(userId, sessionToken, (state) => {
    state.recipients = recipients;
  });
}

export async function replaceCachedPrivateTasks(
  userId: string,
  sessionToken: string,
  tasks: PersonalTask[]
) {
  await transact(userId, sessionToken, (state) => {
    const pendingTasks = state.tasks.filter((task) => task.id.startsWith("offline-task-"));
    state.tasks = [
      ...pendingTasks,
      ...tasks.filter((task) => !pendingTasks.some((pending) => pending.id === task.id))
    ];
    state.cachedAt = new Date().toISOString();
  });
}

export async function queueOfflineTaskCreation(
  sessionToken: string,
  input: OfflineCreateInput
) {
  return transact(input.userId, sessionToken, (state) => {
    const timestamp = new Date().toISOString();
    const tempTaskId = input.assigneeId ? null : createOfflineId("offline-task");
    const operation: PrivateTaskOfflineOperation = {
      id: createOfflineId("task-operation"),
      type: "create",
      tempTaskId,
      content: input.content,
      assigneeId: input.assigneeId,
      status: "todo",
      createdAt: timestamp
    };
    state.outbox.push(operation);

    if (tempTaskId) {
      state.tasks.unshift({
        id: tempTaskId,
        content: input.content,
        status: "todo",
        completed: false,
        completedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: input.userId,
        createdByName: input.userName,
        createdByUsername: input.username
      });
    }

    return {
      id: tempTaskId ?? operation.id,
      queued: true
    };
  });
}

export async function queueOfflineTaskStatus(
  userId: string,
  sessionToken: string,
  taskId: string,
  status: TaskStatus
) {
  await transact(userId, sessionToken, (state) => {
    const timestamp = new Date().toISOString();
    state.tasks = state.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status,
            completed: status === "done",
            completedAt: status === "done" ? timestamp : null,
            updatedAt: timestamp
          }
        : task
    );

    if (taskId.startsWith("offline-task-")) {
      state.outbox = state.outbox.map((operation) =>
        operation.type === "create" && operation.tempTaskId === taskId
          ? { ...operation, status }
          : operation
      );
      return;
    }

    state.outbox = state.outbox.filter(
      (operation) => !(operation.type === "status" && operation.taskId === taskId)
    );
    state.outbox.push({
      id: createOfflineId("task-operation"),
      type: "status",
      taskId,
      status,
      createdAt: timestamp
    });
  });
}

export async function queueOfflineTaskDeletion(
  userId: string,
  sessionToken: string,
  taskId: string
) {
  await transact(userId, sessionToken, (state) => {
    state.tasks = state.tasks.filter((task) => task.id !== taskId);

    if (taskId.startsWith("offline-task-")) {
      state.outbox = state.outbox.filter((operation) => {
        if (operation.type === "create") return operation.tempTaskId !== taskId;
        return !("taskId" in operation) || operation.taskId !== taskId;
      });
      return;
    }

    state.outbox = state.outbox.filter(
      (operation) => !("taskId" in operation) || operation.taskId !== taskId
    );
    state.outbox.push({
      id: createOfflineId("task-operation"),
      type: "delete",
      taskId,
      createdAt: new Date().toISOString()
    });
  });
}

export async function completePrivateTaskOfflineOperation(
  userId: string,
  sessionToken: string,
  operationId: string,
  replacement?: {
    tempTaskId: string;
    remoteTaskId: string;
  }
) {
  await transact(userId, sessionToken, (state) => {
    state.outbox = state.outbox
      .filter((operation) => operation.id !== operationId)
      .map((operation) => {
        if (!replacement || operation.type === "create") return operation;
        return operation.taskId === replacement.tempTaskId
          ? { ...operation, taskId: replacement.remoteTaskId }
          : operation;
      });

    if (replacement) {
      state.tasks = state.tasks.map((task) =>
        task.id === replacement.tempTaskId
          ? { ...task, id: replacement.remoteTaskId }
          : task
      );
    }
  });
}

export async function clearPrivateTaskOfflineData(userId: string) {
  await del(storageKey(userId));
}
