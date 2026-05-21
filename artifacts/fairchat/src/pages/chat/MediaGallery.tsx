import { X, Images, Play, Download, FileText } from "lucide-react";
import { useChatContext } from "./context";
import { getMessageAttachment } from "@/lib/attachmentMessage";
import { fmtFull } from "./helpers";
import { SecureAttachmentImage, SecureAttachmentAudio, SecureAttachmentFileLink } from "./SecureAttachment";

export default function MediaGallery() {
  const {
    user, T, dk, showMediaGallery, setShowMediaGallery, selectedUser,
    galleryMedia, galleryLoading, galleryTab, setGalleryTab,
    pubKeyMapRef,
    setLightboxUrl, setLightboxMsg, setLightboxRotation, setLightboxMoreOpen,
  } = useChatContext();

  const otherPubKey = selectedUser?.publicKey ?? pubKeyMapRef.current.get(selectedUser?.id ?? "");

  if (!showMediaGallery || !selectedUser) return null;

  return (
    <div style={{ position:"fixed", inset:0, zIndex:180, display:"flex" }}>
      <div onClick={()=>setShowMediaGallery(false)} style={{ flex:1, background:"rgba(0,0,0,0.4)" }}/>
      <div style={{ width:360, display:"flex", flexDirection:"column", background:T.bg, boxShadow:"-4px 0 32px rgba(0,0,0,0.35)" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"16px 16px 12px", borderBottom:`0.5px solid ${T.border}` }}>
          <Images size={18} style={{ color:"var(--fc-accent)" }}/>
          <span style={{ fontSize:15, fontWeight:700, color:T.text, flex:1 }}>Media & Files</span>
          <button onClick={()=>setShowMediaGallery(false)} style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, display:"flex", padding:4, borderRadius:6 }}><X size={18}/></button>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:`0.5px solid ${T.border}` }}>
          {(["photos","files","audio"] as const).map(tab=>(
            <button key={tab} onClick={()=>setGalleryTab(tab)} style={{ flex:1, padding:"10px 6px", fontSize:12, fontWeight:600, background:"none", border:"none", cursor:"pointer", color:galleryTab===tab?"var(--fc-accent)":T.textSec, borderBottom:galleryTab===tab?"2px solid var(--fc-accent)":"2px solid transparent", textTransform:"uppercase", letterSpacing:"0.05em" }}>
              {tab==="photos"?"Photos":tab==="files"?"Files":"Audio"}
            </button>
          ))}
        </div>

        {/* Content */}
        {galleryLoading ? (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ width:24, height:24, borderRadius:"50%", border:"2px solid var(--fc-accent)", borderTopColor:"transparent", animation:"spin 0.7s linear infinite" }}/>
          </div>
        ) : galleryTab==="photos" ? (
          <div style={{ flex:1, overflowY:"auto", padding:8 }}>
            {(() => {
              const imgs = galleryMedia.filter(m => {
                const a = getMessageAttachment(m);
                return !!a && (a.type.startsWith("image/") || a.type.startsWith("video/"));
              });
              if (!imgs.length) return <div style={{ textAlign:"center", color:T.textSec, marginTop:50, fontSize:13 }}>No photos or videos yet</div>;
              return <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:3 }}>
                {imgs.map(m => {
                  const a = getMessageAttachment(m)!;
                  const pk =
                    pubKeyMapRef.current.get(m.senderId === user.id ? (m.recipientId ?? "") : m.senderId) ??
                    otherPubKey;
                  return (
                    <div
                      key={m.id}
                      style={{ aspectRatio: "1", borderRadius: 6, overflow: "hidden", cursor: "pointer", background: T.inputBg }}
                    >
                      {a.type.startsWith("image/") ? (
                        <SecureAttachmentImage
                          att={a}
                          otherUserPubKey={pk}
                          onOpen={(blobUrl) => {
                            setLightboxUrl(blobUrl);
                            setLightboxMsg(m);
                            setLightboxRotation(0);
                            setLightboxMoreOpen(false);
                            setShowMediaGallery(false);
                          }}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Play size={22} style={{ color: T.textSec }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>;
            })()}
          </div>
        ) : galleryTab==="files" ? (
          <div style={{ flex:1, overflowY:"auto", padding:12, display:"flex", flexDirection:"column", gap:4 }}>
            {(() => {
              const files = galleryMedia.filter(m => {
                const a = getMessageAttachment(m);
                return !!a && !a.type.startsWith("image/") && !a.type.startsWith("video/") && !a.type.startsWith("audio/");
              });
              if (!files.length) return <div style={{ textAlign:"center", color:T.textSec, marginTop:50, fontSize:13 }}>No files yet</div>;
              return files.map(m => {
                const a = getMessageAttachment(m)!;
                const pk =
                  pubKeyMapRef.current.get(m.senderId === user.id ? (m.recipientId ?? "") : m.senderId) ??
                  otherPubKey;
                return (
                  <div key={m.id} style={{ padding: "4px 0" }}>
                    <SecureAttachmentFileLink att={a} otherUserPubKey={pk} />
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div style={{ flex:1, overflowY:"auto", padding:12, display:"flex", flexDirection:"column", gap:8 }}>
            {(() => {
              const audios = galleryMedia.filter(m => getMessageAttachment(m)?.type.startsWith("audio/"));
              if (!audios.length) return <div style={{ textAlign:"center", color:T.textSec, marginTop:50, fontSize:13 }}>No voice messages yet</div>;
              return audios.map(m => {
                const a = getMessageAttachment(m)!;
                const pk =
                  pubKeyMapRef.current.get(m.senderId === user.id ? (m.recipientId ?? "") : m.senderId) ??
                  otherPubKey;
                return (
                  <div key={m.id} style={{ padding: "10px 12px", borderRadius: 10, background: T.inputBg }}>
                    <div style={{ fontSize: 11, color: T.textSec, marginBottom: 6 }}>{fmtFull(m.createdAt)}</div>
                    <SecureAttachmentAudio att={a} otherUserPubKey={pk} dark={dk} mine={false} />
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
