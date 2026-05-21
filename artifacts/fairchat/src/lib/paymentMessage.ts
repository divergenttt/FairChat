import { decryptMessage, encryptMessage, getCachedPrivateKey } from "./crypto";

export interface PaymentPayload {
  amount?: string;
  token?: string;
  network?: string;
  networkId?: string;
  txHash?: string;
  explorerUrl?: string | null;
  mode?: string;
  memo?: string;
  address?: string;
  requestId?: string;
}

const DECRYPT_ERR = "[Ошибка дешифрации: нешифрованный или некорректный формат сообщения]";

export function tryParsePaymentPayload(decrypted: string | undefined | null): PaymentPayload | null {
  if (!decrypted || decrypted === DECRYPT_ERR) return null;
  try {
    const p = JSON.parse(decrypted) as unknown;
    if (p && typeof p === "object" && !Array.isArray(p)) return p as PaymentPayload;
  } catch {
    /* not JSON */
  }
  return null;
}

export function encryptPaymentPayload(
  payload: PaymentPayload,
  recipientPublicKey: string | undefined | null,
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

export interface PaymentHistoryRow {
  encryptedContent: string;
  partnerPublicKey?: string | null;
}

export function decryptPaymentHistoryContent(
  row: PaymentHistoryRow,
  myPrivateKey?: string | null,
): string | null {
  const priv = myPrivateKey ?? getCachedPrivateKey();
  const pk = row.partnerPublicKey;
  if (!priv || !pk) return null;
  const plain = decryptMessage(row.encryptedContent, pk, priv);
  return tryParsePaymentPayload(plain) ? plain : null;
}

export function parsePaymentHistoryEntry<T extends PaymentHistoryRow>(
  entry: T,
  myPrivateKey?: string | null,
): T & { parsed?: PaymentPayload } {
  const plain = decryptPaymentHistoryContent(entry, myPrivateKey);
  let parsed: PaymentPayload | undefined;
  if (plain) {
    parsed = tryParsePaymentPayload(plain) ?? undefined;
    if (parsed?.networkId === "arc-confidential") {
      parsed = { ...parsed, networkId: "arc" };
    }
  }
  return { ...entry, parsed };
}
