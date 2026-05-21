import { useState, useCallback, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/apiConfig";
import {
  X, User as UserIcon, Lock, Camera, Wallet, CheckCircle2, RefreshCw, LogOut,
  Sun, Moon, Palette, Shield, KeyRound, Bell, Volume2, Eye, Clock,
} from "lucide-react";
import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useChatContext } from "./context";
import { getColor, ini, avatarSrc } from "./helpers";
import { THEMES } from "./constants";
import { getCachedPrivateKey } from "@/lib/crypto";

const APP_VERSION = "v0.15";

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <div className={`fc-toggle${on ? " is-on" : ""}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} />;
}

function SettingRow({
  icon, title, hint, control,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  control?: React.ReactNode;
}) {
  return (
    <div className="fc-setting-row">
      <div className="fc-setting-row__icon">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="fc-setting-row__text">{title}</div>
        {hint && <div className="fc-setting-row__hint">{hint}</div>}
      </div>
      <div>{control}</div>
    </div>
  );
}

function WalletSection({
  savedAddress, onSaved, T, dk,
}: {
  savedAddress: string | null;
  onSaved: (addr: string | null) => void;
  T: { border: string; text: string; textSec: string; inputBg: string; surface: string };
  dk: boolean;
}) {
  const { address: wagmiAddress, isConnected: wagmiConnected, isConnecting: connecting } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);
  const autoSavedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!wagmiConnected || !wagmiAddress) return;
    if (savedAddress && savedAddress.toLowerCase() === wagmiAddress.toLowerCase()) return;
    if (autoSavedRef.current === wagmiAddress) return;
    autoSavedRef.current = wagmiAddress;
    fetch(apiUrl("/api/auth/me"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ walletAddress: wagmiAddress }),
    })
      .then((r) => { if (r.ok) onSaved(wagmiAddress); })
      .catch(() => {});
  }, [wagmiConnected, wagmiAddress, savedAddress, onSaved]);

  const handleConnect = useCallback(() => {
    if (openConnectModal) openConnectModal();
  }, [openConnectModal]);

  const handleDisconnect = useCallback(() => {
    disconnectAsync().catch(() => {});
  }, [disconnectAsync]);

  const walletAddr = wagmiConnected && wagmiAddress ? wagmiAddress : null;
  const isConnected = !!walletAddr;
  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const green = "#34C759";
  const isSaved = !!savedAddress && !!walletAddr &&
    savedAddress.toLowerCase() === walletAddr.toLowerCase();

  const saveWallet = async (addr: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/auth/me"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ walletAddress: addr }),
      });
      if (res.ok) { onSaved(addr); setFlash("ok"); }
      else setFlash("err");
    } catch { setFlash("err"); }
    finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 2500);
    }
  };

  const removeWallet = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/auth/me"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ walletAddress: null }),
      });
      if (res.ok) { onSaved(null); handleDisconnect(); }
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  if (!isConnected) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {savedAddress && (
          <div style={{ padding:"10px 14px", borderRadius:10, background:dk?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)", border:`0.5px solid ${T.border}`, display:"flex", alignItems:"center", gap:10 }}>
            <Wallet size={13} color={T.textSec} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, color:T.textSec }}>Current address</div>
              <div style={{ fontSize:12, fontFamily:"monospace", color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{savedAddress}</div>
            </div>
          </div>
        )}
        <button onClick={handleConnect} disabled={connecting} style={{ width:"100%", padding:"10px 14px", borderRadius:10, cursor:connecting?"default":"pointer", display:"flex", alignItems:"center", gap:10, textAlign:"left", background:"linear-gradient(135deg,rgba(155,92,246,0.12),rgba(224,64,189,0.12))", border:"0.5px solid rgba(155,92,246,0.3)", opacity:connecting?0.7:1 }}>
          <div style={{ width:28, height:28, borderRadius:8, flexShrink:0, background:"linear-gradient(135deg,#9B5CF6,#E040BD)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 2px 8px rgba(155,92,246,0.35)" }}>
            <Wallet size={13} color="#fff" />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.text }}>{connecting ? "Connecting…" : savedAddress ? "Change wallet" : "Connect wallet"}</div>
            <div style={{ fontSize:11, color:T.textSec, marginTop:1 }}>Connect your wallet to link your address</div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      <div style={{ padding:"10px 14px", borderRadius:10, background: isSaved ? "rgba(52,199,89,0.08)" : dk?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.04)", border:`0.5px solid ${isSaved?"rgba(52,199,89,0.3)":T.border}`, display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:28, height:28, borderRadius:8, flexShrink:0, background: isSaved?"rgba(52,199,89,0.18)":"rgba(155,92,246,0.18)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Wallet size={13} color={isSaved ? green : "var(--fc-accent)"} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11, fontWeight:700, color: isSaved ? green : "var(--fc-accent)" }}>
            {isSaved ? "Wallet linked" : "Wallet connected"}
          </div>
          <div style={{ fontSize:12, fontFamily:"monospace", color:T.text, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {shortAddr(walletAddr!)}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0, alignItems:"center" }}>
          {isSaved ? (
            <>
              <CheckCircle2 size={14} color={green} />
              <button onClick={handleDisconnect} title="Disconnect" style={{ padding:"5px 8px", borderRadius:7, fontSize:11, background:"transparent", border:`0.5px solid ${T.border}`, cursor:"pointer", color:T.textSec, display:"flex", alignItems:"center", gap:4 }}>
                <RefreshCw size={10} /> Change
              </button>
            </>
          ) : (
            <button
              onClick={() => saveWallet(walletAddr!)}
              disabled={saving}
              style={{ padding:"5px 12px", borderRadius:7, fontSize:11, fontWeight:700, background:"linear-gradient(135deg, #9B5CF6 0%, #E040BD 100%)", color:"#fff", border:"none", cursor:saving?"default":"pointer", opacity:saving?0.6:1 }}
            >
              {saving ? "Saving…" : "Save as my wallet"}
            </button>
          )}
        </div>
      </div>

      {flash === "ok" && (
        <div style={{ fontSize:12, color:green, display:"flex", alignItems:"center", gap:5 }}>
          <CheckCircle2 size={12} color={green} /> Wallet address saved!
        </div>
      )}
      {flash === "err" && (
        <div style={{ fontSize:12, color:"#E53935" }}>Failed to save — try again</div>
      )}

      {isSaved && (
        <button onClick={removeWallet} disabled={saving}
          style={{ background:"none", border:"none", cursor:"pointer", color:"#E53935", fontSize:11, textAlign:"left", padding:0, opacity:saving?0.5:0.7 }}>
          Unlink wallet address
        </button>
      )}
    </div>
  );
}

export default function SettingsPanel() {
  const {
    user, updateUser,
    T, dk, showSettings, setShowSettings,
    settingsMsg, setSettingsMsg,
    settingsDisplayName, setSettingsDisplayName,
    settingsBio, setSettingsBio,
    settingsAvatarPreview, setSettingsAvatarPreview,
    settingsSaving, settingsAvatarInputRef,
    handleAvatarFileChange, handleSaveProfile,
    settingsCurPwd, setSettingsCurPwd,
    settingsNewPwd, setSettingsNewPwd,
    settingsConfPwd, setSettingsConfPwd,
    handleChangePassword,
    sessionDuration, setSessionDuration,
    sessionRefreshing, handleRefreshSession,
    accentColor, setAccentColor,
    darkMode, setDarkMode,
    logout,
  } = useChatContext();

  const [pushOn, setPushOn] = useState(() => localStorage.getItem("fc_push") !== "false");
  const [soundsOn, setSoundsOn] = useState(() => localStorage.getItem("fc_sounds") !== "false");
  const [readReceipts, setReadReceipts] = useState(() => localStorage.getItem("fc_read_receipts") !== "false");
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);

  useEffect(() => { localStorage.setItem("fc_push", pushOn ? "true" : "false"); }, [pushOn]);
  useEffect(() => { localStorage.setItem("fc_sounds", soundsOn ? "true" : "false"); }, [soundsOn]);
  useEffect(() => { localStorage.setItem("fc_read_receipts", readReceipts ? "true" : "false"); }, [readReceipts]);

  if (!showSettings) return null;

  const ICON_INPUT = { width:"100%", padding:"9px 12px", fontSize:13, borderRadius:10, border:`0.5px solid ${T.border}`, background:T.inputBg, color:T.text, outline:"none", boxSizing:"border-box" as const };

  return (
    <div onClick={()=>setShowSettings(false)}
      className="fc-overlay-anim fc-overlay-backdrop"
      style={{ position:"fixed", inset:0, zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div onClick={e=>e.stopPropagation()}
        className="fc-card-anim fc-overlay-card">

        {/* Header */}
        <div style={{ padding:"16px 20px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`0.75px solid ${T.border}` }}>
          <div style={{ fontSize:16, fontWeight:600, letterSpacing:"-0.01em", display:"flex", alignItems:"center", gap:10, color:T.text }}>
            <Settings_Icon /> Settings
          </div>
          <button onClick={()=>setShowSettings(false)} style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, display:"flex", padding:6, borderRadius:8 }}>
            <X size={18}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding:"18px 20px 20px", overflowY:"auto", flex:1, display:"flex", flexDirection:"column", gap:14 }}>

          {/* ── 1. WALLET ─────────────────────────────────────────── */}
          <div className="fc-setting-group">
            <div className="fc-setting-group__label">
              Wallet <span style={{ textTransform:"none", letterSpacing:0, fontSize:11, opacity:0.75, marginLeft:4 }}>(for receiving payments)</span>
            </div>
            <div className="fc-setting-row fc-setting-row--block">
              <WalletSection
                savedAddress={user?.walletAddress ?? null}
                onSaved={addr => updateUser({ walletAddress: addr })}
                T={T}
                dk={dk}
              />
            </div>
          </div>

          {/* ── 2. APPEARANCE ─────────────────────────────────────── */}
          <div className="fc-setting-group">
            <div className="fc-setting-group__label">Appearance</div>
            <SettingRow
              icon={darkMode ? <Moon size={15}/> : <Sun size={15}/>}
              title="Theme"
              hint="Switch between dark and light glass"
              control={
                <div className="fc-segmented">
                  <button className={darkMode?"is-on":""} onClick={()=>setDarkMode(true)}>Dark</button>
                  <button className={!darkMode?"is-on":""} onClick={()=>setDarkMode(false)}>Light</button>
                </div>
              }
            />
            <SettingRow
              icon={<Palette size={15}/>}
              title="Accent"
              hint="Message bubbles, highlights and CTAs"
              control={
                <div className="fc-swatch-row">
                  {THEMES.map(theme => (
                    <button
                      key={theme.color}
                      type="button"
                      title={theme.name}
                      className={`fc-swatch${accentColor===theme.color?" is-on":""}`}
                      style={{ background: theme.gradient }}
                      onClick={()=>setAccentColor(theme.color)}
                    />
                  ))}
                </div>
              }
            />
          </div>

          {/* ── 3. PRIVACY ────────────────────────────────────────── */}
          <div className="fc-setting-group">
            <div className="fc-setting-group__label">Privacy</div>
            <SettingRow
              icon={<Lock size={15}/>}
              title="End-to-end encryption"
              hint="All messages are encrypted on your device"
              control={<Toggle on={true} onChange={() => {}} />}
            />
            <SettingRow
              icon={<Eye size={15}/>}
              title="Read receipts"
              hint="Show when you've read a message"
              control={<Toggle on={readReceipts} onChange={setReadReceipts} />}
            />
            <SettingRow
              icon={<Clock size={15}/>}
              title="Session duration"
              hint={user?.sessionExpiry ? `Expires ${new Date(user.sessionExpiry).toLocaleDateString([],{day:"numeric",month:"short",year:"numeric"})}` : undefined}
              control={
                <div className="fc-segmented">
                  {[7,30,90,365].map(d => (
                    <button key={d} className={sessionDuration===d?"is-on":""} onClick={()=>setSessionDuration(d)}>
                      {d===7?"7d":d===30?"30d":d===90?"90d":"1y"}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="fc-setting-row fc-setting-row--block">
              <button onClick={()=>handleRefreshSession(sessionDuration)} disabled={sessionRefreshing}
                style={{ width:"100%", padding:"9px", borderRadius:10, background:"linear-gradient(135deg,#9B5CF6,#E040BD)", color:"#fff", border:"none", cursor:sessionRefreshing?"default":"pointer", fontSize:12.5, fontWeight:600, opacity:sessionRefreshing?0.6:1 }}>
                {sessionRefreshing ? "Refreshing…" : `Refresh session (${sessionDuration===1?"1d":sessionDuration===7?"7d":sessionDuration===30?"30d":sessionDuration===90?"90d":"1yr"})`}
              </button>
            </div>
            <SettingRow
              icon={<KeyRound size={15}/>}
              title="Change password"
              control={
                <button onClick={()=>setShowPwdForm(s=>!s)}
                  style={{ padding:"5px 12px", borderRadius:8, fontSize:11.5, background:"transparent", border:`0.75px solid ${T.border}`, cursor:"pointer", color:T.text, fontWeight:500 }}>
                  {showPwdForm ? "Hide" : "Edit"}
                </button>
              }
            />
            {showPwdForm && (
              <div className="fc-setting-row fc-setting-row--block" style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <input type="password" placeholder="Current password" value={settingsCurPwd} onChange={e=>setSettingsCurPwd(e.target.value)} style={ICON_INPUT}/>
                <input type="password" placeholder="New password" value={settingsNewPwd} onChange={e=>setSettingsNewPwd(e.target.value)} style={ICON_INPUT}/>
                <input type="password" placeholder="Confirm password" value={settingsConfPwd} onChange={e=>setSettingsConfPwd(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter") handleChangePassword(); }} style={ICON_INPUT}/>
                <button onClick={handleChangePassword} disabled={settingsSaving||!settingsCurPwd||!settingsNewPwd||!settingsConfPwd}
                  style={{ width:"100%", padding:"9px", borderRadius:10, background:"linear-gradient(135deg,#9B5CF6,#E040BD)", color:"#fff", border:"none", cursor:settingsSaving?"default":"pointer", fontSize:13, fontWeight:600, opacity:(settingsSaving||!settingsCurPwd||!settingsNewPwd||!settingsConfPwd)?0.6:1 }}>
                  {settingsSaving ? "Changing…" : "Change password"}
                </button>
              </div>
            )}
            <SettingRow
              icon={<Shield size={15}/>}
              title="Encryption key"
              hint="Export your private key for backup"
              control={
                <button onClick={() => {
                  const key = getCachedPrivateKey();
                  if (!key) { alert("No private key found in this browser."); return; }
                  const blob = new Blob([key], { type:"text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = `fairchat-private-key-${user?.username ?? "key"}.txt`; a.click();
                  URL.revokeObjectURL(url);
                }}
                  style={{ padding:"5px 12px", borderRadius:8, fontSize:11.5, background:"transparent", border:`0.75px solid ${T.border}`, cursor:"pointer", color:T.text, fontWeight:500 }}>
                  Export
                </button>
              }
            />
          </div>

          {/* ── 4. NOTIFICATIONS ──────────────────────────────────── */}
          <div className="fc-setting-group">
            <div className="fc-setting-group__label">Notifications</div>
            <SettingRow
              icon={<Bell size={15}/>}
              title="Push notifications"
              hint="Notify on new messages"
              control={<Toggle on={pushOn} onChange={setPushOn} />}
            />
            <SettingRow
              icon={<Volume2 size={15}/>}
              title="In-app sounds"
              hint="Play a sound on new messages"
              control={<Toggle on={soundsOn} onChange={setSoundsOn} />}
            />
          </div>

          {/* ── 5. PROFILE ────────────────────────────────────────── */}
          <div className="fc-setting-group">
            <div className="fc-setting-group__label">Profile</div>
            <SettingRow
              icon={<UserIcon size={15}/>}
              title={user?.displayName || user?.username || "—"}
              hint={`@${user?.username ?? ""}`}
              control={
                <button onClick={()=>setShowProfileEdit(s=>!s)}
                  style={{ padding:"5px 12px", borderRadius:8, fontSize:11.5, background:"transparent", border:`0.75px solid ${T.border}`, cursor:"pointer", color:T.text, fontWeight:500 }}>
                  {showProfileEdit ? "Hide" : "Edit"}
                </button>
              }
            />
            {showProfileEdit && (
              <div className="fc-setting-row fc-setting-row--block" style={{ display:"flex", flexDirection:"column", gap:12, alignItems:"stretch" }}>
                <div style={{ display:"flex", justifyContent:"center" }}>
                  <div style={{ position:"relative", cursor:"pointer" }} onClick={()=>settingsAvatarInputRef.current?.click()}>
                    <div style={{ width:72, height:72, borderRadius:"50%", overflow:"hidden", background:settingsAvatarPreview?"transparent":getColor(settingsDisplayName||user.displayName), display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(0,0,0,0.15)" }}>
                      {settingsAvatarPreview
                        ? <img src={avatarSrc(settingsAvatarPreview)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                        : <span style={{ color:"#fff", fontWeight:700, fontSize:24 }}>{ini(settingsDisplayName||user.displayName)}</span>}
                    </div>
                    <div style={{ position:"absolute", bottom:0, right:0, width:24, height:24, borderRadius:"50%", background:"linear-gradient(135deg,#9B5CF6,#E040BD)", display:"flex", alignItems:"center", justifyContent:"center", border:`2px solid ${dk?"#1f1b30":"#fff"}` }}>
                      <Camera size={12} style={{ color:"#fff" }}/>
                    </div>
                  </div>
                </div>
                <input ref={settingsAvatarInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleAvatarFileChange}/>
                {settingsAvatarPreview && (
                  <button onClick={()=>setSettingsAvatarPreview(null)} style={{ fontSize:12, color:"#E53935", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                    Remove avatar
                  </button>
                )}
                <input value={settingsDisplayName} onChange={e=>setSettingsDisplayName(e.target.value)} placeholder="Display name" style={ICON_INPUT}/>
                <textarea value={settingsBio} onChange={e=>setSettingsBio(e.target.value.slice(0,120))} placeholder="Bio / status" rows={2}
                  style={{ ...ICON_INPUT, resize:"none", fontFamily:"Inter,sans-serif", lineHeight:1.5 }}/>
                <button onClick={handleSaveProfile} disabled={settingsSaving || !settingsDisplayName.trim()}
                  style={{ width:"100%", padding:"9px", borderRadius:10, background:"linear-gradient(135deg,#9B5CF6,#E040BD)", color:"#fff", border:"none", cursor:(settingsSaving||!settingsDisplayName.trim())?"default":"pointer", fontSize:13, fontWeight:600, opacity:(settingsSaving||!settingsDisplayName.trim())?0.6:1 }}>
                  {settingsSaving ? "Saving…" : "Save profile"}
                </button>
              </div>
            )}
          </div>

          {settingsMsg && (
            <div style={{ padding:"10px 14px", borderRadius:10, background:settingsMsg.ok?"rgba(76,175,80,0.12)":"rgba(229,57,53,0.10)", color:settingsMsg.ok?"#34C759":"#E53935", fontSize:13, fontWeight:500, textAlign:"center" }}>
              {settingsMsg.text}
            </div>
          )}

          {/* Sign out */}
          <button onClick={logout}
            style={{ width:"100%", padding:"11px", borderRadius:12, background:dk?"rgba(229,57,53,0.10)":"rgba(229,57,53,0.06)", border:`0.75px solid ${dk?"rgba(229,57,53,0.25)":"rgba(229,57,53,0.18)"}`, color:"#E53935", fontSize:13.5, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <LogOut size={15} /> Sign out
          </button>

          {/* Footer */}
          <div style={{ textAlign:"center", fontSize:11, color:T.textSec, paddingTop:6 }}>
            Fairchat {APP_VERSION} · StableTrust connected
          </div>
        </div>
      </div>
    </div>
  );
}

function Settings_Icon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}
