import React, { useState } from "react";
import { X, Lock } from "lucide-react";

const ethereumLogo = "/networks/ethereum.png";
const usdcLogo = "/networks/usdc.png";

export const G = {
  overlay: "rgba(0, 0, 0, 0.52)",
  modalBg: "rgba(22, 20, 30, 0.78)",
  panelBg: "rgba(255, 255, 255, 0.055)",
  panelBgHov: "rgba(255, 255, 255, 0.09)",
  dropdownBg: "rgba(26, 24, 36, 0.94)",
  border: "rgba(255, 255, 255, 0.14)",
  borderSub: "rgba(255, 255, 255, 0.07)",
  text: "rgba(255, 255, 255, 0.96)",
  textSec: "rgba(255, 255, 255, 0.52)",
  textMuted: "rgba(255, 255, 255, 0.28)",
  accent: "#9B5CF6",
  accentEnd: "#E040BD",
  grad: "linear-gradient(135deg, #9B5CF6 0%, #E040BD 100%)",
  green: "rgba(74, 222, 128, 0.9)",
  greenBg: "rgba(74, 222, 128, 0.07)",
  greenBorder: "rgba(74, 222, 128, 0.18)",
  orange: "rgba(251, 146, 60, 0.9)",
  orangeBg: "rgba(251, 146, 60, 0.07)",
  orangeBorder: "rgba(251, 146, 60, 0.18)",
  red: "rgba(248, 113, 113, 0.9)",
  redBg: "rgba(248, 113, 113, 0.07)",
  redBorder: "rgba(248, 113, 113, 0.18)",
  blur: "blur(80px) saturate(260%)",
  blurPanel: "blur(40px) saturate(200%)",
  blurDrop: "blur(50px) saturate(220%)",
  shadow:
    "0 40px 100px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.26), inset 0 0 0 0.5px rgba(255,255,255,0.10)",
  shadowPanel: "inset 0 0.5px 0 rgba(255,255,255,0.20)",
  shadowDrop: "0 24px 64px rgba(0,0,0,0.50), inset 0 0.5px 0 rgba(255,255,255,0.14)",
  radius: "26px",
  radiusMd: "18px",
  radiusSm: "12px",
};

export const pillStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  height: 38,
  padding: "0 12px 0 10px",
  borderRadius: 24,
  background: "rgba(255,255,255,0.09)",
  border: "0.5px solid rgba(255,255,255,0.18)",
  backdropFilter: G.blurPanel,
  cursor: "pointer",
  boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.18)",
  flexShrink: 0,
};

export const pillLabelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: G.text,
  letterSpacing: "-0.01em",
};

const arbitrumLogo = "/networks/arbitrum.png";
const arcLogo = "/networks/arc.jpg";
const baseLogo = "/networks/base.png";
const stableLogo = "/networks/stable.jpg";
const tempoLogo = "/networks/tempo.jpg";

export const NETWORK_LOGOS: Record<string, string> = {
  "base-sepolia": baseLogo,
  base: baseLogo,
  ethereum: ethereumLogo,
  arbitrum: arbitrumLogo,
  arc: arcLogo,
  stable: stableLogo,
  tempo: tempoLogo,
};

export const NETWORK_ACCENT: Record<string, string> = {
  "base-sepolia": "rgba(0, 82, 255, 0.18)",
  arc: "rgba(0, 194, 255, 0.18)",
  ethereum: "rgba(98, 126, 234, 0.18)",
  arbitrum: "rgba(40, 160, 240, 0.18)",
  stable: "rgba(107, 114, 128, 0.18)",
  tempo: "rgba(245, 158, 11, 0.18)",
};

export function GlassOverlay({
  onClose,
  children,
  subtitle,
  headerRight,
}: {
  onClose: () => void;
  children: React.ReactNode;
  subtitle?: string;
  headerRight?: React.ReactNode;
}) {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(onClose, 210);
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9900,
        background: G.overlay,
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: isClosing ? "fcFadeOut 0.22s ease forwards" : "fcFadeIn 0.2s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxHeight: "92vh",
          borderRadius: G.radius,
          background: G.modalBg,
          backdropFilter: G.blur,
          border: "0.5px solid rgba(255,255,255,0.18)",
          boxShadow: G.shadow,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: isClosing
            ? "fcScaleOut 0.22s cubic-bezier(0.4, 0, 1, 1) forwards"
            : "fcScaleIn 0.28s cubic-bezier(0.34, 1.1, 0.64, 1) both",
          willChange: "transform, opacity",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 18px 14px",
            borderBottom: "0.5px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: G.grad,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(155,92,246,0.38), inset 0 0.5px 0 rgba(255,255,255,0.25)",
              }}
            >
              <Lock size={13} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: G.text, letterSpacing: "-0.02em" }}>
                Send Payment
              </div>
              <div style={{ fontSize: 10, color: G.textMuted, marginTop: 1 }}>
                {subtitle ?? "Powered by StableTrust \u00b7 FairBlock"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {headerRight}
            <button
              onClick={handleClose}
              className="fc-btn-close"
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: G.grad,
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(155,92,246,0.4)",
              }}
            >
              <X size={13} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function GlassPanel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: G.radiusMd,
        background: G.panelBg,
        backdropFilter: G.blurPanel,
        border: "0.5px solid rgba(255,255,255,0.12)",
        boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.18), 0 1px 4px rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function GlassBtn({
  onClick,
  children,
  style,
}: {
  onClick: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "13px 18px",
        borderRadius: G.radiusMd,
        background: "rgba(255,255,255,0.07)",
        border: "0.5px solid rgba(255,255,255,0.14)",
        backdropFilter: G.blurPanel,
        color: G.text,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.18)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: G.textMuted,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

export function Badge({ comingSoon, label }: { comingSoon: boolean; label: string }) {
  if (!label) return null;
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 5,
        background: comingSoon ? "rgba(251,146,60,0.1)" : "rgba(255,255,255,0.1)",
        color: comingSoon ? G.orange : G.textSec,
        border: `1px solid ${comingSoon ? G.orangeBorder : G.borderSub}`,
        letterSpacing: "0.03em",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

export function NetLogo({ networkId, size = 16 }: { networkId: string; size?: number }) {
  const logo = NETWORK_LOGOS[networkId];
  if (logo) {
    return (
      <img
        src={logo}
        alt={networkId}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.1)",
        flexShrink: 0,
      }}
    />
  );
}

export function TokCircle({ symbol, size = 16 }: { symbol: string; size?: number }) {
  if (symbol === "ETH") {
    return (
      <img
        src={ethereumLogo}
        alt="ETH"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  if (symbol === "USDC") {
    return (
      <img
        src={usdcLogo}
        alt="USDC"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  const colors: Record<string, string> = { USDC: "#2775CA", USDT: "#26A17B" };
  const bg = colors[symbol] ?? "#666";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 800,
        color: "#fff",
      }}
    >
      $
    </div>
  );
}
