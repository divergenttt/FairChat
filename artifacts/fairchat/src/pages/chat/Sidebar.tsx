import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, Clock, Bookmark, Settings, Sun, Moon, Ban, BellOff, Wallet } from "lucide-react";
import { useChatContext } from "./context";
import { getColor, ini, fmtTime, avatarSrc } from "./helpers";
import { FAV_GRADIENT } from "./constants";

export default function Sidebar() {
  const {
    user, T, dk, darkMode, setDarkMode, wsStatus,
    conversations, selectedUser, setSelectedUser,
    searchQuery, setSearchQuery, searchResults,
    searchFocused, setSearchFocused, sidebarSearchRef,
    recentSearches, saveRecentSearch, removeRecentSearch,
    pubKeyMapRef, blockedUsers, mutedUsers, convCtxMenu: _convCtxMenu,
    setConvCtxMenu, draftedChats, draftCacheRef,
    openSettings, showSettings,
    showPaymentsView, setShowPaymentsView,
  } = useChatContext();

  const pubKeyMap = (pubKeyMapRef as any)?.current as Map<string, string> | undefined;

  // Track input position for portal-rendered dropdown (escapes overflow:hidden of glass panel)
  const [dropdownPos, setDropdownPos] = useState<{ left:number; top:number; width:number } | null>(null);
  useEffect(() => {
    if (!searchFocused) { setDropdownPos(null); return; }
    const update = () => {
      const el = sidebarSearchRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDropdownPos({ left: r.left, top: r.bottom + 6, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [searchFocused, sidebarSearchRef]);

  return (
    <div className="fc-glass-panel fc-sidebar" style={{ display:"flex", flexDirection:"column" }}>
      {/* Header — avatar left, action buttons right */}
      <div style={{ padding:"16px 16px 12px", borderBottom:`0.5px solid ${T.border}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          {/* User avatar */}
          <div onClick={openSettings} style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ position:"relative" }}>
              <div style={{ width:40, height:40, borderRadius:"50%", overflow:"hidden", background:user.avatarUrl?"transparent":getColor(user.displayName), display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {user.avatarUrl
                  ? <img src={avatarSrc(user.avatarUrl)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                  : <span style={{ color:"#fff", fontWeight:700, fontSize:14 }}>{ini(user.displayName)}</span>}
              </div>
              <div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:"50%", border:`2px solid ${T.bg}`, background: wsStatus==="connected"?"#4CAF50":wsStatus==="connecting"?"#FF9800":"#9E9E9E" }} title={wsStatus}/>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
            <button onClick={()=>setDarkMode(d=>!d)} title={darkMode?"Light mode":"Dark mode"}
              style={{ width:36, height:36, borderRadius:10, background:"none", border:"none", cursor:"pointer", color:T.textSec, display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.15s" }}
              onMouseEnter={e=>(e.currentTarget.style.background=T.hoverBg)}
              onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
              {darkMode ? <Sun size={18}/> : <Moon size={18}/>}
            </button>
            <button onClick={()=>setShowPaymentsView(v=>!v)} title="Payments"
              style={{ width:36, height:36, borderRadius:10, background:showPaymentsView?"linear-gradient(135deg, #9B5CF6 0%, #E040BD 100%)":"none", border:"none", cursor:"pointer", color:showPaymentsView?"#fff":T.textSec, display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.15s" }}
              onMouseEnter={e=>{ if(!showPaymentsView) e.currentTarget.style.background=T.hoverBg; }}
              onMouseLeave={e=>{ if(!showPaymentsView) e.currentTarget.style.background="transparent"; }}>
              <Wallet size={18}/>
            </button>
            <button onClick={openSettings} title="Settings"
              style={{ width:36, height:36, borderRadius:10, background:showSettings?"linear-gradient(135deg, #9B5CF6 0%, #E040BD 100%)":"none", border:"none", cursor:"pointer", color:showSettings?"#fff":T.textSec, display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.15s" }}
              onMouseEnter={e=>{ if(!showSettings) e.currentTarget.style.background=T.hoverBg; }}
              onMouseLeave={e=>{ if(!showSettings) e.currentTarget.style.background="transparent"; }}>
              <Settings size={18}/>
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position:"relative", zIndex:50 }}>
          <Search size={15} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:T.textSec, zIndex:1 }}/>
          <input ref={sidebarSearchRef} value={searchQuery}
            onChange={e=>setSearchQuery(e.target.value)}
            onFocus={()=>setSearchFocused(true)}
            onBlur={()=>setTimeout(()=>setSearchFocused(false), 150)}
            onKeyDown={e=>{ if(e.key==="Escape"){ setSearchQuery(""); sidebarSearchRef.current?.blur(); } }}
            placeholder="Search by @tag…"
            style={{ width:"100%", paddingLeft:36, paddingRight:searchQuery?32:12, paddingTop:10, paddingBottom:10, fontSize:14, borderRadius:10, border:`0.5px solid ${searchFocused?'var(--fc-accent)':T.border}`, background:T.inputBg, outline:"none", boxSizing:"border-box", color:T.text, transition:"border-color 0.15s" }}/>
          {searchQuery && (
            <button onClick={()=>{setSearchQuery(""); }} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:T.textSec, display:"flex", padding:2 }}>
              <X size={14}/>
            </button>
          )}

        </div>

        {/* Search results dropdown — portal to escape sidebar overflow:hidden */}
        {searchFocused && dropdownPos && (() => {
          const clean = searchQuery.trim().replace(/^@+/, "");
          const showResults = !!clean;
          const showRecent = !clean && recentSearches.length > 0;
          if (!showResults && !showRecent) return null;
          const baseStyle: React.CSSProperties = {
            position:"fixed", left:dropdownPos.left, top:dropdownPos.top, width:dropdownPos.width,
            zIndex:9999, background:T.surface, border:`0.5px solid ${T.border}`, borderRadius:12,
            boxShadow:"0 12px 32px rgba(0,0,0,0.28)", overflow:"hidden",
            backdropFilter:"blur(28px) saturate(160%)", WebkitBackdropFilter:"blur(28px) saturate(160%)",
          };
          return createPortal(
            showResults ? (
              <div style={baseStyle}>
                {clean.length < 3 ? (
                  <div style={{ padding:"14px 16px", fontSize:13, color:T.textSec, textAlign:"center" }}>
                    Type {3 - clean.length} more character{3 - clean.length !== 1 ? "s" : ""}…
                  </div>
                ) : searchResults.length === 0 ? (
                  <div style={{ padding:"14px 16px", fontSize:13, color:T.textSec, textAlign:"center" }}>
                    @{clean} not found
                  </div>
                ) : (
                  searchResults.map(su => (
                    <div key={su.id}
                      onMouseDown={()=>{
                        if(su.publicKey) pubKeyMap?.set(su.id, su.publicKey);
                        saveRecentSearch(su);
                        setSelectedUser(su); setSearchQuery("");
                      }}
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", cursor:"pointer", borderBottom:`0.5px solid ${T.border}` }}
                      onMouseEnter={e=>(e.currentTarget.style.background=T.hoverBg)}
                      onMouseLeave={e=>(e.currentTarget.style.background="")}>
                      <div style={{ position:"relative", flexShrink:0 }}>
                        <div style={{ width:40, height:40, borderRadius:"50%", background:getColor(su.displayName), display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <span style={{ color:"#fff", fontWeight:700, fontSize:14 }}>{ini(su.displayName)}</span>
                        </div>
                        <div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:"50%", border:`2px solid ${T.surface}`, background:su.isOnline?"#4CAF50":"#9E9E9E" }}/>
                      </div>
                      <div style={{ flex:1, overflow:"hidden" }}>
                        <div style={{ fontSize:14, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{su.displayName}</div>
                        <div style={{ fontSize:12, color:T.textSec }}>@{su.username}{su.isOnline?" · online":""}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div style={baseStyle}>
                <div style={{ padding:"8px 14px 6px", fontSize:12, fontWeight:600, color:T.textSec, letterSpacing:"0.04em", display:"flex", alignItems:"center", gap:5 }}>
                  <Clock size={12}/> Recent
                </div>
                {recentSearches.map(ru => (
                  <div key={ru.id}
                    onMouseDown={()=>{
                      if(ru.publicKey) pubKeyMap?.set(ru.id, ru.publicKey);
                      setSelectedUser(ru); setSearchQuery(""); setSearchFocused(false);
                    }}
                    style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", cursor:"pointer", borderTop:`0.5px solid ${T.border}` }}
                    onMouseEnter={e=>(e.currentTarget.style.background=T.hoverBg)}
                    onMouseLeave={e=>(e.currentTarget.style.background="")}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:getColor(ru.displayName), display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <span style={{ color:"#fff", fontWeight:700, fontSize:12 }}>{ini(ru.displayName)}</span>
                    </div>
                    <div style={{ flex:1, overflow:"hidden" }}>
                      <div style={{ fontSize:14, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ru.displayName}</div>
                      <div style={{ fontSize:12, color:T.textSec }}>@{ru.username}</div>
                    </div>
                    <button
                      onMouseDown={e=>{ e.stopPropagation(); removeRecentSearch(ru.id); }}
                      style={{ background:"none", border:"none", cursor:"pointer", color:T.textSec, display:"flex", padding:3, borderRadius:4, flexShrink:0 }}>
                      <X size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            ),
            document.body
          );
        })()}
      </div>

      {/* Chat list */}
      <div style={{ flex:1, overflowY:"auto" }}>
        {/* Favorites */}
        {(() => {
          const isAct = selectedUser?.id === user.id;
          return (
            <button onClick={()=>setSelectedUser({id:user.id, username:user.username, displayName:user.displayName, isOnline:true})}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"14px 16px", cursor:"pointer", background:isAct?T.activeBg:"transparent", borderBottom:`0.5px solid ${dk?T.border:"rgba(0,0,0,0.04)"}`, border:"none", textAlign:"left", transition:"background 0.13s" }}
              onMouseEnter={e=>{if(!isAct)e.currentTarget.style.background=T.hoverBg;}}
              onMouseLeave={e=>{if(!isAct)e.currentTarget.style.background=isAct?T.activeBg:"transparent";}}>
              <div style={{ width:48, height:48, borderRadius:"50%", background:FAV_GRADIENT, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Bookmark size={20} style={{ color:"#fff" }}/>
              </div>
              <div style={{ flex:1, overflow:"hidden" }}>
                <div style={{ fontSize:14, fontWeight:600, color:T.text }}>Favorites</div>
                <div style={{ fontSize:13, color:T.textSec }}>Saved messages</div>
              </div>
            </button>
          );
        })()}

        {conversations.length===0 && (
          <div style={{ padding:"24px 16px", textAlign:"center", color:T.textSec, fontSize:14 }}>No conversations yet.<br/>Search for a user to start.</div>
        )}

        {conversations.filter(c=>c.id!==user.id && !blockedUsers.has(c.id)).map(conv => {
          const isAct = selectedUser?.id === conv.id;
          const isBlocked = blockedUsers.has(conv.id);
          const isMuted = mutedUsers.has(conv.id);
          return (
            <button key={conv.id} onClick={()=>setSelectedUser(conv)}
              onContextMenu={e=>{e.preventDefault(); setConvCtxMenu({ x:e.clientX, y:e.clientY, userId:conv.id });}}
              style={{ width:"100%", display:"flex", alignItems:"flex-start", gap:12, padding:"14px 16px", cursor:"pointer", background:isAct?T.activeBg:"transparent", borderBottom:`0.5px solid ${dk?T.border:"rgba(0,0,0,0.04)"}`, border:"none", textAlign:"left", transition:"background 0.13s" }}
              onMouseEnter={e=>{if(!isAct)e.currentTarget.style.background=T.hoverBg;}}
              onMouseLeave={e=>{if(!isAct)e.currentTarget.style.background=isAct?T.activeBg:"transparent";}}>
              {/* Avatar */}
              <div style={{ position:"relative", flexShrink:0 }}>
                <div style={{ width:48, height:48, borderRadius:"50%", background:isBlocked?"#9E9E9E":getColor(conv.displayName), display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {isBlocked ? <Ban size={20} style={{ color:"#fff" }}/> : <span style={{ color:"#fff", fontWeight:600, fontSize:16 }}>{ini(conv.displayName)}</span>}
                </div>
                {conv.isOnline && !isBlocked && <div className="fc-online-dot" style={{ position:"absolute", bottom:1, right:1, width:12, height:12, borderRadius:"50%", background:"#4CAF50", border:`2.5px solid ${T.bg}`}}/>}
                {isMuted && <div style={{ position:"absolute", bottom:1, right:1, width:16, height:16, borderRadius:"50%", background:T.bg, display:"flex", alignItems:"center", justifyContent:"center" }}><BellOff size={10} style={{ color:T.textSec }}/></div>}
              </div>

              {/* Chat Info */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:14, fontWeight:600, color:isBlocked?T.textSec:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{conv.displayName}</span>
                  {conv.lastTime && <span style={{ fontSize:12, color:T.textSec, flexShrink:0, marginLeft:8 }}>{conv.lastTime}</span>}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  {isBlocked ? (
                    <span style={{ fontSize:13, color:T.textSec, fontStyle:"italic" }}>Blocked</span>
                  ) : draftedChats.has(conv.id) && conv.id !== selectedUser?.id ? (
                    <span style={{ fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      <span style={{ color:"var(--fc-accent)", fontWeight:600 }}>Draft: </span>
                      <span style={{ color:T.textSec }}>{draftCacheRef.current.get(conv.id)}</span>
                    </span>
                  ) : (
                    <span style={{ fontSize:13, color:T.textSec, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{conv.lastMessage || `@${conv.username}`}</span>
                  )}

                  {/* Unread badge */}
                  {(conv.unread??0)>0 && !isMuted && <div className="badge-pulse" style={{ minWidth:20, height:20, borderRadius:10, background:"var(--fc-accent)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#fff", fontWeight:700, padding:"0 5px", flexShrink:0, marginLeft:8 }}>{conv.unread}</div>}
                  {(conv.unread??0)>0 && isMuted && <div style={{ minWidth:20, height:20, borderRadius:10, background:T.border, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:T.textSec, fontWeight:700, padding:"0 5px", flexShrink:0, marginLeft:8 }}>{conv.unread}</div>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

    </div>
  );
}
