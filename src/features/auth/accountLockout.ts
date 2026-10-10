export const PASSWORD_ATTEMPT_LIMIT = 8;
export const ACCOUNT_SUSPENDED_MESSAGE = "Compte suspendu. Réactivation par un administrateur et connexion Internet requises.";
const PREFIX = "contribution_account_lockout_v1:";
export const LOCKOUT_CHANGED_EVENT = "contribution-account-lockout";

type Lockout = { failures: number; suspended: boolean; pending: boolean; token?: string };

export function readAccountLockout(userId: string): Lockout {
  const raw = localStorage.getItem(PREFIX + userId);
  if (!raw) return { failures: 0, suspended: false, pending: false };
  try {
    const state = JSON.parse(raw) as Lockout;
    if (!Number.isInteger(state.failures) || state.failures < 0 || state.failures > 8 ||
      typeof state.suspended !== "boolean" || typeof state.pending !== "boolean") throw new Error("Invalid lockout");
    return state;
  } catch {
    return { failures: 8, suspended: true, pending: false };
  }
}

function write(userId: string, value: Lockout) {
  // Do not permit offline authentication when its security state cannot persist.
  localStorage.setItem(PREFIX + userId, JSON.stringify(value));
  window.dispatchEvent(new Event(LOCKOUT_CHANGED_EVENT));
}

export function recordPasswordFailure(userId: string, token?: string, serverFailures = 0): Lockout {
  const current = readAccountLockout(userId);
  const failures = Math.min(PASSWORD_ATTEMPT_LIMIT, Math.max(current.failures + 1, serverFailures));
  const next = { ...current, failures, suspended: current.suspended || failures >= PASSWORD_ATTEMPT_LIMIT,
    pending: current.pending || failures >= PASSWORD_ATTEMPT_LIMIT, token: current.token ?? token };
  write(userId, next);
  return next;
}

export function recordOfflineSuccess(userId: string) {
  const current = readAccountLockout(userId);
  if (current.suspended) return false;
  write(userId, { ...current, failures: 0 });
  return true;
}

export function recordOnlineSuccess(userId: string, token: string) {
  const current = readAccountLockout(userId);
  // An unreported suspension may never be erased by a concurrent login.
  if (current.pending) return false;
  write(userId, { failures: 0, suspended: false, pending: false, token });
  return true;
}

export function recordServerSuspension(userId: string) {
  write(userId, { ...readAccountLockout(userId), suspended: true });
}

export function pendingAccountSuspensions() {
  return Object.keys(localStorage).filter((key) => key.startsWith(PREFIX)).flatMap((key) => {
    const userId = key.slice(PREFIX.length);
    const state = readAccountLockout(userId);
    return state.pending ? [{ userId, ...state }] : [];
  });
}

export function acknowledgeAccountSuspension(userId: string, token: string) {
  const current = readAccountLockout(userId);
  if (current.token === token) write(userId, { ...current, pending: false });
}
