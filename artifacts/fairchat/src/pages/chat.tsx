import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAccount, useDisconnect } from "wagmi";
import { useAuth } from "@/hooks/useAuth";
import { apiUrl, getWsUrl, wsNeedsTokenAuth } from "@/lib/apiConfig";
import { encryptMessage, decryptMessage, initSodium, generateKeyPair, derivePublicKey, isValidKey, loadPrivateKey, setPrivateKey } from "@/lib/crypto";
import { idbGet, idbSet, idbClear, IDB_MSGS, IDB_CONVS, IDB_KEYS } from "@/lib/idb";
import { fmtTime } from "./chat/helpers";
import { URL_REGEX, THEMES } from "./chat/constants";
import { ChatContext, InputContext } from "./chat/context";
import Sidebar from "./chat/Sidebar";
import ChatArea from "./chat/ChatArea";
import PaymentsView from "./chat/PaymentsView";

class PaymentErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 40 }}>
          <div style={{ fontSize: 48 }}>&#9888;</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Payment terminal failed to load</div>
          <div style={{ fontSize: 14, opacity: 0.6, maxWidth: 400, textAlign: "center" }}>{this.state.error.message}</div>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 8, padding: "10px 24px", borderRadius: 10, background: "linear-gradient(135deg, #9B5CF6 0%, #E040BD 100%)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import SettingsPanel from "./chat/SettingsPanel";
import MediaGallery from "./chat/MediaGallery";
import Dialogs from "./chat/Dialogs";
import type { User, Message, ConvItem, LinkPreview, CtxMenu } from "./chat/types";

function fmtMsgPreview(decrypted: string | undefined, msgType?: string | null): string | undefined {
  if (decrypted?.startsWith("e1:")) return "🔒 Encrypted message";
  if (msgType === "payment") {
    try {
      const p = JSON.parse(decrypted ?? "");
      const amount = p.amount ?? "?";
      const token  = p.token  ?? "USDC";
      const net    = p.network ? ` · ${p.network}` : "";
      return `↗ ${amount} ${token}${net}`;
    } catch {
      return "Crypto transfer";
    }
  }
  if (msgType === "payment_request") {
    try {
      const p = JSON.parse(decrypted ?? "");
      const amount = p.amount ?? "?";
      const token  = p.token  ?? "USDC";
      return `⬆ Requested ${amount} ${token}`;
    } catch {
      return "Payment request";
    }
  }
  if (msgType === "payment_request_declined") return "✕ Payment request declined";
  return decrypted;
}

export default function ChatPage() {
  const { user, token, isLoading, logout: rawLogout, updateUser, refreshSession } = useAuth();
  const [, setLocation] = useLocation();
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const walletAutoSavedRef = useRef<string | null>(null);
  const walletMismatchAlertedRef = useRef<string | null>(null);

  // Always disconnect wagmi BEFORE clearing the auth session, otherwise the
  // wallet connection persists in wagmi's localStorage and gets reused by the
  // next account that logs in on this browser — leading to one account
  // accidentally spending another account's wallet.
  const logout = useCallback(() => {
    try { wagmiDisconnect(); } catch { /* ignore */ }
    try {
      // Clear wagmi's persisted connection state defensively. RainbowKit/wagmi
      // store the active connector under "wagmi.*" keys.
      Object.keys(localStorage)
        .filter((k) => k.startsWith("wagmi.") || k.startsWith("wagmi:") || k === "wagmi")
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    rawLogout();
  }, [wagmiDisconnect, rawLogout]);

  // 1-wallet-per-account guard: if the account already has a bound wallet on
  // the server and the user's wagmi-connected wallet differs, do NOT silently
  // overwrite the server binding. Force-disconnect the foreign wallet and
  // alert the user. Only auto-bind when the account has no wallet yet.
  useEffect(() => {
    if (!token || !wagmiConnected || !wagmiAddress || !user) return;

    const wagmiLc = wagmiAddress.toLowerCase();
    const boundLc = user.walletAddress?.toLowerCase() ?? null;

    if (boundLc && boundLc === wagmiLc) {
      walletMismatchAlertedRef.current = null;
      return;
    }

    if (boundLc && boundLc !== wagmiLc) {
      // Mismatch — the wallet connected in MetaMask/WalletConnect is NOT the
      // one bound to this account. Disconnect to prevent cross-account spend.
      if (walletMismatchAlertedRef.current !== wagmiAddress) {
        walletMismatchAlertedRef.current = wagmiAddress;
        // eslint-disable-next-line no-alert
        alert(
          `Connected wallet (${wagmiAddress.slice(0, 6)}…${wagmiAddress.slice(-4)}) does not match the wallet bound to this account ` +
          `(${user.walletAddress!.slice(0, 6)}…${user.walletAddress!.slice(-4)}). Disconnecting it. ` +
          `Connect the correct wallet, or change the bound wallet in Settings first.`,
        );
        try { wagmiDisconnect(); } catch { /* ignore */ }
      }
      return;
    }

    // No wallet bound yet — first-time bind for this account.
    if (walletAutoSavedRef.current === wagmiAddress) return;
    walletAutoSavedRef.current = wagmiAddress;
    fetch(apiUrl("/api/auth/me"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ walletAddress: wagmiAddress }),
    })
      .then((r) => { if (r.ok) updateUser({ walletAddress: wagmiAddress }); })
      .catch(() => {});
  }, [token, wagmiConnected, wagmiAddress, user, updateUser, wagmiDisconnect]);

  const withToken = useCallback((url: string | null | undefined): string => {
    return url ?? "";
  }, []);

  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<User[]>(() => {
    try { return JSON.parse(localStorage.getItem("fc_recent_searches") ?? "[]"); } catch { return []; }
  });
  const [wsStatus, setWsStatus] = useState<"connecting"|"connected"|"disconnected">("disconnected");
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const [selMode, setSelMode] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [fwdQuery, setFwdQuery] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [pinnedMsg, setPinnedMsg] = useState<Message | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [chatSearch, setChatSearch] = useState(false);
  const [chatQ, setChatQ] = useState("");
  const [chatMatchIdx, setChatMatchIdx] = useState(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [dragInfo, setDragInfo] = useState<{ msgId: string; dx: number; mine: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draftedChats, setDraftedChats] = useState<Set<string>>(new Set());
  const hasMoreRef = useRef<Map<string, boolean>>(new Map());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [showPaymentsView, setShowPaymentsView] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentPrefill, setPaymentPrefill] = useState<{ amount?: string; networkId?: string; tokenSymbol?: string; replyToRequestId?: string } | null>(null);
  const [showTxHistory, setShowTxHistory] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [sendPopActive, setSendPopActive] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxRotation, setLightboxRotation] = useState(0);
  const [lightboxMsg, setLightboxMsg] = useState<Message | null>(null);
  const [lightboxMoreOpen, setLightboxMoreOpen] = useState(false);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const loadedImgsRef = useRef<Set<string>>(new Set());
  const [flashMsgId, setFlashMsgId] = useState<string | null>(null);
  const [linkPreviews, setLinkPreviews] = useState<Record<string, LinkPreview | null>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profile"|"security"|"appearance">("profile");
  const [settingsDisplayName, setSettingsDisplayName] = useState("");
  const [settingsBio, setSettingsBio] = useState("");
  const [settingsWalletAddress, setSettingsWalletAddress] = useState("");
  const [settingsAvatarPreview, setSettingsAvatarPreview] = useState<string | null>(null);
  const [settingsAvatarFile, setSettingsAvatarFile] = useState<File | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [settingsCurPwd, setSettingsCurPwd] = useState("");
  const [settingsNewPwd, setSettingsNewPwd] = useState("");
  const [settingsConfPwd, setSettingsConfPwd] = useState("");
  const [sessionDuration, setSessionDuration] = useState<number>(() => {
    const v = parseInt(localStorage.getItem("fc_session_days") ?? "30", 10);
    return isNaN(v) ? 30 : v;
  });
  const [sessionRefreshing, setSessionRefreshing] = useState(false);
  const settingsAvatarInputRef = useRef<HTMLInputElement>(null);
  const [accentColor, setAccentColor] = useState<string>(() => {
    const stored = localStorage.getItem("fc_accent");
    return THEMES.find(t => t.color === stored) ? stored! : THEMES[0].color;
  });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [galleryMedia, setGalleryMedia] = useState<Message[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryTab, setGalleryTab] = useState<"photos"|"files"|"audio">("photos");
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set());
  const [convCtxMenu, setConvCtxMenu] = useState<{ x: number; y: number; userId: string } | null>(null);
  const [savedContacts, setSavedContacts] = useState<Set<string>>(new Set());
  const [contactBannerDismissed, setContactBannerDismissed] = useState<Set<string>>(new Set());
  const [destroyAfter, setDestroyAfter] = useState<number | null>(null);
  const [sendTimerMenu, setSendTimerMenu] = useState(false);
  const sendBtnRef = useRef<HTMLButtonElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const selectedUserRef = useRef<User | null>(null);
  const userRef = useRef<typeof user>(user);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const wsEverConnected = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sidebarSearchRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingSent = useRef(false);
  const otherTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartX = useRef(0);
  const dragActive = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActivated = useRef(false);
  const chatSearchInputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const newMsgIdsRef = useRef<Set<string>>(new Set());
  const switchingChatRef = useRef(false);
  const firstUnreadIdRef = useRef<string | null>(null);
  const msgCacheRef = useRef<Map<string, Message[]>>(new Map());
  const pinnedCacheRef = useRef<Map<string, Message | null>>(new Map());
  const draftCacheRef = useRef<Map<string, string>>(new Map());
  const scrollPosCacheRef = useRef<Map<string, number>>(new Map());
  const myPrivKeyRef = useRef<string | null>(null);
  const [keyReady, setKeyReady] = useState(false);
  const pubKeyMapRef = useRef<Map<string, string>>(new Map());
  const conversationsRef = useRef<ConvItem[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutedUsersRef = useRef<Set<string>>(new Set());
  mutedUsersRef.current = mutedUsers;
  selectedUserRef.current = selectedUser;
  userRef.current = user;
  conversationsRef.current = conversations;

  const [cachesReady, setCachesReady] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    const stored = localStorage.getItem("fc_current_user_id");
    if (stored !== user.id) {
      msgCacheRef.current.clear();
      pinnedCacheRef.current.clear();
      draftCacheRef.current.clear();
      scrollPosCacheRef.current.clear();
      pubKeyMapRef.current.clear();
      walletAutoSavedRef.current = null;
      setConversations([]);
      setMessages([]);
      setSelectedUser(null);
      try {
        localStorage.removeItem("fc_recent_searches");
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith("wagmi.") || k.startsWith("wc@2:") || k.startsWith("@w3m") || k.startsWith("W3M_") || k.startsWith("@reown")) {
            localStorage.removeItem(k);
          }
        });
      } catch {}
      try { wagmiDisconnect(); } catch {}
      Promise.allSettled([idbClear(IDB_MSGS), idbClear(IDB_CONVS), idbClear(IDB_KEYS)])
        .finally(() => {
          localStorage.setItem("fc_current_user_id", user.id);
          setCachesReady(true);
        });
    } else {
      setCachesReady(true);
    }
  }, [user?.id]);

  useEffect(() => {
    const theme = THEMES.find(t => t.color === accentColor) ?? THEMES[0];
    document.documentElement.style.setProperty('--fc-accent', theme.color);
    document.documentElement.style.setProperty('--fc-accent-dk', theme.dk);
    document.documentElement.style.setProperty('--fc-accent-rgb', theme.rgb);
    document.documentElement.style.setProperty('--fc-accent-gradient', theme.gradient);
    localStorage.setItem('fc_accent', theme.color);
  }, [accentColor]);

  useEffect(() => {
    if (!token || !user) return;
    initSodium().then(async () => {
      const SK_BYTES = 32;
      const PK_BYTES = 32;
      const patchServer = async (publicKey: string): Promise<boolean> => {
        try {
          const res = await fetch(apiUrl("/api/auth/me"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" }, credentials: "include",
            body: JSON.stringify({ publicKey }),
          });
          if (res.ok) {
            pubKeyMapRef.current.set(user.id, publicKey);
            return true;
          }
          // 403 KEY_ROTATION_REQUIRES_FRESH_LOGIN — session too old; key stays as-is on server
          return false;
        } catch {
          return false;
        }
      };
      let privKey = await loadPrivateKey(user.id);
      let keyMismatch = false;
      if (!privKey || !isValidKey(privKey, SK_BYTES)) {
        const kp = await generateKeyPair();
        privKey = kp.privateKey;
        await setPrivateKey(privKey, user.id);
        const ok = await patchServer(kp.publicKey);
        if (!ok) keyMismatch = true;
      } else {
        await setPrivateKey(privKey, user.id);
        try {
          const derivedPubKey = derivePublicKey(privKey);
          pubKeyMapRef.current.set(user.id, derivedPubKey);
          const serverPubKey = user.publicKey;
          const serverValid = !!serverPubKey && isValidKey(serverPubKey, PK_BYTES);
          if (!serverValid || serverPubKey !== derivedPubKey) {
            const ok = await patchServer(derivedPubKey);
            if (!ok) keyMismatch = true;
          }
        } catch {
          const kp = await generateKeyPair();
          privKey = kp.privateKey;
          await setPrivateKey(privKey, user.id);
          const ok = await patchServer(kp.publicKey);
          if (!ok) keyMismatch = true;
        }
      }
      myPrivKeyRef.current = privKey;
      setKeyReady(true);
      if (keyMismatch) {
        // Server has a different public key than our local private key — incoming
        // messages encrypted to the server's pubkey cannot be decrypted with our
        // local privkey. The user must re-login (fresh JWT) so PATCH /me succeeds.
        alert(
          "Your encryption key is out of sync with the server. " +
          "Please log out and log back in so other users' messages can be decrypted."
        );
      }
      fetchConversations();
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id]);

  const dec = useCallback((encrypted: string, otherPk?: string): string =>
    decryptMessage(encrypted, otherPk, myPrivKeyRef.current ?? undefined),
  []);

  const enc = useCallback((text: string, recipientId: string): string => {
    const pk = pubKeyMapRef.current.get(recipientId);
    const sk = myPrivKeyRef.current;
    if (!pk || !sk) throw new Error("Encryption failed — message not sent");
    return encryptMessage(text, pk, sk);
  }, []);

  const fetchFreshKey = useCallback(async (recipientId: string): Promise<void> => {
    if (!token || !recipientId) return;
    if (recipientId === userRef.current?.id) return;
    try {
      const res = await fetch(apiUrl(`/api/users/id/${recipientId}`), { credentials: "include" });
      if (res.ok) { const data = await res.json(); if (data.publicKey) pubKeyMapRef.current.set(recipientId, data.publicKey); }
    } catch {}
  }, [token]);

  const dk = darkMode;
  // Glass-messenger tokens: transparent surfaces over the aurora background.
  const T = dk ? {
    bg:            "rgba(22, 20, 34, 0.55)",
    bgChat:        "rgba(13, 12, 22, 0.32)",
    surface:       "rgba(28, 25, 42, 0.62)",
    border:        "rgba(255, 255, 255, 0.09)",
    text:          "rgba(255, 255, 255, 0.92)",
    textSec:       "rgba(255, 255, 255, 0.55)",
    inputBg:       "rgba(255, 255, 255, 0.06)",
    hoverBg:       "rgba(255, 255, 255, 0.07)",
    activeBg:      "linear-gradient(90deg, rgba(167,139,250,0.22), rgba(167,139,250,0.06))",
    msgOther:      "rgba(255, 255, 255, 0.07)",
    msgOtherText:  "rgba(255, 255, 255, 0.94)",
    msgOtherBorder:"rgba(255, 255, 255, 0.10)",
    ctxBg:         "rgba(28, 25, 42, 0.92)",
    replyBar:      "rgba(167, 139, 250, 0.10)",
  } : {
    bg:            "rgba(255, 255, 255, 0.55)",
    bgChat:        "rgba(255, 255, 255, 0.30)",
    surface:       "rgba(255, 255, 255, 0.70)",
    border:        "rgba(20, 18, 40, 0.10)",
    text:          "#1b1730",
    textSec:       "rgba(27, 23, 48, 0.55)",
    inputBg:       "rgba(255, 255, 255, 0.55)",
    hoverBg:       "rgba(124, 58, 237, 0.06)",
    activeBg:      "linear-gradient(90deg, rgba(124,58,237,0.18), rgba(124,58,237,0.05))",
    msgOther:      "rgba(255, 255, 255, 0.78)",
    msgOtherText:  "#1b1730",
    msgOtherBorder:"rgba(20, 18, 40, 0.10)",
    ctxBg:         "rgba(255, 255, 255, 0.92)",
    replyBar:      "rgba(124, 58, 237, 0.08)",
  };

  const chatMatches = chatQ.trim()
    ? messages.filter(m => m.decrypted?.toLowerCase().includes(chatQ.toLowerCase()))
    : [];

  const playNotifSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const t = ctx.currentTime;
      [{ freq: 700, start: 0, dur: 0.18, vol: 0.09 },
       { freq: 1050, start: 0.10, dur: 0.22, vol: 0.07 }].forEach(({ freq, start, dur, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t + start);
        gain.gain.linearRampToValueAtTime(vol, t + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
        osc.start(t + start); osc.stop(t + start + dur);
      });
    } catch {}
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/messages/conversations"), { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const mapped: ConvItem[] = data
        .filter((item: any) => item?.user?.id && item.user.id !== userRef.current?.id)
        .map((item: any) => {
          const pk: string | undefined = item.user.publicKey;
          if (pk) pubKeyMapRef.current.set(item.user.id, pk);
          let lastMessage: string | undefined;
          try { lastMessage = fmtMsgPreview(item.lastMessage?.encryptedContent ? dec(item.lastMessage.encryptedContent, pk) : undefined, item.lastMessage?.messageType); } catch { lastMessage = undefined; }
          return {
            id: item.user.id, username: item.user.username,
            displayName: item.user.displayName || item.user.username,
            publicKey: pk, isOnline: item.user.isOnline ?? false,
            lastSeen: item.user.lastSeen ?? null, createdAt: item.user.createdAt,
            avatarUrl: item.user.avatarUrl ?? null,
            bio: item.user.bio ?? null,
            walletAddress: item.user.walletAddress ?? null,
            lastMessage, lastTime: item.lastMessage?.createdAt ? fmtTime(item.lastMessage.createdAt) : undefined,
            unread: item.unreadCount || 0,
          };
        });
      setConversations(mapped);
      idbSet(IDB_CONVS, "list", mapped).catch(() => {});
    } catch {}
  }, [token]);

  const updateConvLocally = useCallback((targetId: string, lastMsg: string, time: string, addUnread = false) => {
    setConversations(prev => {
      const isActive = selectedUserRef.current?.id === targetId;
      const inc = addUnread && !isActive ? 1 : 0;
      const idx = prev.findIndex(c => c.id === targetId);
      if (idx === -1) {
        const su = selectedUserRef.current;
        if (!su || su.id !== targetId) return prev;
        const newConv: ConvItem = { ...su, lastMessage: lastMsg, lastTime: fmtTime(time), unread: inc };
        return [newConv, ...prev];
      }
      const prev_unread = prev[idx].unread ?? 0;
      const item = { ...prev[idx], lastMessage: lastMsg, lastTime: fmtTime(time), unread: isActive ? 0 : (addUnread ? prev_unread + 1 : prev_unread) };
      return [item, ...prev.filter((_, i) => i !== idx)];
    });
  }, []);

  const handleSelectUser = useCallback((su: User | null) => {
    setSelectedUser(su);
    if (!su || su.id === userRef.current?.id) return;
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === su.id);
      if (idx === -1) {
        const newConv: ConvItem = { ...su, lastMessage: undefined, lastTime: undefined, unread: 0 };
        return [newConv, ...prev];
      }
      if ((prev[idx].unread ?? 0) === 0) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], unread: 0 };
      return updated;
    });
  }, []);

  const markAsRead = useCallback(async (senderId: string) => {
    try {
      await fetch(apiUrl("/api/messages/read"), {
        method: "POST",
        headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ senderId })
      });
    } catch {}
  }, [token]);

  const fetchMessages = useCallback(async (userId: string) => {
    try {
      await fetchFreshKey(userId);
      const res = await fetch(apiUrl(`/api/messages/${userId}?limit=60`), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const raw: Message[] = Array.isArray(data) ? data : (data.messages ?? []);
        const hasMore: boolean = Array.isArray(data) ? false : (data.hasMore ?? false);
        const otherPk = pubKeyMapRef.current.get(userId);
        const msgs = raw.map((m: Message) => ({ ...m, decrypted: dec(m.encryptedContent, otherPk) }));
        const firstUnread = msgs.find((m: Message) => !m.isRead && m.senderId !== userRef.current?.id);
        firstUnreadIdRef.current = firstUnread?.id ?? null;
        hasMoreRef.current.set(userId, hasMore);

        const cached = msgCacheRef.current.get(userId);
        const changed = !cached || cached.length !== msgs.length ||
          msgs.some((m, i) => m.id !== cached[i].id || m.isRead !== cached[i].isRead || m.editedAt !== cached[i].editedAt || m.decrypted !== cached[i].decrypted);

        msgCacheRef.current.set(userId, msgs);
        if (changed || !cached) {
          if (selectedUserRef.current?.id === userId) setMessages(msgs);
        }
        idbSet(IDB_MSGS, userId, msgs.filter(m => !m._pending && !m._failed)).catch(() => {});
        if (userId !== userRef.current?.id) markAsRead(userId);
      }
    } catch {} finally { setMessagesLoading(false); }
  }, [token, markAsRead, fetchFreshKey]);

  const fetchMore = useCallback(async (userId: string) => {
    if (loadingMore || !hasMoreRef.current.get(userId)) return;
    const current = msgCacheRef.current.get(userId) ?? [];
    if (!current.length) return;
    const oldest = current[0].createdAt;
    setLoadingMore(true);
    try {
      const res = await fetch(apiUrl(`/api/messages/${userId}?limit=60&before=${encodeURIComponent(oldest)}`), { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const raw: Message[] = Array.isArray(data) ? data : (data.messages ?? []);
      const hasMore: boolean = Array.isArray(data) ? false : (data.hasMore ?? false);
      if (!raw.length) { hasMoreRef.current.set(userId, false); return; }
      const otherPk = pubKeyMapRef.current.get(userId);
      const older = raw.map((m: Message) => ({ ...m, decrypted: dec(m.encryptedContent, otherPk) }));
      hasMoreRef.current.set(userId, hasMore);
      const el = scrollRef.current;
      const prevH = el?.scrollHeight ?? 0;
      const updated = [...older, ...current];
      msgCacheRef.current.set(userId, updated);
      setMessages(updated);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH + el.scrollTop; });
    } catch {} finally { setLoadingMore(false); }
  }, [token, loadingMore]);

  const fetchPinned = useCallback(async (userId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/messages/pinned/${userId}`), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const otherPk = pubKeyMapRef.current.get(userId);
        const pinned = data ? { ...data, decrypted: dec(data.encryptedContent, otherPk) } : null;
        pinnedCacheRef.current.set(userId, pinned);
        setPinnedMsg(pinned);
      }
    } catch {}
  }, [token]);

  const searchUsers = useCallback(async (q: string) => {
    try {
      const clean = q.trim().replace(/^@+/, "");
      if (!clean) { setSearchResults([]); return; }
      const res = await fetch(apiUrl(`/api/users/search?q=${encodeURIComponent(clean)}`), { credentials: "include" });
      if (res.ok) setSearchResults(await res.json());
      else setSearchResults([]);
    } catch { setSearchResults([]); }
  }, [token]);

  const saveRecentSearch = useCallback((u: User) => {
    setRecentSearches(prev => {
      const next = [u, ...prev.filter(r => r.id !== u.id)].slice(0, 5);
      try { localStorage.setItem("fc_recent_searches", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const removeRecentSearch = useCallback((userId: string) => {
    setRecentSearches(prev => {
      const next = prev.filter(r => r.id !== userId);
      try { localStorage.setItem("fc_recent_searches", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!token) return;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    setWsStatus("connecting");
    const wsUrl = getWsUrl();
    const needsWsToken = wsNeedsTokenAuth(wsUrl);
    const ws = new WebSocket(wsUrl);
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let wsAuthenticated = false;
    ws.onopen = () => {
      if (!needsWsToken) return;
      void (async () => {
        try {
          const res = await fetch(apiUrl("/api/auth/ws-token"), { credentials: "include" });
          if (!res.ok) throw new Error("ws-token failed");
          const { token: wsToken } = (await res.json()) as { token: string };
          ws.send(JSON.stringify({ type: "auth", token: wsToken }));
        } catch {
          ws.close();
        }
      })();
    };
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data) as any;
        if (data.type === "pong") return;
        if (data.type === "connected" && !wsAuthenticated) {
          wsAuthenticated = true;
          setWsStatus("connected");
          reconnectDelay.current = 1000;
          pingInterval = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" })); }, 25000);
          if (wsEverConnected.current) {
            const su = selectedUserRef.current; const me = userRef.current;
            if (su && su.id !== me?.id) markAsRead(su.id);
            fetchConversations();
            flushOfflineQueue();
          }
          wsEverConnected.current = true;
          return;
        }
        if (data.type === "error" && !wsAuthenticated) return;
        const su = selectedUserRef.current; const me = userRef.current;
        if (data.type === "new_message") {
          const raw = data.message as Message;
          const otherUserId2 = raw.senderId === me?.id ? raw.recipientId : raw.senderId;
          let otherPk2 = otherUserId2 ? pubKeyMapRef.current.get(otherUserId2) : undefined;
          if (!otherPk2 && otherUserId2) {
            try {
              const keyRes = await fetch(apiUrl(`/api/users/id/${otherUserId2}`), { credentials: "include" });
              if (keyRes.ok) { const kd = await keyRes.json(); if (kd.publicKey) { pubKeyMapRef.current.set(otherUserId2, kd.publicKey); otherPk2 = kd.publicKey; } }
            } catch {}
          }
          let decrypted = dec(raw.encryptedContent, otherPk2);
          // Self-heal: if decryption failed (still has e1: prefix) and we had a cached
          // pubkey, the cache may be stale — refetch from server and retry once.
          if (decrypted.startsWith("e1:") && otherUserId2) {
            try {
              const keyRes = await fetch(apiUrl(`/api/users/id/${otherUserId2}`), { credentials: "include" });
              if (keyRes.ok) {
                const kd = await keyRes.json();
                if (kd.publicKey && kd.publicKey !== otherPk2) {
                  pubKeyMapRef.current.set(otherUserId2, kd.publicKey);
                  otherPk2 = kd.publicKey;
                  decrypted = dec(raw.encryptedContent, otherPk2);
                }
              }
            } catch {}
          }
          const msg: Message = { ...raw, decrypted };
          const otherUserId = (msg.senderId === me?.id ? msg.recipientId : msg.senderId) ?? "";
          const cachedConv = otherUserId ? (msgCacheRef.current.get(otherUserId) ?? []) : [];
          if (otherUserId && !cachedConv.some(m => m.id === msg.id)) {
            const withoutPending = cachedConv.filter(m => !m._pending || m.senderId !== me?.id);
            msgCacheRef.current.set(otherUserId, [...withoutPending, msg]);
          }
          if (su) {
            const isFavView = su.id === me?.id;
            const fits = isFavView
              ? (msg.senderId === me?.id && msg.recipientId === me?.id)
              : ((msg.senderId === su.id && msg.recipientId === me?.id) || (msg.senderId === me?.id && msg.recipientId === su.id));
            if (fits) {
              setMessages(prev => {
                if (prev.some(m => m.id === msg.id)) return prev;
                const hasPendingVersion = msg.senderId === me?.id && prev.some(m => m._pending || m._failed);
                if (hasPendingVersion) return prev;
                newMsgIdsRef.current.add(msg.id);
                return [...prev, msg];
              });
              if (msg.senderId === su.id && msg.senderId !== me?.id) markAsRead(su.id);
            }
          }
          if (otherUserId) {
            const isIncoming = msg.senderId !== me?.id;
            updateConvLocally(otherUserId, fmtMsgPreview(msg.decrypted ?? undefined, msg.messageType) ?? "…", msg.createdAt, isIncoming);
            const isNewContact = isIncoming && !conversationsRef.current.some(c => c.id === otherUserId);
            if (isNewContact) fetchConversations();
          }
          if (msg.senderId !== me?.id) {
            const isMuted = mutedUsersRef.current.has(msg.senderId);
            if (!isMuted) playNotifSound();
            if (!isMuted && document.hidden && "Notification" in window && Notification.permission === "granted") {
              const sender = conversationsRef.current.find(c => c.id === msg.senderId);
              const senderName = sender?.displayName ?? "FairChat";
              const body = msg.decrypted ? (msg.decrypted.length > 80 ? msg.decrypted.slice(0, 80) + "…" : msg.decrypted) : "📎 Attachment";
              const n = new Notification(`FairChat — ${senderName}`, { body, icon: "/logo.png", tag: msg.senderId });
              n.onclick = () => { window.focus(); if (sender) handleSelectUser(sender as User); };
            }
          }
        }
        if (data.type === "messages_deleted") {
          setMessages(prev => prev.filter(m => !data.ids.includes(m.id)));
          msgCacheRef.current.forEach((msgs, uid) => msgCacheRef.current.set(uid, msgs.filter(m => !data.ids.includes(m.id))));
        }
        if (data.type === "conversation_deleted") {
          const peerId: string = data.peerId;
          const scope: string = data.scope;
          const meId = userRef.current?.id;
          setConversations(prev => prev.filter(c => c.id !== peerId));
          msgCacheRef.current.delete(peerId);
          if (selectedUserRef.current?.id === peerId) {
            setSelectedUser(null);
            setMessages([]);
          } else {
            setMessages(prev => {
              if (scope === "forMe" && meId) return prev.filter(m => !(m.senderId === meId && m.recipientId === peerId));
              if (scope === "forThem" && meId) return prev.filter(m => !(m.senderId === peerId && m.recipientId === meId));
              return prev.filter(m => !(m.senderId === peerId || m.recipientId === peerId));
            });
          }
        }
        if (data.type === "message_edited") {
          const editedOtherPk = su ? pubKeyMapRef.current.get(su.id) : undefined;
          const edited = { ...data.message, decrypted: dec(data.message.encryptedContent, editedOtherPk) };
          setMessages(prev => prev.map(m => m.id === edited.id ? { ...m, ...edited } : m));
          msgCacheRef.current.forEach((msgs, uid) => msgCacheRef.current.set(uid, msgs.map(m => m.id === edited.id ? { ...m, ...edited } : m)));
        }
        if (data.type === "messages_delivered") {
          const ids = new Set<string>(data.messageIds ?? []);
          const patchDelivered = (m: Message) => ids.has(m.id) ? { ...m, deliveryStatus: "delivered" as const } : m;
          if (su && data.deliveredTo === su.id) setMessages(prev => prev.map(patchDelivered));
          msgCacheRef.current.forEach((msgs, uid) => msgCacheRef.current.set(uid, msgs.map(patchDelivered)));
        }
        if (data.type === "messages_read") {
          if (su && data.readBy === su.id) {
            setMessages(prev => prev.map(m => m.senderId === me?.id ? { ...m, isRead: true, deliveryStatus: "read" as const } : m));
            const cached = msgCacheRef.current.get(su.id);
            if (cached) msgCacheRef.current.set(su.id, cached.map(m => m.senderId === me?.id ? { ...m, isRead: true, deliveryStatus: "read" as const } : m));
          }
        }
        if (data.type === "reaction_updated") {
          setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, reactions: data.reactions } : m));
          msgCacheRef.current.forEach((msgs, uid) => msgCacheRef.current.set(uid, msgs.map(m => m.id === data.messageId ? { ...m, reactions: data.reactions } : m)));
        }
        if (data.type === "message_pinned") {
          if (su) {
            const key = [su.id, me?.id].sort().join(":");
            if (data.chatKey === key) {
              const pinnedOtherPk = pubKeyMapRef.current.get(su.id);
              if (data.message) setPinnedMsg({ ...data.message, decrypted: dec(data.message.encryptedContent, pinnedOtherPk) });
              else setPinnedMsg(null);
            }
          }
        }
        if (data.type === "typing" && su && data.senderId === su.id) {
          setOtherTyping(true);
          if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
          otherTypingTimer.current = setTimeout(() => setOtherTyping(false), 3000);
        }
        if (data.type === "stop_typing" && su && data.senderId === su.id) {
          setOtherTyping(false);
          if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
        }
        if (data.type === "message_updated") {
          const upd = data.message;
          const updOtherPk = su ? pubKeyMapRef.current.get(su.id) : undefined;
          const updMsg = { ...upd, decrypted: dec(upd.encryptedContent, updOtherPk) };
          setMessages(prev => prev.map(m => m.id === updMsg.id ? { ...m, ...updMsg } : m));
          msgCacheRef.current.forEach((msgs, uid) => msgCacheRef.current.set(uid, msgs.map(m => m.id === updMsg.id ? { ...m, ...updMsg } : m)));
        }
        if (data.type === "block_updated") {
          if (data.action === "block") setBlockedUsers(prev => new Set([...prev, data.blockedId]));
          else setBlockedUsers(prev => { const s = new Set(prev); s.delete(data.blockedId); return s; });
        }
        if (data.type === "mute_updated") {
          if (data.action === "mute") setMutedUsers(prev => new Set([...prev, data.mutedId]));
          else setMutedUsers(prev => { const s = new Set(prev); s.delete(data.mutedId); return s; });
        }
      } catch {}
    };
    ws.onclose = () => {
      if (pingInterval) clearInterval(pingInterval);
      setWsStatus("disconnected"); wsRef.current = null;
      const delay = Math.min(reconnectDelay.current, 30000);
      reconnectDelay.current = delay * 2;
      reconnectTimer.current = setTimeout(connectWebSocket, delay);
    };
    ws.onerror = () => { if (pingInterval) clearInterval(pingInterval); ws.close(); };
    wsRef.current = ws;
  }, [token, playNotifSound, fetchConversations, markAsRead]);

  useEffect(() => { const s = localStorage.getItem("fc_dark"); if (s === "true") setDarkMode(true); }, []);
  useEffect(() => { localStorage.setItem("fc_dark", darkMode ? "true" : "false"); }, [darkMode]);
  useEffect(() => {
    const total = conversations.reduce((acc, c) => acc + (c.unread ?? 0), 0);
    document.title = total > 0 ? `(${total}) FairChat` : "FairChat";
  }, [conversations]);
  useEffect(() => { if (!isLoading && !user && !token) setLocation("/"); }, [user, isLoading, token]);
  useEffect(() => {
    if (token && cachesReady && keyReady) {
      idbGet<ConvItem[]>(IDB_CONVS, "list").then(cached => { if (cached?.length) setConversations(cached); }).catch(() => {});
      connectWebSocket();
    }
    return () => { if (reconnectTimer.current) clearTimeout(reconnectTimer.current); wsRef.current?.close(); };
  }, [token, cachesReady, keyReady]);

  const prevSelectedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevSelectedUserIdRef.current;
    if (prevId) {
      draftCacheRef.current.set(prevId, messageInput);
      if (scrollRef.current) scrollPosCacheRef.current.set(prevId, scrollRef.current.scrollTop);
      if (messageInput.trim()) setDraftedChats(prev => new Set([...prev, prevId]));
      else setDraftedChats(prev => { const n = new Set(prev); n.delete(prevId); return n; });
    }
    newMsgIdsRef.current.clear();
    switchingChatRef.current = true;
    if (selectedUser) {
      prevSelectedUserIdRef.current = selectedUser.id;
      setShowScrollBtn(false); setUnreadBelow(0);
      setShowPaymentsView(false);
      const cachedMsgs = msgCacheRef.current.get(selectedUser.id);
      if (cachedMsgs !== undefined) { setMessages(cachedMsgs); setMessagesLoading(false); }
      else {
        setMessages([]); setMessagesLoading(true);
        idbGet<Message[]>(IDB_MSGS, selectedUser.id).then(idbMsgs => {
          if (idbMsgs?.length && !msgCacheRef.current.has(selectedUser.id)) {
            msgCacheRef.current.set(selectedUser.id, idbMsgs); setMessages(idbMsgs);
          }
        }).catch(() => {});
      }
      const cachedPinned = pinnedCacheRef.current.get(selectedUser.id);
      if (cachedPinned !== undefined) setPinnedMsg(cachedPinned); else setPinnedMsg(null);
      setMessageInput(draftCacheRef.current.get(selectedUser.id) ?? "");
      if (keyReady) { fetchMessages(selectedUser.id); fetchPinned(selectedUser.id); }
      exitSelMode(); setReplyTo(null); setEditingMsg(null);
      setOtherTyping(false); setChatSearch(false); setChatQ(""); setShowEmojiPicker(false);
      setShowProfile(false); setShowMediaGallery(false); setReactionPickerMsgId(null);
      setTimeout(() => { inputRef.current?.focus(); }, 120);
      const savedScroll = scrollPosCacheRef.current.get(selectedUser.id);
      if (savedScroll !== undefined) requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = savedScroll; });
      requestAnimationFrame(() => { switchingChatRef.current = false; });
    } else {
      prevSelectedUserIdRef.current = null; setMessages([]); setPinnedMsg(null);
      switchingChatRef.current = false;
    }
  }, [selectedUser?.id, keyReady]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    if (switchingChatRef.current) {
      el.scrollTop = el.scrollHeight;
      setUnreadBelow(0); setShowScrollBtn(false);
      return;
    }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    const last = messages[messages.length - 1];
    const sentByMe = last && last.senderId === user?.id;
    if (sentByMe) { el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); setUnreadBelow(0); setShowScrollBtn(false); }
    else if (atBottom) { el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); setUnreadBelow(0); setShowScrollBtn(false); }
    else { if (last) setUnreadBelow(n => n + 1); }
  }, [messages.length]);

  useEffect(() => {
    const clean = searchQuery.trim().replace(/^@+/, "");
    const t = setTimeout(() => { if (clean.length >= 3) searchUsers(searchQuery); else setSearchResults([]); }, 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [ctxMenu]);

  useEffect(() => {
    if (!reactionPickerMsgId) return;
    const close = () => { setReactionPickerMsgId(null); setPickerPos(null); };
    const t = setTimeout(() => window.addEventListener("click", close), 0);
    return () => { clearTimeout(t); window.removeEventListener("click", close); };
  }, [reactionPickerMsgId]);

  useEffect(() => { if (chatSearch && chatSearchInputRef.current) chatSearchInputRef.current.focus(); }, [chatSearch]);

  useEffect(() => {
    if (!chatMatches.length) return;
    scrollToMsg(chatMatches[Math.min(chatMatchIdx, chatMatches.length - 1)].id);
  }, [chatMatchIdx, chatQ]);

  useEffect(() => {
    if (!user) return;
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }, [!!user]);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl("/api/moderation/status"), { credentials: "include" })
      .then(r => r.json()).then(d => { setBlockedUsers(new Set(d.blocked ?? [])); setMutedUsers(new Set(d.muted ?? [])); }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl("/api/contacts"), { credentials: "include" })
      .then(r => r.json()).then((list: { id: string }[]) => { if (Array.isArray(list)) setSavedContacts(new Set(list.map(u => u.id))); }).catch(() => {});
  }, [token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); sidebarSearchRef.current?.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && selectedUserRef.current) {
        e.preventDefault(); setChatSearch(s => { if (!s) { setChatQ(""); setChatMatchIdx(0); } return !s; });
      }
      if (e.key === "Escape") {
        setCtxMenu(null); setShowEmojiPicker(false); setLightboxUrl(null); setLightboxMsg(null); setLightboxMoreOpen(false);
        if (chatSearch) { setChatSearch(false); setChatQ(""); return; }
        if (replyTo) { setReplyTo(null); return; }
        if (editingMsg) { setEditingMsg(null); setMessageInput(""); return; }
        if (selMode) exitSelMode();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chatSearch, replyTo, editingMsg, selMode]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const close = (e: MouseEvent) => { if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) setShowEmojiPicker(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showEmojiPicker]);

  useEffect(() => { if (messageInput === "" && inputRef.current) inputRef.current.style.height = ""; }, [messageInput]);

  useEffect(() => {
    if (!token || messages.length === 0) return;
    const urlSet = new Set<string>();
    for (const msg of messages) {
      if (!msg.decrypted) continue;
      for (const match of msg.decrypted.matchAll(URL_REGEX)) urlSet.add(match[0].replace(/[.,;!?)"']+$/, ""));
    }
    const toFetch = Array.from(urlSet).filter(url => !(url in linkPreviews));
    if (!toFetch.length) return;
    toFetch.forEach(async (url) => {
      try {
        const r = await fetch(apiUrl(`/api/link-preview?url=${encodeURIComponent(url)}`), { credentials: "include" });
        if (r.ok) { const data: LinkPreview = await r.json(); setLinkPreviews(prev => ({ ...prev, [url]: data.title ? data : null })); }
        else setLinkPreviews(prev => ({ ...prev, [url]: null }));
      } catch { setLinkPreviews(prev => ({ ...prev, [url]: null })); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, token]);

  useEffect(() => { firstUnreadIdRef.current = null; }, [selectedUser?.id]);

  const scrollToMsg = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); setFlashMsgId(id); setTimeout(() => setFlashMsgId(null), 1300); }
  };

  const exitSelMode = () => { setSelMode(false); setSelIds(new Set()); };
  const toggleSel = (id: string) => setSelIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const enterSelMode = (id: string) => { setSelMode(true); setSelIds(new Set([id])); setCtxMenu(null); };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr; audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start(100); setIsRecording(true); setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { alert("Microphone access denied. Please allow microphone in browser settings."); }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current; if (!mr) return;
    mr.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: mr.mimeType });
      mr.stream.getTracks().forEach(t => t.stop()); mediaRecorderRef.current = null;
      setIsRecording(false); setRecordingTime(0);
      if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
      const ext = mr.mimeType.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mr.mimeType });
      setAttachmentUploading(true);
      try {
        const fd = new FormData(); fd.append("file", file);
        const res = await fetch(apiUrl("/api/upload"), { method: "POST", credentials: "include", body: fd });
        if (res.ok) {
          const { url, name, type: ftype, size } = await res.json();
          const su = selectedUserRef.current; if (!su) return;
          const content = "[Voice message]";
          await fetchFreshKey(su.id);
          const otherPk = pubKeyMapRef.current.get(su.id);
          if (!otherPk || !myPrivKeyRef.current) { alert("Encryption failed — message not sent"); return; }
          let encContent: string;
          try { encContent = encryptMessage(content, otherPk, myPrivKeyRef.current); }
          catch { alert("Encryption failed — message not sent"); return; }
          await fetch(apiUrl(`/api/messages/${su.id}`), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
            body: JSON.stringify({ encryptedContent: encContent, attachmentUrl: url, attachmentName: name, attachmentType: ftype, attachmentSize: size }) });
        }
      } finally { setAttachmentUploading(false); }
    };
    mr.stop();
  };

  const cancelRecording = () => {
    const mr = mediaRecorderRef.current; if (!mr) return;
    mr.onstop = () => { mr.stream.getTracks().forEach(t => t.stop()); };
    mr.stop(); mediaRecorderRef.current = null; setIsRecording(false); setRecordingTime(0);
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  };

  const openGallery = async () => {
    if (!selectedUser || !token) return;
    setShowMediaGallery(true); setGalleryLoading(true); setGalleryTab("photos");
    try {
      const res = await fetch(apiUrl(`/api/messages/media/${selectedUser.id}`), { credentials: "include" });
      const data = await res.json();
      const otherPk = pubKeyMapRef.current.get(selectedUser.id);
      const medias: Message[] = (data.media ?? []).map((m: Message) => ({
        ...m, decrypted: m.encryptedContent ? (decryptMessage(m.encryptedContent, otherPk, myPrivKeyRef.current ?? undefined) ?? undefined) : undefined
      }));
      setGalleryMedia(medias);
    } catch { setGalleryMedia([]); } finally { setGalleryLoading(false); }
  };

  const toggleBlock = async (userId: string) => {
    if (!token) return;
    const isBlocked = blockedUsers.has(userId);
    try {
      await fetch(apiUrl(`/api/moderation/block/${userId}`), { method: isBlocked ? "DELETE" : "POST", credentials: "include" });
      setBlockedUsers(prev => { const s = new Set(prev); if (isBlocked) s.delete(userId); else s.add(userId); return s; });
    } catch {}
    setConvCtxMenu(null);
  };

  const toggleMute = async (userId: string) => {
    if (!token) return;
    const isMuted = mutedUsers.has(userId);
    try {
      await fetch(apiUrl(`/api/moderation/mute/${userId}`), { method: isMuted ? "DELETE" : "POST", credentials: "include" });
      setMutedUsers(prev => { const s = new Set(prev); if (isMuted) s.delete(userId); else s.add(userId); return s; });
    } catch {}
    setConvCtxMenu(null);
  };

  const deleteConversation = async (userId: string, scope: "forMe" | "forThem" | "forBoth") => {
    if (!token) return;
    try {
      await fetch(apiUrl(`/api/messages/conversation/${userId}?scope=${scope}`), {
        method: "DELETE",
        credentials: "include",
      });
    } catch {}
    setConversations(prev => prev.filter(c => c.id !== userId));
    msgCacheRef.current.delete(userId);
    if (selectedUserRef.current?.id === userId) {
      setSelectedUser(null);
      setMessages([]);
    } else {
      setMessages(prev => {
        if (scope === "forMe") return prev.filter(m => !(m.senderId === user!.id && m.recipientId === userId));
        if (scope === "forThem") return prev.filter(m => !(m.senderId === userId && m.recipientId === user!.id));
        return prev.filter(m => !(m.senderId === userId || m.recipientId === userId));
      });
    }
    setConvCtxMenu(null);
  };

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/reactions/${messageId}/${encodeURIComponent(emoji)}`), { method: "POST", credentials: "include" });
      if (res.ok) { const { reactions } = await res.json(); setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m)); }
    } catch {}
    setReactionPickerMsgId(null);
  }, [token]);

  const handleInputChange = (val: string) => {
    setMessageInput(val);
    if (!selectedUser || selectedUser.id === user?.id) return;
    if (!isTypingSent.current) { isTypingSent.current = true; wsRef.current?.send(JSON.stringify({ type: "typing", recipientId: selectedUser.id })); }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { isTypingSent.current = false; wsRef.current?.send(JSON.stringify({ type: "stop_typing", recipientId: selectedUser.id })); }, 2500);
  };

  const clearAttachment = () => {
    setAttachmentFile(null);
    if (attachmentPreviewUrl) { URL.revokeObjectURL(attachmentPreviewUrl); setAttachmentPreviewUrl(null); }
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  };

  const handleAttachmentPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setAttachmentFile(file);
    if (file.type.startsWith("image/")) { const url = URL.createObjectURL(file); setAttachmentPreviewUrl(url); }
    else setAttachmentPreviewUrl(null);
  };

  const handleSendWithAttachment = async () => {
    if (!attachmentFile || !selectedUser) return;
    setAttachmentUploading(true);
    try {
      const formData = new FormData(); formData.append("file", attachmentFile);
      const uploadRes = await fetch(apiUrl("/api/upload"), { method: "POST", credentials: "include", body: formData });
      if (!uploadRes.ok) { setAttachmentUploading(false); return; }
      const { url, name, type, size } = await uploadRes.json();
      const text = messageInput.trim();
      await fetchFreshKey(selectedUser.id);
      let encrypted = "";
      if (text) {
        try { encrypted = enc(text, selectedUser.id); }
        catch { alert("Encryption failed — message not sent"); setAttachmentUploading(false); return; }
      }
      const replyToId = replyTo?.id ?? undefined;
      const res = await fetch(apiUrl(`/api/messages/${selectedUser.id}`), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ encryptedContent: encrypted, replyToId, attachmentUrl: url, attachmentName: name, attachmentType: type, attachmentSize: size }),
      });
      if (res.ok) {
        const newMsg = { ...await res.json(), decrypted: text };
        setMessages(prev => { if (prev.some(m => m.id === newMsg.id)) return prev; newMsgIdsRef.current.add(newMsg.id); return [...prev, newMsg]; });
        const target = selectedUser.id; const cached = msgCacheRef.current.get(target) ?? [];
        if (!cached.some(m => m.id === newMsg.id)) msgCacheRef.current.set(target, [...cached, newMsg]);
        updateConvLocally(target, fmtMsgPreview(newMsg.decrypted, newMsg.messageType) || (newMsg.attachmentName ?? ""), newMsg.createdAt);
        setMessageInput(""); setReplyTo(null); setShowEmojiPicker(false); clearAttachment();
      }
    } catch {} finally { setAttachmentUploading(false); }
  };

  const handleSendMessage = async (content?: string, recipientId?: string) => {
    const text = (content ?? messageInput).trim();
    const target = recipientId ?? selectedUser?.id;
    if (!text || !target || !user) return;
    const replyToId = (!content && replyTo) ? replyTo.id : undefined;
    if (!content) {
      setMessageInput(""); setReplyTo(null); setShowEmojiPicker(false);
      draftCacheRef.current.delete(target);
      setDraftedChats(prev => { const n = new Set(prev); n.delete(target); return n; });
    }
    const pendingId = `pending-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: pendingId, senderId: user.id, recipientId: target,
      encryptedContent: "", decrypted: text, createdAt: new Date().toISOString(),
      replyToId: replyToId ?? null, _pending: true, _stableId: pendingId,
      deliveryStatus: "pending", _retryCount: 0,
    };
    if (target === selectedUser?.id) { setMessages(prev => [...prev, optimistic]); newMsgIdsRef.current.add(pendingId); }
    const prevCache = msgCacheRef.current.get(target) ?? [];
    msgCacheRef.current.set(target, [...prevCache, optimistic]);
    updateConvLocally(target, text, optimistic.createdAt);

    const attemptSend = async (attempt: number) => {
      try {
        await fetchFreshKey(target);
        const encrypted = enc(text, target);
        const da = !content && attempt === 0 ? destroyAfter : null;
        if (!content && da && attempt === 0) setDestroyAfter(null);
        const res = await fetch(apiUrl(`/api/messages/${target}`), {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ encryptedContent: encrypted, replyToId, ...(da ? { destroyAfter: da } : {}) })
        });
        if (res.ok) {
          const confirmed = { ...await res.json(), decrypted: text, _stableId: pendingId };
          const replacer = (prev: Message[]) =>
            prev.some(m => m.id === confirmed.id) ? prev.filter(m => m.id !== pendingId)
            : prev.map(m => m.id === pendingId ? confirmed : m);
          if (target === selectedUser?.id) { setMessages(replacer); newMsgIdsRef.current.delete(pendingId); }
          const newCache = msgCacheRef.current.get(target) ?? [];
          msgCacheRef.current.set(target, newCache.some(m => m.id === confirmed.id) ? newCache.filter(m => m.id !== pendingId)
            : newCache.map(m => m.id === pendingId ? confirmed : m));
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        if (attempt < 4) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          const patchRetry = (prev: Message[]) => prev.map(m => m.id === pendingId ? { ...m, _retryCount: attempt + 1 } : m);
          if (target === selectedUser?.id) setMessages(patchRetry);
          msgCacheRef.current.set(target, (msgCacheRef.current.get(target) ?? []).map(m => m.id === pendingId ? { ...m, _retryCount: attempt + 1 } : m));
          setTimeout(() => attemptSend(attempt + 1), delay);
        } else {
          const markFailed = (prev: Message[]) => prev.map(m => m.id === pendingId ? { ...m, _pending: false, _failed: true, deliveryStatus: "failed" as const } : m);
          if (target === selectedUser?.id) setMessages(markFailed);
          msgCacheRef.current.set(target, (msgCacheRef.current.get(target) ?? []).map(m => m.id === pendingId ? { ...m, _pending: false, _failed: true, deliveryStatus: "failed" as const } : m));
        }
      }
    };

    attemptSend(0);
  };

  const flushOfflineQueue = useCallback(() => {
    msgCacheRef.current.forEach((msgs, uid) => {
      const failed = msgs.filter(m => m._failed && m.deliveryStatus === "failed" && m.decrypted);
      for (const msg of failed) {
        const txt = msg.decrypted!;
        const remove = (prev: Message[]) => prev.filter(m => m.id !== msg.id);
        setMessages(remove);
        msgCacheRef.current.set(uid, (msgCacheRef.current.get(uid) ?? []).filter(m => m.id !== msg.id));
        handleSendMessage(txt, uid);
      }
    });
  }, [handleSendMessage]);

  const handleSaveEdit = async () => {
    if (!editingMsg || !messageInput.trim()) return;
    const text = messageInput.trim();
    setMessageInput(""); setEditingMsg(null);
    try {
      const target2 = editingMsg.senderId === user?.id ? (editingMsg.recipientId ?? selectedUser?.id ?? "") : editingMsg.senderId;
      await fetchFreshKey(target2);
      let encrypted: string;
      try { encrypted = enc(text, target2); }
      catch { alert("Encryption failed — message not sent"); return; }
      const res = await fetch(apiUrl(`/api/messages/${editingMsg.id}`), {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ encryptedContent: encrypted })
      });
      if (res.ok) {
        const updated = await res.json(); const patch = { ...updated, decrypted: text };
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...patch } : m));
        msgCacheRef.current.forEach((msgs, uid) => msgCacheRef.current.set(uid, msgs.map(m => m.id === updated.id ? { ...m, ...patch } : m)));
      }
    } catch {}
  };

  const handleSendOrEdit = async () => {
    if (editingMsg) { await handleSaveEdit(); return; }
    if (attachmentFile) { await handleSendWithAttachment(); return; }
    await handleSendMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (messageInput.trim()) { setSendPopActive(false); requestAnimationFrame(() => setSendPopActive(true)); }
      handleSendOrEdit();
    }
    if (e.key === "Escape") { setLightboxUrl(null); setReplyTo(null); setEditingMsg(null); setMessageInput(""); setShowEmojiPicker(false); }
    if (e.key === "ArrowUp" && messageInput === "" && !editingMsg) {
      const lastMine = [...messages].reverse().find(m => m.senderId === user?.id);
      if (lastMine) { e.preventDefault(); startEdit(lastMine); }
    }
  };

  const handleDeleteMsgs = async (ids: string[]) => {
    if (!ids.length) return;
    setCtxMenu(null); exitSelMode();
    setDeletingIds(new Set(ids));
    let ok = false;
    try {
      const res = await fetch(apiUrl("/api/messages/delete"), {
        method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ ids })
      });
      ok = res.ok;
    } catch {}
    if (!ok) {
      setDeletingIds(new Set());
      return;
    }
    await new Promise(r => setTimeout(r, 360));
    setMessages(prev => prev.filter(m => !ids.includes(m.id)));
    msgCacheRef.current.forEach((msgs, uid) => msgCacheRef.current.set(uid, msgs.filter(m => !ids.includes(m.id))));
    setDeletingIds(new Set());
    fetchConversations();
  };

  const handleDeleteSel = () => handleDeleteMsgs(Array.from(selIds));

  const handleForward = async (targetId: string) => {
    const msgs = messages.filter(m => selIds.has(m.id));
    for (const msg of msgs) if (msg.decrypted) await handleSendMessage(`⟫ ${msg.decrypted}`, targetId);
    setIsForwardOpen(false); exitSelMode();
  };

  const handleCopySel = () => {
    const texts = messages.filter(m => selIds.has(m.id)).map(m => m.decrypted ?? "").join("\n");
    navigator.clipboard.writeText(texts); exitSelMode();
  };

  const handlePin = async (msgId: string | null) => {
    if (!selectedUser) return; setCtxMenu(null);
    try {
      await fetch(apiUrl("/api/messages/pin"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ chatUserId: selectedUser.id, messageId: msgId })
      });
      fetchPinned(selectedUser.id);
    } catch {}
  };

  const openSettings = () => {
    setSettingsDisplayName(user?.displayName ?? "");
    setSettingsBio(user?.bio ?? "");
    setSettingsWalletAddress(user?.walletAddress ?? "");
    setSettingsAvatarPreview(user?.avatarUrl ?? null);
    setSettingsAvatarFile(null);
    setSettingsMsg(null);
    setSettingsCurPwd(""); setSettingsNewPwd(""); setSettingsConfPwd("");
    setSettingsTab("profile"); setShowSettings(true);
  };

  const resizeImage = (file: File): Promise<{ dataUrl: string; blob: Blob }> =>
    new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 256; const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error("Image encode failed")); return; }
            resolve({ dataUrl, blob });
          },
          "image/jpeg",
          0.82,
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
      img.src = url;
    });

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const { dataUrl, blob } = await resizeImage(file);
      setSettingsAvatarPreview(dataUrl);
      const jpegFile = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      setSettingsAvatarFile(jpegFile);
    }
    catch { setSettingsMsg({ text: "Failed to load image", ok: false }); }
  };

  const handleSaveProfile = async () => {
    setSettingsSaving(true); setSettingsMsg(null);
    try {
      let avatarUrl: string | null | undefined = undefined;
      if (settingsAvatarFile) {
        const fd = new FormData();
        fd.append("file", settingsAvatarFile);
        const upRes = await fetch(apiUrl("/api/upload"), { method: "POST", credentials: "include", body: fd });
        const upData = await upRes.json();
        if (!upRes.ok) { setSettingsMsg({ text: upData.error ?? "Upload failed", ok: false }); return; }
        avatarUrl = upData.url;
      } else if (settingsAvatarPreview === null && user?.avatarUrl) {
        avatarUrl = null;
      }
      const body: Record<string, unknown> = { displayName: settingsDisplayName.trim(), bio: settingsBio.trim() || null };
      if (avatarUrl !== undefined) body.avatarUrl = avatarUrl;
      const res = await fetch(apiUrl("/api/auth/me"), {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setSettingsMsg({ text: data.error ?? "Error", ok: false }); return; }
      updateUser({ displayName: data.displayName, avatarUrl: data.avatarUrl, bio: data.bio });
      setSettingsAvatarFile(null);
      setSettingsMsg({ text: "Profile saved", ok: true });
    } catch { setSettingsMsg({ text: "Network error", ok: false }); } finally { setSettingsSaving(false); }
  };

  const handleChangePassword = async () => {
    if (settingsNewPwd !== settingsConfPwd) { setSettingsMsg({ text: "Passwords do not match", ok: false }); return; }
    setSettingsSaving(true); setSettingsMsg(null);
    try {
      const res = await fetch(apiUrl("/api/auth/me/password"), {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ currentPassword: settingsCurPwd, newPassword: settingsNewPwd }),
      });
      const data = await res.json();
      if (!res.ok) { setSettingsMsg({ text: data.error ?? "Error", ok: false }); return; }
      setSettingsMsg({ text: "Password changed", ok: true });
      setSettingsCurPwd(""); setSettingsNewPwd(""); setSettingsConfPwd("");
    } catch { setSettingsMsg({ text: "Network error", ok: false }); } finally { setSettingsSaving(false); }
  };

  const handleRefreshSession = async (days: number) => {
    setSessionRefreshing(true); setSettingsMsg(null);
    localStorage.setItem("fc_session_days", String(days));
    const result = await refreshSession(days);
    setSessionRefreshing(false);
    if (result.ok) setSettingsMsg({ text: `Session extended by ${days}d.`, ok: true });
    else setSettingsMsg({ text: result.error ?? "Error", ok: false });
  };

  const startReply = (msg: Message) => { setReplyTo(msg); setEditingMsg(null); setCtxMenu(null); setTimeout(() => inputRef.current?.focus(), 0); };
  const startEdit  = (msg: Message) => { setEditingMsg(msg); setReplyTo(null); setMessageInput(msg.decrypted ?? ""); setCtxMenu(null); setTimeout(() => inputRef.current?.focus(), 0); };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 200);
    if (scrollHeight - scrollTop - clientHeight < 80) setUnreadBelow(0);
    if (scrollTop < 120 && selectedUserRef.current && !loadingMore) fetchMore(selectedUserRef.current.id);
  };

  const scrollToBottom = () => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); setUnreadBelow(0); setShowScrollBtn(false); };

  const clearLongPress = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };

  const onDragStart = (e: React.PointerEvent, msgId: string, mine: boolean) => {
    longPressActivated.current = false;
    if (!selMode) { longPressTimer.current = setTimeout(() => { longPressActivated.current = true; clearLongPress(); enterSelMode(msgId); }, 500); }
    if (selMode) return;
    dragStartX.current = e.clientX; dragActive.current = true;
    setDragInfo({ msgId, dx: 0, mine });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent, msgId: string, mine: boolean) => {
    if (!dragActive.current) return;
    const rawDx = e.clientX - dragStartX.current;
    if (Math.abs(rawDx) > 8) clearLongPress();
    if (mine) { if (rawDx < 0) setDragInfo({ msgId, dx: Math.max(rawDx, -75), mine }); }
    else { if (rawDx > 0) setDragInfo({ msgId, dx: Math.min(rawDx, 75), mine }); }
  };

  const onDragEnd = (msg: Message, mine: boolean) => {
    clearLongPress();
    if (dragActive.current && dragInfo) {
      const triggered = mine ? dragInfo.dx < -60 : dragInfo.dx > 60;
      if (triggered) { setReplyTo(msg); setEditingMsg(null); setTimeout(() => inputRef.current?.focus(), 0); }
    }
    dragActive.current = false; setDragInfo(null);
  };

  const addContact = async (contactId: string) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl("/api/contacts"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ contactId }) });
      if (res.ok) setSavedContacts(prev => new Set([...prev, contactId]));
    } catch {}
  };

  if (isLoading || !user) return <div style={{ background: T.bg, color: T.text }} className="min-h-screen flex items-center justify-center">Loading...</div>;

  const isFav = selectedUser?.id === user.id;
  const fwdContacts: ConvItem[] = [{ id: user.id, username: user.username, displayName: "Favorites" }, ...conversations.filter(c => c.id !== user.id)];
  const filteredFwd = fwdContacts.filter(c => c.displayName.toLowerCase().includes(fwdQuery.toLowerCase()) || c.username.toLowerCase().includes(fwdQuery.toLowerCase()));

  const ctxValue = {
    user, logout, updateUser, refreshSession,
    T, dk, darkMode, setDarkMode, accentColor, setAccentColor,
    conversations, setConversations, selectedUser, setSelectedUser: handleSelectUser,
    messages, setMessages, messagesLoading, setMessagesLoading, loadingMore,
    replyTo, setReplyTo, editingMsg, setEditingMsg,
    destroyAfter, setDestroyAfter, sendTimerMenu, setSendTimerMenu,
    attachmentFile, setAttachmentFile, attachmentPreviewUrl, setAttachmentPreviewUrl,
    attachmentUploading, attachmentInputRef, clearAttachment, handleAttachmentPick,
    showEmojiPicker, setShowEmojiPicker, emojiCat, setEmojiCat, emojiPickerRef,
    searchQuery, setSearchQuery, searchResults, setSearchResults, searchFocused, setSearchFocused,
    recentSearches, saveRecentSearch, removeRecentSearch, sidebarSearchRef,
    chatSearch, setChatSearch, chatQ, setChatQ, chatMatchIdx, setChatMatchIdx, chatMatches, chatSearchInputRef,
    selIds, setSelIds, selMode, enterSelMode, toggleSel, exitSelMode,
    pinnedMsg, setPinnedMsg,
    showProfile, setShowProfile, showMediaGallery, setShowMediaGallery, openGallery,
    galleryMedia, galleryLoading, galleryTab, setGalleryTab,
    wsStatus, otherTyping,
    scrollRef, showScrollBtn, unreadBelow, setUnreadBelow, scrollToBottom, scrollToMsg, handleScroll,
    dragInfo, onDragStart, onDragMove, onDragEnd, dragActive,
    reactionPickerMsgId, setReactionPickerMsgId, pickerPos, setPickerPos, toggleReaction,
    lightboxUrl, setLightboxUrl, lightboxRotation, setLightboxRotation,
    lightboxMsg, setLightboxMsg, lightboxMoreOpen, setLightboxMoreOpen,
    linkPreviews, flashMsgId, loadedImgsRef, newMsgIdsRef, firstUnreadIdRef,
    inputRef, sendBtnRef,
    showSettings, setShowSettings,
    settingsTab, setSettingsTab, settingsDisplayName, setSettingsDisplayName,
    settingsBio, setSettingsBio, settingsWalletAddress, setSettingsWalletAddress,
    settingsAvatarPreview, setSettingsAvatarPreview, settingsSaving, settingsMsg, setSettingsMsg,
    settingsCurPwd, setSettingsCurPwd, settingsNewPwd, setSettingsNewPwd, settingsConfPwd, setSettingsConfPwd,
    sessionDuration, setSessionDuration, sessionRefreshing, settingsAvatarInputRef,
    handleAvatarFileChange, handleSaveProfile, handleChangePassword, handleRefreshSession, openSettings,
    blockedUsers, mutedUsers, convCtxMenu, setConvCtxMenu, toggleBlock, toggleMute, deleteConversation,
    savedContacts, contactBannerDismissed, setContactBannerDismissed, addContact,
    isForwardOpen, setIsForwardOpen, fwdQuery, setFwdQuery, filteredFwd, handleForward,
    showPaymentsView, setShowPaymentsView,
    showPaymentModal, setShowPaymentModal,
    paymentPrefill, setPaymentPrefill,
    showTxHistory, setShowTxHistory,
    draftedChats, draftCacheRef, pubKeyMapRef,
    setDragInfo, longPressActivated, clearLongPress, msgCacheRef,
    isFav, hoveredMsgId, setHoveredMsgId, sendPopActive, setSendPopActive, deletingIds,
    withToken, handleSendOrEdit, handleKeyDown,
    handleDeleteMsgs, handleDeleteSel, handleCopySel, handlePin,
    startReply, startEdit, handleSendMessage, ctxMenu, setCtxMenu,
    hasMoreRef,
  };

  const inputCtxValue = {
    messageInput, setMessageInput, handleInputChange,
    isRecording, recordingTime, startRecording, stopRecording, cancelRecording,
  };

  return (
    <ChatContext.Provider value={ctxValue as any}>
      <InputContext.Provider value={inputCtxValue}>
        <>
          {/* Aurora background — fixed, behind everything */}
          <div className={`fc-aurora${dk ? "" : " is-light"}`} aria-hidden="true">
            <div className="fc-aurora__blob b1"/>
            <div className="fc-aurora__blob b2"/>
            <div className="fc-aurora__blob b3"/>
            <div className="fc-aurora__blob b4"/>
            <div className="fc-aurora__grain"/>
          </div>
          <div className={`fc-app${dk ? "" : " is-light"}`} style={{ position:"relative", zIndex:1, fontFamily: "Inter,sans-serif", color: T.text }}>
            <Sidebar />
            {showPaymentsView ? <PaymentErrorBoundary><PaymentsView /></PaymentErrorBoundary> : <ChatArea />}
            <SettingsPanel />
            <MediaGallery />
            <Dialogs />
          </div>
        </>
      </InputContext.Provider>
    </ChatContext.Provider>
  );
}
