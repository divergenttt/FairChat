import { useState, useEffect, useRef, memo } from "react";
import { Pause, Play, Flame } from "lucide-react";
import { WAVE_HEIGHTS } from "./constants";
import { escRe } from "./helpers";

// ─── MsgTick ──────────────────────────────────────────────────────────────────
export function MsgTick({ isRead, color, sent = true, deliveryStatus, failed }: { isRead?: boolean; color: string; sent?: boolean; deliveryStatus?: string; failed?: boolean }) {
  const status = deliveryStatus ?? (failed ? "failed" : !sent ? "pending" : isRead ? "read" : "sent");

  if (status === "failed") {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
  }
  if (status === "pending") {
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
  }
  if (status === "sent") {
    return (
      <svg width="14" height="11" viewBox="0 0 14 11" fill="none" style={{ flexShrink: 0 }}>
        <polyline points="2,5.5 5.5,9 12,2" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    );
  }
  const c = status === "read" ? "var(--fc-accent)" : color;
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <polyline points="1,5.5 4,8.5 8.5,2" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <polyline points="5,5.5 8,8.5 14.5,1" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// ─── AudioPlayer ──────────────────────────────────────────────────────────────
export function AudioPlayer({ src, dark, mine }: { src: string; dark: boolean; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [curTime, setCurTime] = useState(0);
  const [total, setTotal] = useState(0);
  const fmtSec = (s: number) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
  const accent = "var(--fc-accent)";
  const inactive = mine ? "rgba(255,255,255,0.28)" : dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.13)";
  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) a.pause(); else a.play().catch(()=>{});
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current; if (!a || !total) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * total;
  };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:9, minWidth:200, maxWidth:280 }}>
      <audio ref={audioRef} src={src}
        onTimeUpdate={()=>{ const a=audioRef.current; if(a){ setCurTime(a.currentTime); setProgress(a.duration?a.currentTime/a.duration*100:0); } }}
        onLoadedMetadata={()=>{ if(audioRef.current) setTotal(audioRef.current.duration); }}
        onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
        onEnded={()=>{ setPlaying(false); setProgress(0); setCurTime(0); if(audioRef.current) audioRef.current.currentTime=0; }}
      />
      <button onClick={toggle} style={{ width:34, height:34, borderRadius:"50%", background: mine?"rgba(255,255,255,0.2)":"rgba(var(--fc-accent-rgb),0.12)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color: mine?"#fff":"var(--fc-accent)" }}>
        {playing ? <Pause size={14}/> : <Play size={14}/>}
      </button>
      <div style={{ flex:1, display:"flex", flexDirection:"column", gap:5 }}>
        <div onClick={seek} style={{ display:"flex", gap:2, alignItems:"center", height:26, cursor:"pointer" }}>
          {WAVE_HEIGHTS.map((h,i) => {
            const filled = progress/100 * WAVE_HEIGHTS.length > i;
            return <div key={i} style={{ flex:1, height:`${h}%`, borderRadius:2, background: filled?(mine?"rgba(255,255,255,0.85)":accent):inactive, transition:"background 0.08s" }}/>;
          })}
        </div>
        <div style={{ fontSize:10, color: mine?"rgba(255,255,255,0.6)":dark?"rgba(255,255,255,0.45)":"rgba(0,0,0,0.4)" }}>
          {playing ? fmtSec(curTime) : (total>0 ? fmtSec(total) : "0:00")}
        </div>
      </div>
    </div>
  );
}

// ─── SelfDestructCountdown ────────────────────────────────────────────────────
export const SelfDestructCountdown = memo(function SelfDestructCountdown({ destroyAt }: { destroyAt: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.round((new Date(destroyAt).getTime() - Date.now()) / 1000));
  const txt = secs >= 3600 ? `${Math.round(secs/3600)}h` : secs >= 60 ? `${Math.round(secs/60)}m` : `${secs}s`;
  return <span style={{ fontSize:10, color:"#f44336", fontWeight:700, display:"flex", alignItems:"center", gap:2 }}><Flame size={10}/>🔥{txt}</span>;
});

// ─── Highlight ────────────────────────────────────────────────────────────────
export function Highlight({ text, q }: { text: string; q: string }) {
  if (!q.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escRe(q)})`, "gi"));
  return <>{parts.map((p,i) => p.toLowerCase()===q.toLowerCase()
    ? <mark key={i} style={{background:"#FFD600",borderRadius:2,padding:"0 1px"}}>{p}</mark>
    : <span key={i}>{p}</span>)}</>;
}

// ─── Spoiler ──────────────────────────────────────────────────────────────────
export function Spoiler({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span onClick={e=>{e.stopPropagation();setRevealed(r=>!r);}} title={revealed?"Click to hide":"Click to reveal"}
      style={{ filter:revealed?"none":"blur(5px)", cursor:"pointer", display:"inline-block",
        background:revealed?"transparent":"rgba(0,0,0,0.15)", borderRadius:4,
        userSelect:revealed?"text":"none", transition:"filter 0.25s" }}>
      {text}
    </span>
  );
}

// ─── CodeBlock ────────────────────────────────────────────────────────────────
export function CodeBlock({ code, dark }: { code: string; dark: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position:"relative", margin:"4px 0" }}>
      <pre style={{ background:dark?"#1a1a1f":"#f1f1f6", color:dark?"#e2e2e8":"#1a1a1f",
        borderRadius:8, padding:"10px 12px", fontFamily:"monospace", fontSize:13,
        overflowX:"auto", margin:0, whiteSpace:"pre-wrap", wordBreak:"break-all",
        border:`1px solid ${dark?"#333":"#e0e0e0"}` }}>
        {code}
      </pre>
      <button onClick={e=>{e.stopPropagation();navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),2000);}}
        style={{ position:"absolute", top:6, right:6, padding:"2px 8px", fontSize:11, borderRadius:6,
          background:copied?"#4CAF50":"rgba(var(--fc-accent-rgb),0.85)", color:"#fff", border:"none",
          cursor:"pointer", fontWeight:600, transition:"background 0.2s" }}>
        {copied ? "✓ Copied" : "⎘ Copy"}
      </button>
    </div>
  );
}

// ─── renderMessageText ────────────────────────────────────────────────────────
export function renderMessageText(text: string, q: string, mine: boolean, dark: boolean): React.ReactNode {
  const codeBlockPattern = /(```[\s\S]*?```)/g;
  const segments = text.split(codeBlockPattern);
  const nodes: React.ReactNode[] = [];
  segments.forEach((seg, si) => {
    if (seg.startsWith("```") && seg.endsWith("```")) {
      const inner = seg.slice(3, -3).replace(/^[a-z+]*\n/, "").trimEnd();
      nodes.push(<CodeBlock key={si} code={inner} dark={dark || mine} />);
    } else {
      const inlineRe = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|_[^_]+_|~~[^~]+~~|\|\|[^|]+\|\|)/g;
      const parts: React.ReactNode[] = [];
      let lastIdx = 0, match: RegExpExecArray | null, pi = 0;
      while ((match = inlineRe.exec(seg)) !== null) {
        if (match.index > lastIdx) {
          const plain = seg.slice(lastIdx, match.index);
          parts.push(q.trim() ? <Highlight key={`${si}-${pi++}`} text={plain} q={q}/> : <span key={`${si}-${pi++}`}>{plain}</span>);
        }
        const m = match[0];
        if (m.startsWith("`"))        parts.push(<code key={`${si}-${pi++}`} style={{background:mine?"rgba(255,255,255,0.22)":"rgba(0,0,0,0.1)",borderRadius:4,padding:"1px 5px",fontFamily:"monospace",fontSize:"0.88em"}}>{m.slice(1,-1)}</code>);
        else if (m.startsWith("**"))  parts.push(<strong key={`${si}-${pi++}`}>{m.slice(2,-2)}</strong>);
        else if (m.startsWith("__"))  parts.push(<strong key={`${si}-${pi++}`}>{m.slice(2,-2)}</strong>);
        else if (m.startsWith("_"))   parts.push(<em key={`${si}-${pi++}`}>{m.slice(1,-1)}</em>);
        else if (m.startsWith("~~"))  parts.push(<s key={`${si}-${pi++}`}>{m.slice(2,-2)}</s>);
        else if (m.startsWith("||"))  parts.push(<Spoiler key={`${si}-${pi++}`} text={m.slice(2,-2)}/>);
        lastIdx = match.index + m.length;
      }
      if (lastIdx < seg.length) {
        const plain = seg.slice(lastIdx);
        parts.push(q.trim() ? <Highlight key={`${si}-${pi++}`} text={plain} q={q}/> : <span key={`${si}-${pi++}`}>{plain}</span>);
      }
      nodes.push(...parts);
    }
  });
  return <>{nodes}</>;
}

// ─── MessageText ──────────────────────────────────────────────────────────────
export const MessageText = memo(function MessageText({ text, q, mine, dark }: { text: string; q: string; mine: boolean; dark: boolean }) {
  return <>{renderMessageText(text, q, mine, dark)}</>;
});

// ─── BtnToolbar ───────────────────────────────────────────────────────────────
export function BtnToolbar({ icon, label, disabled, onClick, danger, T }: { icon: React.ReactNode; label: string; disabled: boolean; onClick: ()=>void; danger?: boolean; T: any }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:8, border:`0.5px solid ${danger?"#FFCDD2":T.border}`, background:danger?"#FFF5F5":T.surface, cursor:disabled?"default":"pointer", color:disabled?T.textSec:danger?"#E53935":T.text, fontSize:13, opacity:disabled?0.5:1 }}>
      {icon} {label}
    </button>
  );
}
