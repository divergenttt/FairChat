import { useState } from "react";
import { X, RotateCw, MoreVertical, MessageCircle, ArrowUpRight, Copy, Forward, Trash2, Download, Images, Check, Ban, Bell, BellOff, Reply, Pencil, Pin, PinOff, ChevronDown, UserRound, UserX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import PaymentModal from "@/components/PaymentModal";
import TransactionHistory from "./TransactionHistory";
import { useChatContext } from "./context";
import { getColor, ini } from "./helpers";
import { COMMON_REACTIONS, FAV_GRADIENT } from "./constants";

export default function Dialogs() {
  const [delConvExpandedFor, setDelConvExpandedFor] = useState<string | null>(null);

  const {
    user, T, dk,
    messages, selectedUser,
    // lightbox
    lightboxUrl, setLightboxUrl, lightboxRotation, setLightboxRotation,
    lightboxMsg, setLightboxMsg, lightboxMoreOpen, setLightboxMoreOpen,
    // forward
    isForwardOpen, setIsForwardOpen, fwdQuery, setFwdQuery, filteredFwd, handleForward,
    // reaction picker
    reactionPickerMsgId, setReactionPickerMsgId, pickerPos, setPickerPos,
    toggleReaction,
    pinnedMsg, handlePin, handleDeleteMsgs,
    setSelIds, setReplyTo, startReply, startEdit, enterSelMode,
    inputRef, scrollToMsg,
    // conv ctx menu
    convCtxMenu, setConvCtxMenu, blockedUsers, mutedUsers, toggleBlock, toggleMute, deleteConversation,
    // payment
    showPaymentModal, setShowPaymentModal,
    paymentPrefill, setPaymentPrefill,
    showTxHistory, setShowTxHistory,
    // selection
    selIds, selMode,
    withToken,
  } = useChatContext();

  return (
    <>
      {/* ── LIGHTBOX ── */}
      {lightboxUrl && (
        <div onClick={()=>{ setLightboxUrl(null); setLightboxMsg(null); setLightboxMoreOpen(false); }}
          className="fc-fade-in"
          style={{ position:"fixed", inset:0, zIndex:9000, background:"rgba(0,0,0,0.88)", display:"flex", alignItems:"center", justifyContent:"center" }}>

          <div onClick={e=>e.stopPropagation()} style={{ position:"absolute", top:0, left:0, right:0, height:52, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px", background:"linear-gradient(rgba(0,0,0,0.5),transparent)", zIndex:1 }}>
            <span style={{ color:"rgba(255,255,255,0.75)", fontSize:13, fontWeight:500 }}>{lightboxMsg?.attachmentName ?? ""}</span>
            <button onClick={()=>{ setLightboxUrl(null); setLightboxMsg(null); setLightboxMoreOpen(false); }}
              style={{ background:"rgba(255,255,255,0.12)", border:"none", borderRadius:"50%", width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff" }}>
              <X size={18}/>
            </button>
          </div>

          <img key={lightboxUrl} src={lightboxUrl} alt="" onClick={e=>e.stopPropagation()} className="fc-image-in"
            style={{ maxWidth:"80vw", maxHeight:"86vh", objectFit:"contain", transform:`rotate(${lightboxRotation}deg)`, transition:"transform 0.22s ease", borderRadius:6, boxShadow:"0 8px 60px rgba(0,0,0,0.7)", cursor:"default" }}/>

          <div onClick={e=>e.stopPropagation()} style={{ position:"absolute", right:20, top:"50%", transform:"translateY(-50%)", display:"flex", flexDirection:"column", gap:10, zIndex:1 }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <button onClick={()=>{ if(lightboxMsg) startReply(lightboxMsg); setLightboxUrl(null); setLightboxMsg(null); setLightboxMoreOpen(false); setTimeout(()=>inputRef.current?.focus(),50); }}
                title="Reply" className="fc-icon-btn"
                style={{ width:46, height:46, borderRadius:"50%", background:"rgba(255,255,255,0.13)", border:"none", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", backdropFilter:"blur(10px)" } as React.CSSProperties}>
                <MessageCircle size={20}/>
              </button>
              <span style={{ color:"rgba(255,255,255,0.65)", fontSize:11 }}>Reply</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <button onClick={()=>setLightboxRotation(r=>(r+90)%360)} title="Rotate" className="fc-icon-btn"
                style={{ width:46, height:46, borderRadius:"50%", background:"rgba(255,255,255,0.13)", border:"none", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", backdropFilter:"blur(10px)" } as React.CSSProperties}>
                <RotateCw size={20}/>
              </button>
              <span style={{ color:"rgba(255,255,255,0.65)", fontSize:11 }}>Rotate</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, position:"relative" }}>
              <button onClick={()=>setLightboxMoreOpen(o=>!o)} title="More" className="fc-icon-btn"
                style={{ width:46, height:46, borderRadius:"50%", background:lightboxMoreOpen?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.13)", border:"none", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", backdropFilter:"blur(10px)" } as React.CSSProperties}>
                <MoreVertical size={20}/>
              </button>
              <span style={{ color:"rgba(255,255,255,0.65)", fontSize:11 }}>More</span>
              {lightboxMoreOpen && (
                <div className="fc-dropdown-in" style={{ position:"absolute", right:58, bottom:0, background:"#2c2c2e", borderRadius:12, overflow:"hidden", minWidth:200, boxShadow:"0 4px 28px rgba(0,0,0,0.6)", border:"0.5px solid rgba(255,255,255,0.08)" }}>
                  {[
                    { icon:<ArrowUpRight size={15}/>, label:"Go to Message", action:()=>{ if(lightboxMsg){ scrollToMsg(lightboxMsg.id); } setLightboxUrl(null); setLightboxMsg(null); setLightboxMoreOpen(false); } },
                    { icon:<Copy size={15}/>,         label:"Copy Link",     action:()=>{ if(lightboxUrl) navigator.clipboard.writeText(lightboxUrl).catch(()=>{}); setLightboxMoreOpen(false); } },
                    { icon:<Forward size={15}/>,      label:"Forward",       action:()=>{ if(lightboxMsg){ setSelIds(new Set([lightboxMsg.id])); setIsForwardOpen(true); setFwdQuery(""); } setLightboxUrl(null); setLightboxMsg(null); setLightboxMoreOpen(false); } },
                    { icon:<Trash2 size={15}/>,       label:"Delete",        action:()=>{ if(lightboxMsg) handleDeleteMsgs([lightboxMsg.id]); setLightboxUrl(null); setLightboxMsg(null); setLightboxMoreOpen(false); }, danger:true },
                    { icon:<Download size={15}/>,     label:"Save As",       action:()=>{ setLightboxMoreOpen(false); }, isDownload:true },
                    { icon:<Images size={15}/>,       label:"All Photos",    action:()=>{ setLightboxMoreOpen(false); } },
                  ].map((item,i)=>(
                    item.isDownload ? (
                      <a key={i} href={lightboxUrl!} download={lightboxMsg?.attachmentName ?? "image"} onClick={item.action}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px", color:"#fff", textDecoration:"none", fontSize:14, borderTop:i>0?"0.5px solid rgba(255,255,255,0.07)":"none" }}>
                        {item.icon}{item.label}
                      </a>
                    ) : (
                      <button key={i} onClick={item.action}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px", color:(item as {danger?:boolean}).danger?"#ff453a":"#fff", background:"none", border:"none", width:"100%", textAlign:"left", fontSize:14, cursor:"pointer", borderTop:i>0?"0.5px solid rgba(255,255,255,0.07)":"none" }}>
                        {item.icon}{item.label}
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FORWARD DIALOG ── */}
      <Dialog open={isForwardOpen} onOpenChange={setIsForwardOpen}>
        <DialogContent style={{ fontFamily:"Inter,sans-serif", maxWidth:380, background:T.surface, color:T.text }}>
          <DialogHeader>
            <DialogTitle style={{ color:T.text }}>Forward {selIds.size} message{selIds.size!==1?"s":""}</DialogTitle>
            <DialogDescription>Choose who to forward to</DialogDescription>
          </DialogHeader>
          <input value={fwdQuery} onChange={e=>setFwdQuery(e.target.value)} placeholder="Search contacts…" autoFocus
            style={{ width:"100%", padding:"8px 12px", fontSize:13, borderRadius:8, border:`0.5px solid ${T.border}`, outline:"none", marginBottom:8, boxSizing:"border-box", background:T.inputBg, color:T.text }}/>
          <div style={{ maxHeight:280, overflowY:"auto" }}>
            {filteredFwd.map(c => (
              <div key={c.id} onClick={()=>handleForward(c.id)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:8, cursor:"pointer" }}
                onMouseEnter={e=>(e.currentTarget.style.background=T.hoverBg)}
                onMouseLeave={e=>(e.currentTarget.style.background="")}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:c.id===user.id?FAV_GRADIENT:getColor(c.displayName), display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {c.id===user.id?<span style={{color:"#fff",fontSize:15}}>★</span>:<span style={{ color:"#fff", fontWeight:600, fontSize:13 }}>{ini(c.displayName)}</span>}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{c.displayName}</div>
                  <div style={{ fontSize:11, color:T.textSec }}>@{c.username}</div>
                </div>
              </div>
            ))}
            {!filteredFwd.length && <div style={{ textAlign:"center", color:T.textSec, fontSize:13, padding:16 }}>No contacts found</div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── REACTION PICKER / MSG CONTEXT MENU ── */}
      {reactionPickerMsgId && pickerPos && !selMode && (() => {
        const m = messages.find(x => x.id === reactionPickerMsgId);
        if (!m) return null;
        const isMine = m.senderId === user.id;
        const isPin = pinnedMsg?.id === m.id;
        const close = () => { setReactionPickerMsgId(null); setPickerPos(null); };
        const items: { label: string; icon: React.ReactNode; action: () => void; danger?: boolean }[] = [
          { label:"Reply",     icon:<Reply size={15}/>,    action:()=>{ startReply(m); close(); } },
          ...(isMine ? [{ label:"Edit", icon:<Pencil size={15}/>, action:()=>{ startEdit(m); close(); } }] : []),
          { label:isPin?"Unpin":"Pin", icon:isPin?<PinOff size={15}/>:<Pin size={15}/>, action:()=>{ handlePin(isPin?null:m.id); close(); } },
          { label:"Copy text", icon:<Copy size={15}/>,     action:()=>{ navigator.clipboard.writeText(m.decrypted ?? ""); close(); } },
          { label:"Forward",   icon:<Forward size={15}/>,  action:()=>{ setSelIds(new Set([m.id])); setIsForwardOpen(true); close(); } },
          { label:"Delete",    icon:<Trash2 size={15}/>,   action:()=>{ handleDeleteMsgs([m.id]); close(); }, danger:true },
          { label:"Select",    icon:<Check size={15}/>,    action:()=>{ close(); enterSelMode(m.id); } },
        ];
        return (
          <div className="msg-menu-enter" onClick={e=>e.stopPropagation()}
            style={{ position:"fixed", left:pickerPos.left, top:pickerPos.top, zIndex:9999, width:220, background:T.surface, borderRadius:14, boxShadow:"0 8px 32px rgba(0,0,0,0.28)", border:`0.5px solid ${T.border}`, overflow:"hidden" }}>
            <div style={{ display:"flex", justifyContent:"space-around", padding:"10px 6px 8px", borderBottom:`0.5px solid ${T.border}` }}>
              {COMMON_REACTIONS.map(em => {
                const picked = m.reactions?.find(r=>r.emoji===em && r.byMe);
                return (
                  <button key={em} onClick={()=>{ toggleReaction(m.id, em); close(); }}
                    style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, padding:"2px 3px", borderRadius:8, transform:picked?"scale(1.3)":"scale(1)", transition:"transform 0.12s" }}>
                    {em}
                  </button>
                );
              })}
            </div>
            {items.map(({ label, icon, action, danger }) => (
              <button key={label} onClick={action}
                style={{ display:"flex", alignItems:"center", gap:12, width:"100%", padding:"10px 16px", background:"none", border:"none", cursor:"pointer", color:danger?"#E53935":T.text, fontSize:14, textAlign:"left" }}
                onMouseEnter={e=>(e.currentTarget.style.background=dk?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.05)")}
                onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                <span style={{ color:danger?"#E53935":T.textSec, display:"flex" }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* ── CONV CONTEXT MENU ── */}
      {convCtxMenu && (() => {
        const uid = convCtxMenu.userId;
        const expanded = delConvExpandedFor === uid;
        const closeMenu = () => { setConvCtxMenu(null); setDelConvExpandedFor(null); };
        const btnBase: React.CSSProperties = { display:"flex", alignItems:"center", gap:10, width:"100%", padding:"11px 16px", background:"none", border:"none", cursor:"pointer", fontSize:13, textAlign:"left" };
        const subBtnBase: React.CSSProperties = { display:"flex", alignItems:"center", gap:9, width:"100%", padding:"8px 20px 8px 28px", background:"none", border:"none", cursor:"pointer", fontSize:12, textAlign:"left" };
        return (
          <>
            <div onClick={closeMenu} style={{ position:"fixed", inset:0, zIndex:299 }}/>
            <div style={{ position:"fixed", left:convCtxMenu.x, top:convCtxMenu.y, background:T.surface, border:`0.5px solid ${T.border}`, borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,0.25)", overflow:"hidden", zIndex:300, minWidth:192 }}>
              <button onClick={()=>{ toggleBlock(uid); setDelConvExpandedFor(null); }}
                style={{ ...btnBase, color:blockedUsers.has(uid)?"#4CAF50":"#f44336" }}>
                <Ban size={15}/>{blockedUsers.has(uid)?"Unblock":"Block"}
              </button>
              <div style={{ height:1, background:T.border, margin:"0 12px" }}/>
              <button onClick={()=>{ toggleMute(uid); setDelConvExpandedFor(null); }}
                style={{ ...btnBase, color:T.text }}>
                {mutedUsers.has(uid) ? <><Bell size={15}/>Unmute</> : <><BellOff size={15}/>Mute</>}
              </button>
              <div style={{ height:1, background:T.border, margin:"0 12px" }}/>
              <button onClick={()=>setDelConvExpandedFor(expanded ? null : uid)}
                style={{ ...btnBase, color:"#E53935", justifyContent:"space-between" }}>
                <span style={{ display:"flex", alignItems:"center", gap:10 }}><Trash2 size={15}/>Delete chat</span>
                <ChevronDown size={13} style={{ flexShrink:0, transition:"transform 0.15s", transform:expanded?"rotate(180deg)":"rotate(0deg)" }}/>
              </button>
              {expanded && (
                <div style={{ borderTop:`0.5px solid ${T.border}`, background:dk?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)" }}>
                  <button onClick={()=>{ deleteConversation(uid,"forMe"); closeMenu(); }}
                    style={{ ...subBtnBase, color:T.text }}
                    onMouseEnter={e=>(e.currentTarget.style.background=dk?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.05)")}
                    onMouseLeave={e=>(e.currentTarget.style.background="")}>
                    <UserRound size={13} style={{ color:T.textSec, flexShrink:0 }}/>
                    My messages only
                  </button>
                  <button onClick={()=>{ deleteConversation(uid,"forThem"); closeMenu(); }}
                    style={{ ...subBtnBase, color:T.text }}
                    onMouseEnter={e=>(e.currentTarget.style.background=dk?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.05)")}
                    onMouseLeave={e=>(e.currentTarget.style.background="")}>
                    <UserX size={13} style={{ color:T.textSec, flexShrink:0 }}/>
                    Their messages only
                  </button>
                  <button onClick={()=>{ deleteConversation(uid,"forBoth"); closeMenu(); }}
                    style={{ ...subBtnBase, color:"#E53935" }}
                    onMouseEnter={e=>(e.currentTarget.style.background=dk?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.05)")}
                    onMouseLeave={e=>(e.currentTarget.style.background="")}>
                    <Trash2 size={13} style={{ flexShrink:0 }}/>
                    Delete for both
                  </button>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ── PAYMENT MODAL ── */}
      {showPaymentModal && (
        <PaymentModal
          onClose={() => { setShowPaymentModal(false); setPaymentPrefill(null); }}
          selectedUser={selectedUser}
          T={T}
          getColor={getColor}
          ini={ini}
          initialAmount={paymentPrefill?.amount}
          initialNetworkId={paymentPrefill?.networkId}
          initialTokenSymbol={paymentPrefill?.tokenSymbol}
          initialReplyToRequestId={paymentPrefill?.replyToRequestId}
        />
      )}

      {/* ── TRANSACTION HISTORY ── */}
      {showTxHistory && <TransactionHistory />}
    </>
  );
}
