import React, { useState, useEffect, useRef, useCallback } from "react";
import { apiUrl } from "@/lib/apiConfig";
import { Search, UserPlus, CheckCircle2 } from "lucide-react";
import { G } from "./PaymentGlass";

interface User {
  id: string;
  username: string;
  displayName: string;
  publicKey?: string;
  isOnline?: boolean;
  avatarUrl?: string | null;
  walletAddress?: string | null;
}

export function useContactPicker(
  selectedUser: User | null,
) {
  const [recipient, setRecipient] = useState<User | null>(selectedUser);
  const [contacts, setContacts] = useState<User[]>([]);
  const [savedContactIds, setSavedContactIds] = useState<Set<string>>(new Set());
  const [walletDataLoaded, setWalletDataLoaded] = useState(false);

  useEffect(() => {
    setRecipient(selectedUser);
  }, [selectedUser]);

  useEffect(() => {
    const opts: RequestInit = { credentials: "include" };
    Promise.all([
      fetch(apiUrl("/api/contacts"), opts)
        .then((r) => r.json())
        .catch(() => []),
      fetch(apiUrl("/api/messages/conversations"), opts)
        .then((r) => r.json())
        .catch(() => []),
    ])
      .then(([saved, convs]: [User[], Array<{ user: User }>]) => {
        const savedList: User[] = Array.isArray(saved) ? saved : [];
        const convList: User[] = Array.isArray(convs) ? convs.map((c) => c.user) : [];
        const ids = new Set(savedList.map((u) => u.id));
        setSavedContactIds(ids);
        const merged = [...savedList];
        for (const u of convList) {
          if (!ids.has(u.id)) merged.push(u);
        }
        setContacts(merged);
        setRecipient((prev) => {
          if (!prev) return prev;
          const fresh = merged.find((u) => u.id === prev.id);
          if (fresh && fresh.walletAddress !== prev.walletAddress) return { ...prev, ...fresh };
          return prev;
        });
        setWalletDataLoaded(true);
      })
      .catch(() => {
        setWalletDataLoaded(true);
      });
  }, []);

  const selectContact = useCallback((c: User) => {
    setRecipient(c);
  }, []);

  return { recipient, contacts, savedContactIds, walletDataLoaded, selectContact };
}

export function ContactPickerDropdown({
  contacts,
  savedContactIds,
  selectedId,
  onSelect,
  onClose,
  getColor,
  ini,
}: {
  contacts: User[];
  savedContactIds: Set<string>;
  selectedId: string | null;
  onSelect: (c: User) => void;
  onClose: () => void;
  getColor: (name: string) => string;
  ini: (name: string) => string;
}) {
  const [contactSearch, setContactSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filtered = contactSearch.trim()
    ? contacts.filter(
        (c) =>
          c.displayName.toLowerCase().includes(contactSearch.toLowerCase()) ||
          c.username.toLowerCase().includes(contactSearch.toLowerCase()),
      )
    : contacts;

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        marginBottom: 10,
        borderRadius: 10,
        background: G.dropdownBg,
        backdropFilter: G.blurDrop,
        border: `1px solid ${G.border}`,
        boxShadow: G.shadowDrop,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          borderBottom: `1px solid ${G.borderSub}`,
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <Search size={12} color={G.textMuted} style={{ flexShrink: 0 }} />
        <input
          autoFocus
          value={contactSearch}
          onChange={(e) => setContactSearch(e.target.value)}
          placeholder="Search contacts\u2026"
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
      </div>
      <div style={{ maxHeight: 160, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "12px 14px",
              fontSize: 12,
              color: G.textMuted,
              textAlign: "center",
            }}
          >
            {contactSearch ? "No results" : "No conversations yet"}
          </div>
        ) : (
          filtered.map((c, i, arr) => (
            <button
              key={c.id}
              onClick={() => {
                onSelect(c);
                onClose();
              }}
              style={{
                width: "100%",
                padding: "9px 12px",
                display: "flex",
                alignItems: "center",
                gap: 9,
                background:
                  selectedId === c.id ? "rgba(155,92,246,0.14)" : "transparent",
                border: "none",
                borderBottom: i < arr.length - 1 ? `1px solid ${G.borderSub}` : "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: getColor(c.displayName),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 12,
                  color: "#fff",
                  overflow: "hidden",
                }}
              >
                {c.avatarUrl ? (
                  <img
                    src={c.avatarUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  ini(c.displayName)
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: G.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.displayName}
                  </span>
                  {savedContactIds.has(c.id) && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 4,
                        background: "rgba(155,92,246,0.18)",
                        color: "#c4b5fd",
                        border: "1px solid rgba(155,92,246,0.28)",
                        flexShrink: 0,
                      }}
                    >
                      Saved
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: G.textMuted }}>@{c.username}</div>
              </div>
              {c.walletAddress ? (
                <CheckCircle2 size={12} color={G.green} />
              ) : (
                <div style={{ fontSize: 9, color: G.orange }}>No wallet</div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function RecipientDisplay({
  recipient,
  getColor,
  ini,
  onPickerToggle,
  showContactPicker,
}: {
  recipient: User | null;
  getColor: (name: string) => string;
  ini: (name: string) => string;
  onPickerToggle: () => void;
  showContactPicker: boolean;
}) {
  const recipientWallet = recipient?.walletAddress ?? null;
  const isValid = !!recipientWallet && /^0x[0-9a-fA-F]{40}$/.test(recipientWallet);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
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
          To
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPickerToggle();
          }}
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 6,
            background: "rgba(155,92,246,0.12)",
            border: "1px solid rgba(155,92,246,0.28)",
            color: "#c4b5fd",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <UserPlus size={10} />
          {recipient ? "Change" : "Pick contact"}
        </button>
      </div>

      {recipient ? (
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: getColor(recipient.displayName),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontWeight: 700,
              fontSize: 14,
              color: "#fff",
              overflow: "hidden",
            }}
          >
            {recipient.avatarUrl ? (
              <img
                src={recipient.avatarUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              ini(recipient.displayName)
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: G.text }}>
              {recipient.displayName}
            </div>
            {recipientWallet ? (
              <div
                style={{
                  fontSize: 11,
                  color: G.green,
                  fontFamily: "monospace",
                  marginTop: 2,
                }}
              >
                {recipientWallet.slice(0, 8)}\u2026{recipientWallet.slice(-6)}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#c4b5fd", marginTop: 2 }}>
                No wallet linked yet
              </div>
            )}
          </div>
          {isValid ? (
            <CheckCircle2 size={16} color={G.green} style={{ flexShrink: 0 }} />
          ) : (
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: "3px 7px",
                borderRadius: 6,
                background: "rgba(155,92,246,0.12)",
                border: "1px solid rgba(155,92,246,0.28)",
                color: "#c4b5fd",
                flexShrink: 0,
              }}
            >
              {recipientWallet ? "Invalid address" : "No wallet"}
            </div>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 13, color: G.textMuted }}>Select a contact first</span>
      )}
    </>
  );
}
