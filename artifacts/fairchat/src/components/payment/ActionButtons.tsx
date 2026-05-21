import React from "react";
import { Lock, Wallet, Zap, CheckCircle2, ArrowUpRight } from "lucide-react";
import { G, GlassBtn } from "./PaymentGlass";

export function ActionButtons({
  mode,
  step,
  isAuthenticated,
  canSend,
  canRequest,
  paymentMode,
  tokenSymbol,
  onSend,
  onRequest,
  onLogin,
  onClose,
  onReset,
}: {
  mode: "send" | "request";
  step: string;
  isAuthenticated: boolean;
  canSend: boolean;
  canRequest: boolean;
  paymentMode: "standard" | "confidential";
  tokenSymbol: string;
  onSend: () => void;
  onRequest: () => void;
  onLogin: () => void;
  onClose: () => void;
  onReset: () => void;
}) {
  if (mode === "request") {
    return (
      <div style={{ padding: "14px 16px 22px", display: "flex", gap: 9 }}>
        <GlassBtn onClick={onClose} style={{ flex: 1, color: G.textSec }}>
          Cancel
        </GlassBtn>
        <button
          onClick={onRequest}
          disabled={!canRequest}
          className={canRequest ? "fc-btn-grad" : ""}
          style={
            {
              flex: 2,
              padding: "13px",
              borderRadius: G.radiusMd,
              background: canRequest
                ? "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)"
                : "rgba(255,255,255,0.04)",
              border: canRequest ? "none" : `1px solid ${G.borderSub}`,
              color: canRequest ? "#fff" : G.textMuted,
              fontSize: 14,
              fontWeight: 700,
              cursor: canRequest ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            } as React.CSSProperties
          }
        >
          <ArrowUpRight size={13} />
          Request Payment
        </button>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div style={{ padding: "14px 16px 22px", display: "flex", gap: 9 }}>
        <button
          onClick={onClose}
          className="fc-btn-grad"
          style={
            {
              flex: 1,
              padding: "13px",
              borderRadius: G.radiusMd,
              background: "rgba(74,222,128,0.18)",
              color: G.green,
              backdropFilter: G.blurPanel,
              border: `1px solid ${G.greenBorder}`,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
            } as React.CSSProperties
          }
        >
          <CheckCircle2 size={14} />
          Done {"\u00b7"} auto-closing{"\u2026"}
        </button>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div style={{ padding: "14px 16px 22px", display: "flex", gap: 9 }}>
        <GlassBtn onClick={onReset} style={{ flex: 1 }}>
          Try again
        </GlassBtn>
        <GlassBtn onClick={onClose} style={{ flex: 1, color: G.textSec }}>
          Close
        </GlassBtn>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: "14px 16px 22px", display: "flex", gap: 9 }}>
        <button
          onClick={onLogin}
          className="fc-btn-grad"
          style={{
            flex: 1,
            padding: "13px",
            borderRadius: G.radiusMd,
            border: "none",
            background: G.grad,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Wallet size={14} />
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 16px 22px", display: "flex", gap: 9 }}>
      <GlassBtn onClick={onClose} style={{ flex: 1, color: G.textSec }}>
        Cancel
      </GlassBtn>
      <button
        onClick={onSend}
        disabled={!canSend}
        className={canSend ? "fc-btn-grad" : ""}
        style={
          {
            flex: 2,
            padding: "13px",
            borderRadius: G.radiusMd,
            background: canSend ? G.grad : "rgba(255,255,255,0.04)",
            border: canSend ? "none" : `1px solid ${G.borderSub}`,
            color: canSend ? "#fff" : G.textMuted,
            fontSize: 14,
            fontWeight: 700,
            cursor: canSend ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          } as React.CSSProperties
        }
      >
        {paymentMode === "confidential" ? <Lock size={13} /> : <Zap size={13} />}
        {paymentMode === "confidential" ? "Send Confidential" : `Send ${tokenSymbol}`}
      </button>
    </div>
  );
}
