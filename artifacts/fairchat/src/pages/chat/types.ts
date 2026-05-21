export interface User {
  id: string;
  username: string;
  displayName: string;
  publicKey?: string;
  isOnline?: boolean;
  createdAt?: string;
  lastSeen?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  walletAddress?: string | null;
  sessionExpiry?: string | null;
}
export interface Reaction { emoji: string; count: number; byMe: boolean; }
export type DeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed";
export interface Message {
  id: string; senderId: string; recipientId?: string;
  encryptedContent: string; replyToId?: string | null;
  editedAt?: string | null; isRead?: boolean;
  createdAt: string; decrypted?: string;
  reactions?: Reaction[];
  attachmentUrl?: string | null; attachmentName?: string | null;
  attachmentType?: string | null; attachmentSize?: number | null;
  destroyAfter?: number | null; destroyAt?: string | null;
  messageType?: string | null;
  deliveryStatus?: DeliveryStatus;
  _pending?: boolean; _failed?: boolean; _stableId?: string;
  _retryCount?: number;
}
export interface ConvItem extends User { lastMessage?: string; lastTime?: string; unread?: number; }
export interface LinkPreview { title: string; description: string; image: string; siteName: string; url: string; }
export interface CtxMenu { x: number; y: number; msg: Message; isMine: boolean; }

export interface Theme {
  bg: string; bgChat: string; surface: string; border: string;
  text: string; textSec: string; inputBg: string; hoverBg: string;
  activeBg: string; msgOther: string; msgOtherText: string; msgOtherBorder: string;
  ctxBg: string; replyBar: string;
}
