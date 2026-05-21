import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/apiConfig";
import { X, ArrowUpRight, ArrowDownLeft, ExternalLink, ArrowUpFromLine, Clock } from "lucide-react";
import { useChatContext } from "./context";

interface TxEntry {
  id: string;
  messageType: "payment" | "payment_request";
  encryptedContent: string;
  createdAt: string;
  isSent: boolean;
  partnerId: string;
  partnerName: string;
  partnerUsername: string;
  parsed?: {
    amount?: string;
    token?: string;
    network?: string;
    txHash?: string;
    explorerUrl?: string | null;
  };
}

type Filter = "all" | "sent" | "received" | "requests";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function TransactionHistory() {
  const { T, dk, setShowTxHistory } = useChatContext();
  const [entries, setEntries] = useState<TxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    setLoading(true);
    fetch(apiUrl("/api/messages/payment-history"), { credentials: "include" })
      .then(r => r.json())
      .then((data: TxEntry[]) => {
        setEntries(
          data.map(e => {
            let parsed: TxEntry["parsed"] = {};
            try { parsed = JSON.parse(e.encryptedContent); } catch {}
            return { ...e, parsed };
          })
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = entries.filter(e => {
    if (filter === "sent")     return e.messageType === "payment" && e.isSent;
    if (filter === "received") return e.messageType === "payment" && !e.isSent;
    if (filter === "requests") return e.messageType === "payment_request";
    return true;
  });

  const pill = (f: Filter, label: string) => (
    <button
      onClick={() => setFilter(f)}
      style={{
        padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer",
        fontSize: 12, fontWeight: 600,
        background: filter === f ? "var(--fc-accent)" : (dk ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"),
        color: filter === f ? "#fff" : T.textSec,
        transition: "background 0.15s, color 0.15s",
      }}
    >{label}</button>
  );

  return (
    <div
      className="fc-fade-in"
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={() => setShowTxHistory(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 420, maxWidth: "95vw", maxHeight: "80vh",
          background: T.surface, borderRadius: 20,
          border: `1px solid ${T.border}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 18px 12px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>
              Transaction History
            </div>
            <div style={{ fontSize: 12, color: T.textSec, marginTop: 1 }}>
              Your payments &amp; requests
            </div>
          </div>
          <button
            onClick={() => setShowTxHistory(false)}
            style={{
              width: 30, height: 30, borderRadius: "50%", border: "none",
              background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: T.textSec,
            }}
          ><X size={14} /></button>
        </div>

        {/* Filters */}
        <div style={{ padding: "10px 18px", display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
          {pill("all",      "All")}
          {pill("sent",     "Sent")}
          {pill("received", "Received")}
          {pill("requests", "Requests")}
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1, padding: "0 10px 14px" }}>
          {loading && (
            <div style={{ textAlign: "center", color: T.textSec, fontSize: 13, paddingTop: 40 }}>
              Loading…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", color: T.textSec, fontSize: 13, paddingTop: 40 }}>
              No transactions found.
            </div>
          )}
          {!loading && filtered.map(e => {
            const isRequest = e.messageType === "payment_request";
            const explorerLink = !isRequest && e.parsed?.explorerUrl && e.parsed?.txHash
              ? `${e.parsed.explorerUrl.replace(/\/$/, "")}/tx/${e.parsed.txHash}`
              : null;

            return (
              <div key={e.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 8px", borderRadius: 12,
                borderBottom: `1px solid ${T.border}`,
              }}>
                {/* Icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isRequest
                    ? (dk ? "rgba(251,191,36,0.15)" : "rgba(251,191,36,0.12)")
                    : e.isSent
                      ? "rgba(130,90,255,0.15)"
                      : "rgba(74,222,128,0.12)",
                }}>
                  {isRequest
                    ? <ArrowUpFromLine size={14} style={{ color: "#F59E0B" }} />
                    : e.isSent
                      ? <ArrowUpRight size={14} style={{ color: "#8B5CF6" }} />
                      : <ArrowDownLeft size={14} style={{ color: "#4ADE80" }} />
                  }
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isRequest ? "Requested from" : e.isSent ? "Sent to" : "Received from"}{" "}
                      <span style={{ color: "var(--fc-accent)" }}>
                        {e.partnerName || e.partnerUsername}
                      </span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flexShrink: 0 }}>
                      {e.parsed?.amount ?? "?"} {e.parsed?.token ?? ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                    <Clock size={10} style={{ color: T.textSec, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: T.textSec }}>{fmtDate(e.createdAt)}</span>
                    {e.parsed?.network && (
                      <span style={{ fontSize: 11, color: T.textSec }}>· {e.parsed.network}</span>
                    )}
                    {explorerLink && e.parsed?.txHash && (
                      <a
                        href={explorerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={ev => ev.stopPropagation()}
                        style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--fc-accent)", fontSize: 11, textDecoration: "none" }}
                      >
                        <span style={{ fontFamily: "monospace" }}>
                          {e.parsed.txHash.slice(0, 6)}…{e.parsed.txHash.slice(-4)}
                        </span>
                        <ExternalLink size={10} />
                      </a>
                    )}
                    {isRequest && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 8,
                        background: dk ? "rgba(251,191,36,0.15)" : "rgba(251,191,36,0.15)",
                        color: "#F59E0B",
                      }}>Request</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
