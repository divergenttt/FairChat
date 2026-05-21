import React, { useState, useEffect, useRef } from "react";
import { apiUrl } from "@/lib/apiConfig";
import type { Theme } from "../pages/chat/types";
import { Lock, Zap, Clock, ArrowDownToLine } from "lucide-react";
import { useConfidentialPayment } from "../hooks/useConfidentialPayment";
import { useStandardPayment } from "../hooks/useStandardPayment";
import { useArcPayment } from "../hooks/useArcPayment";
import { useWallet } from "../hooks/useWallet";
import { NETWORKS } from "../lib/paymentConfig";
import { encryptPaymentPayload, parsePaymentHistoryEntry } from "../lib/paymentMessage";
import { GlassOverlay, GlassPanel, GlassBtn, G } from "./payment/PaymentGlass";
import { StatusBox } from "./payment/StatusBox";
import { PaymentHistory, type TxHistoryEntry } from "./payment/PaymentHistory";
import { useContactPicker, ContactPickerDropdown, RecipientDisplay } from "./payment/ContactPicker";
import { ModeToggle, PrivacyToggle } from "./payment/ModeToggle";
import { SendCard } from "./payment/SendCard";
import { WalletBar } from "./payment/WalletBar";
import { ActionButtons } from "./payment/ActionButtons";

interface User {
  id: string;
  username: string;
  displayName: string;
  publicKey?: string;
  isOnline?: boolean;
  avatarUrl?: string | null;
  walletAddress?: string | null;
}

interface Props {
  onClose: () => void;
  selectedUser: User | null;
  T: Theme;
  getColor: (name: string) => string;
  ini: (name: string) => string;
  initialMode?: "send" | "request";
  initialAmount?: string;
  initialNetworkId?: string;
  initialTokenSymbol?: string;
  initialReplyToRequestId?: string;
}

export default function PaymentModal({
  onClose,
  selectedUser,
  getColor,
  ini,
  initialMode = "send",
  initialAmount = "",
  initialNetworkId,
  initialTokenSymbol,
  initialReplyToRequestId,
}: Props) {
  const [mode, setMode] = useState<"send" | "request">(initialMode);
  const [paymentMode, setPaymentMode] = useState<"standard" | "confidential">("standard");
  const [memo, setMemo] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [txHistory, setTxHistory] = useState<TxHistoryEntry[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const [networkId, setNetworkId] = useState(
    initialNetworkId && NETWORKS[initialNetworkId] ? initialNetworkId : "base-sepolia",
  );
  const [tokenSymbol, setTokenSymbol] = useState(initialTokenSymbol ?? "USDC");
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
    ? paymentMode === "confidential"
      ? confHook
      : {
          isAuthenticated: arcHook.isAuthenticated,
          walletAddress: arcHook.walletAddress,
          balances: arcHook.balances,
          step: arcHook.step,
          txHash: arcHook.txHash,
          error: arcHook.error,
          login: arcHook.login,
          logout: arcHook.logout,
          fetchBalances: arcHook.fetchBalances,
          reset: arcHook.reset,
        }
    : paymentMode === "confidential"
      ? confHook
      : stdHook;

  const { isAuthenticated, walletAddress, balances, step, txHash, error, login, logout, fetchBalances, reset } =
    active;

  const [amount, setAmount] = useState(initialAmount);
  const [showContactPicker, setShowContactPicker] = useState(false);

  const { recipient, contacts, savedContactIds, walletDataLoaded, selectContact } =
    useContactPicker(selectedUser);

  const savedWalletRef = useRef<string | null>(null);
  useEffect(() => {
    if (!walletAddress) return;
    if (savedWalletRef.current === walletAddress) return;
    savedWalletRef.current = walletAddress;
    fetch(apiUrl("/api/auth/me"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ walletAddress }),
    }).catch(() => {});
  }, [walletAddress]);

  useEffect(() => {
    if (!showHistory) return;
    setTxLoading(true);
    fetch(apiUrl("/api/messages/payment-history"), { credentials: "include" })
      .then((r) => r.json())
      .then((data: TxHistoryEntry[]) => {
        setTxHistory(data.map((e) => parsePaymentHistoryEntry(e)));
      })
      .catch(() => {})
      .finally(() => setTxLoading(false));
  }, [showHistory]);

  const recipientWallet = recipient?.walletAddress ?? null;
  const isReady = !displayNetwork.comingSoon && !token.comingSoon;
  const isValidEthAddress = (addr: string | null) => !!addr && /^0x[0-9a-fA-F]{40}$/.test(addr);

  const amountNum = parseFloat(amount);
  const decimalCount = amount.includes(".") ? (amount.split(".")[1]?.length ?? 0) : 0;
  const amountValid = !!amount && !isNaN(amountNum) && amountNum >= 0.01 && decimalCount <= token.decimals;
  const isSelfTransfer = !!(walletAddress && recipientWallet && walletAddress.toLowerCase() === recipientWallet.toLowerCase());
  const canSend = isAuthenticated && isValidEthAddress(recipientWallet) && !isSelfTransfer && amountValid && step === "idle" && isReady;
  const eitherBusy = confHook.step !== "idle" || stdHook.step !== "idle" || arcHook.step !== "idle";
  const canRequest = !!recipient?.id && amountValid;

  const notifiedTxRef = useRef<string | null>(null);
  useEffect(() => {
    if (step !== "done" || !txHash || !recipient?.id || notifiedTxRef.current === txHash) return;
    notifiedTxRef.current = txHash;
    const outNetworkId = effectiveNetworkId === "arc-confidential" ? "arc" : effectiveNetworkId;
    const payload = {
      amount, token: token.symbol, network: displayNetwork.name, networkId: outNetworkId,
      txHash, explorerUrl: network.explorerUrl ?? null, mode: paymentMode,
      ...(memo.trim() ? { memo: memo.trim() } : {}),
    };
    const encrypted = encryptPaymentPayload(payload, recipient.publicKey);
    if (!encrypted) {
      console.warn("[PaymentModal] Missing keys — payment receipt not sent");
      return;
    }
    fetch(apiUrl(`/api/messages/${recipient.id}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        encryptedContent: encrypted, messageType: "payment",
        ...(initialReplyToRequestId ? { replyToId: initialReplyToRequestId } : {}),
      }),
    }).catch(() => {});
  }, [step, txHash, recipient?.id, recipient?.publicKey, amount, token.symbol, displayNetwork.name, effectiveNetworkId, network.explorerUrl, memo, initialReplyToRequestId, paymentMode]);

  const handleSend = async () => {
    if (!recipientWallet || !amount || !isValidEthAddress(recipientWallet) || !amountValid) return;

    // Strict pre-flight: 1 sender wallet → 1 recipient wallet (mirrors PaymentsView).
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
      alert("Your account has no bound wallet. Connect a wallet first.");
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
      alert("Recipient's wallet has changed. Please reopen this dialog and try again.");
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
  };

  const handleClose = () => { reset(); onClose(); };

  useEffect(() => {
    if (step !== "done") return;
    const tid = setTimeout(handleClose, 3000);
    return () => clearTimeout(tid);
  }, [step]);

  const sentRequestRef = useRef(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const handleRequest = async () => {
    if (!recipient?.id || !amountValid || sentRequestRef.current) return;
    sentRequestRef.current = true;
    setRequestError(null);
    const outNetworkId = effectiveNetworkId === "arc-confidential" ? "arc" : effectiveNetworkId;
    const payload = {
      amount, token: token.symbol, network: displayNetwork.name, networkId: outNetworkId,
      ...(memo.trim() ? { memo: memo.trim() } : {}),
    };
    const encrypted = encryptPaymentPayload(payload, recipient.publicKey);
    if (!encrypted) {
      sentRequestRef.current = false;
      setRequestError("Could not encrypt payment request — unlock your account keys");
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/messages/${recipient.id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ encryptedContent: encrypted, messageType: "payment_request" }),
      });
      if (!res.ok) throw new Error("Failed to send request");
      onClose();
    } catch {
      sentRequestRef.current = false;
      setRequestError("Could not send payment request \u2014 please try again");
    }
  };

  const effectiveMode = paymentMode;

  const headerSubtitle = isArc && paymentMode === "standard"
    ? "Powered by Circle Gateway \u00b7 Arc"
    : paymentMode === "confidential"
      ? "Powered by StableTrust \u00b7 FairBlock"
      : "Direct on-chain transfer";

  const displayBalance = effectiveMode === "confidential" ? balances.confidential : balances.public;

  return (
    <GlassOverlay
      onClose={handleClose}
      subtitle={headerSubtitle}
      headerRight={
        <button
          onClick={(e) => { e.stopPropagation(); setShowHistory((v) => !v); }}
          title="Transaction History"
          style={{
            width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer",
            background: showHistory ? G.grad : "rgba(155,92,246,0.14)",
            color: showHistory ? "#fff" : "#c4b5fd",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s",
          }}
        >
          <Clock size={13} />
        </button>
      }
    >
      {showHistory && <PaymentHistory txHistory={txHistory} txLoading={txLoading} />}

      <div style={{ overflowY: "auto", flex: 1, display: showHistory ? "none" : undefined }}>
        <ModeToggle mode={mode} setMode={setMode} disabled={eitherBusy} />
        <PrivacyToggle
          paymentMode={paymentMode}
          setPaymentMode={setPaymentMode}
          disabled={eitherBusy}
          onReset={() => { confHook.reset(); stdHook.reset(); arcHook.reset(); }}
        />

        {mode === "send" && isAuthenticated && walletAddress && (
          <WalletBar
            walletAddress={walletAddress}
            balance={displayBalance}
            tokenSymbol={token.symbol}
            onLogout={logout}
          />
        )}

        {isArc && paymentMode === "standard" && isAuthenticated && (parseFloat(arcHook.withdrawState.withdrawableBalance) > 0 || parseFloat(arcHook.withdrawState.withdrawingBalance) > 0 || parseFloat(arcHook.balances.confidential) > 0) && (
          <div style={{ padding: "6px 16px 0" }}>
            <GlassPanel style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <ArrowDownToLine size={13} color="#a78bfa" />
                <span style={{ fontSize: 12, fontWeight: 600, color: G.text }}>Gateway Balance</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: G.textSec }}>
                  <span>Available in Gateway</span>
                  <span style={{ color: G.text, fontWeight: 500 }}>{arcHook.balances.confidential} USDC</span>
                </div>
                {parseFloat(arcHook.withdrawState.withdrawingBalance) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: G.textSec }}>
                    <span>Withdrawing (pending)</span>
                    <span style={{ color: "#fbbf24", fontWeight: 500 }}>{arcHook.withdrawState.withdrawingBalance} USDC</span>
                  </div>
                )}
                {parseFloat(arcHook.withdrawState.withdrawableBalance) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: G.textSec }}>
                    <span>Ready to withdraw</span>
                    <span style={{ color: "#34d399", fontWeight: 500 }}>{arcHook.withdrawState.withdrawableBalance} USDC</span>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {arcHook.withdrawState.canInitiate && step === "idle" && (
                  <GlassBtn
                    onClick={() => { arcHook.reset(); arcHook.initiateWithdraw(); }}
                    style={{ flex: 1, padding: "8px 0", fontSize: 11.5 }}
                  >
                    Initiate Withdrawal
                  </GlassBtn>
                )}
                {arcHook.withdrawState.canFinalize && step === "idle" && (
                  <GlassBtn
                    onClick={() => { arcHook.reset(); arcHook.finalizeWithdraw(); }}
                    style={{ flex: 1, padding: "8px 0", fontSize: 11.5, background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)" }}
                  >
                    Complete Withdrawal
                  </GlassBtn>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 10.5, color: G.textMuted, lineHeight: 1.5 }}>
                Received payments land in the Circle Gateway. Use "Initiate Withdrawal" to start, then "Complete Withdrawal" after the delay period.
              </div>
            </GlassPanel>
          </div>
        )}

        <SendCard
          networkId={networkId}
          network={displayNetwork}
          token={token}
          amount={amount}
          setAmount={setAmount}
          memo={memo}
          setMemo={setMemo}
          setNetworkId={setNetworkId}
          setTokenSymbol={setTokenSymbol}
          balances={balances}
          paymentMode={effectiveMode}
          isAuthenticated={isAuthenticated}
          step={step}
          mode={mode}
        />

        <div style={{ padding: "8px 16px 0" }}>
          <GlassPanel style={{ padding: "14px 16px" }}>
            <RecipientDisplay
              recipient={recipient}
              getColor={getColor}
              ini={ini}
              onPickerToggle={() => setShowContactPicker((v) => !v)}
              showContactPicker={showContactPicker}
            />
            {showContactPicker && (
              <ContactPickerDropdown
                contacts={contacts}
                savedContactIds={savedContactIds}
                selectedId={recipient?.id ?? null}
                onSelect={selectContact}
                onClose={() => setShowContactPicker(false)}
                getColor={getColor}
                ini={ini}
              />
            )}
            {mode === "send" && recipient && !isValidEthAddress(recipientWallet) && walletDataLoaded && (
              <div
                style={{
                  marginTop: 10, padding: "9px 12px", borderRadius: G.radiusSm,
                  background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.28)",
                  display: "flex", alignItems: "flex-start", gap: 8,
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>{"\u26a0\ufe0f"}</span>
                <span style={{ fontSize: 11.5, color: "#FCD34D", lineHeight: 1.5 }}>
                  <strong style={{ color: "#FDE68A" }}>{recipient.displayName}</strong> hasn't linked
                  a wallet address yet {"\u2014"} they won't be able to receive this payment.
                </span>
              </div>
            )}
            {mode === "send" && isSelfTransfer && (
              <div
                style={{
                  marginTop: 10, padding: "9px 12px", borderRadius: G.radiusSm,
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.28)",
                  display: "flex", alignItems: "flex-start", gap: 8,
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>{"\u26a0\ufe0f"}</span>
                <span style={{ fontSize: 11.5, color: "#f87171", lineHeight: 1.5 }}>
                  Cannot send to yourself {"\u2014"} the recipient has the same wallet address as yours.
                </span>
              </div>
            )}
          </GlassPanel>
        </div>

        <div style={{ padding: "8px 18px 0", display: "flex", alignItems: "center", gap: 8 }}>
          {isArc && paymentMode === "standard" ? (
            <>
              <Lock size={11} color={G.textMuted} />
              <span style={{ fontSize: 11, color: G.textMuted }}>Circle Gateway</span>
              <span style={{ color: G.borderSub, fontSize: 11 }}>{"\u00b7"}</span>
              <span style={{ fontSize: 11, color: G.textMuted }}>x402 Batched</span>
              <span style={{ color: G.borderSub, fontSize: 11 }}>{"\u00b7"}</span>
              <span style={{ fontSize: 11, color: G.textMuted }}>Arc Network</span>
            </>
          ) : paymentMode === "confidential" ? (
            <>
              <Lock size={11} color={G.textMuted} />
              <span style={{ fontSize: 11, color: G.textMuted }}>FHE encrypted</span>
              <span style={{ color: G.borderSub, fontSize: 11 }}>{"\u00b7"}</span>
              <span style={{ fontSize: 11, color: G.textMuted }}>~45 sec</span>
              <span style={{ color: G.borderSub, fontSize: 11 }}>{"\u00b7"}</span>
              <span style={{ fontSize: 11, color: G.textMuted }}>StableTrust {"\u00b7"} Fairblock</span>
            </>
          ) : (
            <>
              <Zap size={11} color={G.textMuted} />
              <span style={{ fontSize: 11, color: G.textMuted }}>Direct on-chain transfer</span>
              <span style={{ color: G.borderSub, fontSize: 11 }}>{"\u00b7"}</span>
              <span style={{ fontSize: 11, color: G.textMuted }}>ERC-20 {"\u00b7"} Standard</span>
            </>
          )}
        </div>

        {mode === "send" && step !== "idle" && (
          <div style={{ padding: "10px 16px 0" }}>
            <StatusBox
              step={step}
              txHash={txHash}
              error={error}
              explorerUrl={network.explorerUrl}
              tokenSymbol={token.symbol}
              mode={effectiveMode}
            />
          </div>
        )}

        {requestError && mode === "request" && (
          <div style={{ padding: "8px 16px 0" }}>
            <div style={{
              padding: "10px 14px", borderRadius: 12,
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
              fontSize: 12, color: "#f87171", lineHeight: 1.5,
            }}>
              {requestError}
            </div>
          </div>
        )}

        <ActionButtons
          mode={mode}
          step={step}
          isAuthenticated={isAuthenticated}
          canSend={canSend}
          canRequest={canRequest}
          paymentMode={effectiveMode}
          tokenSymbol={token.symbol}
          onSend={handleSend}
          onRequest={handleRequest}
          onLogin={login}
          onClose={handleClose}
          onReset={reset}
        />
      </div>
    </GlassOverlay>
  );
}
