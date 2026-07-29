import { beforeEach, describe, expect, it, vi } from "vitest";

const offlineStorage = vi.hoisted(() => new Map<string, unknown>());

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => offlineStorage.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    offlineStorage.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    offlineStorage.delete(key);
  })
}));

import {
  queueOfflineTaskCreation,
  queueOfflineTaskDeletion,
  queueOfflineTaskStatus,
  readPrivateTaskOfflineState
} from "./privateTaskOffline";

const user = {
  id: "user-1",
  name: "Jean Dupont",
  username: "jdupont"
};
const sessionToken = "private-session-token";

describe("private task offline storage", () => {
  beforeEach(() => {
    offlineStorage.clear();
  });

  it("encrypts a personal task and restores it from the private cache", async () => {
    const queued = await queueOfflineTaskCreation(sessionToken, {
      ...user,
      userId: user.id,
      userName: user.name,
      content: "Préparer le contrat #123-456",
      assigneeId: null
    });

    const rawEnvelope = offlineStorage.get(`private-task-cache:${user.id}`);
    expect(JSON.stringify(rawEnvelope)).not.toContain("Préparer le contrat");

    const state = await readPrivateTaskOfflineState(user.id, sessionToken);
    expect(queued.queued).toBe(true);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({
      id: queued.id,
      content: "Préparer le contrat #123-456",
      status: "todo",
      createdBy: user.id
    });
    expect(state.outbox).toHaveLength(1);
  });

  it("folds status changes into a task created offline", async () => {
    const queued = await queueOfflineTaskCreation(sessionToken, {
      ...user,
      userId: user.id,
      userName: user.name,
      content: "Réviser le dossier",
      assigneeId: null
    });

    await queueOfflineTaskStatus(user.id, sessionToken, queued.id, "in_progress");

    const state = await readPrivateTaskOfflineState(user.id, sessionToken);
    expect(state.tasks[0]?.status).toBe("in_progress");
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0]).toMatchObject({
      type: "create",
      tempTaskId: queued.id,
      status: "in_progress"
    });
  });

  it("cancels an unsynchronized creation when it is deleted offline", async () => {
    const queued = await queueOfflineTaskCreation(sessionToken, {
      ...user,
      userId: user.id,
      userName: user.name,
      content: "Tâche temporaire",
      assigneeId: null
    });

    await queueOfflineTaskDeletion(user.id, sessionToken, queued.id);

    const state = await readPrivateTaskOfflineState(user.id, sessionToken);
    expect(state.tasks).toEqual([]);
    expect(state.outbox).toEqual([]);
  });

  it("queues a confidential transfer without adding it to the sender list", async () => {
    await queueOfflineTaskCreation(sessionToken, {
      ...user,
      userId: user.id,
      userName: user.name,
      content: "À transmettre",
      assigneeId: "user-2"
    });

    const state = await readPrivateTaskOfflineState(user.id, sessionToken);
    expect(state.tasks).toEqual([]);
    expect(state.outbox[0]).toMatchObject({
      type: "create",
      assigneeId: "user-2",
      content: "À transmettre"
    });
  });
});
