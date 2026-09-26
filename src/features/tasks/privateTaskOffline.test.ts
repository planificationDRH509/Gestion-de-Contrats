import { beforeEach, describe, expect, it, vi } from "vitest";

const offlineStorage = vi.hoisted(() => new Map<string, unknown>());

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => offlineStorage.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    offlineStorage.set(key, value);
  }),
  update: vi.fn(async (key: string, fn: (value: unknown) => unknown) => { offlineStorage.set(key, fn(offlineStorage.get(key))); }),
  del: vi.fn(async (key: string) => {
    offlineStorage.delete(key);
  })
}));

import {
  queueOfflineTaskCreation,
  queueOfflineTaskDeletion,
  queueOfflineTaskStatus,
  readPrivateTaskOfflineState,
  clearPrivateTaskOfflineData,
  preparePrivateTaskSession,
  claimPrivateTaskOperation,
  completePrivateTaskOfflineOperation
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

  it("retains unsent work across logout and a new session token", async () => {
    await queueOfflineTaskCreation(sessionToken, { userId: user.id, userName: user.name,
      username: user.username, content: "À conserver", assigneeId: null });
    await clearPrivateTaskOfflineData(user.id, sessionToken);
    const restored = await readPrivateTaskOfflineState(user.id, "a-new-session");
    expect(restored.outbox).toHaveLength(1);
    expect(restored.tasks[0].content).toBe("À conserver");
  });

  it("migrates a valid legacy session-encrypted cache before token renewal", async () => {
    await queueOfflineTaskCreation(sessionToken, { userId: user.id, userName: user.name,
      username: user.username, content: "Legacy pending work", assigneeId: null });
    const state = await readPrivateTaskOfflineState(user.id, sessionToken);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`private-tasks:${sessionToken}`));
    const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(state)));
    offlineStorage.set(`private-task-cache:${user.id}`, { version: 1, iv, ciphertext });
    await preparePrivateTaskSession(user.id, sessionToken);
    expect((await readPrivateTaskOfflineState(user.id, "renewed-token")).outbox).toEqual(state.outbox);
    expect(offlineStorage.get(`private-task-cache:${user.id}`)).toMatchObject({ version: 2 });
  });

  it("never substitutes an empty state for an unreadable cache", async () => {
    offlineStorage.set(`private-task-cache:${user.id}`, { version: 1, iv: new Uint8Array(12), ciphertext: new ArrayBuffer(8) });
    await expect(queueOfflineTaskCreation(sessionToken, { userId: user.id, userName: user.name,
      username: user.username, content: "New", assigneeId: null })).rejects.toThrow(/préservé/);
    expect(offlineStorage.get(`private-task-cache:${user.id}`)).toMatchObject({ version: 1 });
  });

  it("keeps a deletion made while creation is awaiting its acknowledgement", async () => {
    const task = await queueOfflineTaskCreation(sessionToken, { userId: user.id, userName: user.name,
      username: user.username, content: "In flight", assigneeId: null });
    const operation = await claimPrivateTaskOperation(user.id, sessionToken);
    await queueOfflineTaskDeletion(user.id, sessionToken, task.id);
    expect((await readPrivateTaskOfflineState(user.id, sessionToken)).outbox).toHaveLength(2);
    await completePrivateTaskOfflineOperation(user.id, sessionToken, operation!.id, { tempTaskId: task.id, remoteTaskId: "server-id" });
    expect((await readPrivateTaskOfflineState(user.id, sessionToken)).outbox).toMatchObject([{ type: "delete", taskId: "server-id" }]);
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
