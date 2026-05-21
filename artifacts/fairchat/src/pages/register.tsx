import { useState, useEffect } from "react";
import { apiUrl } from "@/lib/apiConfig";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { keypairFromSeedWords, recoveryHashFromSeedWords, initSodium, setPrivateKey } from "@/lib/crypto";
import { Check, X, ArrowLeft, ArrowRight } from "lucide-react";
import { AuthShell, AuthHeader } from "@/components/AuthShell";

const WORDS = [
  "able","acid","aged","also","area","army","away","baby","back","ball",
  "band","bank","base","bath","bear","beat","been","bell","best","bird",
  "blow","blue","body","bold","bond","bone","book","boot","born","both",
  "bowl","bulk","burn","busy","calm","came","card","care","case","cash",
  "cast","cave","cell","chat","chip","city","clap","clay","clip","club",
  "coal","coat","code","coil","coin","cold","cope","copy","cord","core",
  "corn","cost","coup","crew","crop","cure","data","date","dawn","days",
  "dead","deal","dear","debt","deck","deep","deny","desk","diet","dirt",
  "disc","dish","disk","dock","done","door","dose","down","draw","drop",
  "drum","dual","dull","dump","dust","duty","each","earn","ease","edge",
  "emit","enum","epic","even","exam","exit","face","fact","fail","fair",
  "fall","farm","fast","fate","fear","feed","feel","feet","fell","felt",
  "file","fill","film","find","fine","fire","firm","fish","fist","flag",
  "flat","flew","flip","flow","foam","fold","folk","fond","font","food",
  "foot","ford","fork","form","fort","foul","frog","from","fuel","full",
  "fund","fuse","gain","game","gate","gave","gaze","gear","gale","gift",
  "girl","give","glad","glow","glue","gone","good","grab","gram","gray",
  "grew","grid","grip","grit","grow","gulf","guru","gust","hall","halt",
  "hand","hard","harm","hash","hats","have","hawk","head","heal","heap",
  "heat","heel","held","helm","hemp","herb","high","hill","hint","hire",
  "hold","hole","home","hood","hook","hope","horn","host","hour","huge",
  "hull","hunt","hurt","icon","idea","idle","inch","into","iron","isle",
  "item","jade","jail","join","joke","jump","just","keen","keep","kind",
  "knew","knot","lack","lake","lamb","lamp","land","lane","last","late",
];

function cryptoShuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const { user, isLoading: authLoading } = useAuth();

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) { window.location.href = "/chat"; }
  }, [user, authLoading]);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [savedSeed, setSavedSeed] = useState(false);

  useEffect(() => {
    if (step === 2 && seedWords.length === 0) {
      setSeedWords(cryptoShuffle(WORDS).slice(0, 12));
    }
  }, [step, seedWords.length]);

  useEffect(() => {
    if (username.length > 2) {
      setUsernameStatus("checking");
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(apiUrl("/api/auth/check-username"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username }),
          });
          const data = await res.json();
          setUsernameStatus(data.available ? "available" : "taken");
        } catch { setUsernameStatus("taken"); }
      }, 500);
      return () => clearTimeout(timer);
    } else if (username.length > 0) {
      setUsernameStatus("taken");
      return undefined;
    } else {
      setUsernameStatus("idle");
      return undefined;
    }
  }, [username]);

  const handleRegister = async () => {
    setError("");
    setIsLoading(true);
    try {
      await initSodium();
      const [{ publicKey, privateKey }, recoveryHash] = await Promise.all([
        keypairFromSeedWords(seedWords),
        recoveryHashFromSeedWords(seedWords),
      ]);
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName, username, password, publicKey, recoveryHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      await setPrivateKey(privateKey);
      window.location.href = "/chat";
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthHeader
        title={step === 1 ? "Create your account" : "Save your phrase"}
        description={step === 1 ? "Choose your name on the platform." : "Save these words to recover your account later."}
      />

      {/* Step indicator */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 18 }}>
        {[1, 2].map(s => (
          <div key={s} style={{
            height: 4, width: s === step ? 28 : 14, borderRadius: 100,
            background: s === step ? "var(--fc-accent-gradient)" : "rgba(255,255,255,0.15)",
            transition: "all .25s",
          }} />
        ))}
      </div>

      {error && <div className="fc-auth-error" style={{ marginBottom: 14 }}>{error}</div>}

      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="fc-auth-label">Display name</label>
            <input className="fc-auth-input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="John Doe" />
          </div>
          <div>
            <label className="fc-auth-label">Username</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.5, fontSize: 14, pointerEvents: "none" }}>@</span>
              <input
                className="fc-auth-input"
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="ivanov"
                style={{ paddingLeft: 28, paddingRight: 36 }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }}>
                {usernameStatus === "checking" && <span style={{ fontSize: 11, opacity: 0.5 }}>…</span>}
                {usernameStatus === "available" && <Check size={16} color="#34C759" />}
                {usernameStatus === "taken" && <X size={16} color="#E53935" />}
              </span>
            </div>
          </div>
          <div>
            <label className="fc-auth-label">Password</label>
            <input className="fc-auth-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div>
            <label className="fc-auth-label">Confirm password</label>
            <input className="fc-auth-input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" />
          </div>

          <button
            className="fc-auth-btn fc-auth-btn--primary"
            style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onClick={() => {
              if (!displayName) return setError("Please enter a display name");
              if (usernameStatus !== "available") return setError("Username is not available");
              if (password.length < 8) return setError("Password must be at least 8 characters");
              if (password !== confirmPassword) return setError("Passwords do not match");
              setError("");
              setStep(2);
            }}
          >
            Continue <ArrowRight size={16} />
          </button>

          <div style={{ textAlign: "center", marginTop: 4 }} className="fc-auth-muted">
            Already have an account? <Link href="/login" className="fc-auth-link">Sign in</Link>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="fc-auth-seed-grid">
            {seedWords.map((word, i) => (
              <div key={i} className="fc-auth-seed-cell">
                <span className="fc-auth-seed-cell__num">{i + 1}.</span>
                <span style={{ fontWeight: 500 }}>{word}</span>
              </div>
            ))}
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={savedSeed}
              onChange={e => setSavedSeed(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: "var(--fc-accent)", cursor: "pointer" }}
            />
            <span className="fc-auth-muted">I have saved my recovery phrase in a safe place</span>
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="fc-auth-btn fc-auth-btn--ghost"
              style={{ flex: "0 0 auto", width: "auto", padding: "12px 16px", display: "flex", alignItems: "center", gap: 6 }}
              onClick={() => setStep(1)}
              disabled={isLoading}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              className="fc-auth-btn fc-auth-btn--primary"
              style={{ flex: 1 }}
              onClick={handleRegister}
              disabled={!savedSeed || isLoading}
            >
              {isLoading ? "Creating…" : "Create account"}
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
