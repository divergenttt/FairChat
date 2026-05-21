import { COLORS } from "./constants";
import type { Message } from "./types";

export const getColor = (n: string) => { let h=0; for(let i=0;i<(n?.length??0);i++) h=n.charCodeAt(i)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length]; };

export function avatarSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url;
}
export const ini = (n: string) => (n||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
export const fmtFull = (iso: string) => new Date(iso).toLocaleString([],{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});
export const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

export const fmtLastSeen = (lastSeen: string | null | undefined, isOnline?: boolean): string => {
  if (isOnline) return "online";
  if (!lastSeen) return "offline";
  const d = new Date(lastSeen);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const todayStr = now.toDateString();
  const dStr = d.toDateString();
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (todayStr === dStr) return `today at ${t}`;
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === dStr) return `yesterday at ${t}`;
  return `${d.toLocaleDateString([], { day: "2-digit", month: "short" })}`;
};

export function isGrouped(msg: Message, prev?: Message): boolean {
  if (!prev) return false;
  if (msg.senderId !== prev.senderId) return false;
  if (msg.replyToId) return false;
  return new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 2 * 60 * 1000;
}

export function groupByDate(msgs: Message[]) {
  const groups: { label: string; messages: Message[] }[] = [];
  let cur = { label: "", messages: [] as Message[] };
  const today = new Date(); const yest = new Date(today); yest.setDate(today.getDate()-1);
  msgs.forEach(msg => {
    const d = new Date(msg.createdAt);
    let label = d.toLocaleDateString([],{day:"numeric",month:"long",year:"numeric"});
    if (d.toDateString()===today.toDateString()) label="Today";
    else if (d.toDateString()===yest.toDateString()) label="Yesterday";
    if (label!==cur.label) { if(cur.messages.length) groups.push(cur); cur={label,messages:[msg]}; }
    else cur.messages.push(msg);
  });
  if (cur.messages.length) groups.push(cur);
  return groups;
}
