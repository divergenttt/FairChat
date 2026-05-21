import { X, Reply, Pencil, Smile, Paperclip, Send, Flame, Check } from "lucide-react";
import { useChatContext, useInputContext } from "./context";
import { EMOJI_CATS } from "./constants";

export default function ChatInput() {
  const {
    user, T, dk,
    handleSendOrEdit, handleKeyDown,
    replyTo, setReplyTo, editingMsg, setEditingMsg,
    selectedUser,
    attachmentFile, attachmentPreviewUrl, attachmentUploading, attachmentInputRef,
    clearAttachment, handleAttachmentPick,
    showEmojiPicker, setShowEmojiPicker, emojiCat, setEmojiCat, emojiPickerRef,
    destroyAfter, setDestroyAfter, sendTimerMenu, setSendTimerMenu,
    sendPopActive, setSendPopActive, sendBtnRef, inputRef,
  } = useChatContext();
  const {
    messageInput, setMessageInput, handleInputChange,
    isRecording, recordingTime, startRecording, stopRecording, cancelRecording,
  } = useInputContext();

  if (!selectedUser) return null;

  return (
    <div className="fc-composer-shell" style={{ position:"relative" }}>
      {/* Reply bar */}
      {replyTo && !editingMsg && (
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 20px", borderTop:`0.5px solid ${T.border}`, background:T.replyBar }}>
          <Reply size={14} style={{ color:"var(--fc-accent)", flexShrink:0 }}/>
          <div style={{ flex:1, overflow:"hidden" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"var(--fc-accent)", marginBottom:1 }}>Reply to {replyTo.senderId===user.id?"yourself":selectedUser?.displayName}</div>
            <div style={{ fontSize:13, color:T.textSec, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{replyTo.decrypted}</div>
          </div>
          <button onClick={()=>setReplyTo(null)} style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, display:"flex", padding:2 }}><X size={15}/></button>
        </div>
      )}

      {/* Edit bar */}
      {editingMsg && (
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 20px", borderTop:`0.5px solid ${T.border}`, background:T.replyBar }}>
          <Pencil size={14} style={{ color:"var(--fc-accent)", flexShrink:0 }}/>
          <div style={{ flex:1, overflow:"hidden" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"var(--fc-accent)", marginBottom:1 }}>Editing message</div>
            <div style={{ fontSize:13, color:T.textSec, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{editingMsg.decrypted}</div>
          </div>
          <button onClick={()=>{ setEditingMsg(null); setMessageInput(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, display:"flex", padding:2 }}><X size={15}/></button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmojiPicker && (
        <div ref={emojiPickerRef} className="fc-scale-in" style={{
          position:"absolute", bottom:"calc(100% + 6px)", left:0, width:320, zIndex:200,
          background: dk ? "rgba(28,28,32,0.82)" : "rgba(255,255,255,0.82)",
          backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
          border:`0.5px solid ${dk?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.10)"}`,
          borderRadius:16,
          boxShadow: dk ? "0 8px 32px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.08)" : "0 8px 32px rgba(0,0,0,0.14), inset 0 0.5px 0 rgba(255,255,255,0.9)",
          overflow:"hidden",
        }}>
          <div style={{ display:"flex", borderBottom:`0.5px solid ${dk?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.07)"}`, padding:"0 6px" }}>
            {EMOJI_CATS.map((cat, i) => (
              <button key={i} onClick={()=>setEmojiCat(i)} style={{
                flex:1, background:"none", border:"none", cursor:"pointer",
                padding:"8px 0 7px", fontSize:18,
                borderBottom: emojiCat===i ? "2px solid var(--fc-accent)" : "2px solid transparent",
                transition:"border-color 0.15s", opacity: emojiCat===i ? 1 : 0.5,
              }} title={cat.label}>
                {cat.icon}
              </button>
            ))}
          </div>
          <div style={{ padding:"6px 6px 8px", maxHeight:180, overflowY:"auto" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(8, 1fr)", gap:1 }}>
              {EMOJI_CATS[emojiCat].emoji.map(emoji => (
                <button key={emoji} onClick={()=>{ handleInputChange(messageInput + emoji); inputRef.current?.focus(); }}
                  style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, padding:"5px 2px", borderRadius:6, lineHeight:1.2, transition:"transform 0.1s, background 0.1s", color:"inherit" }}
                  onMouseEnter={e=>{ (e.currentTarget as HTMLButtonElement).style.transform="scale(1.25)"; (e.currentTarget as HTMLButtonElement).style.background=dk?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)"; }}
                  onMouseLeave={e=>{ (e.currentTarget as HTMLButtonElement).style.transform="scale(1)"; (e.currentTarget as HTMLButtonElement).style.background="none"; }}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Attachment preview */}
      {attachmentFile && (
        <div className="fc-slide-in-up" style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 20px", borderTop:`0.5px solid ${T.border}`, background:T.replyBar }}>
          {attachmentPreviewUrl
            ? <img src={attachmentPreviewUrl} alt="" style={{ width:56, height:56, borderRadius:10, objectFit:"cover", flexShrink:0 }}/>
            : <div style={{ width:48, height:48, borderRadius:10, background:"var(--fc-accent)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Paperclip size={22} style={{ color:"#fff" }}/>
              </div>}
          <div style={{ flex:1, overflow:"hidden" }}>
            <div style={{ fontSize:14, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{attachmentFile.name}</div>
            <div style={{ fontSize:12, color:T.textSec }}>{(attachmentFile.size/1024).toFixed(0)} KB</div>
          </div>
          <button onClick={clearAttachment} style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, display:"flex", padding:2 }}><X size={16}/></button>
        </div>
      )}

      {/* Recording UI or normal input row */}
      {isRecording ? (
        <div style={{ padding:"14px 24px", display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={cancelRecording} title="Cancel" style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, padding:6, display:"flex", flexShrink:0, borderRadius:8 }}>
            <X size={20}/>
          </button>
          <div className="rec-pulse" style={{ width:10, height:10, borderRadius:"50%", background:"#f44336", flexShrink:0 }}/>
          <div style={{ flex:1, display:"flex", gap:3, alignItems:"center", height:30 }}>
            {[...Array(20)].map((_,i) => (
              <div key={i} className="rec-bar" style={{ flex:1, borderRadius:2, background:"var(--fc-accent)", animationDelay:`${(i*0.07).toFixed(2)}s` }}/>
            ))}
          </div>
          <span style={{ fontSize:14, fontWeight:500, color:T.text, minWidth:40, textAlign:"right", fontVariantNumeric:"tabular-nums" }}>
            {`${Math.floor(recordingTime/60)}:${String(recordingTime%60).padStart(2,"0")}`}
          </span>
          <button onClick={stopRecording} title="Send voice message"
            style={{ width:40, height:40, borderRadius:"50%", background:"linear-gradient(135deg, #f44336 0%, #e53935 100%)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 2px 10px rgba(244,67,54,0.5)" }}>
            <Send size={18} style={{ color:"#fff", marginLeft:1 }}/>
          </button>
        </div>
      ) : (
        <div style={{ padding:"14px 24px", display:"flex", alignItems:"flex-end", gap:12 }}>
          <input ref={attachmentInputRef} type="file" style={{ display:"none" }} onChange={handleAttachmentPick}/>

          {/* Left action buttons */}
          <button onClick={()=>attachmentInputRef.current?.click()} title="Attach file"
            style={{ width:36, height:36, borderRadius:10, background:"none", border:"none", cursor:"pointer", color:attachmentFile?"var(--fc-accent)":T.textSec, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}
            onMouseEnter={e=>(e.currentTarget.style.background=T.hoverBg)}
            onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
            <Paperclip size={20}/>
          </button>

          {/* Message input in rounded container */}
          <div style={{ flex:1, display:"flex", alignItems:"flex-end", gap:8, borderRadius:20, padding:"6px 16px", background:T.inputBg, border:`0.5px solid ${T.border}` }}>
            <textarea ref={inputRef} value={messageInput}
              onChange={e => { handleInputChange(e.target.value); e.target.style.height="0"; e.target.style.height=Math.min(e.target.scrollHeight,160)+"px"; }}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={editingMsg?"Edit message…":attachmentFile?"Add caption…":"Write a message…"}
              style={{ flex:1, padding:"4px 0", fontSize:14, border:"none", background:"transparent", outline:"none", color:T.text, fontFamily:"Inter,sans-serif", resize:"none", overflow:"hidden", lineHeight:"1.5", minHeight:24, maxHeight:160, display:"block" }}/>
            <button onClick={()=>setShowEmojiPicker(s=>!s)} title="Emoji"
              style={{ background:"none", border:"none", cursor:"pointer", color:showEmojiPicker?"var(--fc-accent)":T.textSec, padding:2, display:"flex", flexShrink:0, borderRadius:6, marginBottom:2 }}>
              <Smile size={20}/>
            </button>
          </div>

          {/* Send or Mic button */}
          {messageInput.trim() || attachmentFile || editingMsg ? (
            <div style={{ position:"relative", display:"flex", flexShrink:0, gap:2 }}>
              {destroyAfter && (
                <div style={{ position:"absolute", top:-8, left:"50%", transform:"translateX(-50%)", background:"#f44336", color:"#fff", fontSize:9, fontWeight:700, borderRadius:8, padding:"1px 5px", whiteSpace:"nowrap", pointerEvents:"none" }}>
                  🔥 {destroyAfter < 60 ? `${destroyAfter}s` : destroyAfter < 3600 ? `${destroyAfter/60}m` : `${destroyAfter/3600}h`}
                </div>
              )}
              <button
                ref={sendBtnRef}
                onClick={() => { handleSendOrEdit(); if (messageInput.trim() || attachmentFile) { setSendPopActive(false); requestAnimationFrame(() => setSendPopActive(true)); } }}
                onContextMenu={e => { e.preventDefault(); setSendTimerMenu(s => !s); }}
                disabled={!messageInput.trim() && !attachmentFile}
                className={sendPopActive ? "send-pop" : ""}
                onAnimationEnd={() => setSendPopActive(false)}
                style={{ width:40, height:40, borderRadius:"50%", background:(messageInput.trim()||attachmentFile)?attachmentUploading?"#9E9E9E":destroyAfter?"linear-gradient(135deg, #f44336 0%, #e53935 100%)":"linear-gradient(135deg, #9B5CF6 0%, #E040BD 100%)":"#9E9E9E", border:"none", cursor:(messageInput.trim()||attachmentFile)&&!attachmentUploading?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"background 0.2s", boxShadow:(messageInput.trim()||attachmentFile)&&!attachmentUploading?"0 2px 12px rgba(155,92,246,0.55)":"none" }}>
                {attachmentUploading ? <div style={{ width:16, height:16, border:"2px solid #fff", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/> : editingMsg ? <Check size={18} style={{ color:"#fff" }}/> : destroyAfter ? <Flame size={18} style={{ color:"#fff" }}/> : <Send size={18} style={{ color:"#fff", marginLeft:1 }}/>}
              </button>
              {/* Self-destruct timer dropdown */}
              {sendTimerMenu && (
                <div style={{ position:"absolute", bottom:50, right:0, background:T.surface, border:`0.5px solid ${T.border}`, borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,0.25)", overflow:"hidden", zIndex:200, minWidth:170 }}>
                  <div style={{ padding:"10px 14px", fontSize:12, fontWeight:700, color:T.textSec, textTransform:"uppercase", letterSpacing:"0.06em" }}>Self-Destruct Timer</div>
                  {[
                    { label:"Off", value:null },
                    { label:"5 seconds", value:5 },
                    { label:"1 minute", value:60 },
                    { label:"5 minutes", value:300 },
                    { label:"1 hour", value:3600 },
                    { label:"1 day", value:86400 },
                  ].map(opt => (
                    <button key={opt.label} onClick={()=>{ setDestroyAfter(opt.value); setSendTimerMenu(false); }}
                      style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"10px 16px", background:"none", border:"none", cursor:"pointer", fontSize:14, color:T.text, borderTop:`0.5px solid ${T.border}` }}
                      onMouseEnter={e=>(e.currentTarget.style.background=dk?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.04)")}
                      onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                      <span>{opt.label}</span>
                      {destroyAfter === opt.value && <Check size={15} style={{ color:"var(--fc-accent)" }}/>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button onClick={handleSendOrEdit} title="Send" disabled
              style={{ width:40, height:40, borderRadius:"50%", background:"transparent", border:`0.5px solid ${T.border}`, cursor:"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:T.textSec, opacity:0.5 }}>
              <Send size={18}/>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
