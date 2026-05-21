import { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/apiConfig";
import { createPortal } from "react-dom";
import {
  ArrowUpRight, ArrowDownLeft, Wallet, Send, ArrowDownToLine, Clock, Check, X,
  ExternalLink, Shield, Lock, Zap, ChevronDown, Search, UserPlus, CheckCircle2,
  AlertCircle, Loader2, LogOut,
} from "lucide-react";
import { useChatContext } from "./context";
import { getColor, ini } from "./helpers";
import { NETWORKS } from "../../lib/paymentConfig";
import { useWallet } from "../../hooks/useWallet";
import { useConfidentialPayment } from "../../hooks/useConfidentialPayment";
import { useStandardPayment } from "../../hooks/useStandardPayment";
import { useArcPayment } from "../../hooks/useArcPayment";
import { useContactPicker } from "../../components/payment/ContactPicker";
import { NetLogo, TokCircle, NETWORK_ACCENT } from "../../components/payment/PaymentGlass";
import type { TxHistoryEntry } from "../../components/payment/PaymentHistory";
import { encryptPaymentPayload, parsePaymentHistoryEntry } from "../../lib/paymentMessage";
import { getCachedPrivateKey } from "../../lib/crypto";

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function WithdrawCountdown({ initiatedAt, delaySeconds }: { initiatedAt: number; delaySeconds: number }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const calc = () => {
      const elapsed = (Date.now() - initiatedAt) / 1000;
      const rem = Math.max(0, delaySeconds - elapsed);
      setRemaining(rem);
    };
    calc();
    // For long delays (>1h) we don't need 1s precision — update every minute to save renders.
    const tickMs = delaySeconds > 3600 ? 60_000 : 1_000;
    const tid = setInterval(calc, tickMs);
    return () => clearInterval(tid);
  }, [initiatedAt, delaySeconds]);

  if (remaining === 0) return <span style={{ color: "#4ade80" }}>Ready!</span>;

  return (
    <span
      style={{ color: "#fbbf24" }}
      title={`On-chain delay enforced by Circle Gateway contract: ${formatDuration(delaySeconds)}`}
    >
      {formatDuration(remaining)}
    </span>
  );
}

export default function PaymentsView() {
  const { T, dk, user, selectedUser, setShowPaymentsView, conversations } = useChatContext();

  const [mode, setMode] = useState<"send" | "request">("send");
  const [paymentMode, setPaymentMode] = useState<"standard" | "confidential">("standard");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [txHistory, setTxHistory] = useState<TxHistoryEntry[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [networkId, setNetworkId] = useState("arc");
  const [tokenSymbol, setTokenSymbol] = useState("USDC");
  const isArc = networkId === "arc";
  const isArcConfidential = isArc && paymentMode === "confidential";
  const effectiveNetworkId = isArcConfidential ? "arc-confidential" : networkId;
  const network = NETWORKS[effectiveNetworkId] ?? NETWORKS["base-sepolia"];
  const displayNetwork = NETWORKS[networkId] ?? NETWORKS["base-sepolia"];
  const token = network.tokens[tokenSymbol] ?? network.tokens["USDC"];

  const ext = useWallet(network);
  const confHook = useConfidentialPayment(ext, effectiveNetworkId, tokenSymbol, isArcConfidential || (!isArc && paymentMode === "confidential"));
  const stdHook = useStandardPayment(ext, networkId, tokenSymbol, !isArc && paymentMode === "standard");
  const arcHook = useArcPayment(ext, isArc && paymentMode === "standard");

  const active = isArc
    ? paymentMode === "confidential" ? confHook
      : { isAuthenticated: arcHook.isAuthenticated, walletAddress: arcHook.walletAddress, balances: arcHook.balances, step: arcHook.step, txHash: arcHook.txHash, error: arcHook.error, login: arcHook.login, logout: arcHook.logout, fetchBalances: arcHook.fetchBalances, reset: arcHook.reset }
    : paymentMode === "confidential" ? confHook : stdHook;

  const { isAuthenticated, walletAddress, balances, step, txHash, error, login, logout, reset } = active;

  const { recipient, contacts, savedContactIds, walletDataLoaded, selectContact } = useContactPicker(selectedUser);

  const savedWalletRef = useRef<string | null>(null);
  useEffect(() => {
    if (!walletAddress) return;
    if (savedWalletRef.current === walletAddress) return;
    savedWalletRef.current = walletAddress;
    fetch(apiUrl("/api/auth/me"), { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ walletAddress }) }).catch(() => {});
  }, [walletAddress]);

  useEffect(() => {
    setTxLoading(true);
    fetch(apiUrl("/api/messages/payment-history"), { credentials: "include" })
      .then(r => r.json())
      .then((data: TxHistoryEntry[]) => {
        setTxHistory(data.map((e) => parsePaymentHistoryEntry(e)));
      }).catch(() => {}).finally(() => setTxLoading(false));
  }, []);

  const recipientWallet = recipient?.walletAddress ?? null;
  const isReady = !displayNetwork.comingSoon && !token.comingSoon;
  const isValidEthAddress = (addr: string | null) => !!addr && /^0x[0-9a-fA-F]{40}$/.test(addr);
  const amountNum = parseFloat(amount);
  const decimalCount = amount.includes(".") ? (amount.split(".")[1]?.length ?? 0) : 0;
  const amountValid = !!amount && !isNaN(amountNum) && amountNum >= 0.01 && amountNum <= 10000 && decimalCount <= token.decimals;

  const validateAmount = (value: string): string | null => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return "Enter a valid amount";
    if (num < 0.01) return "Minimum amount is 0.01";
    if (num > 10000) return "Maximum amount is 10,000";
    const dec = value.includes(".") ? (value.split(".")[1]?.length ?? 0) : 0;
    if (dec > token.decimals) return `Max ${token.decimals} decimals`;
    return null;
  };
  const isSelfTransfer = !!(walletAddress && recipientWallet && walletAddress.toLowerCase() === recipientWallet.toLowerCase());
  const canSend = isAuthenticated && isValidEthAddress(recipientWallet) && !isSelfTransfer && amountValid && step === "idle" && isReady;
  const eitherBusy = confHook.step !== "idle" || stdHook.step !== "idle" || arcHook.step !== "idle";
  const canRequest = !!recipient?.id && amountValid;
  const effectiveMode = paymentMode;
  const displayBalance = effectiveMode === "confidential" ? balances.confidential : balances.public;

  const notifiedTxRef = useRef<string | null>(null);
  useEffect(() => {
    notifiedTxRef.current = null;
  }, [recipient?.id]);
  useEffect(() => {
    if (step !== "done" || !txHash || !recipient?.id || notifiedTxRef.current === txHash) return;
    notifiedTxRef.current = txHash;
    const outNetworkId = effectiveNetworkId === "arc-confidential" ? "arc" : effectiveNetworkId;
    const payload = { amount, token: token.symbol, network: displayNetwork.name, networkId: outNetworkId, txHash, explorerUrl: network.explorerUrl ?? null, mode: paymentMode, ...(memo.trim() ? { memo: memo.trim() } : {}) };
    const encrypted = encryptPaymentPayload(payload, recipient.publicKey, getCachedPrivateKey());
    if (!encrypted) {
      console.warn("[PaymentsView] Missing keys — payment receipt not sent (encryption required)");
      return;
    }
    fetch(apiUrl(`/api/messages/${recipient.id}`), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ encryptedContent: encrypted, messageType: "payment" }) }).catch(() => {});
  }, [step, txHash, recipient?.id, recipient?.publicKey, amount, token.symbol, displayNetwork.name, effectiveNetworkId, network.explorerUrl, memo, paymentMode]);

  const isSendingRef = useRef(false);
  const handleSend = async () => {
    if (!recipientWallet || !isValidEthAddress(recipientWallet)) return;
    const amountErr = validateAmount(amount);
    if (amountErr) { alert(amountErr); return; }
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    try {
      // ── Strict pre-flight: 1 sender wallet → 1 recipient wallet ─────────
      // Refresh both sides from the server so we never act on stale UI state
      // and so a wallet swap on either side is caught BEFORE we sign anything.
      let serverSenderWallet: string | null = null;
      let serverRecipientWallet: string | null = null;
      try {
        const [meRes, rcptRes] = await Promise.all([
          fetch(apiUrl("/api/auth/me"), { credentials: "include" }),
          recipient?.id
            ? fetch(apiUrl(`/api/users/id/${encodeURIComponent(recipient.id)}`), { credentials: "include" })
            : Promise.resolve(null),
        ]);
        if (meRes.ok) {
          const me = await meRes.json();
          serverSenderWallet = me.walletAddress ?? null;
        }
        if (rcptRes && rcptRes.ok) {
          const r = await rcptRes.json();
          serverRecipientWallet = r.walletAddress ?? null;
        }
      } catch {
        alert("Couldn't verify wallet bindings — please check your connection and try again.");
        return;
      }

      if (!serverSenderWallet) {
        alert("Your account has no bound wallet. Connect a wallet first in the Payments view.");
        return;
      }
      if (!walletAddress || serverSenderWallet.toLowerCase() !== walletAddress.toLowerCase()) {
        alert(
          `Your connected wallet (${walletAddress?.slice(0, 6) ?? "?"}…${walletAddress?.slice(-4) ?? "?"}) ` +
          `does not match the wallet bound to this account (${serverSenderWallet.slice(0, 6)}…${serverSenderWallet.slice(-4)}). ` +
          `Reconnect the correct wallet before sending.`,
        );
        return;
      }
      if (!serverRecipientWallet || !isValidEthAddress(serverRecipientWallet)) {
        alert("Recipient does not have a wallet bound to their account.");
        return;
      }
      if (serverRecipientWallet.toLowerCase() !== recipientWallet.toLowerCase()) {
        alert(
          "Recipient's wallet has changed since this view was opened. " +
          "Please reopen the chat to refresh and try again.",
        );
        return;
      }
      if (serverSenderWallet.toLowerCase() === serverRecipientWallet.toLowerCase()) {
        alert("Cannot send to yourself.");
        return;
      }

      if (isArc && paymentMode === "standard") {
        await arcHook.sendConfidentialPayment(serverRecipientWallet, amount, serverSenderWallet);
      } else if (paymentMode === "confidential") {
        await confHook.sendConfidentialPayment(serverRecipientWallet, amount);
      } else {
        await stdHook.sendPayment(serverRecipientWallet, amount);
      }
    } finally {
      isSendingRef.current = false;
    }
  };

  const sentRequestRef = useRef(false);
  const handleRequest = async () => {
    if (!recipient?.id || !amountValid || sentRequestRef.current) return;
    sentRequestRef.current = true;
    setRequestError(null);
    const outNetworkId = effectiveNetworkId === "arc-confidential" ? "arc" : effectiveNetworkId;
    const payload = { amount, token: token.symbol, network: displayNetwork.name, networkId: outNetworkId, ...(memo.trim() ? { memo: memo.trim() } : {}) };
    const encrypted = encryptPaymentPayload(payload, recipient.publicKey, getCachedPrivateKey());
    if (!encrypted) {
      sentRequestRef.current = false;
      setRequestError("Could not encrypt payment request — unlock your account keys");
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/messages/${recipient.id}`), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ encryptedContent: encrypted, messageType: "payment_request" }) });
      if (!res.ok) throw new Error("Failed");
      setAmount(""); setMemo(""); sentRequestRef.current = false;
    } catch { sentRequestRef.current = false; setRequestError("Could not send payment request — please try again"); }
  };

  useEffect(() => { if (step === "done") { const tid = setTimeout(() => { reset(); setAmount(""); setMemo(""); }, 3000); return () => clearTimeout(tid); } return undefined; }, [step]);

  const [showNetworkMenu, setShowNetworkMenu] = useState(false);
  const networkBtnRef = useRef<HTMLButtonElement>(null);
  const [networkMenuRect, setNetworkMenuRect] = useState<DOMRect | null>(null);

  const visibleNetworks = Object.values(NETWORKS).filter(n => !n.hidden && n.id === "arc");
  const tokenList = Object.values(displayNetwork.tokens);

  const accent = "var(--fc-accent)";
  const grad = "linear-gradient(135deg, #9B5CF6 0%, #E040BD 100%)";
  const cardBg = dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const cardBorder = dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const subtleBg = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  const statusSteps = effectiveMode === "confidential"
    ? [{ key: "initializing", label: "Initializing confidential account…" }, { key: "depositing", label: `Depositing ${token.symbol} into encrypted layer…` }, { key: "transferring", label: "Sending confidential transfer…" }, { key: "done", label: "Transfer complete!" }]
    : [{ key: "transferring", label: `Sending ${token.symbol}…` }, { key: "done", label: "Transfer complete!" }];

  return (
    <div className="fc-glass-panel fc-chat" style={{ display: "flex", flexDirection: "column", color: T.text, minWidth: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: `0.5px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: grad, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wallet size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Payments</h1>
            <p style={{ fontSize: 12, color: T.textSec, margin: 0 }}>
              {isArc && paymentMode === "standard" ? "Circle Gateway · Arc" : paymentMode === "confidential" ? "StableTrust · FairBlock" : "Direct on-chain transfer"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setShowPaymentsView(false)}
            style={{ width: 36, height: 36, borderRadius: 10, background: "transparent", border: `1px solid ${T.border}`, cursor: "pointer", color: T.textSec, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>

          {/* Payment Form */}
              {/* Send / Request Toggle */}
              <div style={{ position: "relative", display: "flex", background: subtleBg, borderRadius: 14, padding: 3, height: 42, marginBottom: 20, border: `0.5px solid ${cardBorder}` }}>
                <div style={{
                  position: "absolute", top: 3, bottom: 3, left: 3, width: "calc(50% - 3px)", borderRadius: 11,
                  background: mode === "send" ? grad : "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)",
                  transform: mode === "request" ? "translateX(100%)" : "translateX(0%)",
                  transition: "transform 0.22s cubic-bezier(0.34,1.1,0.64,1)", pointerEvents: "none",
                }} />
                {(["send", "request"] as const).map(m => (
                  <button key={m} disabled={eitherBusy} onClick={() => !eitherBusy && setMode(m)}
                    style={{ flex: 1, background: "transparent", border: "none", fontSize: 13, fontWeight: 700, cursor: eitherBusy ? "not-allowed" : "pointer", color: mode === m ? "#fff" : T.textSec, position: "relative", zIndex: 1, transition: "color 0.18s" }}>
                    {m === "send" ? "Send" : "Request"}
                  </button>
                ))}
              </div>

              {/* Privacy Toggle */}
              <div style={{ position: "relative", display: "flex", background: subtleBg, borderRadius: 11, padding: 3, height: 36, marginBottom: 20, border: `0.5px solid ${cardBorder}` }}>
                <div style={{
                  position: "absolute", top: 3, bottom: 3, left: 3, width: "calc(50% - 3px)", borderRadius: 8,
                  background: paymentMode === "confidential" ? grad : (dk ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)"),
                  transform: paymentMode === "confidential" ? "translateX(100%)" : "translateX(0%)",
                  transition: "transform 0.25s cubic-bezier(0.34,1.1,0.64,1)", pointerEvents: "none",
                }} />
                <button disabled={eitherBusy} onClick={() => { if (!eitherBusy) { setPaymentMode("standard"); confHook.reset(); stdHook.reset(); arcHook.reset(); } }}
                  style={{ flex: 1, background: "transparent", border: "none", color: paymentMode === "standard" ? (dk ? "#fff" : "#000") : T.textSec, fontSize: 11, fontWeight: 700, cursor: eitherBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, position: "relative", zIndex: 1 }}>
                  <Zap size={10} /> Standard
                </button>
                <button disabled={eitherBusy} onClick={() => { if (!eitherBusy) { setPaymentMode("confidential"); confHook.reset(); stdHook.reset(); arcHook.reset(); } }}
                  style={{ flex: 1, background: "transparent", border: "none", color: paymentMode === "confidential" ? "#fff" : T.textSec, fontSize: 11, fontWeight: 700, cursor: eitherBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, position: "relative", zIndex: 1 }}>
                  <Lock size={10} /> Confidential
                </button>
              </div>

              {/* Wallet Status Bar */}
              {mode === "send" && isAuthenticated && walletAddress && (
                <div style={{ padding: "12px 16px", borderRadius: 14, background: dk ? "rgba(74,222,128,0.06)" : "rgba(74,222,128,0.08)", border: `1px solid ${dk ? "rgba(74,222,128,0.15)" : "rgba(74,222,128,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Wallet size={13} color="#4ade80" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4ade80", fontFamily: "monospace" }}>{walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "#4ade80" }}>{(isNaN(parseFloat(displayBalance)) ? 0 : parseFloat(displayBalance)).toFixed(2)} {token.symbol}</span>
                    <button onClick={logout} title="Disconnect" style={{ background: "none", border: "none", cursor: "pointer", color: T.textSec, display: "flex", padding: 2 }}><LogOut size={12} /></button>
                  </div>
                </div>
              )}

              {/* Arc Gateway Balance */}
              {isArc && paymentMode === "standard" && isAuthenticated && (parseFloat(arcHook.withdrawState.withdrawableBalance) > 0 || parseFloat(arcHook.withdrawState.withdrawingBalance) > 0 || parseFloat(arcHook.balances.confidential) > 0) && (
                <div style={{ padding: "14px 16px", borderRadius: 14, background: cardBg, border: `1px solid ${cardBorder}`, marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <ArrowDownToLine size={13} color={T.textSec} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Gateway Balance</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textSec }}>
                      <span>Available in Gateway</span><span style={{ fontWeight: 500, color: T.text }}>{arcHook.balances.confidential} USDC</span>
                    </div>
                    {parseFloat(arcHook.withdrawState.withdrawingBalance) > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textSec }}>
                        <span>Withdrawing (pending)</span>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ color: "#fbbf24", fontWeight: 500 }}>
                            {arcHook.withdrawState.withdrawingBalance} USDC
                          </span>
                          {arcHook.withdrawInitiatedAt && (
                            <WithdrawCountdown
                              initiatedAt={arcHook.withdrawInitiatedAt}
                              delaySeconds={Number(arcHook.withdrawDelay)}
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {parseFloat(arcHook.withdrawState.withdrawableBalance) > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textSec }}>
                        <span>Ready to withdraw</span><span style={{ color: "#4ade80", fontWeight: 500 }}>{arcHook.withdrawState.withdrawableBalance} USDC</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    {arcHook.withdrawState.canInitiate && step === "idle" && (
                      <button onClick={() => { arcHook.reset(); arcHook.initiateWithdraw(); }}
                        style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 600, borderRadius: 10, background: subtleBg, border: `1px solid ${cardBorder}`, color: T.text, cursor: "pointer" }}>
                        Initiate Withdrawal
                      </button>
                    )}
                    {arcHook.withdrawState.canFinalize && step === "idle" && (
                      <button onClick={() => { arcHook.reset(); arcHook.finalizeWithdraw(); }}
                        style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 600, borderRadius: 10, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80", cursor: "pointer" }}>
                        Complete Withdrawal
                      </button>
                    )}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: T.textSec, lineHeight: 1.5 }}>
                    Received payments land in the Circle Gateway. Use "Initiate Withdrawal" to start, then "Complete Withdrawal" after the delay period.
                  </div>
                </div>
              )}

              {/* Amount + Network Card */}
              <div style={{ borderRadius: 16, padding: "20px", background: cardBg, border: `1px solid ${cardBorder}`, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.textSec, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    {mode === "send" ? "You send" : "You request"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button ref={networkBtnRef} disabled={step !== "idle"} onClick={() => { setNetworkMenuRect(networkBtnRef.current?.getBoundingClientRect() ?? null); setShowNetworkMenu(v => !v); }}
                      style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 12px 0 10px", borderRadius: 24, background: subtleBg, border: `1px solid ${cardBorder}`, cursor: step !== "idle" ? "not-allowed" : "pointer", opacity: step !== "idle" ? 0.45 : 1 }}>
                      <NetLogo networkId={displayNetwork.id} size={22} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{displayNetwork.name}</span>
                      <ChevronDown size={13} color={T.textSec} />
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 12px", borderRadius: 24, background: subtleBg, border: `1px solid ${cardBorder}` }}>
                      <TokCircle symbol={token.symbol} size={22} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{token.symbol}</span>
                    </div>
                  </div>
                </div>

                <input type="text" inputMode="decimal" placeholder="0.00" value={amount}
                  onChange={e => { if (/^[\d]*\.?[\d]*$/.test(e.target.value)) setAmount(e.target.value); }}
                  disabled={mode === "send" ? !isAuthenticated || step !== "idle" || !isReady : step !== "idle"}
                  style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 42, fontWeight: 700, color: T.text, letterSpacing: "-0.04em", opacity: mode === "send" && (!isAuthenticated || !isReady) ? 0.2 : 1 }} />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                  <span style={{ fontSize: 12, color: T.textSec }}>Balance: <span style={{ fontWeight: 600, color: T.text }}>{(parseFloat(displayBalance) || 0).toFixed(2)} {token.symbol}</span></span>
                  {isAuthenticated && parseFloat(displayBalance) > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => {
                        const gwBal = parseFloat(displayBalance) || 0;
                        const safeAmount = gwBal * 0.95;
                        setAmount(isNaN(safeAmount) ? "0" : safeAmount.toFixed(2));
                      }}
                        style={{ fontSize: 10, fontWeight: 800, color: accent, background: dk ? "rgba(124,77,255,0.15)" : "rgba(124,77,255,0.1)", border: `1px solid ${dk ? "rgba(124,77,255,0.3)" : "rgba(124,77,255,0.2)"}`, padding: "2px 8px", borderRadius: 6, cursor: "pointer", letterSpacing: "0.04em" }}>MAX</button>
                      <span style={{ fontSize: 10, color: T.textSec }}>~5% reserved for gas</span>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: subtleBg, border: `1px solid ${cardBorder}` }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>✏️</span>
                  <input type="text" placeholder="Add a note (optional)" value={memo} onChange={e => setMemo(e.target.value.slice(0, 80))} maxLength={80}
                    style={{ flex: 1, background: "none", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "inherit" }} />
                  {memo && <span style={{ fontSize: 10, color: T.textSec, flexShrink: 0 }}>{memo.length}/80</span>}
                </div>

                {(displayNetwork.comingSoon || token.comingSoon) && (
                  <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", fontSize: 12, color: "#fbbf24", lineHeight: 1.5 }}>
                    {displayNetwork.comingSoon ? `${displayNetwork.name} is coming soon — Base Sepolia is active.` : `${token.symbol} is coming soon — only USDC is supported.`}
                  </div>
                )}
              </div>

              {/* Recipient Card */}
              <div style={{ borderRadius: 16, padding: "16px 20px", background: cardBg, border: `1px solid ${cardBorder}`, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.textSec, letterSpacing: "0.07em", textTransform: "uppercase" }}>To</span>
                  <button onClick={() => setShowContactPicker(v => !v)}
                    style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: dk ? "rgba(124,77,255,0.12)" : "rgba(124,77,255,0.08)", border: `1px solid ${dk ? "rgba(124,77,255,0.25)" : "rgba(124,77,255,0.15)"}`, color: accent, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                    <UserPlus size={11} /> {recipient ? "Change" : "Pick contact"}
                  </button>
                </div>

                {showContactPicker && (
                  <ContactPickerInline contacts={contacts} savedContactIds={savedContactIds} selectedId={recipient?.id ?? null} onSelect={c => { selectContact(c); setShowContactPicker(false); }} T={T} dk={dk} />
                )}

                {recipient ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: getColor(recipient.displayName), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 700, fontSize: 14, color: "#fff", overflow: "hidden" }}>
                      {recipient.avatarUrl ? <img src={recipient.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : ini(recipient.displayName)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{recipient.displayName}</div>
                      {recipientWallet ? (
                        <div style={{ fontSize: 11, color: "#4ade80", fontFamily: "monospace", marginTop: 2 }}>{recipientWallet.slice(0, 8)}…{recipientWallet.slice(-6)}</div>
                      ) : (
                        <div style={{ fontSize: 11, color: T.textSec, marginTop: 2 }}>No wallet linked yet</div>
                      )}
                    </div>
                    {isValidEthAddress(recipientWallet) ? <CheckCircle2 size={16} color="#4ade80" /> : <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 6, background: dk ? "rgba(124,77,255,0.12)" : "rgba(124,77,255,0.08)", border: `1px solid ${dk ? "rgba(124,77,255,0.25)" : "rgba(124,77,255,0.15)"}`, color: accent }}>{recipientWallet ? "Invalid" : "No wallet"}</span>}
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: T.textSec }}>Select a contact first</span>
                )}

                {mode === "send" && recipient && !isValidEthAddress(recipientWallet) && walletDataLoaded && (
                  <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>⚠️</span>
                    <span style={{ fontSize: 12, color: "#fcd34d", lineHeight: 1.5 }}><strong>{recipient.displayName}</strong> hasn't linked a wallet address yet — they won't be able to receive this payment.</span>
                  </div>
                )}
                {mode === "send" && isSelfTransfer && (
                  <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>⚠️</span>
                    <span style={{ fontSize: 12, color: "#f87171", lineHeight: 1.5 }}>Cannot send to yourself — the recipient has the same wallet address as yours.</span>
                  </div>
                )}
              </div>

              {/* Transfer info line */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "0 4px" }}>
                {isArc && paymentMode === "standard" ? (
                  <><Lock size={11} color={T.textSec} /><span style={{ fontSize: 11, color: T.textSec }}>Circle Gateway · x402 Batched · Arc Network</span></>
                ) : paymentMode === "confidential" ? (
                  <><Lock size={11} color={T.textSec} /><span style={{ fontSize: 11, color: T.textSec }}>FHE encrypted · ~45 sec · StableTrust · FairBlock</span></>
                ) : (
                  <><Zap size={11} color={T.textSec} /><span style={{ fontSize: 11, color: T.textSec }}>Direct on-chain transfer · ERC-20 · Standard</span></>
                )}
              </div>

              {/* Status */}
              {mode === "send" && step !== "idle" && (
                <div style={{ borderRadius: 14, padding: "14px 16px", background: step === "error" ? "rgba(248,113,113,0.06)" : step === "done" ? "rgba(74,222,128,0.06)" : cardBg, border: `1px solid ${step === "error" ? "rgba(248,113,113,0.15)" : step === "done" ? "rgba(74,222,128,0.15)" : cardBorder}`, marginBottom: 16 }}>
                  {step === "error" ? (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                      <AlertCircle size={14} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 13, color: "#f87171", lineHeight: 1.5 }}>{error ?? "Transaction failed"}</span>
                    </div>
                  ) : step === "done" ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={14} color="#4ade80" /><span style={{ fontSize: 13, fontWeight: 700, color: "#4ade80" }}>Transfer confirmed!</span></div>
                      {txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash) && (
                        <a href={`${network.explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.textSec, display: "flex", alignItems: "center", gap: 4, textDecoration: "none", marginTop: 6 }}>View on Explorer <ExternalLink size={11} /></a>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {statusSteps.map((s, i) => {
                        const currentIdx = statusSteps.findIndex(ss => ss.key === step);
                        const done = i < currentIdx;
                        const act = s.key === step;
                        return (
                          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            {done ? <CheckCircle2 size={13} color="#4ade80" /> : act ? <Loader2 size={13} color={T.text} style={{ animation: "spin 1s linear infinite" }} /> : <div style={{ width: 13, height: 13, borderRadius: "50%", border: `1.5px solid ${cardBorder}` }} />}
                            <span style={{ fontSize: 13, color: done ? "#4ade80" : act ? T.text : T.textSec, fontWeight: act ? 600 : 400 }}>{s.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {requestError && mode === "request" && (
                <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", fontSize: 13, color: "#f87171", lineHeight: 1.5, marginBottom: 16 }}>{requestError}</div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 10 }}>
                {mode === "request" ? (
                  <button onClick={handleRequest} disabled={!canRequest}
                    style={{ flex: 1, padding: "14px", borderRadius: 14, background: canRequest ? "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)" : subtleBg, border: canRequest ? "none" : `1px solid ${cardBorder}`, color: canRequest ? "#fff" : T.textSec, fontSize: 14, fontWeight: 700, cursor: canRequest ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <ArrowUpRight size={14} /> Request Payment
                  </button>
                ) : step === "done" ? (
                  <button onClick={() => { reset(); setAmount(""); setMemo(""); }}
                    style={{ flex: 1, padding: "14px", borderRadius: 14, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ade80", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <CheckCircle2 size={14} /> Done · auto-closing…
                  </button>
                ) : step === "error" ? (
                  <button onClick={reset}
                    style={{ flex: 1, padding: "14px", borderRadius: 14, background: subtleBg, border: `1px solid ${cardBorder}`, color: T.text, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    Try again
                  </button>
                ) : !isAuthenticated ? (
                  <button onClick={login}
                    style={{ flex: 1, padding: "14px", borderRadius: 14, background: grad, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Wallet size={14} /> Connect Wallet
                  </button>
                ) : (
                  <button onClick={handleSend} disabled={!canSend}
                    style={{ flex: 1, padding: "14px", borderRadius: 14, background: canSend ? grad : subtleBg, border: canSend ? "none" : `1px solid ${cardBorder}`, color: canSend ? "#fff" : T.textSec, fontSize: 14, fontWeight: 700, cursor: canSend ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    {paymentMode === "confidential" ? <Lock size={13} /> : <Zap size={13} />}
                    {paymentMode === "confidential" ? "Send Confidential" : `Send ${token.symbol}`}
                  </button>
                )}
              </div>
          {/* Transaction History - inline */}
          {txLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}><Loader2 size={20} color={T.textSec} style={{ animation: "spin 1s linear infinite" }} /></div>
          ) : txHistory.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Clock size={12} />
                Recent Transactions
              </div>
              <div style={{ borderRadius: 16, border: `0.5px solid ${cardBorder}`, overflow: "hidden" }}>
                {txHistory.slice(0, historyLimit).map((tx, i, arr) => {
                  const isSend = tx.messageType === "payment" && tx.isSent;
                  const isReq = tx.messageType === "payment_request";
                  const link = tx.parsed?.explorerUrl && tx.parsed?.txHash ? `${tx.parsed.explorerUrl.replace(/\/$/, "")}/tx/${tx.parsed.txHash}` : null;
                  return (
                    <div key={tx.id} style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 11, borderBottom: i < arr.length - 1 ? `0.5px solid ${cardBorder}` : "none", transition: "background 0.1s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = T.hoverBg)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        background: isReq ? "rgba(245,158,11,0.12)" : isSend ? (dk ? "rgba(248,113,113,0.12)" : "rgba(248,113,113,0.08)") : (dk ? "rgba(74,222,128,0.12)" : "rgba(74,222,128,0.08)"),
                        color: isReq ? "#f59e0b" : isSend ? "#f87171" : "#4ade80" }}>
                        {isReq ? <ArrowUpRight size={14} /> : isSend ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{tx.parsed?.amount ?? "?"} {tx.parsed?.token ?? "USDC"}</span>
                          {isReq && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "rgba(245,158,11,0.15)", color: "#fcd34d" }}>REQUEST</span>}
                        </div>
                        <div style={{ fontSize: 11, color: T.textSec, marginTop: 1 }}>
                          {isSend ? `→ ${tx.partnerName}` : `← ${tx.partnerName}`}{tx.parsed?.network && ` · ${tx.parsed.network}`}
                          {" · "}{new Date(tx.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </div>
                      </div>
                      {link && <a href={link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: T.textSec, display: "flex" }}><ExternalLink size={12} /></a>}
                    </div>
                  );
                })}
              </div>
              {txHistory.length > historyLimit && (
                <button onClick={() => setHistoryLimit(prev => prev + 20)}
                  style={{ width: "100%", padding: "10px", marginTop: 8, borderRadius: 10, background: "none", border: `1px solid ${cardBorder}`, cursor: "pointer", color: T.textSec, fontSize: 12, fontWeight: 600, transition: "background 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.hoverBg)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  Show more ({txHistory.length - historyLimit} remaining)
                </button>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Network dropdown portal */}
      {showNetworkMenu && networkMenuRect && createPortal(
        <div onClick={e => e.stopPropagation()} style={{ position: "fixed", top: networkMenuRect.bottom + 6, left: networkMenuRect.left, zIndex: 99999, width: 280, borderRadius: 16, background: dk ? "rgba(26,24,36,0.96)" : "#fff", border: `1px solid ${cardBorder}`, boxShadow: "0 24px 64px rgba(0,0,0,0.3)", overflow: "hidden" }}>
          {visibleNetworks.map((n, i, arr) => (
            <button key={n.id} onClick={() => { if (!n.comingSoon) { setNetworkId(n.id); setTokenSymbol("USDC"); setAmount(""); } setShowNetworkMenu(false); }}
              style={{ width: "100%", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, background: n.id === networkId ? (NETWORK_ACCENT[n.id] ?? subtleBg) : "transparent", border: "none", borderBottom: i < arr.length - 1 ? `1px solid ${cardBorder}` : "none", cursor: n.comingSoon ? "default" : "pointer", opacity: n.comingSoon ? 0.45 : 1, color: T.text }}>
              <NetLogo networkId={n.id} size={26} />
              <span style={{ flex: 1, textAlign: "left", fontSize: 14, fontWeight: 700 }}>{n.name}</span>
              {n.comingSoon ? <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>Soon</span>
                : n.badge ? <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, background: subtleBg, color: T.textSec }}>{n.badge}</span> : null}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function ContactPickerInline({ contacts, savedContactIds, selectedId, onSelect, T, dk }: {
  contacts: Array<{ id: string; username: string; displayName: string; avatarUrl?: string | null; walletAddress?: string | null }>;
  savedContactIds: Set<string>;
  selectedId: string | null;
  onSelect: (c: any) => void;
  T: any; dk: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = q.trim() ? contacts.filter(c => c.displayName.toLowerCase().includes(q.toLowerCase()) || c.username.toLowerCase().includes(q.toLowerCase())) : contacts;
  const cardBorder = dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  return (
    <div style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${cardBorder}`, overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${cardBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
        <Search size={13} color={T.textSec} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search contacts…"
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "inherit" }} />
      </div>
      <div style={{ maxHeight: 180, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "14px", fontSize: 12, color: T.textSec, textAlign: "center" }}>{q ? "No results" : "No conversations yet"}</div>
        ) : filtered.map((c, i, arr) => (
          <button key={c.id} onClick={() => onSelect(c)}
            style={{ width: "100%", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, background: selectedId === c.id ? (dk ? "rgba(124,77,255,0.12)" : "rgba(124,77,255,0.06)") : "transparent", border: "none", borderBottom: i < arr.length - 1 ? `1px solid ${cardBorder}` : "none", cursor: "pointer", textAlign: "left", color: T.text }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: getColor(c.displayName), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: "#fff", overflow: "hidden" }}>
              {c.avatarUrl ? <img src={c.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : ini(c.displayName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.displayName}</span>
                {savedContactIds.has(c.id) && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: dk ? "rgba(124,77,255,0.15)" : "rgba(124,77,255,0.08)", color: "var(--fc-accent)" }}>Saved</span>}
              </div>
              <div style={{ fontSize: 10, color: T.textSec }}>@{c.username}</div>
            </div>
            {c.walletAddress ? <CheckCircle2 size={12} color="#4ade80" /> : <span style={{ fontSize: 9, color: "#fbbf24" }}>No wallet</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
