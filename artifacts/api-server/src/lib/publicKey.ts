/**
 * X25519 public key: 32 bytes as URL-safe base64 (43 chars, libsodium) or standard base64 (44 chars).
 */
const URL_SAFE_B64_32 = /^[A-Za-z0-9_-]{43}$/;
const STD_B64_32 = /^[A-Za-z0-9+/]{43}=$/;

function decodePublicKeyBytes(key: string): Uint8Array | null {
  const trimmed = key.trim();
  try {
    if (URL_SAFE_B64_32.test(trimmed)) {
      const bin = Buffer.from(trimmed.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      return bin.length === 32 ? new Uint8Array(bin) : null;
    }
    if (STD_B64_32.test(trimmed)) {
      const bin = Buffer.from(trimmed, "base64");
      return bin.length === 32 ? new Uint8Array(bin) : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function isValidPublicKey(publicKey: unknown): publicKey is string {
  if (typeof publicKey !== "string" || !publicKey.trim()) return false;
  const trimmed = publicKey.trim();
  if (trimmed.length !== 43 && trimmed.length !== 44) return false;
  return decodePublicKeyBytes(trimmed) !== null;
}

export function normalizePublicKey(publicKey: string): string {
  return publicKey.trim();
}
