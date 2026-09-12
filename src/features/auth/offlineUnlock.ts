const OFFLINE_UNLOCK_KEY_PREFIX = "contribution_offline_unlock_v1:";
const PBKDF2_ITERATIONS = 210_000;
const DERIVED_KEY_BYTES = 32;

type StoredOfflineCredential = {
  version: 1;
  salt: string;
  hash: string;
  iterations: number;
};

function credentialKey(userId: string): string {
  return `${OFFLINE_UNLOCK_KEY_PREFIX}${userId}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt),
      iterations
    },
    passwordKey,
    DERIVED_KEY_BYTES * 8
  );
  return new Uint8Array(bits);
}

function hashesMatch(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

/** Saves a one-way password verifier after the server has authenticated the user. */
export async function saveOfflineUnlockCredential(
  userId: string,
  password: string
): Promise<void> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);
    const credential: StoredOfflineCredential = {
      version: 1,
      salt: bytesToBase64(salt),
      hash: bytesToBase64(hash),
      iterations: PBKDF2_ITERATIONS
    };
    localStorage.setItem(credentialKey(userId), JSON.stringify(credential));
  } catch (error) {
    // Authentication must remain available if storage or Web Crypto is disabled.
    console.warn("Offline unlock could not be enabled:", error);
  }
}

export async function verifyOfflineUnlockCredential(
  userId: string,
  password: string
): Promise<boolean | null> {
  try {
    const raw = localStorage.getItem(credentialKey(userId));
    if (!raw) return null;
    const credential = JSON.parse(raw) as Partial<StoredOfflineCredential>;
    if (
      credential.version !== 1 ||
      typeof credential.salt !== "string" ||
      typeof credential.hash !== "string" ||
      typeof credential.iterations !== "number" ||
      credential.iterations < 100_000
    ) {
      return null;
    }
    const actual = await derivePasswordHash(
      password,
      base64ToBytes(credential.salt),
      credential.iterations
    );
    return hashesMatch(actual, base64ToBytes(credential.hash));
  } catch {
    return null;
  }
}

export function clearOfflineUnlockCredential(userId: string): void {
  try {
    localStorage.removeItem(credentialKey(userId));
  } catch {
    // Ignore storage errors during logout.
  }
}

export function isNetworkAuthenticationError(error: unknown): boolean {
  const details = error && typeof error === "object"
    ? error as { message?: unknown; details?: unknown }
    : null;
  const message = [details?.message, details?.details, error instanceof Error ? error.message : ""]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return /failed to fetch|network(?:error| request)?|load failed|fetch failed|offline|internet|connection/i.test(message);
}
