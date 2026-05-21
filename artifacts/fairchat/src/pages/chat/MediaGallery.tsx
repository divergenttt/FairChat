import { X, Images, Play, Download, FileText } from "lucide-react";
import { useChatContext } from "./context";
import { fmtFull } from "./helpers";
import { AudioPlayer } from "./ui";

export default function MediaGallery() {
  const {
    T, dk, showMediaGallery, setShowMediaGallery, selectedUser,
    galleryMedia, galleryLoading, galleryTab, setGalleryTab,
    withToken,
    setLightboxUrl, setLightboxMsg, setLightboxRotation, setLightboxMoreOpen,
  } = useChatContext();

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
              const imgs = galleryMedia.filter(m=>m.attachmentType?.startsWith("image/")||m.attachmentType?.startsWith("video/"));
              if (!imgs.length) return <div style={{ textAlign:"center", color:T.textSec, marginTop:50, fontSize:13 }}>No photos or videos yet</div>;
              return <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:3 }}>
                {imgs.map(m=>(
                  <div key={m.id} onClick={()=>{ if(m.attachmentType?.startsWith("image/")){setLightboxUrl(withToken(m.attachmentUrl)); setLightboxMsg(m); setLightboxRotation(0); setLightboxMoreOpen(false); setShowMediaGallery(false);} }}
                    style={{ aspectRatio:"1", borderRadius:6, overflow:"hidden", cursor:"pointer", background:T.inputBg }}>
                    {m.attachmentType?.startsWith("image/")
                      ? <img src={withToken(m.attachmentUrl)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                      : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}><Play size={22} style={{ color:T.textSec }}/></div>}
                  </div>
                ))}
              </div>;
            })()}
          </div>
        ) : galleryTab==="files" ? (
          <div style={{ flex:1, overflowY:"auto", padding:12, display:"flex", flexDirection:"column", gap:4 }}>
            {(() => {
              const files = galleryMedia.filter(m=>!m.attachmentType?.startsWith("image/")&&!m.attachmentType?.startsWith("video/")&&!m.attachmentType?.startsWith("audio/"));
              if (!files.length) return <div style={{ textAlign:"center", color:T.textSec, marginTop:50, fontSize:13 }}>No files yet</div>;
              return files.map(m=>(
                <a key={m.id} href={withToken(m.attachmentUrl)} download={m.attachmentName} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background:T.inputBg, textDecoration:"none" }}>
                  <FileText size={22} style={{ color:"var(--fc-accent)", flexShrink:0 }}/>
                  <div style={{ flex:1, overflow:"hidden" }}>
                    <div style={{ fontSize:13, fontWeight:500, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.attachmentName||"File"}</div>
                    <div style={{ fontSize:11, color:T.textSec }}>{m.attachmentSize?`${(m.attachmentSize/1024).toFixed(0)} KB`:""}</div>
                  </div>
                  <Download size={14} style={{ color:T.textSec, flexShrink:0 }}/>
                </a>
              ));
            })()}
          </div>
        ) : (
          <div style={{ flex:1, overflowY:"auto", padding:12, display:"flex", flexDirection:"column", gap:8 }}>
            {(() => {
              const audios = galleryMedia.filter(m=>m.attachmentType?.startsWith("audio/"));
              if (!audios.length) return <div style={{ textAlign:"center", color:T.textSec, marginTop:50, fontSize:13 }}>No voice messages yet</div>;
              return audios.map(m=>(
                <div key={m.id} style={{ padding:"10px 12px", borderRadius:10, background:T.inputBg }}>
                  <div style={{ fontSize:11, color:T.textSec, marginBottom:6 }}>{fmtFull(m.createdAt)}</div>
                  <AudioPlayer src={withToken(m.attachmentUrl)} dark={dk} mine={false}/>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
