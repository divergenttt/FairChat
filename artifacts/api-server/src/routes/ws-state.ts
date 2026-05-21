import type { WebSocket } from "ws";

export const onlineUsers = new Set<string>();
export const userSockets = new Map<string, Set<WebSocket>>();

export function addUserSocket(userId: string, ws: WebSocket): void {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)!.add(ws);
  onlineUsers.add(userId);
}

export function removeUserSocket(userId: string, ws: WebSocket): void {
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) {
      userSockets.delete(userId);
      onlineUsers.delete(userId);
    }
  }
}

export function sendToUser(userId: string, data: object): void {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const payload = JSON.stringify(data);
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}
