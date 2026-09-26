import { get, update } from "idb-keyval";

export type SealedValue = { encrypted: 1; iv: Uint8Array; ciphertext: ArrayBuffer };
const KEY = "contribution-device-key-v1";

let pendingKey: Promise<CryptoKey> | null = null;
function deviceKey(): Promise<CryptoKey> {
  return pendingKey ??= loadDeviceKey().finally(() => { pendingKey = null; });
}

async function loadDeviceKey(): Promise<CryptoKey> {
  const stored = await get<CryptoKey>(KEY);
  if (stored) return stored;
  const generated = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  // IndexedDB serializes the updater, so two tabs cannot replace each other's key.
  await update<CryptoKey>(KEY, current => current ?? generated);
  return (await get<CryptoKey>(KEY))!;
}

export async function sealLocalValue(value: unknown): Promise<SealedValue> {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { encrypted: 1, iv, ciphertext };
}

export async function openLocalValue<T>(value: SealedValue | T): Promise<T> {
  if (!value || typeof value !== "object" || !("encrypted" in value) || value.encrypted !== 1) return value as T;
  const envelope = value as SealedValue;
  const key = await get<CryptoKey>(KEY);
  if (!key) throw new Error("Clé du cache local introuvable. Les données ont été conservées.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(envelope.iv) }, key, envelope.ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
