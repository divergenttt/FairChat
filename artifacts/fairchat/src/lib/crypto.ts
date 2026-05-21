import _sodium from "libsodium-wrappers";
import { idbGet, idbSet, idbDel, IDB_KEYS } from "./idb";

export const PRIVATE_KEY_STORAGE = "fairchat_sk";
export const PUBLIC_KEY_STORAGE  = "fairchat_pk";

// In-memory cache so that synchronous callers (encrypt/decrypt inside event handlers)
// can read the key without awaiting IndexedDB on every operation. Populated by
// loadPrivateKey() at app start (chat.tsx) and by setPrivateKey() at login/register.
let PK_CACHE: string | null = null;

export function getCachedPrivateKey(): string | null {
  return PK_CACHE;
}

/**
 * Read the private key from IndexedDB (preferred). If it's still in localStorage
 * from a previous version, migrate it to IndexedDB and wipe the localStorage copy.
 * Caches the value in memory for subsequent synchronous access.
 */
export async function loadPrivateKey(userId?: string): Promise<string | null> {
  if (PK_CACHE) return PK_CACHE;

  const userKeyName = userId ? `${PRIVATE_KEY_STORAGE}_${userId}` : null;

  const fromIdb =
    (userKeyName ? await idbGet<string>(IDB_KEYS, userKeyName) : null) ??
    (await idbGet<string>(IDB_KEYS, PRIVATE_KEY_STORAGE));
  if (fromIdb) {
    PK_CACHE = fromIdb;
    return fromIdb;
  }

  // Legacy migration: pull out of localStorage, persist to IDB, scrub localStorage.
  const legacy =
    (userKeyName ? localStorage.getItem(userKeyName) : null) ??
    localStorage.getItem(PRIVATE_KEY_STORAGE);
  if (legacy) {
    PK_CACHE = legacy;
    await idbSet(IDB_KEYS, PRIVATE_KEY_STORAGE, legacy);
    if (userKeyName) await idbSet(IDB_KEYS, userKeyName, legacy);
    localStorage.removeItem(PRIVATE_KEY_STORAGE);
    if (userKeyName) localStorage.removeItem(userKeyName);
  }
  return PK_CACHE;
}

export async function setPrivateKey(privKey: string, userId?: string): Promise<void> {
  PK_CACHE = privKey;
  await idbSet(IDB_KEYS, PRIVATE_KEY_STORAGE, privKey);
  if (userId) await idbSet(IDB_KEYS, `${PRIVATE_KEY_STORAGE}_${userId}`, privKey);
  // Remove any stale plaintext copies left over from older builds.
  localStorage.removeItem(PRIVATE_KEY_STORAGE);
  if (userId) localStorage.removeItem(`${PRIVATE_KEY_STORAGE}_${userId}`);
}

export async function clearPrivateKey(userId?: string): Promise<void> {
  PK_CACHE = null;
  await idbDel(IDB_KEYS, PRIVATE_KEY_STORAGE);
  if (userId) await idbDel(IDB_KEYS, `${PRIVATE_KEY_STORAGE}_${userId}`);
  localStorage.removeItem(PRIVATE_KEY_STORAGE);
  if (userId) localStorage.removeItem(`${PRIVATE_KEY_STORAGE}_${userId}`);
}

let sodium: typeof _sodium | null = null;

export async function initSodium(): Promise<typeof _sodium> {
  if (sodium) return sodium;
  await _sodium.ready;
  sodium = _sodium;
  return sodium;
}

function b64(bytes: Uint8Array): string {
  return sodium!.to_base64(bytes, sodium!.base64_variants.URLSAFE_NO_PADDING);
}
function fromb64(s: string): Uint8Array {
  return sodium!.from_base64(s, sodium!.base64_variants.URLSAFE_NO_PADDING);
}

export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const s = await initSodium();
  const kp = s.crypto_box_keypair();
  return { publicKey: b64(kp.publicKey), privateKey: b64(kp.privateKey) };
}

/** Derive the X25519 public key from a private key (URL-safe base64). */
export function derivePublicKey(privKeyB64: string): string {
  const s = sodium!;
  const sk = s.from_base64(privKeyB64, s.base64_variants.URLSAFE_NO_PADDING);
  const pk = s.crypto_scalarmult_base(sk);
  return s.to_base64(pk, s.base64_variants.URLSAFE_NO_PADDING);
}

/** Returns true if a string is a valid URL-safe base64 libsodium key of the expected byte length. */
export function isValidKey(keyB64: string, expectedBytes: number): boolean {
  try {
    const s = sodium!;
    const bytes = s.from_base64(keyB64, s.base64_variants.URLSAFE_NO_PADDING);
    return bytes.length === expectedBytes;
  } catch {
    return false;
  }
}

/**
 * Derive a deterministic recovery token from the seed phrase.
 * Uses a DIFFERENT salt than keypairFromSeedWords so the recovery token
 * is independent from the encryption key — never exposed in API responses.
 * Returns a 64-char hex string (256 bits of PBKDF2 entropy).
 */
export async function recoveryHashFromSeedWords(words: string[]): Promise<string> {
  const phrase = words.map(w => w.trim().toLowerCase()).join(" ");
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(phrase), "PBKDF2", false, ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode("fairchat-recovery-v1"), iterations: 100_000, hash: "SHA-256" },
    keyMaterial, 256,
  );
  return Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function keypairFromSeedWords(
  words: string[],
): Promise<{ publicKey: string; privateKey: string }> {
  const s = await initSodium();
  const phrase = words.map(w => w.trim().toLowerCase()).join(" ");
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(phrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode("fairchat-seed-v1"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  const seed = new Uint8Array(derivedBits);
  const kp = s.crypto_box_seed_keypair(seed);
  return { publicKey: b64(kp.publicKey), privateKey: b64(kp.privateKey) };
}

export function encryptMessage(
  text: string,
  recipientPubKeyB64: string,
  myPrivKeyB64: string,
): string {
  if (!sodium) throw new Error("Encryption failed — crypto not initialized");
  if (!recipientPubKeyB64 || !myPrivKeyB64) throw new Error("Encryption failed — missing keys");
  try {
    const s = sodium;
    const nonce = s.randombytes_buf(s.crypto_box_NONCEBYTES);
    const ct    = s.crypto_box_easy(
      s.from_string(text),
      nonce,
      fromb64(recipientPubKeyB64),
      fromb64(myPrivKeyB64),
    );
    const combined = new Uint8Array(nonce.length + ct.length);
    combined.set(nonce);
    combined.set(ct, nonce.length);
    return "e1:" + b64(combined);
  } catch (err) {
    throw new Error("Encryption failed — message not sent");
  }
}

const DECRYPT_FORMAT_ERROR =
  "[Ошибка дешифрации: нешифрованный или некорректный формат сообщения]";

export function decryptMessage(
  encrypted: string,
  otherUserPubKeyB64?: string,
  myPrivKeyB64?: string,
): string {
  if (!encrypted.startsWith("e1:")) {
    return DECRYPT_FORMAT_ERROR;
  }
  if (!otherUserPubKeyB64 || !myPrivKeyB64) {
    return DECRYPT_FORMAT_ERROR;
  }
  try {
    const s = sodium!;
    const combined = fromb64(encrypted.slice(3));
    const nonce = combined.slice(0, s.crypto_box_NONCEBYTES);
    const ct = combined.slice(s.crypto_box_NONCEBYTES);
    const plain = s.crypto_box_open_easy(
      ct,
      nonce,
      fromb64(otherUserPubKeyB64),
      fromb64(myPrivKeyB64),
    );
    return s.to_string(plain);
  } catch {
    return DECRYPT_FORMAT_ERROR;
  }
}
