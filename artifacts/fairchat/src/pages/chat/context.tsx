import { createContext, useContext } from "react";
import type { MutableRefObject, RefObject, Dispatch, SetStateAction } from "react";
import type { User, Message, ConvItem, LinkPreview, CtxMenu, Theme } from "./types";

export interface ChatCtx {
  // auth
  user: User;
  logout: () => void;
  updateUser: (patch: Partial<User>) => void;
  refreshSession: (days: number) => Promise<{ ok: boolean; error?: string }>;

  // theme
  T: Theme;
  dk: boolean;
  darkMode: boolean;
  setDarkMode: Dispatch<SetStateAction<boolean>>;
  accentColor: string;
  setAccentColor: Dispatch<SetStateAction<string>>;

  // conversations / navigation
  conversations: ConvItem[];
  setConversations: Dispatch<SetStateAction<ConvItem[]>>;
  selectedUser: User | null;
  setSelectedUser: (su: User | null) => void;

  // messages
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  messagesLoading: boolean;
  setMessagesLoading: Dispatch<SetStateAction<boolean>>;
  loadingMore: boolean;

  // input
  messageInput: string;
  setMessageInput: Dispatch<SetStateAction<string>>;
  replyTo: Message | null;
  setReplyTo: Dispatch<SetStateAction<Message | null>>;
  editingMsg: Message | null;
  setEditingMsg: Dispatch<SetStateAction<Message | null>>;
  destroyAfter: number | null;
  setDestroyAfter: Dispatch<SetStateAction<number | null>>;
  sendTimerMenu: boolean;
  setSendTimerMenu: Dispatch<SetStateAction<boolean>>;

  // attachments
  attachmentFile: File | null;
  setAttachmentFile: Dispatch<SetStateAction<File | null>>;
  attachmentPreviewUrl: string | null;
  setAttachmentPreviewUrl: Dispatch<SetStateAction<string | null>>;
  attachmentUploading: boolean;
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  clearAttachment: () => void;
  handleAttachmentPick: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // emoji picker
  showEmojiPicker: boolean;
  setShowEmojiPicker: Dispatch<SetStateAction<boolean>>;
  emojiCat: number;
  setEmojiCat: Dispatch<SetStateAction<number>>;
  emojiPickerRef: RefObject<HTMLDivElement | null>;

  // search
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  searchResults: User[];
  setSearchResults: Dispatch<SetStateAction<User[]>>;
  searchFocused: boolean;
  setSearchFocused: Dispatch<SetStateAction<boolean>>;
  recentSearches: User[];
  saveRecentSearch: (u: User) => void;
  removeRecentSearch: (userId: string) => void;
  sidebarSearchRef: RefObject<HTMLInputElement | null>;

  // chat search
  chatSearch: boolean;
  setChatSearch: Dispatch<SetStateAction<boolean>>;
  chatQ: string;
  setChatQ: Dispatch<SetStateAction<string>>;
  chatMatchIdx: number;
  setChatMatchIdx: Dispatch<SetStateAction<number>>;
  chatMatches: Message[];
  chatSearchInputRef: RefObject<HTMLInputElement | null>;

  // selection
  selIds: Set<string>;
  selMode: boolean;
  enterSelMode: (id: string) => void;
  toggleSel: (id: string) => void;
  exitSelMode: () => void;

  // pinned
  pinnedMsg: Message | null;
  setPinnedMsg: Dispatch<SetStateAction<Message | null>>;

  // profile / media
  showProfile: boolean;
  setShowProfile: Dispatch<SetStateAction<boolean>>;
  showMediaGallery: boolean;
  setShowMediaGallery: Dispatch<SetStateAction<boolean>>;
  openGallery: () => void;

  // gallery
  galleryMedia: Message[];
  galleryLoading: boolean;
  galleryTab: "photos" | "files" | "audio";
  setGalleryTab: Dispatch<SetStateAction<"photos" | "files" | "audio">>;

  // ws status
  wsStatus: "connecting" | "connected" | "disconnected";

  // typing
  otherTyping: boolean;

  // scroll
  scrollRef: RefObject<HTMLDivElement | null>;
  showScrollBtn: boolean;
  unreadBelow: number;
  setUnreadBelow: Dispatch<SetStateAction<number>>;
  scrollToBottom: () => void;
  scrollToMsg: (id: string) => void;
  handleScroll: () => void;

  // drag-to-reply
  dragInfo: { msgId: string; dx: number; mine: boolean } | null;
  onDragStart: (e: React.PointerEvent, msgId: string, mine: boolean) => void;
  onDragMove: (e: React.PointerEvent, msgId: string, mine: boolean) => void;
  onDragEnd: (msg: Message, mine: boolean) => void;
  dragActive: MutableRefObject<boolean>;

  // reactions
  reactionPickerMsgId: string | null;
  setReactionPickerMsgId: Dispatch<SetStateAction<string | null>>;
  pickerPos: { left: number; top: number } | null;
  setPickerPos: Dispatch<SetStateAction<{ left: number; top: number } | null>>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;

  // lightbox
  lightboxUrl: string | null;
  setLightboxUrl: Dispatch<SetStateAction<string | null>>;
  lightboxRotation: number;
  setLightboxRotation: Dispatch<SetStateAction<number>>;
  lightboxMsg: Message | null;
  setLightboxMsg: Dispatch<SetStateAction<Message | null>>;
  lightboxMoreOpen: boolean;
  setLightboxMoreOpen: Dispatch<SetStateAction<boolean>>;

  // link previews
  linkPreviews: Record<string, LinkPreview | null>;

  // flash
  flashMsgId: string | null;
  loadedImgsRef: MutableRefObject<Set<string>>;
  newMsgIdsRef: MutableRefObject<Set<string>>;
  firstUnreadIdRef: MutableRefObject<string | null>;

  // refs
  inputRef: RefObject<HTMLTextAreaElement | null>;
  sendBtnRef: RefObject<HTMLButtonElement | null>;

  // settings
  showSettings: boolean;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  settingsTab: "profile" | "security" | "appearance";
  setSettingsTab: Dispatch<SetStateAction<"profile" | "security" | "appearance">>;
  settingsDisplayName: string;
  setSettingsDisplayName: Dispatch<SetStateAction<string>>;
  settingsBio: string;
  setSettingsBio: Dispatch<SetStateAction<string>>;
  settingsWalletAddress: string;
  setSettingsWalletAddress: Dispatch<SetStateAction<string>>;
  settingsAvatarPreview: string | null;
  setSettingsAvatarPreview: Dispatch<SetStateAction<string | null>>;
  settingsSaving: boolean;
  settingsMsg: { text: string; ok: boolean } | null;
  setSettingsMsg: Dispatch<SetStateAction<{ text: string; ok: boolean } | null>>;
  settingsCurPwd: string;
  setSettingsCurPwd: Dispatch<SetStateAction<string>>;
  settingsNewPwd: string;
  setSettingsNewPwd: Dispatch<SetStateAction<string>>;
  settingsConfPwd: string;
  setSettingsConfPwd: Dispatch<SetStateAction<string>>;
  sessionDuration: number;
  setSessionDuration: Dispatch<SetStateAction<number>>;
  sessionRefreshing: boolean;
  settingsAvatarInputRef: RefObject<HTMLInputElement | null>;
  handleAvatarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleSaveProfile: () => Promise<void>;
  handleChangePassword: () => Promise<void>;
  handleRefreshSession: (days: number) => Promise<void>;
  openSettings: () => void;

  // block / mute / delete conv
  blockedUsers: Set<string>;
  mutedUsers: Set<string>;
  convCtxMenu: { x: number; y: number; userId: string } | null;
  setConvCtxMenu: Dispatch<SetStateAction<{ x: number; y: number; userId: string } | null>>;
  toggleBlock: (userId: string) => Promise<void>;
  toggleMute: (userId: string) => Promise<void>;
  deleteConversation: (userId: string, scope: "forMe" | "forThem" | "forBoth") => Promise<void>;

  // contacts
  savedContacts: Set<string>;
  contactBannerDismissed: Set<string>;
  setContactBannerDismissed: Dispatch<SetStateAction<Set<string>>>;
  addContact: (contactId: string) => Promise<void>;

  // forward
  isForwardOpen: boolean;
  setIsForwardOpen: Dispatch<SetStateAction<boolean>>;
  fwdQuery: string;
  setFwdQuery: Dispatch<SetStateAction<string>>;
  filteredFwd: ConvItem[];
  handleForward: (targetId: string) => Promise<void>;

  // recording
  isRecording: boolean;
  recordingTime: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;

  // payment
  showPaymentsView: boolean;
  setShowPaymentsView: Dispatch<SetStateAction<boolean>>;
  showPaymentModal: boolean;
  setShowPaymentModal: Dispatch<SetStateAction<boolean>>;
  paymentPrefill: { amount?: string; networkId?: string; tokenSymbol?: string; replyToRequestId?: string } | null;
  setPaymentPrefill: Dispatch<SetStateAction<{ amount?: string; networkId?: string; tokenSymbol?: string; replyToRequestId?: string } | null>>;
  showTxHistory: boolean;
  setShowTxHistory: Dispatch<SetStateAction<boolean>>;

  // draftedChats
  draftedChats: Set<string>;
  draftCacheRef: MutableRefObject<Map<string, string>>;

  // refs (shared)
  pubKeyMapRef: import("react").MutableRefObject<Map<string, string>>;

  // selection (extra)
  setSelIds: Dispatch<SetStateAction<Set<string>>>;

  // drag (extra)
  setDragInfo: Dispatch<SetStateAction<{ msgId: string; dx: number; mine: boolean } | null>>;
  longPressActivated: MutableRefObject<boolean>;
  clearLongPress: () => void;

  // msg cache
  msgCacheRef: MutableRefObject<Map<string, import("./types").Message[]>>;

  // misc
  isFav: boolean;
  hoveredMsgId: string | null;
  setHoveredMsgId: Dispatch<SetStateAction<string | null>>;
  sendPopActive: boolean;
  setSendPopActive: Dispatch<SetStateAction<boolean>>;
  deletingIds: Set<string>;

  // actions
  withToken: (url: string | null | undefined) => string;
  handleInputChange: (val: string) => void;
  handleSendOrEdit: () => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleDeleteMsgs: (ids: string[]) => Promise<void>;
  handleDeleteSel: () => void;
  handleCopySel: () => void;
  handlePin: (msgId: string | null) => Promise<void>;
  startReply: (msg: Message) => void;
  startEdit: (msg: Message) => void;
  handleSendMessage: (content?: string, recipientId?: string) => Promise<void>;
  ctxMenu: CtxMenu | null;
  setCtxMenu: Dispatch<SetStateAction<CtxMenu | null>>;
}

export const ChatContext = createContext<ChatCtx | null>(null);

export function useChatContext(): ChatCtx {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatPage");
  return ctx;
}

export interface InputCtx {
  messageInput: string;
  setMessageInput: Dispatch<SetStateAction<string>>;
  handleInputChange: (val: string) => void;
  isRecording: boolean;
  recordingTime: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
}

export const InputContext = createContext<InputCtx | null>(null);

export function useInputContext(): InputCtx {
  const ctx = useContext(InputContext);
  if (!ctx) throw new Error("useInputContext must be used within ChatPage");
  return ctx;
}
