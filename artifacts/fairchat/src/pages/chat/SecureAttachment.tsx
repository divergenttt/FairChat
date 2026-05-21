import { useEffect, useState } from "react";
import { ImageOff, Paperclip, Loader2 } from "lucide-react";
import type { AttachmentPayload } from "@/lib/attachmentMessage";
import { fetchAttachmentBlobUrl } from "@/lib/attachmentMessage";
import { getCachedPrivateKey } from "@/lib/crypto";
import { AudioPlayer } from "./ui";

type LoadState = "loading" | "ready" | "error";

export function SecureAttachmentImage({
  att,
  otherUserPubKey,
  alt,
  style,
  onOpen,
  onPointerDown,
}: {
  att: AttachmentPayload;
  otherUserPubKey?: string | null;
  alt?: string;
  style?: React.CSSProperties;
  onOpen?: (blobUrl: string) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setState("loading");
    setBlobUrl(null);

    void fetchAttachmentBlobUrl(att, otherUserPubKey, getCachedPrivateKey()).then((result) => {
      if (cancelled) {
        if (result.ok) URL.revokeObjectURL(result.blobUrl);
        return;
      }
      if (!result.ok) {
        setState("error");
        return;
      }
      revoked = result.blobUrl;
      setBlobUrl(result.blobUrl);
      setState("ready");
    });

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [att.url, att.fileEncrypted, att.type, otherUserPubKey]);

  if (state === "error") {
    return (
      <div
        style={{
          ...style,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          minWidth: 120,
          minHeight: 80,
          borderRadius: 8,
          background: "rgba(0,0,0,0.08)",
          color: "rgba(0,0,0,0.45)",
          fontSize: 12,
          padding: 8,
        }}
      >
        <ImageOff size={16} />
        <span>Не удалось загрузить</span>
      </div>
    );
  }

  if (state === "loading" || !blobUrl) {
    return (
      <div
        className="img-blur"
        style={{
          ...style,
          minWidth: 120,
          minHeight: 80,
          borderRadius: 8,
          background: "rgba(0,0,0,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader2 size={20} style={{ opacity: 0.4, animation: "spin 0.7s linear infinite" }} />
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt ?? "image"}
      loading="lazy"
      className="img-loaded"
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(blobUrl);
      }}
      onError={() => {
        console.error("[SecureAttachmentImage] img onError", att.url);
        setState("error");
      }}
      style={{ ...style, display: "block", borderRadius: 8, objectFit: "cover", cursor: onOpen ? "zoom-in" : undefined }}
    />
  );
}

export function SecureAttachmentAudio({
  att,
  otherUserPubKey,
  mine,
  dark,
}: {
  att: AttachmentPayload;
  otherUserPubKey?: string | null;
  mine?: boolean;
  dark?: boolean;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void fetchAttachmentBlobUrl(att, otherUserPubKey, getCachedPrivateKey()).then((result) => {
      if (cancelled) {
        if (result.ok) URL.revokeObjectURL(result.blobUrl);
        return;
      }
      if (!result.ok) {
        setState("error");
        return;
      }
      revoked = result.blobUrl;
      setBlobUrl(result.blobUrl);
      setState("ready");
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [att.url, att.fileEncrypted, otherUserPubKey]);

  if (state === "error") {
    return <span style={{ fontSize: 12, opacity: 0.6 }}>Не удалось расшифровать аудио</span>;
  }
  if (state === "loading" || !blobUrl) {
    return <Loader2 size={16} style={{ opacity: 0.4, animation: "spin 0.7s linear infinite" }} />;
  }
  return <AudioPlayer src={blobUrl} dark={!!dark} mine={!!mine} />;
}

export function SecureAttachmentFileLink({
  att,
  otherUserPubKey,
  mine,
  marginTop,
}: {
  att: AttachmentPayload;
  otherUserPubKey?: string | null;
  mine?: boolean;
  marginTop?: number;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void fetchAttachmentBlobUrl(att, otherUserPubKey, getCachedPrivateKey()).then((result) => {
      if (cancelled) {
        if (result.ok) URL.revokeObjectURL(result.blobUrl);
        return;
      }
      if (!result.ok) {
        setState("error");
        return;
      }
      revoked = result.blobUrl;
      setBlobUrl(result.blobUrl);
      setState("ready");
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [att.url, att.fileEncrypted, otherUserPubKey]);

  if (state === "error") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop, fontSize: 12, opacity: 0.65 }}>
        <ImageOff size={14} />
        Не удалось загрузить файл
      </div>
    );
  }

  const href = state === "ready" && blobUrl ? blobUrl : "#";
  return (
    <a
      href={href}
      download={att.name}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        if (!blobUrl) e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop,
        padding: "8px 10px",
        borderRadius: 10,
        background: mine ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)",
        textDecoration: "none",
        color: "inherit",
        cursor: blobUrl ? "pointer" : "wait",
        opacity: blobUrl ? 1 : 0.7,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: mine ? "rgba(255,255,255,0.2)" : "var(--fc-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Paperclip size={16} style={{ color: "#fff" }} />
      </div>
      <div style={{ overflow: "hidden" }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
          {att.name}
        </div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>
          {att.size ? `${(att.size / 1024).toFixed(0)} KB` : ""}
        </div>
      </div>
    </a>
  );
}
