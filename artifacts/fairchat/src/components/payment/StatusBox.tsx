import React from "react";
import { CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { G, GlassPanel } from "./PaymentGlass";

export function StatusBox({
  step,
  txHash,
  error,
  explorerUrl,
  tokenSymbol,
  mode = "confidential",
}: {
  step: string;
  txHash: string | null;
  error: string | null;
  explorerUrl: string;
  tokenSymbol: string;
  mode?: "standard" | "confidential";
}) {
  const steps =
    mode === "confidential"
      ? [
          { key: "initializing", label: "Initializing confidential account\u2026" },
          { key: "depositing", label: `Depositing ${tokenSymbol} into encrypted layer\u2026` },
          { key: "transferring", label: "Sending confidential transfer\u2026" },
          { key: "done", label: "Transfer complete!" },
        ]
      : [
          { key: "transferring", label: `Sending ${tokenSymbol}\u2026` },
          { key: "done", label: "Transfer complete!" },
        ];

  if (step === "error") {
    return (
      <GlassPanel
        style={{
          padding: "12px 14px",
          background: G.redBg,
          border: `1px solid ${G.redBorder}`,
          display: "flex",
          alignItems: "flex-start",
          gap: 9,
        }}
      >
        <AlertCircle size={13} color={G.red} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12, color: G.red, lineHeight: 1.5 }}>
          {error ?? "Transaction failed"}
        </span>
      </GlassPanel>
    );
  }

  const isValidTxHash = (h: string | null): h is string => !!h && /^0x[0-9a-fA-F]{64}$/.test(h);

  if (step === "done") {
    return (
      <GlassPanel
        style={{
          padding: "12px 14px",
          background: G.greenBg,
          border: `1px solid ${G.greenBorder}`,
          display: "flex",
          flexDirection: "column",
          gap: 7,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={13} color={G.green} />
          <span style={{ fontSize: 12, fontWeight: 700, color: G.green }}>Transfer confirmed!</span>
        </div>
        {isValidTxHash(txHash) && (
          <a
            href={`${explorerUrl}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              color: G.textSec,
              display: "flex",
              alignItems: "center",
              gap: 4,
              textDecoration: "none",
            }}
          >
            View on Explorer <ExternalLink size={10} />
          </a>
        )}
      </GlassPanel>
    );
  }

  const currentIdx = steps.findIndex((s) => s.key === step);
  return (
    <GlassPanel style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
      {steps.map((s, i) => {
        const done = i < currentIdx || step === "done";
        const active = s.key === step;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            {done ? (
              <CheckCircle2 size={12} color={G.green} />
            ) : active ? (
              <Loader2
                size={12}
                color={G.text}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  border: `1.5px solid ${G.borderSub}`,
                }}
              />
            )}
            <span
              style={{
                fontSize: 12,
                color: done ? G.green : active ? G.text : G.textMuted,
                fontWeight: active ? 600 : 400,
              }}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </GlassPanel>
  );
}
