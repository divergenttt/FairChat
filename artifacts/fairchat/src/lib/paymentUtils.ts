/** Dig out the real message from ethers.js error wrappers */
function unwrap(e: unknown): { msg: string; code?: number | string } {
  if (!(e instanceof Error)) return { msg: String(e) };

  // ethers.js wraps provider errors in e.info?.error or e.error
  const info = (e as { info?: { error?: { code?: number; message?: string } } }).info;
  if (info?.error?.message) return { msg: info.error.message, code: info.error.code };

  const inner = (e as { error?: { code?: number; message?: string } }).error;
  if (inner?.message) return { msg: inner.message, code: inner.code };

  // Some providers put code directly on the error
  const code = (e as { code?: number | string }).code;
  return { msg: e.message, code };
}

export function sanitizeError(e: unknown): string {
  const { msg, code } = unwrap(e);
  const raw = msg;

  // -32002: MetaMask already has a pending request (open MetaMask to confirm or reject it)
  if (code === -32002 || /already pending|already processing/i.test(raw)) {
    return "MetaMask has a pending request — open your wallet and confirm or reject it first";
  }

  // User cancelled
  if (code === 4001 || /user denied|user rejected|rejected the request/i.test(raw)) {
    return "Transaction rejected by user";
  }

  // RPC rate limit / "too many errors" / "could not coalesce"
  if (/too many (errors|requests)|rate.?limit|coalesce|retrying in/i.test(raw)) {
    return "RPC rate limit hit — please wait a moment and try again";
  }

  if (/insufficient funds/i.test(raw)) return "Insufficient funds for this transfer";

  // General network / connection error
  if (/network|fetch failed|connection|ECONNREFUSED|timeout/i.test(raw)) {
    return "Network error — please try again";
  }

  if (/nonce/i.test(raw)) return "Transaction nonce error — please try again";
  if (/gas/i.test(raw))   return "Gas estimation failed — check your balance";

  return raw.length > 140 ? raw.slice(0, 140) + "…" : raw;
}
