import { useEffect, useState, type ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  const [light, setLight] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("fc_dark") !== "true";
  });
  useEffect(() => {
    const sync = () => setLight(localStorage.getItem("fc_dark") !== "true");
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return (
    <div className="fc-auth-page">
      <div
        className={`fc-aurora pointer-events-none${light ? " is-light" : ""}`}
        aria-hidden
      >
        <div className="fc-aurora__blob b1 pointer-events-none" />
        <div className="fc-aurora__blob b2 pointer-events-none" />
        <div className="fc-aurora__blob b3 pointer-events-none" />
        <div className="fc-aurora__blob b4 pointer-events-none" />
        <div className="fc-aurora__grain pointer-events-none" />
      </div>
      <div className="fc-auth-shell relative z-50 pointer-events-auto">
        <div className="fc-auth-card relative z-50 pointer-events-auto">{children}</div>
      </div>
    </div>
  );
}

export function AuthHeader({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 22 }}>
      <img src="/logo.png" alt="FairChat" style={{ width: 56, height: 56, borderRadius: 16, boxShadow: "0 10px 28px -10px rgba(155,92,246,0.5)" }} />
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div>
      <div className="fc-auth-muted" style={{ maxWidth: 320 }}>{description}</div>
    </div>
  );
}
