import React from "react";
import { Lock, Zap } from "lucide-react";
import { G } from "./PaymentGlass";

export function ModeToggle({
  mode,
  setMode,
  disabled,
}: {
  mode: "send" | "request";
  setMode: (m: "send" | "request") => void;
  disabled: boolean;
}) {
  return (
    <div style={{ padding: "14px 16px 0" }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          background: "rgba(255,255,255,0.06)",
          border: "0.5px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          padding: 3,
          height: 38,
          boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.10)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 3,
            width: "calc(50% - 3px)",
            borderRadius: 11,
            background: G.grad,
            boxShadow: "0 2px 12px rgba(155,92,246,0.4), inset 0 0.5px 0 rgba(255,255,255,0.22)",
            transform: mode === "request" ? "translateX(100%)" : "translateX(0%)",
            opacity: mode === "request" ? 0 : 1,
            transition: "transform 0.22s cubic-bezier(0.34,1.1,0.64,1), opacity 0.16s ease",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 3,
            width: "calc(50% - 3px)",
            borderRadius: 11,
            background: "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)",
            boxShadow: "0 2px 12px rgba(245,158,11,0.35), inset 0 0.5px 0 rgba(255,255,255,0.22)",
            transform: mode === "request" ? "translateX(100%)" : "translateX(0%)",
            opacity: mode === "request" ? 1 : 0,
            transition: "transform 0.22s cubic-bezier(0.34,1.1,0.64,1), opacity 0.16s ease",
            pointerEvents: "none",
          }}
        />
        {(["send", "request"] as const).map((m) => (
          <button
            key={m}
            disabled={disabled}
            onClick={() => !disabled && setMode(m)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              fontSize: 13,
              fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer",
              color: mode === m ? "#fff" : G.textSec,
              position: "relative",
              zIndex: 1,
              opacity: disabled && mode !== m ? 0.4 : 1,
              transition: "color 0.18s ease, opacity 0.18s ease",
            }}
          >
            {m === "send" ? "Send" : "Request"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PrivacyToggle({
  paymentMode,
  setPaymentMode,
  disabled,
  onReset,
}: {
  paymentMode: "standard" | "confidential";
  setPaymentMode: (m: "standard" | "confidential") => void;
  disabled: boolean;
  onReset: () => void;
}) {
  const switchTo = (m: "standard" | "confidential") => {
    if (disabled) return;
    setPaymentMode(m);
    onReset();
  };

  return (
    <div style={{ padding: "8px 16px 0" }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${G.borderSub}`,
          borderRadius: 11,
          padding: 3,
          height: 32,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 3,
            width: "calc(50% - 3px)",
            borderRadius: 8,
            background: "rgba(255,255,255,0.14)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
            transform: paymentMode === "confidential" ? "translateX(100%)" : "translateX(0%)",
            opacity: paymentMode === "confidential" ? 0 : 1,
            transition: "transform 0.25s cubic-bezier(0.34,1.1,0.64,1), opacity 0.18s ease",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 3,
            width: "calc(50% - 3px)",
            borderRadius: 8,
            background: G.grad,
            boxShadow: "0 2px 10px rgba(155,92,246,0.35)",
            transform: paymentMode === "confidential" ? "translateX(100%)" : "translateX(0%)",
            opacity: paymentMode === "confidential" ? 1 : 0,
            transition: "transform 0.25s cubic-bezier(0.34,1.1,0.64,1), opacity 0.18s ease",
            pointerEvents: "none",
          }}
        />
        <button
          disabled={disabled}
          onClick={() => switchTo("standard")}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            color: paymentMode === "standard" ? G.text : G.textMuted,
            fontSize: 11,
            fontWeight: 700,
            cursor: disabled ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            position: "relative",
            zIndex: 1,
            opacity: disabled && paymentMode !== "standard" ? 0.4 : 1,
            transition: "color 0.2s ease, opacity 0.2s ease",
          }}
        >
          <Zap size={10} />
          Standard
        </button>
        <button
          disabled={disabled}
          onClick={() => switchTo("confidential")}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            color: paymentMode === "confidential" ? "#fff" : G.textMuted,
            fontSize: 11,
            fontWeight: 700,
            cursor: disabled ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            position: "relative",
            zIndex: 1,
            opacity: disabled && paymentMode !== "confidential" ? 0.4 : 1,
            transition: "color 0.2s ease, opacity 0.2s ease",
          }}
        >
          <Lock size={10} />
          Confidential
        </button>
      </div>
    </div>
  );
}
