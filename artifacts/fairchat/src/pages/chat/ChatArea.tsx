import { useEffect, useMemo, useState } from "react";
import { Search, X, Pin, User as UserIcon, ChevronDown, Copy, Forward, Trash2, Ban, Download, Bell, BellOff, Wallet, Link as LinkIcon } from "lucide-react";
import { useChatContext } from "./context";
import { getColor, ini, fmtLastSeen } from "./helpers";
import { FAV_GRADIENT } from "./constants";
import { BtnToolbar } from "./ui";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import { getMessageAttachment, getMessageCaption } from "@/lib/attachmentMessage";
import { SecureAttachmentImage, SecureAttachmentFileLink } from "./SecureAttachment";

export default function ChatArea() {
  const {
    user, T, dk, isFav,
    selectedUser, setSelectedUser,
    messages, loadingMore, hasMoreRef,
    scrollRef, handleScroll, showScrollBtn, unreadBelow, setUnreadBelow, scrollToBottom, scrollToMsg,
    selMode, selIds, setSelIds, exitSelMode, enterSelMode,
    pinnedMsg, handlePin, chatSearch, setChatSearch, chatQ, setChatQ, chatMatchIdx, setChatMatchIdx, chatSearchInputRef, chatMatches,
    showProfile, setShowProfile, showMediaGallery, openGallery,
    savedContacts, contactBannerDismissed, setContactBannerDismissed, addContact,
    blockedUsers, toggleBlock, mutedUsers, toggleMute, setShowPaymentsView,
    handleCopySel, handleDeleteSel, handleDeleteMsgs,
    setIsForwardOpen, setFwdQuery, setCtxMenu, setReactionPickerMsgId, setPickerPos,
    otherTyping,
    withToken, setLightboxUrl, setLightboxMsg, setLightboxRotation, setLightboxMoreOpen, pubKeyMapRef,
  } = useChatContext();

  const _hasMoreRef = hasMoreRef as React.MutableRefObject<Map<string, boolean>>;

  return (
    <div className="fc-glass-panel fc-chat" style={{ display:"flex", flexDirection:"column", overflow:"hidden", position:"relative" }}>
      {!selectedUser ? (
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:T.textSec }}>
          <div style={{ width:80, height:80, borderRadius:"50%", overflow:"hidden", marginBottom:16, background:dk?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.04)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <img src="/logo.png" alt="FairChat" style={{ width:48, height:48, objectFit:"contain" }}/>
          </div>
          <div style={{ fontSize:20, fontWeight:600, color:T.text, marginBottom:8 }}>Select a chat</div>
          <div style={{ fontSize:14, color:T.textSec }}>Choose a conversation or search for a user</div>
        </div>
      ) : (
        <>
          {/* Chat header */}
          <div className="fc-chat-header-shell">
            {selMode ? (
              <div className="sel-toolbar-enter" style={{ padding:"12px 20px", display:"flex", alignItems:"center", gap:10 }}>
                <button onClick={exitSelMode} title="Cancel" style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, display:"flex", padding:6, borderRadius:8 }}>
                  <X size={18}/>
                </button>
                <span style={{ fontSize:14, fontWeight:600, color:T.text, flex:1 }}>
                  {selIds.size} {selIds.size === 1 ? "message" : "messages"} selected
                </span>
                <button onClick={()=>{ const allIds = new Set(messages.map(m=>m.id)); setSelIds(allIds); }} title="Select all"
                  style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, fontSize:12, fontWeight:600, padding:"4px 8px", borderRadius:6, whiteSpace:"nowrap" }}>
                  All
                </button>
                <BtnToolbar icon={<Copy size={14}/>} label="Copy" disabled={!selIds.size} onClick={handleCopySel} T={T}/>
                <BtnToolbar icon={<Forward size={14}/>} label="Forward" disabled={!selIds.size} onClick={()=>{setIsForwardOpen(true); setFwdQuery("");}} T={T}/>
                <BtnToolbar icon={<Trash2 size={14}/>} label="Delete" disabled={!selIds.size} onClick={handleDeleteSel} danger T={T}/>
              </div>
            ) : (
              <div onClick={()=>setShowProfile(p=>!p)}
                style={{ padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
                  <div style={{ position:"relative", flexShrink:0 }}>
                    <div style={{ width:40, height:40, borderRadius:"50%", background:isFav?FAV_GRADIENT:getColor(selectedUser.displayName), display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {isFav ? <span style={{ color:"#fff", fontSize:17 }}>★</span> : <span style={{ color:"#fff", fontWeight:600, fontSize:14 }}>{ini(selectedUser.displayName)}</span>}
                    </div>
                    {!isFav && selectedUser.isOnline && (
                      <div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:"50%", background:"#4CAF50", border:`2px solid ${T.surface}` }}/>
                    )}
                  </div>
                  <div>
                    <h2 style={{ fontSize:15, fontWeight:600, color:T.text, margin:0 }}>{isFav?"Favorites":selectedUser.displayName}</h2>
                    <p style={{ fontSize:12, color:T.textSec, margin:0, marginTop:1 }}>
                      {otherTyping && !isFav
                        ? <span style={{ color:"var(--fc-accent)", fontStyle:"italic" }}>typing<span className="dot-anim"/>...</span>
                        : isFav ? "Your saved messages"
                        : (() => { const s = fmtLastSeen(selectedUser.lastSeen, selectedUser.isOnline); return <span style={{ color: selectedUser.isOnline?"#4CAF50":T.textSec }}>{s}</span>; })()
                      }
                    </p>
                  </div>
                </div>

                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <button onClick={e=>{e.stopPropagation(); setChatSearch(s=>!s); setChatQ(""); setChatMatchIdx(0);}} title="Search in chat"
                    style={{ width:36, height:36, borderRadius:10, background:"none", border:"none", cursor:"pointer", color:chatSearch?"var(--fc-accent)":T.textSec, display:"flex", alignItems:"center", justifyContent:"center" }}
                    onMouseEnter={e=>(e.currentTarget.style.background=T.hoverBg)}
                    onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                    <Search size={18}/>
                  </button>
                </div>
              </div>
            )}

            {/* Chat search bar */}
            {chatSearch && (
              <div style={{ padding:"8px 20px 12px", display:"flex", alignItems:"center", gap:8 }}>
                <Search size={15} style={{ color:T.textSec, flexShrink:0 }}/>
                <input ref={chatSearchInputRef} value={chatQ} onChange={e=>{setChatQ(e.target.value); setChatMatchIdx(0);}}
                  placeholder="Search messages…" style={{ flex:1, padding:"8px 12px", fontSize:14, borderRadius:10, border:`0.5px solid ${T.border}`, background:T.inputBg, outline:"none", color:T.text }}/>
                {chatMatches.length>0 && (
                  <>
                    <span style={{ fontSize:12, color:T.textSec, whiteSpace:"nowrap" }}>{chatMatchIdx+1}/{chatMatches.length}</span>
                    <button onClick={()=>setChatMatchIdx(i=>Math.max(0,i-1))} style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, padding:2 }}>▲</button>
                    <button onClick={()=>setChatMatchIdx(i=>Math.min(chatMatches.length-1,i+1))} style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, padding:2 }}>▼</button>
                  </>
                )}
                {chatQ && !chatMatches.length && <span style={{ fontSize:12, color:"#E53935" }}>Not found</span>}
                <button onClick={()=>{setChatSearch(false); setChatQ("");}} style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, display:"flex", padding:2 }}><X size={15}/></button>
              </div>
            )}

            {/* Pinned message */}
            {pinnedMsg && !selMode && !chatSearch && (
              <div aria-label="Pinned message" onClick={()=>scrollToMsg(pinnedMsg.id)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 20px", borderTop:`0.5px solid ${T.border}`, cursor:"pointer", background:dk?"#2C2A4A":"#F0EEFF" }}>
                <Pin size={14} style={{ color:"var(--fc-accent)", flexShrink:0 }}/>
                <div style={{ flex:1, overflow:"hidden" }}>
                  <div style={{ fontSize:11, color:"var(--fc-accent)", fontWeight:600, marginBottom:1 }}>Pinned message</div>
                  <div style={{ fontSize:13, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{pinnedMsg.decrypted}</div>
                </div>
                <button aria-label="Unpin message" onClick={e=>{e.stopPropagation(); handlePin(null);}} style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, display:"flex", padding:2 }}><X size={14}/></button>
              </div>
            )}

            {/* Add to contacts banner */}
            {selectedUser && !isFav && !savedContacts.has(selectedUser.id) && !contactBannerDismissed.has(selectedUser.id) && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 20px", borderTop:`0.5px solid ${T.border}`, background:dk?"rgba(var(--fc-accent-rgb),0.08)":"rgba(var(--fc-accent-rgb),0.05)" }}>
                <UserIcon size={14} style={{ color:"var(--fc-accent)", flexShrink:0 }}/>
                <span style={{ flex:1, fontSize:13, color:dk?"rgba(255,255,255,0.7)":"rgba(0,0,0,0.55)" }}>
                  Add <strong style={{ color:T.text }}>{selectedUser.displayName}</strong> to your contacts
                </span>
                <button onClick={()=>addContact(selectedUser.id)} style={{ fontSize:12, fontWeight:600, padding:"4px 12px", borderRadius:8, background:"var(--fc-accent)", color:"#fff", border:"none", cursor:"pointer", whiteSpace:"nowrap" }}>
                  Add
                </button>
                <button onClick={()=>setContactBannerDismissed(prev=>new Set([...prev, selectedUser.id]))} style={{ fontSize:12, fontWeight:500, padding:"4px 10px", borderRadius:8, background:"none", border:`0.5px solid ${T.border}`, color:T.textSec, cursor:"pointer", whiteSpace:"nowrap" }}>
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* Messages scroll area */}
          <div ref={scrollRef} onScroll={handleScroll} className="chat-area-fade" style={{
            flex:1, overflowY:"auto", overflowX:"hidden", padding:"16px 0",
            backgroundImage: "none",
            backgroundSize: "260px 260px",
          }} onClick={()=>{ setCtxMenu(null); setReactionPickerMsgId(null); setPickerPos(null); }}>
            {loadingMore && (
              <div style={{ display:"flex", justifyContent:"center", padding:"8px 0 4px" }}>
                <div style={{ width:20, height:20, borderRadius:"50%", border:"2px solid var(--fc-accent)", borderTopColor:"transparent", animation:"spin 0.7s linear infinite" }}/>
              </div>
            )}
            {!loadingMore && _hasMoreRef.current.get(selectedUser?.id ?? "") === false && messages.length > 0 && (
              <div style={{ display:"flex", justifyContent:"center", padding:"4px 0 8px" }}>
                <span style={{ fontSize:12, color:T.textSec, opacity:0.5 }}>Beginning of conversation</span>
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
              <div style={{ background:dk?"rgba(var(--fc-accent-rgb),0.15)":"rgba(var(--fc-accent-rgb),0.08)", borderRadius:12, padding:"6px 14px", maxWidth:340, textAlign:"center" }}>
                <span style={{ fontSize:12, color:"var(--fc-accent)" }}>🔒 Messages are end-to-end encrypted</span>
              </div>
            </div>

            <MessageList />
          </div>

          {/* Profile / details panel — slide in from right */}
          {showProfile && (
            <ProfileDetailsPanel
              selectedUser={selectedUser}
              messages={messages}
              T={T}
              isMuted={mutedUsers.has(selectedUser.id)}
              isBlocked={blockedUsers.has(selectedUser.id)}
              onMute={() => toggleMute(selectedUser.id)}
              onBlock={() => toggleBlock(selectedUser.id)}
              onSearch={() => { setShowProfile(false); setChatSearch(true); setChatQ(""); setChatMatchIdx(0); }}
              onPay={() => { setShowProfile(false); setShowPaymentsView(true); }}
              onClose={() => setShowProfile(false)}
              onOpenLightbox={(url, m) => { setLightboxUrl(url); setLightboxMsg(m); setLightboxRotation(0); }}
              openGallery={openGallery}
              userId={user.id}
              otherPubKey={pubKeyMapRef.current.get(selectedUser.id) ?? selectedUser.publicKey}
              dk={dk}
            />
          )}

          {/* Scroll to bottom FAB */}
          <button onClick={scrollToBottom} style={{
            position:"absolute", bottom:80, right:24, width:42, height:42,
            borderRadius:"50%", background:"var(--fc-accent)", border:"none",
            cursor: showScrollBtn ? "pointer" : "default",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 2px 10px rgba(0,0,0,0.25)", zIndex:10,
            opacity: showScrollBtn ? 1 : 0,
            transform: showScrollBtn ? "scale(1) translateY(0)" : "scale(0.6) translateY(8px)",
            transition:"opacity 0.22s ease, transform 0.22s ease",
            pointerEvents: showScrollBtn ? "all" : "none",
          }}>
            <ChevronDown size={20} style={{ color:"#fff" }}/>
            {unreadBelow>0 && <div className="badge-pulse" style={{ position:"absolute", top:-6, right:-6, background:"#E53935", color:"#fff", borderRadius:"50%", fontSize:10, fontWeight:700, padding:"2px 5px", minWidth:18, textAlign:"center" }}>{unreadBelow}</div>}
          </button>

          <ChatInput />
        </>
      )}
    </div>
  );
}

declare module "./context" {
  interface ChatCtx {
    hasMoreRef: import("react").MutableRefObject<Map<string, boolean>>;
    scrollToMsg: (id: string) => void;
  }
}

/* ── Profile / details panel (mockup-style) ─────────────────────────────── */

const FILE_KIND_GRADIENTS: Record<string, [string, string]> = {
  pdf:  ["#ef4444", "#f97316"],
  doc:  ["#2563eb", "#7c3aed"],
  docx: ["#2563eb", "#7c3aed"],
  xls:  ["#16a34a", "#0d9488"],
  xlsx: ["#16a34a", "#0d9488"],
  zip:  ["#a16207", "#ca8a04"],
  rar:  ["#a16207", "#ca8a04"],
  mp3:  ["#db2777", "#be185d"],
  mp4:  ["#0ea5e9", "#6366f1"],
  mov:  ["#0ea5e9", "#6366f1"],
  txt:  ["#64748b", "#475569"],
  json: ["#22d3ee", "#6366f1"],
};
function fileKind(name?: string | null) {
  if (!name) return { kind: "FILE", grad: FILE_KIND_GRADIENTS.txt };
  const ext = (name.split(".").pop() || "").toLowerCase();
  return { kind: ext.slice(0, 4).toUpperCase() || "FILE", grad: FILE_KIND_GRADIENTS[ext] ?? ["#7c3aed", "#ec4899"] as [string, string] };
}
function fmtBytes(b?: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024*1024) return `${(b/1024).toFixed(0)} KB`;
  return `${(b/(1024*1024)).toFixed(1)} MB`;
}

function DetailsSection({
  title, count, defaultOpen = true, children,
}: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="fc-details-section">
      <button type="button" className="fc-details-section__head" onClick={() => setOpen(o => !o)}>
        <span>{title}{count != null && <span className="fc-details-count">· {count}</span>}</span>
        <ChevronDown size={14} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .2s" }} />
      </button>
      {open && <div className="fc-details-section__body">{children}</div>}
    </div>
  );
}

function ProfileDetailsPanel({
  selectedUser, messages, isMuted, isBlocked,
  onMute, onBlock, onSearch, onPay, onClose, onOpenLightbox, openGallery,
  userId, otherPubKey,
}: {
  selectedUser: any;
  messages: any[];
  userId: string;
  otherPubKey?: string;
  T?: any;
  dk?: boolean;
  isMuted: boolean;
  isBlocked: boolean;
  onMute: () => void;
  onBlock: () => void;
  onSearch: () => void;
  onPay: () => void;
  onClose: () => void;
  onOpenLightbox: (url: string, m: any) => void;
  openGallery: () => void;
}) {
  const imgs = messages.filter(m => {
    const a = getMessageAttachment(m);
    return !!a?.type.startsWith("image/");
  });
  const files = messages.filter(m => {
    const a = getMessageAttachment(m);
    return !!a && !a.type.startsWith("image/");
  });
  const displayedImgs = imgs.slice(0, 9);

  const links = useMemo(() => {
    const urlRe = /https?:\/\/[^\s<>"']+/gi;
    const seen = new Set<string>();
    const out: { url: string; host: string; msgId: string }[] = [];
    for (const m of messages) {
      const text: string = getMessageCaption(m) || "";
      if (!text) continue;
      const matches = text.match(urlRe);
      if (!matches) continue;
      for (const raw of matches) {
        const url = raw.replace(/[.,;:)\]}'"!?]+$/, "");
        if (seen.has(url)) continue;
        seen.add(url);
        let host = url;
        try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
        out.push({ url, host, msgId: m.id });
      }
    }
    return out;
  }, [messages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const titleId = "fc-details-title";
  return (
    <div onClick={onClose} className="fc-details-overlay">
      <div
        onClick={e=>e.stopPropagation()}
        className="fc-details-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Close */}
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:-8, position:"relative", zIndex:1 }}>
          <button onClick={onClose} aria-label="Close" style={{ background:"none", border:"none", cursor:"pointer", color:"currentColor", opacity:0.6, padding:6, borderRadius:8, display:"flex" }}>
            <X size={18}/>
          </button>
        </div>

        <div className="fc-details-panel__scroll">
          {/* Hero */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"4px 0 6px", textAlign:"center" }}>
            <div style={{ width:88, height:88, borderRadius:"50%", background: selectedUser.avatarUrl ? "transparent" : getColor(selectedUser.displayName), display:"flex", alignItems:"center", justifyContent:"center", marginBottom:14, boxShadow:"0 8px 24px -8px rgba(0,0,0,0.35)", overflow:"hidden", flexShrink:0 }}>
              {selectedUser.avatarUrl
                ? <img src={selectedUser.avatarUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                : <span style={{ color:"#fff", fontWeight:700, fontSize:32 }}>{ini(selectedUser.displayName)}</span>}
            </div>
            <div id={titleId} style={{ fontSize:18, fontWeight:600, letterSpacing:"-0.01em", marginBottom:4 }}>{selectedUser.displayName}</div>
            <div style={{ fontSize:13, opacity:0.6, marginBottom:6 }}>@{selectedUser.username}</div>
            <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background: selectedUser.isOnline ? "#4CAF50" : "#9E9E9E" }}/>
              <span style={{ color: selectedUser.isOnline ? "#4CAF50" : "currentColor", opacity: selectedUser.isOnline ? 1 : 0.6, fontWeight:500 }}>
                {fmtLastSeen(selectedUser.lastSeen, selectedUser.isOnline)}
              </span>
            </div>
            {selectedUser.bio && (
              <div style={{ fontSize:13, marginTop:10, lineHeight:1.5, opacity:0.8, padding:"0 4px" }}>{selectedUser.bio}</div>
            )}
            {selectedUser.createdAt && (
              <div style={{ fontSize:11.5, marginTop:8, opacity:0.5 }}>
                Member since {new Date(selectedUser.createdAt).toLocaleDateString([],{month:"long",year:"numeric"})}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="fc-details-actions">
            <button className={`fc-details-action${isMuted ? " is-on" : ""}`} onClick={onMute}>
              {isMuted ? <BellOff size={18}/> : <Bell size={18}/>}
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button className="fc-details-action" onClick={onSearch}>
              <Search size={18}/>Search
            </button>
            <button className="fc-details-action" onClick={onPay}>
              <Wallet size={18}/>Pay
            </button>
            <button className={`fc-details-action${isBlocked ? " is-on" : " is-danger"}`} onClick={onBlock}>
              <Ban size={18}/>{isBlocked ? "Unblock" : "Block"}
            </button>
          </div>

          {/* Shared files */}
          <DetailsSection title="Shared files" count={files.length} defaultOpen={files.length > 0}>
            {files.length === 0
              ? <div style={{ fontSize:12, opacity:0.5, padding:"6px 2px" }}>No files yet</div>
              : files.map(m => {
                  const a = getMessageAttachment(m)!;
                  return (
                    <div key={m.id} style={{ padding: "4px 0" }}>
                      <SecureAttachmentFileLink att={a} otherUserPubKey={otherPubKey} />
                    </div>
                  );
                })}
          </DetailsSection>

          {/* Shared media */}
          <DetailsSection title="Shared media" count={imgs.length} defaultOpen={true}>
            {imgs.length === 0
              ? <div style={{ fontSize:12, opacity:0.5, padding:"6px 2px" }}>No media yet</div>
              : (
                <>
                  <div className="fc-media-grid">
                    {displayedImgs.map(m => {
                      const a = getMessageAttachment(m)!;
                      return (
                        <div key={m.id} className="fc-media-tile" style={{ padding: 0, border: "none", background: "transparent" }}>
                          <SecureAttachmentImage
                            att={a}
                            otherUserPubKey={otherPubKey}
                            onOpen={(blobUrl) => onOpenLightbox(blobUrl, m)}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {imgs.length > 9 && (
                    <button onClick={openGallery}
                      style={{ marginTop:8, fontSize:12, color:"var(--fc-accent)", background:"none", border:"none", cursor:"pointer", padding:0, fontWeight:600, textAlign:"left" }}>
                      View all {imgs.length} →
                    </button>
                  )}
                </>
              )}
          </DetailsSection>

          {/* Links */}
          <DetailsSection title="Links" count={links.length} defaultOpen={false}>
            {links.length === 0
              ? <div style={{ fontSize:12, opacity:0.5, padding:"6px 2px" }}>No links yet</div>
              : links.map((l, i) => (
                  <a key={`${l.msgId}-${i}`} href={l.url} target="_blank" rel="noreferrer" className="fc-file-row">
                    <div className="fc-file-row__icon" style={{ background: "linear-gradient(135deg, #22d3ee, #6366f1)" }}>
                      <LinkIcon size={14}/>
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div className="fc-file-row__name">{l.url}</div>
                      <div className="fc-file-row__meta">{l.host}</div>
                    </div>
                  </a>
                ))}
          </DetailsSection>

        </div>
      </div>
    </div>
  );
}

