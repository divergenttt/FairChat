import React from "react";
import { Wallet, LogOut } from "lucide-react";
import { G, GlassPanel } from "./PaymentGlass";

export function WalletBar({
  walletAddress,
  balance,
  tokenSymbol,
  onLogout,
}: {
  walletAddress: string;
  balance: string;
  tokenSymbol: string;
  onLogout: () => void;
}) {
  return (
    <div style={{ padding: "12px 16px 0" }}>
      <GlassPanel
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: G.greenBg,
          border: `1px solid ${G.greenBorder}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Wallet size={12} color={G.green} />
          <span
            style={{ fontSize: 11, fontWeight: 600, color: G.green, fontFamily: "monospace" }}
          >
            {walletAddress.slice(0, 6)}{"\u2026"}{walletAddress.slice(-4)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: G.green }}>
            {(isNaN(parseFloat(balance)) ? 0 : parseFloat(balance)).toFixed(2)} {tokenSymbol}
          </span>
          <button
            onClick={onLogout}
            title="Disconnect"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: G.textMuted,
              display: "flex",
              padding: 2,
              borderRadius: 6,
            }}
          >
            <LogOut size={11} />
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}
