import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { NetworkConfig, TokenConfig, Balances } from "../../lib/paymentConfig";
import { NETWORKS } from "../../lib/paymentConfig";
import {
  GlassPanel,
  NetLogo,
  TokCircle,
  Badge,
  G,
  pillStyle,
  pillLabelStyle,
  NETWORK_ACCENT,
} from "./PaymentGlass";

interface SendCardProps {
  networkId: string;
  network: NetworkConfig;
  token: TokenConfig;
  amount: string;
  setAmount: (v: string) => void;
  memo: string;
  setMemo: (v: string) => void;
  setNetworkId: (id: string) => void;
  setTokenSymbol: (s: string) => void;
  balances: Balances;
  paymentMode: "standard" | "confidential";
  isAuthenticated: boolean;
  step: string;
  mode: "send" | "request";
}

export function SendCard({
  networkId,
  network,
  token,
  amount,
  setAmount,
  memo,
  setMemo,
  setNetworkId,
  setTokenSymbol,
  balances,
  paymentMode,
  isAuthenticated,
  step,
  mode,
}: SendCardProps) {
  const isReady = !network.comingSoon && !token.comingSoon;
  const tokenList = Object.values(network.tokens);

  const [showNetworkMenu, setShowNetworkMenu] = useState(false);
  const [showTokenMenu, setShowTokenMenu] = useState(false);
  const networkBtnRef = useRef<HTMLButtonElement>(null);
  const tokenBtnRef = useRef<HTMLButtonElement>(null);
  const [networkMenuRect, setNetworkMenuRect] = useState<DOMRect | null>(null);
  const [tokenMenuRect, setTokenMenuRect] = useState<DOMRect | null>(null);
  const [hoveredNetworkId, setHoveredNetworkId] = useState<string | null>(null);

  const closeMenus = () => {
    setShowNetworkMenu(false);
    setShowTokenMenu(false);
  };

  return (
    <>
      <div style={{ padding: "12px 16px 0" }} onClick={closeMenus}>
        <GlassPanel style={{ padding: "16px 16px 14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: G.textMuted,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
              }}
            >
              You send
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                ref={networkBtnRef}
                disabled={step !== "idle"}
                onClick={(e) => {
                  e.stopPropagation();
                  setNetworkMenuRect(networkBtnRef.current?.getBoundingClientRect() ?? null);
                  setShowNetworkMenu((v) => !v);
                  setShowTokenMenu(false);
                }}
                style={{
                  ...pillStyle,
                  opacity: step !== "idle" ? 0.45 : 1,
                  cursor: step !== "idle" ? "not-allowed" : "pointer",
                }}
              >
                <NetLogo networkId={network.id} size={22} />
                <span style={pillLabelStyle}>{network.name}</span>
                <ChevronDown size={13} color={G.textSec} />
              </button>
              <button
                ref={tokenBtnRef}
                disabled={step !== "idle"}
                onClick={(e) => {
                  e.stopPropagation();
                  setTokenMenuRect(tokenBtnRef.current?.getBoundingClientRect() ?? null);
                  setShowTokenMenu((v) => !v);
                  setShowNetworkMenu(false);
                }}
                style={{
                  ...pillStyle,
                  opacity: step !== "idle" ? 0.45 : 1,
                  cursor: step !== "idle" ? "not-allowed" : "pointer",
                }}
              >
                <TokCircle symbol={token.symbol} size={22} />
                <span style={pillLabelStyle}>{token.symbol}</span>
                <ChevronDown size={13} color={G.textSec} />
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                const v = e.target.value;
                if (/^[\d]*\.?[\d]*$/.test(v)) setAmount(v);
              }}
              disabled={
                mode === "send" ? !isAuthenticated || step !== "idle" || !isReady : step !== "idle"
              }
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                fontSize: 42,
                fontWeight: 700,
                color: G.text,
                cursor:
                  mode === "send" && (!isAuthenticated || !isReady) ? "not-allowed" : "text",
                opacity: mode === "send" && (!isAuthenticated || !isReady) ? 0.2 : 1,
                minWidth: 0,
                letterSpacing: "-0.04em",
              }}
            />
          </div>

          {(() => {
            const displayBal =
              paymentMode === "confidential" ? balances.confidential : balances.public;
            const gwBal = parseFloat(displayBal) || 0;
            const hasBalance = gwBal > 0;
            return (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 10,
                }}
              >
                <span style={{ fontSize: 11, color: G.textMuted }}>
                  Balance:{" "}
                  <span style={{ color: G.textSec, fontWeight: 600 }}>
                    {gwBal.toFixed(2)} {token.symbol}
                  </span>
                </span>
                {isAuthenticated && hasBalance && (
                  <button
                    onClick={() => {
                      setAmount(
                        isNaN(gwBal) ? "0" : gwBal.toFixed(token.decimals).replace(/\.?0+$/, ""),
                      );
                    }}
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#c4b5fd",
                      background: "rgba(155,92,246,0.15)",
                      border: "1px solid rgba(155,92,246,0.3)",
                      padding: "2px 8px",
                      borderRadius: 6,
                      cursor: "pointer",
                      letterSpacing: "0.04em",
                    }}
                  >
                    MAX
                  </button>
                )}
              </div>
            );
          })()}

          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 11px",
              borderRadius: G.radiusSm,
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${G.borderSub}`,
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>{"\u270f\ufe0f"}</span>
            <input
              type="text"
              placeholder="Add a note (optional)"
              value={memo}
              onChange={(e) => setMemo(e.target.value.slice(0, 80))}
              maxLength={80}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                color: G.text,
                fontSize: 12,
                fontFamily: "inherit",
              }}
            />
            {memo && (
              <span style={{ fontSize: 10, color: G.textMuted, flexShrink: 0 }}>
                {memo.length}/80
              </span>
            )}
          </div>

          {(network.comingSoon || token.comingSoon) && (
            <div
              style={{
                marginTop: 12,
                padding: "8px 11px",
                borderRadius: G.radiusSm,
                background: G.orangeBg,
                border: `1px solid ${G.orangeBorder}`,
                fontSize: 11,
                color: G.orange,
                lineHeight: 1.5,
              }}
            >
              {network.comingSoon
                ? `${network.name} is coming soon \u2014 Base Sepolia is active.`
                : `${token.symbol} is coming soon \u2014 only USDC is supported.`}
            </div>
          )}
        </GlassPanel>
      </div>

      {showNetworkMenu &&
        networkMenuRect &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: networkMenuRect.bottom + 6,
              right: window.innerWidth - networkMenuRect.right,
              zIndex: 99999,
              width: 250,
              borderRadius: G.radiusMd,
              background: G.dropdownBg,
              backdropFilter: G.blurDrop,
              border: `1px solid ${G.border}`,
              boxShadow: G.shadowDrop,
              overflow: "hidden",
            }}
          >
            {Object.values(NETWORKS).filter((n) => !n.hidden).map((n, i, arr) => {
              const isHovered = hoveredNetworkId === n.id;
              const isSelected = n.id === network.id;
              const accentBg = NETWORK_ACCENT[n.id] ?? "rgba(255,255,255,0.08)";
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.comingSoon) {
                      setNetworkId(n.id);
                      setTokenSymbol("USDC");
                      setAmount("");
                    }
                    closeMenus();
                  }}
                  onMouseEnter={() => !n.comingSoon && setHoveredNetworkId(n.id)}
                  onMouseLeave={() => setHoveredNetworkId(null)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: isSelected ? accentBg : isHovered ? accentBg : "transparent",
                    border: "none",
                    borderBottom: i < arr.length - 1 ? `1px solid ${G.borderSub}` : "none",
                    borderLeft:
                      isHovered && !n.comingSoon
                        ? `2px solid ${accentBg.replace("0.18", "0.9")}`
                        : "2px solid transparent",
                    cursor: n.comingSoon ? "default" : "pointer",
                    opacity: n.comingSoon ? 0.45 : 1,
                    transition: "background 0.18s ease, border-left 0.18s ease",
                  }}
                >
                  <NetLogo networkId={n.id} size={26} />
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: G.text, lineHeight: 1 }}>
                      {n.name}
                    </div>
                  </div>
                  {n.comingSoon ? (
                    <Badge comingSoon label="Soon" />
                  ) : n.badge ? (
                    <Badge comingSoon={false} label={n.badge} />
                  ) : null}
                </button>
              );
            })}
          </div>,
          document.body,
        )}

      {showTokenMenu &&
        tokenMenuRect &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: tokenMenuRect.bottom + 6,
              right: window.innerWidth - tokenMenuRect.right,
              zIndex: 99999,
              width: 180,
              borderRadius: G.radiusMd,
              background: G.dropdownBg,
              backdropFilter: G.blurDrop,
              border: `1px solid ${G.border}`,
              boxShadow: G.shadowDrop,
              overflow: "hidden",
            }}
          >
            {tokenList.map((tk, i, arr) => (
              <button
                key={tk.symbol}
                onClick={() => {
                  if (!tk.comingSoon) setTokenSymbol(tk.symbol);
                  closeMenus();
                }}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: tk.symbol === token.symbol ? "rgba(255,255,255,0.08)" : "transparent",
                  border: "none",
                  borderBottom: i < arr.length - 1 ? `1px solid ${G.borderSub}` : "none",
                  cursor: tk.comingSoon ? "default" : "pointer",
                  opacity: tk.comingSoon ? 0.45 : 1,
                }}
              >
                <TokCircle symbol={tk.symbol} size={24} />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: G.text,
                    flex: 1,
                    textAlign: "left",
                  }}
                >
                  {tk.symbol}
                </span>
                {tk.comingSoon && <Badge comingSoon label="Soon" />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
