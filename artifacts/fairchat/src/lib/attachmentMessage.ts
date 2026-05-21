import { apiUrl } from "./apiConfig";
import {
  decryptFileBytes,
  encryptFileBytes,
  encryptMessage,
  getCachedPrivateKey,
  isEncryptedFileBlob,
} from "./crypto";

export interface AttachmentPayload {
  url: string;
  name: string;
  type: string;
  size: number;
  caption?: string;
  /** When true, the blob at `url` is an e1f: ciphertext (decrypt after download). */
  fileEncrypted?: boolean;
}

const DECRYPT_ERR = "[Ошибка дешифрации: нешифрованный или некорректный формат сообщения]";

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export function tryParseAttachmentPayload(raw: string | undefined | null): AttachmentPayload | null {
  if (!raw || raw === DECRYPT_ERR) return null;
  try {
    const p = JSON.parse(raw) as unknown;
    if (p && typeof p === "object" && !Array.isArray(p)) {
      const o = p as Record<string, unknown>;
      if (typeof o.url === "string" && o.url.startsWith("/api/uploads/")) {
        return {
          url: o.url,
          name: typeof o.name === "string" ? o.name : "file",
          type: typeof o.type === "string" ? o.type : "application/octet-stream",
          size: typeof o.size === "number" ? o.size : 0,
          caption: typeof o.caption === "string" ? o.caption : undefined,
          fileEncrypted: o.fileEncrypted === true,
        };
      }
    }
  } catch {
    /* not JSON */
  }
  return null;
}

export function encryptAttachmentPayload(
  payload: AttachmentPayload,
  recipientPublicKey: string,
  myPrivateKey?: string | null,
): string | null {
  const priv = myPrivateKey ?? getCachedPrivateKey();
  if (!priv || !recipientPublicKey) return null;
  try {
    return encryptMessage(JSON.stringify(payload), recipientPublicKey, priv);
  } catch {
    return null;
  }
}

export type MessageAttachmentFields = {
  decrypted?: string;
  encryptedContent?: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
};

/** E2E payload in decrypted content, legacy plaintext JSON in encrypted_content, or DB attachment columns. */
export function getMessageAttachment(msg: MessageAttachmentFields): AttachmentPayload | null {
  for (const field of [msg.decrypted, msg.encryptedContent]) {
    const p = tryParseAttachmentPayload(field);
    if (p) return p;
  }
  if (msg.attachmentUrl?.startsWith("/api/uploads/")) {
    return {
      url: msg.attachmentUrl,
      name: msg.attachmentName ?? "file",
      type: msg.attachmentType ?? "application/octet-stream",
      size: msg.attachmentSize ?? 0,
    };
  }
  return null;
}

export function getMessageCaption(msg: MessageAttachmentFields): string {
  const att = getMessageAttachment(msg);
  if (att?.caption?.trim()) return att.caption.trim();
  const d = msg.decrypted?.trim();
  if (!d || d === DECRYPT_ERR) return "";
  if (tryParseAttachmentPayload(d)) return "";
  return d;
}

/** Upload path with optional E2E file encryption (new uploads). */
export async function uploadEncryptedFile(
  file: File | Blob,
  recipientPublicKey: string,
  myPrivateKey?: string | null,
  originalName?: string,
): Promise<{ url: string; name: string; type: string; size: number; fileEncrypted: boolean } | null> {
  const priv = myPrivateKey ?? getCachedPrivateKey();
  if (!priv || !recipientPublicKey) return null;
  try {
    const raw = new Uint8Array(await file.arrayBuffer());
    const encrypted = encryptFileBytes(raw, recipientPublicKey, priv);
    const blob = new Blob([toArrayBuffer(encrypted)], { type: "application/octet-stream" });
    const fd = new FormData();
    fd.append("file", blob, (originalName ?? "file.bin") + ".enc");
    fd.append("encrypted", "1");
    const res = await fetch(apiUrl("/api/upload"), {
      method: "POST",
      credentials: "include",
      headers: { "X-Requested-With": "FairChat" },
      body: fd,
    });
    if (!res.ok) {
      console.error("[uploadEncryptedFile] HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json() as { url: string; name: string; type: string; size: number };
    return { ...data, fileEncrypted: true };
  } catch (e) {
    console.error("[uploadEncryptedFile]", e);
    return null;
  }
}

export type FetchAttachmentResult =
  | { ok: true; blobUrl: string; mimeType: string }
  | { ok: false; error: string };

/**
 * Download attachment with session cookie, decrypt file ciphertext if needed, return blob URL.
 */
export async function fetchAttachmentBlobUrl(
  att: AttachmentPayload,
  otherUserPubKeyB64: string | undefined | null,
  myPrivateKeyB64?: string | null,
): Promise<FetchAttachmentResult> {
  const priv = myPrivateKeyB64 ?? getCachedPrivateKey();
  try {
    const res = await fetch(apiUrl(att.url), { credentials: "include" });
    if (!res.ok) {
      console.error("[fetchAttachmentBlobUrl]", att.url, res.status);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const encryptedOnDisk = att.fileEncrypted || isEncryptedFileBlob(buf);
    let plain = buf;
    if (encryptedOnDisk) {
      if (!otherUserPubKeyB64 || !priv) {
        return { ok: false, error: "Missing keys for file decryption" };
      }
      try {
        plain = new Uint8Array(decryptFileBytes(buf, otherUserPubKeyB64, priv));
      } catch (e) {
        console.error("[fetchAttachmentBlobUrl] decrypt failed", e);
        return { ok: false, error: "Decrypt failed" };
      }
    }
    const mime = att.type || "application/octet-stream";
    const blob = new Blob([toArrayBuffer(plain)], { type: mime });
    return { ok: true, blobUrl: URL.createObjectURL(blob), mimeType: mime };
  } catch (e) {
    console.error("[fetchAttachmentBlobUrl]", e);
    return { ok: false, error: "Network error" };
  }
}

export function attachmentPreviewLabel(att: AttachmentPayload, caption?: string): string {
  const cap = caption?.trim();
  if (cap) return cap;
  if (att.type.startsWith("image/")) return "📷 Photo";
  if (att.type.startsWith("audio/")) return "🎤 Voice message";
  if (att.type.startsWith("video/")) return "🎬 Video";
  return `📎 ${att.name || "File"}`;
}
