import { decryptMessage, encryptMessage, getCachedPrivateKey } from "./crypto";

export interface AttachmentPayload {
  url: string;
  name: string;
  type: string;
  size: number;
  caption?: string;
}

const DECRYPT_ERR = "[Ошибка дешифрации: нешифрованный или некорректный формат сообщения]";

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

export function attachmentPreviewLabel(att: AttachmentPayload, caption?: string): string {
  const cap = caption?.trim();
  if (cap) return cap;
  if (att.type.startsWith("image/")) return "📷 Photo";
  if (att.type.startsWith("audio/")) return "🎤 Voice message";
  if (att.type.startsWith("video/")) return "🎬 Video";
  return `📎 ${att.name || "File"}`;
}
