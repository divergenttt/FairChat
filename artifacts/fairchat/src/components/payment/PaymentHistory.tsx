import React from "react";
import { Loader2, ExternalLink, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { G } from "./PaymentGlass";

export interface TxHistoryEntry {
  id: string;
  messageType: "payment" | "payment_request";
  encryptedContent: string;
  createdAt: string;
  isSent: boolean;
  partnerName: string;
  parsed?: {
    amount?: string;
    token?: string;
    network?: string;
    networkId?: string;
    txHash?: string;
    explorerUrl?: string | null;
  };
}

export function PaymentHistory({
  txHistory,
  txLoading,
}: {
  txHistory: TxHistoryEntry[];
  txLoading: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: G.textMuted,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        Transaction History
      </div>
      {txLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
          <Loader2
            size={20}
            color={G.textMuted}
            style={{ animation: "spin 1s linear infinite" }}
          />
        </div>
      ) : txHistory.length === 0 ? (
        <div
          style={{ textAlign: "center", padding: "40px 0", color: G.textMuted, fontSize: 13 }}
        >
          No transactions yet
        </div>
      ) : (
        txHistory.map((tx) => {
          const isSend = tx.messageType === "payment" && tx.isSent;
          const isRequest = tx.messageType === "payment_request";
          const explorerLink =
            tx.parsed?.explorerUrl && tx.parsed?.txHash
              ? `${tx.parsed.explorerUrl.replace(/\/$/, "")}/tx/${tx.parsed.txHash}`
              : null;
          return (
            <div
              key={tx.id}
              style={{
                borderRadius: 14,
                padding: "11px 14px",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${G.borderSub}`,
                display: "flex",
                alignItems: "center",
                gap: 11,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: isRequest
                    ? "rgba(245,158,11,0.15)"
                    : isSend
                      ? "rgba(155,92,246,0.15)"
                      : "rgba(74,222,128,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isRequest ? (
                  <ArrowUpRight size={14} color="#F59E0B" />
                ) : isSend ? (
                  <ArrowUpRight size={14} color="#a78bfa" />
                ) : (
                  <ArrowDownLeft size={14} color="#4ade80" />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: G.text }}>
                    {tx.parsed?.amount ?? "?"} {tx.parsed?.token ?? "USDC"}
                  </span>
                  {isRequest && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 5,
                        background: "rgba(245,158,11,0.18)",
                        color: "#FCD34D",
                        border: "1px solid rgba(245,158,11,0.3)",
                      }}
                    >
                      REQUEST
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: G.textMuted, marginTop: 2 }}>
                  {isSend ? `\u2192 ${tx.partnerName}` : `\u2190 ${tx.partnerName}`}
                  {tx.parsed?.network && ` \u00b7 ${tx.parsed.network}`}
                </div>
                <div style={{ fontSize: 10, color: G.textMuted, marginTop: 1 }}>
                  {new Date(tx.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>
              {explorerLink && (
                <a
                  href={explorerLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    flexShrink: 0,
                    color: G.textMuted,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
