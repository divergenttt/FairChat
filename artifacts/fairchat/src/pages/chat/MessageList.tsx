import { useMemo } from "react";
import { apiUrl } from "@/lib/apiConfig";
import { getMessageAttachment, getMessageCaption, attachmentPreviewLabel } from "@/lib/attachmentMessage";
import { encryptPaymentPayload, tryParsePaymentPayload } from "@/lib/paymentMessage";
import { getCachedPrivateKey } from "@/lib/crypto";
import { Check, Reply, Paperclip, Flame, RotateCw, ArrowUpRight, ArrowDownLeft, ExternalLink, CheckCircle2, X } from "lucide-react";
import { useChatContext } from "./context";
import { getColor, ini, fmtTime, groupByDate, isGrouped } from "./helpers";
import { URL_REGEX } from "./constants";
import { MsgTick, AudioPlayer, SelfDestructCountdown, MessageText } from "./ui";

export default function MessageList() {
  const {
    user, T, dk, isFav,
    messages, setMessages, messagesLoading,
    selectedUser, chatQ, chatMatches, chatMatchIdx,
    selIds, selMode, toggleSel, enterSelMode,
    dragInfo, onDragStart, onDragMove, onDragEnd, dragActive,
    setDragInfo, clearLongPress, longPressActivated,
    reactionPickerMsgId, setReactionPickerMsgId, pickerPos, setPickerPos, toggleReaction,
    flashMsgId, newMsgIdsRef, firstUnreadIdRef, loadedImgsRef,
    hoveredMsgId, setHoveredMsgId,
    scrollToMsg, setReplyTo, startReply,
    setLightboxUrl, setLightboxMsg, setLightboxRotation, setLightboxMoreOpen,
    linkPreviews, otherTyping, withToken,
    handleSendMessage, msgCacheRef,
    setShowPaymentModal, setPaymentPrefill,
    deletingIds,
  } = useChatContext();

  const replyMap = useMemo(() => new Map(messages.map(m => [m.id, m])), [messages]);

  const paidRequestIds = useMemo(() => {
    const paid = new Set<string>();
    const declined = new Set<string>();
    for (const m of messages) {
      if (m.messageType === "payment" && m.replyToId) paid.add(m.replyToId);
      if (m.messageType === "payment_request_declined" && m.replyToId) declined.add(m.replyToId);
    }
    return { paid, declined };
  }, [messages]);

  if (!selectedUser) return null;
  const groups = groupByDate(messages);

  return (
    <>
      {/* Skeleton loader */}
      {messagesLoading && messages.length === 0 && (
        <div style={{ padding:"0 16px", display:"flex", flexDirection:"column", gap:10 }}>
          {[...Array(6)].map((_, i) => {
            const mine = i % 3 === 2;
            const widths = [160,220,140,200,180,100];
            return (
              <div key={i} style={{ display:"flex", justifyContent:mine?"flex-end":"flex-start", alignItems:"flex-end", gap:8 }}>
                {!mine && <div className="skeleton-shimmer" style={{ width:28, height:28, borderRadius:"50%", flexShrink:0 }}/>}
                <div className="skeleton-shimmer" style={{ width:widths[i], height:36, borderRadius:12 }}/>
              </div>
            );
          })}
        </div>
      )}

      {!messagesLoading && messages.length===0 && (
        <div style={{ textAlign:"center", color:T.textSec, fontSize:13, marginTop:40 }}>
          {isFav ? "Send yourself notes, links or files." : "No messages yet. Say hello!"}
        </div>
      )}

      {groups.map(group => (
        <div key={group.label}>
          {/* Date divider */}
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 20px", marginBottom:4 }}>
            <div style={{ flex:1, height:"0.5px", background:T.border }}/>
            <span style={{ fontSize:11, color:T.textSec, whiteSpace:"nowrap" }}>{group.label}</span>
            <div style={{ flex:1, height:"0.5px", background:T.border }}/>
          </div>

          {group.messages.map((msg, i) => {
            const mine = isFav || msg.senderId === user.id;
            const isSel = selIds.has(msg.id);
            const att = getMessageAttachment(msg);
            const caption = getMessageCaption(msg);
            const isMatch = chatQ.trim() && (caption || msg.decrypted || "").toLowerCase().includes(chatQ.toLowerCase());
            const isCurrentMatch = chatMatches[chatMatchIdx]?.id === msg.id;
            const dx = dragInfo?.msgId===msg.id ? dragInfo.dx : 0;
            const replyMsg = msg.replyToId ? replyMap.get(msg.replyToId) ?? null : null;
            const isHovered = hoveredMsgId === msg.id;
            const isNew = newMsgIdsRef.current.has(msg.id);
            const prevMsg = i > 0 ? group.messages[i-1] : undefined;
            const nextMsg = i < group.messages.length-1 ? group.messages[i+1] : undefined;
            const grouped = isGrouped(msg, prevMsg);
            const isLastInGroup = !nextMsg || !isGrouped(nextMsg, msg);
            const isImageOnly = !!att?.type.startsWith("image/") && !caption;
            const _stripped = caption;
            const isBigEmoji = !att && !msg.replyToId && _stripped.length > 0 && _stripped.length <= 16 &&
              /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{200D}\u{FE0F}\u{20E3}\u{1F3FB}-\u{1F3FF}]+$/u.test(_stripped) &&
              !(/[a-zA-Z0-9\s!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(_stripped));
            const cbVisible = selMode;
            const isFlash = flashMsgId === msg.id;
            const showUnreadDivider = firstUnreadIdRef.current === msg.id;
            const isDeleting = deletingIds.has(msg.id);

            return (
              <div key={msg._stableId ?? msg.id} className={isDeleting ? "msg-deleting" : ""}>
                {showUnreadDivider && (
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 20px", margin:"4px 0" }}>
                    <div style={{ flex:1, height:"0.5px", background:"var(--fc-accent)", opacity:0.4 }}/>
                    <span style={{ fontSize:11, fontWeight:600, color:"var(--fc-accent)", background:dk?"rgba(var(--fc-accent-rgb),0.15)":"rgba(var(--fc-accent-rgb),0.08)", padding:"2px 10px", borderRadius:20, whiteSpace:"nowrap" }}>New messages</span>
                    <div style={{ flex:1, height:"0.5px", background:"var(--fc-accent)", opacity:0.4 }}/>
                  </div>
                )}
                <div id={`msg-${msg.id}`}
                  className={[isDeleting ? "" : isNew ? (mine ? "msg-enter-right" : "msg-enter-left") : "", isFlash ? "msg-flash" : ""].filter(Boolean).join(" ")}
                  onAnimationEnd={() => newMsgIdsRef.current.delete(msg.id)}
                  onClick={e=>{ e.stopPropagation(); if (selMode) toggleSel(msg.id); }}
                  onDoubleClick={e=>{ e.stopPropagation(); setReactionPickerMsgId(null); setPickerPos(null); enterSelMode(msg.id); }}
                  onContextMenu={e=>{ e.preventDefault(); e.stopPropagation(); if(selMode) return; const menuW=220; const menuH=mine?368:328; let left=e.clientX; let top=e.clientY+6; if(top+menuH>window.innerHeight-8) top=e.clientY-menuH-6; left=Math.max(8,Math.min(left,window.innerWidth-menuW-8)); top=Math.max(8,top); setPickerPos({left,top}); setReactionPickerMsgId(msg.id); }}
                  onPointerDown={e=>onDragStart(e,msg.id,mine)}
                  onPointerMove={e=>onDragMove(e,msg.id,mine)}
                  onPointerUp={()=>onDragEnd(msg,mine)}
                  onPointerCancel={()=>{ clearLongPress(); dragActive.current=false; setDragInfo(null); }}
                  onMouseEnter={()=>setHoveredMsgId(msg.id)}
                  onMouseLeave={()=>setHoveredMsgId(null)}
                  style={{
                    position:"relative",
                    contain: reactionPickerMsgId === msg.id ? "none" : "layout style",
                    zIndex: reactionPickerMsgId === msg.id ? 50 : "auto",
                    paddingTop:1, paddingBottom:1, paddingRight:16,
                    paddingLeft: cbVisible ? 48 : 16,
                    transition:"padding-left 0.18s ease",
                    marginBottom: isLastInGroup ? 6 : 0,
                    marginTop: grouped ? 0 : (i===0 ? 0 : 10),
                    background: isSel?"rgba(var(--fc-accent-rgb),0.09)": isCurrentMatch?"rgba(255,214,0,0.15)": isMatch?"rgba(255,214,0,0.07)":"transparent",
                    cursor: selMode?"pointer":"default",
                    borderRadius:8,
                    userSelect: selMode?"none":"auto",
                    touchAction:"pan-y",
                  }}>

                  {/* Selection checkbox */}
                  <div
                    onClick={e=>{ e.stopPropagation(); selMode ? toggleSel(msg.id) : enterSelMode(msg.id); }}
                    style={{
                      position:"absolute", left:12, top:"50%",
                      transform:`translateY(-50%) translateX(${cbVisible?0:-10}px)`,
                      opacity: cbVisible ? 1 : 0,
                      transition:"opacity 0.18s ease, transform 0.18s ease",
                      pointerEvents: cbVisible ? "all" : "none",
                      width:22, height:22, borderRadius:"50%",
                      border:`2px solid ${isSel?"var(--fc-accent)":dk?"#666":"#C8C8D0"}`,
                      background: isSel?"var(--fc-accent)":"transparent",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      cursor:"pointer", zIndex:5, flexShrink:0,
                    }}>
                    {isSel && <Check size={11} style={{ color:"#fff", strokeWidth:3 }}/>}
                  </div>

                  <div style={{ display:"flex", flexDirection:mine?"row-reverse":"row", alignItems:"flex-end", gap:6 }}>

                    {/* ── Payment card ── */}
                    {msg.messageType === "payment" && (() => {
                      const pay = tryParsePaymentPayload(msg.decrypted) ?? {};
                      const explorerLink = pay.explorerUrl && pay.txHash ? `${pay.explorerUrl.replace(/\/$/, "")}/tx/${pay.txHash}` : null;
                      return (
                        <div onPointerDown={e=>e.stopPropagation()} style={{
                          width: 300, borderRadius: 18, overflow: "hidden",
                          background: mine
                            ? "linear-gradient(135deg, rgba(123,78,246,0.95) 0%, rgba(186,64,180,0.95) 100%)"
                            : dk ? "linear-gradient(135deg, rgba(34,30,58,0.98) 0%, rgba(52,36,82,0.98) 100%)"
                                 : "linear-gradient(135deg, rgba(241,237,255,1) 0%, rgba(226,217,255,1) 100%)",
                          border: mine ? "none" : `1px solid ${dk ? "rgba(130,90,255,0.3)" : "rgba(130,90,255,0.2)"}`,
                          boxShadow: "0 2px 16px rgba(0,0,0,0.14)",
                        }}>
                          <div style={{ padding:"12px 14px 10px", borderBottom: mine ? "1px solid rgba(255,255,255,0.12)" : `1px solid ${dk?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.06)"}`, display:"flex", alignItems:"center", gap:8 }}>
                            <div style={{ width:30, height:30, borderRadius:"50%", background: mine?"rgba(255,255,255,0.18)":"rgba(130,90,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              {mine ? <ArrowUpRight size={15} style={{ color:"#fff" }}/> : <ArrowDownLeft size={15} style={{ color:"#8B5CF6" }}/>}
                            </div>
                            <div>
                              <div style={{ fontSize:12, fontWeight:700, color:mine?"#fff":(dk?"#d4b8ff":"#5B21B6"), lineHeight:1.2 }}>{mine?"Sent":"Received"}</div>
                              <div style={{ fontSize:10, color:mine?"rgba(255,255,255,0.6)":(dk?"rgba(200,170,255,0.6)":"rgba(109,40,217,0.55)"), fontWeight:500 }}>Crypto Transfer</div>
                            </div>
                          </div>
                          <div style={{ padding:"12px 14px 8px", display:"flex", alignItems:"baseline", gap:5 }}>
                            <span style={{ fontSize:28, fontWeight:800, color:mine?"#fff":(dk?"#e8d5ff":"#3B0764"), letterSpacing:"-0.03em", lineHeight:1 }}>{pay.amount ?? "?"}</span>
                            <span style={{ fontSize:14, fontWeight:700, color:mine?"rgba(255,255,255,0.75)":(dk?"rgba(200,170,255,0.75)":"rgba(76,29,149,0.7)") }}>{pay.token ?? ""}</span>
                          </div>
                          <div style={{ padding:"0 14px 10px", display:"flex", flexDirection:"column", gap:4 }}>
                            {pay.network && <span style={{ fontSize:11, color:mine?"rgba(255,255,255,0.6)":(dk?"rgba(200,170,255,0.55)":"rgba(109,40,217,0.5)"), fontWeight:500 }}>via {pay.network}</span>}
                            {pay.memo && <span style={{ fontSize:11.5, color:mine?"rgba(255,255,255,0.85)":(dk?"rgba(220,200,255,0.9)":"rgba(76,29,149,0.85)"), fontStyle:"italic" }}>"{pay.memo}"</span>}
                            {explorerLink && pay.txHash && (
                              <a href={explorerLink} target="_blank" rel="noopener noreferrer"
                                onClick={e=>e.stopPropagation()}
                                onPointerDown={e=>e.stopPropagation()}
                                style={{ display:"inline-flex", alignItems:"center", gap:4, textDecoration:"underline", textUnderlineOffset:2, width:"fit-content", cursor:"pointer" }}>
                                <span style={{ fontSize:11, fontFamily:"monospace", color:mine?"rgba(255,255,255,0.85)":(dk?"rgba(200,170,255,0.9)":"rgba(109,40,217,0.85)"), letterSpacing:"0.01em", fontWeight:500 }}>
                                  {pay.txHash.slice(0,6)}…{pay.txHash.slice(-4)}
                                </span>
                                <ExternalLink size={11} style={{ color:mine?"rgba(255,255,255,0.8)":(dk?"rgba(200,170,255,0.85)":"rgba(109,40,217,0.8)"), flexShrink:0 }}/>
                              </a>
                            )}
                          </div>
                          <div style={{ padding:"0 14px 10px", display:"flex", alignItems:"center", justifyContent:"flex-end", gap:4 }}>
                            {msg.destroyAt && <SelfDestructCountdown destroyAt={msg.destroyAt}/>}
                            <span style={{ fontSize:10, color:mine?"rgba(255,255,255,0.6)":T.textSec }}>{fmtTime(msg.createdAt)}</span>
                            {mine && !isFav && <MsgTick isRead={msg.isRead} color={mine?"rgba(255,255,255,0.6)":T.textSec} sent={!msg._pending} deliveryStatus={msg.deliveryStatus} failed={msg._failed}/>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Payment request card ── */}
                    {msg.messageType === "payment_request" && (() => {
                      const pay = tryParsePaymentPayload(msg.decrypted) ?? {};
                      const isPaid = paidRequestIds.paid.has(msg.id);
                      const isDeclined = paidRequestIds.declined.has(msg.id);
                      return (
                        <div onPointerDown={e=>e.stopPropagation()} style={{
                          width: 300, borderRadius: 18, overflow: "hidden",
                          background: mine
                            ? "linear-gradient(135deg, rgba(245,158,11,0.92) 0%, rgba(239,68,68,0.92) 100%)"
                            : dk ? "linear-gradient(135deg, rgba(46,38,18,0.98) 0%, rgba(62,28,28,0.98) 100%)"
                                 : "linear-gradient(135deg, rgba(255,248,230,1) 0%, rgba(255,235,214,1) 100%)",
                          border: mine ? "none" : `1px solid ${dk ? "rgba(245,158,11,0.3)" : "rgba(245,158,11,0.25)"}`,
                          boxShadow: "0 2px 16px rgba(0,0,0,0.14)",
                        }}>
                          <div style={{ padding:"12px 14px 10px", borderBottom: mine ? "1px solid rgba(255,255,255,0.15)" : `1px solid ${dk?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.06)"}`, display:"flex", alignItems:"center", gap:8 }}>
                            <div style={{ width:30, height:30, borderRadius:"50%", background: mine?"rgba(255,255,255,0.2)":"rgba(245,158,11,0.18)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              <ArrowUpRight size={15} style={{ color: mine?"#fff":"#D97706" }}/>
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:mine?"#fff":(dk?"#FCD34D":"#92400E"), lineHeight:1.2 }}>
                                {mine ? "Payment Requested" : "Payment Request"}
                              </div>
                              <div style={{ fontSize:10, color:mine?"rgba(255,255,255,0.65)":(dk?"rgba(252,211,77,0.6)":"rgba(146,64,14,0.6)"), fontWeight:500 }}>
                                {isPaid ? "Paid ✓" : isDeclined ? "Declined" : mine ? "Waiting for payment" : "You were asked to pay"}
                              </div>
                            </div>
                            {isPaid && <CheckCircle2 size={14} color="#4ade80" style={{ flexShrink:0 }}/>}
                            {isDeclined && <X size={14} color="#f87171" style={{ flexShrink:0 }}/>}
                          </div>
                          <div style={{ padding:"12px 14px 8px", display:"flex", alignItems:"baseline", gap:5 }}>
                            <span style={{ fontSize:28, fontWeight:800, color:mine?"#fff":(dk?"#FDE68A":"#78350F"), letterSpacing:"-0.03em", lineHeight:1 }}>{pay.amount ?? "?"}</span>
                            <span style={{ fontSize:14, fontWeight:700, color:mine?"rgba(255,255,255,0.75)":(dk?"rgba(252,211,77,0.75)":"rgba(120,53,15,0.7)") }}>{pay.token ?? ""}</span>
                          </div>
                          <div style={{ padding:"0 14px 10px", display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:6 }}>
                            <div style={{ display:"flex", flexDirection:"column", gap:3, minWidth:0, flex:1 }}>
                              {pay.network && <span style={{ fontSize:11, color:mine?"rgba(255,255,255,0.6)":(dk?"rgba(252,211,77,0.55)":"rgba(146,64,14,0.5)"), fontWeight:500 }}>via {pay.network}</span>}
                              {pay.memo && <span style={{ fontSize:11.5, color:mine?"rgba(255,255,255,0.85)":(dk?"rgba(252,211,77,0.85)":"rgba(120,53,15,0.8)"), fontStyle:"italic" }}>"{pay.memo}"</span>}
                              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                                {msg.destroyAt && <SelfDestructCountdown destroyAt={msg.destroyAt}/>}
                                <span style={{ fontSize:10, color:mine?"rgba(255,255,255,0.6)":T.textSec }}>{fmtTime(msg.createdAt)}</span>
                                {mine && !isFav && <MsgTick isRead={msg.isRead} color={mine?"rgba(255,255,255,0.6)":T.textSec} sent={!msg._pending} deliveryStatus={msg.deliveryStatus} failed={msg._failed}/>}
                              </div>
                            </div>
                            {!mine && !isPaid && !isDeclined && (
                              <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    (() => {
                                      const encrypted = encryptPaymentPayload(
                                        { requestId: msg.id },
                                        selectedUser.publicKey,
                                        getCachedPrivateKey(),
                                      );
                                      if (!encrypted) return;
                                      fetch(apiUrl(`/api/messages/${selectedUser.id}`), {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        credentials: "include",
                                        body: JSON.stringify({
                                          encryptedContent: encrypted,
                                          messageType: "payment_request_declined",
                                          replyToId: msg.id,
                                        }),
                                      }).catch(() => {});
                                    })();
                                  }}
                                  style={{
                                    padding:"6px 10px", borderRadius:10, border:`1px solid ${dk?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.12)"}`, cursor:"pointer",
                                    background:"rgba(255,255,255,0.07)",
                                    color: dk?"rgba(255,255,255,0.6)":"rgba(80,40,0,0.5)", fontSize:11, fontWeight:600,
                                  }}
                                >Decline</button>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    setPaymentPrefill({ amount: pay.amount, tokenSymbol: pay.token, networkId: undefined, replyToRequestId: msg.id });
                                    setShowPaymentModal(true);
                                  }}
                                  style={{
                                    padding:"6px 16px", borderRadius:10, border:"none", cursor:"pointer",
                                    background:"linear-gradient(135deg,#F59E0B 0%,#EF4444 100%)",
                                    color:"#fff", fontSize:12, fontWeight:700,
                                    boxShadow:"0 2px 8px rgba(245,158,11,0.35)",
                                  }}
                                >Pay</button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Payment request declined card ── */}
                    {msg.messageType === "payment_request_declined" && (() => {
                      return (
                        <div onPointerDown={e=>e.stopPropagation()} style={{
                          width: 260, borderRadius: 14, overflow: "hidden",
                          background: dk ? "rgba(40,30,30,0.96)" : "rgba(255,245,245,1)",
                          border: `1px solid ${dk?"rgba(239,68,68,0.25)":"rgba(239,68,68,0.2)"}`,
                          boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
                          padding: "10px 14px",
                          display:"flex", alignItems:"center", gap:9,
                        }}>
                          <div style={{ width:28, height:28, borderRadius:"50%", background:"rgba(239,68,68,0.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <X size={13} color="#f87171"/>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:700, color: dk?"#fca5a5":"#991b1b", lineHeight:1.2 }}>
                              {mine ? "You declined the request" : "Payment request declined"}
                            </div>
                            <div style={{ fontSize:10, color:T.textSec, marginTop:2 }}>{fmtTime(msg.createdAt)}</div>
                          </div>
                          {mine && !isFav && <MsgTick isRead={msg.isRead} color={T.textSec} sent={!msg._pending} deliveryStatus={msg.deliveryStatus} failed={msg._failed}/>}
                        </div>
                      );
                    })()}

                    {/* Drag reply arrow */}
                    {msg.messageType !== "payment" && msg.messageType !== "payment_request" && msg.messageType !== "payment_request_declined" && Math.abs(dx)>15 && (
                      <div style={{ position:"absolute", left:mine?undefined:48+Math.abs(dx)+8, right:mine?Math.abs(dx)+8+16:undefined, alignSelf:"center", opacity:Math.min(Math.abs(dx)/60,1), color:"var(--fc-accent)", transform:`scale(${0.7+0.3*Math.min(Math.abs(dx)/60,1)})`, transition:"none" }}>
                        <Reply size={16}/>
                      </div>
                    )}

                    {/* Incoming avatar */}
                    {msg.messageType !== "payment" && msg.messageType !== "payment_request" && !mine && (
                      <div style={{ width:28, height:28, borderRadius:"50%", background: isLastInGroup ? getColor(selectedUser.displayName) : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginBottom:2, visibility: isLastInGroup ? "visible" : "hidden" }}>
                        {isLastInGroup && <span style={{ color:"#fff", fontWeight:600, fontSize:10 }}>{ini(selectedUser.displayName)}</span>}
                      </div>
                    )}

                    <div style={{ maxWidth:"70%", minWidth:0, display: (msg.messageType==="payment"||msg.messageType==="payment_request")?"none":"flex", flexDirection:"column", alignItems:mine?"flex-end":"flex-start", transform:`translateX(${dx}px)`, transition:dragActive.current&&dragInfo?.msgId===msg.id?"none":"transform 0.2s", position:"relative" }}>
                      {/* Reply preview */}
                      {replyMsg && (
                        <div onClick={e=>{e.stopPropagation(); scrollToMsg(replyMsg.id);}}
                          style={{ marginBottom:3, padding:"4px 8px", borderRadius:8, background:mine?"rgba(255,255,255,0.15)":T.replyBar, borderLeft:`3px solid ${mine?"rgba(255,255,255,0.6)":"var(--fc-accent)"}`, cursor:"pointer", maxWidth:"100%" }}>
                          <div style={{ fontSize:11, fontWeight:600, color:mine?"rgba(255,255,255,0.8)":"var(--fc-accent)", marginBottom:1 }}>
                            {replyMsg.senderId===user.id?"You":selectedUser.displayName}
                          </div>
                          <div style={{ fontSize:12, color:mine?"rgba(255,255,255,0.7)":T.textSec, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:220 }}>
                            {(() => {
                              const rAtt = getMessageAttachment(replyMsg);
                              if (rAtt) return attachmentPreviewLabel(rAtt, getMessageCaption(replyMsg));
                              return replyMsg.decrypted;
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Message bubble */}
                      <div style={{ position:"relative", display:"flex", flexDirection:mine?"row-reverse":"row", alignItems:"flex-end", gap:4 }}>
                        <div
                          className={(isImageOnly || isBigEmoji) ? "fc-bubble--emoji" : (mine ? "fc-bubble--out" : "fc-bubble--in")}
                          onClick={e=>{ e.stopPropagation(); if(longPressActivated.current) return; if(selMode){ toggleSel(msg.id); return; } if(isImageOnly && att){ setLightboxUrl(withToken(att.url)); setLightboxMsg(msg); setLightboxRotation(0); setLightboxMoreOpen(false); return; } const menuW=220; const menuH=mine?368:328; let left=mine?e.clientX-menuW:e.clientX; let top=e.clientY+10; if(top+menuH>window.innerHeight-8) top=e.clientY-menuH-10; left=Math.max(8,Math.min(left,window.innerWidth-menuW-8)); top=Math.max(8,top); setPickerPos({left,top}); setReactionPickerMsgId(p=>p===msg.id?null:msg.id); }}
                          onDoubleClick={e=>{ e.stopPropagation(); setReactionPickerMsgId(null); setPickerPos(null); enterSelMode(msg.id); }}
                          style={{
                            padding: (isImageOnly || isBigEmoji) ? 0 : "8px 14px",
                            borderRadius: 20,
                            borderTopRightRadius:    mine && grouped ? 6 : 20,
                            borderTopLeftRadius:    !mine && grouped ? 6 : 20,
                            borderBottomRightRadius: mine ? (isLastInGroup ? 4 : 6) : 20,
                            borderBottomLeftRadius:  mine ? 20 : (isLastInGroup ? 4 : 6),
                            fontSize: isBigEmoji ? 36 : 14, lineHeight: isBigEmoji ? 1.2 : 1.45, wordBreak:"break-word",
                            flex: 1,
                            cursor: selMode ? "default" : "pointer",
                          }}>
                          {msg.decrypted?.startsWith("e1:") ? (
                            <span style={{ opacity:0.5, fontSize:13, fontStyle:"italic" }}>🔒 Encrypted message</span>
                          ) : isBigEmoji ? (
                            <span style={{ display:"inline-block", transformOrigin:"center center", animation: isNew ? "emojiPop 0.3s ease-out both" : undefined }}>
                              {msg.decrypted}
                            </span>
                          ) : msg.decrypted?.startsWith("⟫ ") ? (
                            <div style={{ borderLeft:`3px solid ${mine?"rgba(255,255,255,0.5)":"var(--fc-accent)"}`, paddingLeft:8, marginBottom:2, fontSize:13, opacity:0.85 }}>
                              {msg.decrypted.slice(2)}
                            </div>
                          ) : caption ? <MessageText text={caption} q={chatQ} mine={mine} dark={dk} /> : null}

                          {/* Attachment */}
                          {att && (() => {
                            const isImage = att.type.startsWith("image/");
                            const isAudio = att.type.startsWith("audio/");
                            const url = withToken(att.url);
                            if (isImage) return (
                              <div style={{ display:"inline-block", marginTop: caption ? 6 : 0, borderRadius:8, overflow:"hidden" }}>
                                <img src={url} alt={att.name ?? "image"}
                                  loading="lazy"
                                  className={loadedImgsRef.current.has(url) ? "" : "img-blur"}
                                  onLoad={e=>{ loadedImgsRef.current.add(url); e.currentTarget.classList.add("img-loaded"); }}
                                  onPointerDown={e => e.stopPropagation()}
                                  onClick={e=>{ e.stopPropagation(); setLightboxUrl(url); setLightboxMsg(msg); setLightboxRotation(0); setLightboxMoreOpen(false); }}
                                  style={{ maxWidth:240, maxHeight:240, display:"block", borderRadius:8, objectFit:"cover", cursor:"zoom-in" }}/>
                              </div>
                            );
                            if (isAudio) return (
                              <div style={{ marginTop: caption && caption !== "[Voice message]" ? 6 : 0 }} onClick={e=>e.stopPropagation()}>
                                <AudioPlayer src={url} dark={dk} mine={mine}/>
                              </div>
                            );
                            return (
                              <a href={url} target="_blank" rel="noreferrer" download={att.name ?? "file"} onClick={e=>e.stopPropagation()}
                                style={{ display:"flex", alignItems:"center", gap:8, marginTop: caption ? 6 : 0, padding:"8px 10px", borderRadius:10,
                                         background: mine?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.06)",
                                         textDecoration:"none", color:"inherit", cursor:"pointer" }}>
                                <div style={{ width:32, height:32, borderRadius:8, background: mine?"rgba(255,255,255,0.2)":"var(--fc-accent)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                  <Paperclip size={16} style={{ color:"#fff" }}/>
                                </div>
                                <div style={{ overflow:"hidden" }}>
                                  <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:160 }}>{att.name ?? "file"}</div>
                                  <div style={{ fontSize:11, opacity:0.7 }}>{att.size ? `${(att.size/1024).toFixed(0)} KB` : ""}</div>
                                </div>
                              </a>
                            );
                          })()}

                          {/* Link preview */}
                          {(() => {
                            if (!caption) return null;
                            const urls = Array.from(caption.matchAll(URL_REGEX), m => m[0].replace(/[.,;!?)"']+$/, ""));
                            const previewUrl = urls.find(url => linkPreviews[url]?.title);
                            if (!previewUrl) return null;
                            const preview = linkPreviews[previewUrl]!;
                            return (
                              <a href={previewUrl} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                                style={{ display:"block", marginTop:8, borderRadius:10, overflow:"hidden", border:`0.5px solid ${mine?"rgba(255,255,255,0.2)":"rgba(0,0,0,0.08)"}`, textDecoration:"none", background:mine?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.03)" }}>
                                {preview.image && <img src={preview.image} alt="" style={{ width:"100%", maxHeight:150, objectFit:"cover", display:"block" }} onError={e=>(e.currentTarget.style.display="none")}/>}
                                <div style={{ padding:"7px 10px" }}>
                                  <div style={{ fontSize:11, color:mine?"rgba(255,255,255,0.55)":"var(--fc-accent)", marginBottom:2, fontWeight:500 }}>{preview.siteName}</div>
                                  <div style={{ fontSize:13, fontWeight:600, color:mine?"#fff":T.text, lineHeight:1.3 }}>{preview.title.slice(0,80)}</div>
                                  {preview.description && <div style={{ fontSize:12, color:mine?"rgba(255,255,255,0.65)":T.textSec, marginTop:2, lineHeight:1.3, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" } as React.CSSProperties}>{preview.description}</div>}
                                </div>
                              </a>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Reaction pills */}
                      {(msg.reactions?.length ?? 0) > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:4, justifyContent:mine?"flex-end":"flex-start" }}>
                          {msg.reactions!.map(r => (
                            <button key={r.emoji} onClick={e=>{e.stopPropagation();toggleReaction(msg.id,r.emoji);}}
                              className="reaction-pop"
                              style={{ display:"flex", alignItems:"center", gap:3, padding:"2px 8px", borderRadius:16,
                                background: r.byMe ? (mine?"rgba(255,255,255,0.25)":"rgba(var(--fc-accent-rgb),0.12)") : (dk?"#2C2C2E":"#e5e5ea"),
                                border: r.byMe ? `1.5px solid ${mine?"rgba(255,255,255,0.5)":"var(--fc-accent)"}` : `1.5px solid transparent`,
                                cursor:"pointer", fontSize:14, fontWeight:600,
                                color: r.byMe ? (mine?"#fff":"var(--fc-accent)") : T.textSec,
                                transition:"all 0.15s" }}>
                              <span>{r.emoji}</span>
                              <span style={{ fontSize:12 }}>{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Timestamp + read receipt */}
                      <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:2, marginLeft:2, marginRight:2, opacity: (isLastInGroup || msg._pending || msg._failed) ? 1 : (isHovered ? 0.7 : 0) }}>
                        {msg.destroyAt && <SelfDestructCountdown destroyAt={msg.destroyAt} />}
                        {!msg.destroyAt && msg.destroyAfter && <span style={{ fontSize:10, color:"#f44336", fontWeight:700, display:"flex", alignItems:"center", gap:2 }}><Flame size={10}/>{msg.destroyAfter < 60 ? `${msg.destroyAfter}s` : msg.destroyAfter < 3600 ? `${msg.destroyAfter/60}m` : `${msg.destroyAfter/3600}h`}</span>}
                        {msg.editedAt && <span style={{ fontSize:10, color:T.textSec, fontStyle:"italic" }}>edited</span>}
                        <span style={{ fontSize:11, color: msg._failed ? "#e53935" : T.textSec }}>{fmtTime(msg.createdAt)}</span>
                        {mine && !isFav && (
                          msg._failed ? (
                            <button onClick={e=>{ e.stopPropagation(); setMessages(prev=>prev.filter(m=>m.id!==msg.id)); msgCacheRef.current.forEach((msgs,k)=>msgCacheRef.current.set(k,msgs.filter(m=>m.id!==msg.id))); handleSendMessage(msg.decrypted, msg.recipientId); }}
                              title="Retry"
                              style={{ background:"none", border:"none", cursor:"pointer", color:"#e53935", padding:0, display:"flex", alignItems:"center", gap:2, fontSize:10 }}>
                              <RotateCw size={10}/> Retry
                            </button>
                          ) : (
                            <MsgTick isRead={msg.isRead} color={T.textSec} sent={!msg._pending} deliveryStatus={msg.deliveryStatus} failed={msg._failed} />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Typing bubble */}
      {otherTyping && !isFav && (
        <div className="typing-bubble" style={{ display:"flex", alignItems:"flex-end", gap:6, padding:"2px 16px 10px" }}>
          <div style={{ width:28, height:28, borderRadius:"50%", background:getColor(selectedUser.displayName), display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <span style={{ color:"#fff", fontWeight:600, fontSize:10 }}>{ini(selectedUser.displayName)}</span>
          </div>
          <div style={{ padding:"10px 14px", borderRadius:20, borderBottomLeftRadius:4, background:T.msgOther, display:"flex", alignItems:"center", gap:5, border:`0.5px solid ${T.msgOtherBorder}` }}>
            <span className="typing-dot" style={{ color:T.textSec }}/>
            <span className="typing-dot" style={{ color:T.textSec }}/>
            <span className="typing-dot" style={{ color:T.textSec }}/>
          </div>
        </div>
      )}
    </>
  );
}
