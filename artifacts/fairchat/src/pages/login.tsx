import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/apiConfig";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { initSodium, keypairFromSeedWords, recoveryHashFromSeedWords, setPrivateKey } from "@/lib/crypto";
import { KeyRound, LogIn, User, Check, ArrowLeft } from "lucide-react";
import { AuthShell, AuthHeader } from "@/components/AuthShell";

type Mode = "login" | "restore";
type RestoreStep = 1 | 2;

interface FoundAccount {
  username: string;
  displayName: string;
  recoveryHash: string;
  privateKey: string;
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user, isLoading: authLoading } = useAuth();

  const [restoreStep, setRestoreStep] = useState<RestoreStep>(1);
  const [seedInputs, setSeedInputs] = useState<string[]>(Array(12).fill(""));
  const [foundAccount, setFoundAccount] = useState<FoundAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const seedRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!authLoading && user) { window.location.href = "/chat"; }
  }, [user, authLoading]);

  const handleSeedChange = (idx: number, raw: string) => {
    const words = raw.trim().split(/\s+/);
    if (words.length > 1) {
      const next = [...seedInputs];
      for (let i = 0; i < words.length && idx + i < 12; i++) next[idx + i] = words[i].toLowerCase();
      setSeedInputs(next);
      const focusIdx = Math.min(idx + words.length, 11);
      seedRefs.current[focusIdx]?.focus();
    } else {
      const next = [...seedInputs];
      next[idx] = raw.toLowerCase();
      setSeedInputs(next);
    }
  };

  const handleSeedKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === " " || e.key === "Enter") && seedInputs[idx].trim()) {
      e.preventDefault();
      if (idx < 11) seedRefs.current[idx + 1]?.focus();
    }
    if (e.key === "Backspace" && !seedInputs[idx] && idx > 0) {
      e.preventDefault();
      seedRefs.current[idx - 1]?.focus();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      window.location.href = "/chat";
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setIsLoading(false);
    }
  };

  const handleFindAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const words = seedInputs.map(w => w.trim().toLowerCase()).filter(Boolean);
    if (words.length !== 12) {
      setError("Please enter all 12 recovery phrase words.");
      return;
    }

    setIsLoading(true);
    try {
      await initSodium();
      const [{ publicKey, privateKey }, recoveryHash] = await Promise.all([
        keypairFromSeedWords(words),
        recoveryHashFromSeedWords(words),
      ]);

      const res = await fetch(apiUrl("/api/auth/restore/find"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryHash, publicKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Account not found");

      setFoundAccount({ username: data.username, displayName: data.displayName, recoveryHash, privateKey });
      setRestoreStep(2);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!foundAccount) return;
    if (newPassword.length < 8) return setError("Password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return setError("Passwords do not match.");

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/restore/reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recoveryHash: foundAccount.recoveryHash, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Account recovery failed");

      await setPrivateKey(foundAccount.privateKey);
      window.location.href = "/chat";
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setIsLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setUsername("");
    setPassword("");
    setSeedInputs(Array(12).fill(""));
    setFoundAccount(null);
    setRestoreStep(1);
    setNewPassword("");
    setConfirmPassword("");
  };

  if (authLoading) {
    return (
      <AuthShell>
        <div style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}>
          <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.1)", borderTop: "3px solid var(--fc-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      </AuthShell>
    );
  }

  const headerTitle = mode === "login" ? "Welcome to FairChat" : "Recover account";
  const headerDesc =
    mode === "login" ? "End-to-end encrypted messaging."
      : restoreStep === 1 ? "Enter your 12-word recovery phrase."
        : `Account found. Set a new password for @${foundAccount?.username}.`;

  return (
    <AuthShell>
      <AuthHeader title={headerTitle} description={headerDesc} />

      {/* Mode tabs */}
      <div className="fc-segmented" style={{ display: "flex", width: "100%", marginBottom: 18 }}>
        <button
          type="button"
          className={mode === "login" ? "is-on" : ""}
          style={{ flex: 1, justifyContent: "center", padding: "8px 12px" }}
          onClick={() => switchMode("login")}
        >
          <LogIn size={13} /> Sign in
        </button>
        <button
          type="button"
          className={mode === "restore" ? "is-on" : ""}
          style={{ flex: 1, justifyContent: "center", padding: "8px 12px" }}
          onClick={() => switchMode("restore")}
        >
          <KeyRound size={13} /> Recover
        </button>
      </div>

      {error && <div className="fc-auth-error" style={{ marginBottom: 14 }}>{error}</div>}

      {mode === "login" && (
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="fc-auth-label">Username</label>
            <input
              className="fc-auth-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoComplete="username"
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="fc-auth-label">Password</label>
            <input
              className="fc-auth-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>
          <button type="submit" className="fc-auth-btn fc-auth-btn--primary" disabled={isLoading} style={{ marginTop: 4 }}>
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
          <div style={{ textAlign: "center" }} className="fc-auth-muted">
            Don't have an account? <Link href="/register" className="fc-auth-link">Register</Link>
          </div>
        </form>
      )}

      {mode === "restore" && restoreStep === 1 && (
        <form onSubmit={handleFindAccount} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="fc-auth-label">Recovery phrase</label>
            <div className="fc-auth-seed-grid">
              {seedInputs.map((word, i) => (
                <div key={i} className="fc-auth-seed-cell">
                  <span className="fc-auth-seed-cell__num">{i + 1}.</span>
                  <input
                    ref={el => { seedRefs.current[i] = el; }}
                    type="text"
                    value={word}
                    onChange={e => handleSeedChange(i, e.target.value)}
                    onKeyDown={e => handleSeedKeyDown(i, e)}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={isLoading}
                  />
                </div>
              ))}
            </div>
            <p className="fc-auth-muted" style={{ marginTop: 8, fontSize: 12 }}>
              You can paste all 12 words at once into the first field.
            </p>
          </div>
          <button
            type="submit"
            className="fc-auth-btn fc-auth-btn--primary"
            disabled={isLoading || seedInputs.filter(w => w.trim()).length < 12}
          >
            {isLoading ? "Searching…" : "Find account"}
          </button>
        </form>
      )}

      {mode === "restore" && restoreStep === 2 && foundAccount && (
        <form onSubmit={handleRestoreAccount} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{
            padding: 14, borderRadius: 14,
            background: "color-mix(in oklab, var(--fc-accent) 12%, transparent)",
            border: "0.75px solid color-mix(in oklab, var(--fc-accent) 25%, transparent)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--fc-accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>
              <User size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{foundAccount.displayName}</div>
              <div className="fc-auth-muted" style={{ fontSize: 12 }}>@{foundAccount.username}</div>
            </div>
            <Check size={16} style={{ color: "var(--fc-accent)" }} />
          </div>

          <div>
            <label className="fc-auth-label">New password</label>
            <input className="fc-auth-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" required disabled={isLoading} />
          </div>
          <div>
            <label className="fc-auth-label">Confirm password</label>
            <input className="fc-auth-input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required disabled={isLoading} />
          </div>

          <button type="submit" className="fc-auth-btn fc-auth-btn--primary" disabled={isLoading}>
            {isLoading ? "Recovering…" : "Restore access"}
          </button>
          <button
            type="button"
            onClick={() => { setRestoreStep(1); setFoundAccount(null); setError(""); setNewPassword(""); setConfirmPassword(""); }}
            className="fc-auth-muted"
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 4 }}
          >
            <ArrowLeft size={14} /> Back to phrase
          </button>
        </form>
      )}
    </AuthShell>
  );
}
