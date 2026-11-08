import { useEffect, useState } from "react";
import { avatarUrl } from "../lib/format";

export interface AvatarProps {
  uuid?: string;
  name?: string;
  src?: string;
  size?: number;
}

export function Avatar({ uuid, name, src, size = 32 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const url = src ?? (uuid ? avatarUrl(uuid) : "");
  useEffect(() => {
    setFailed(false);
  }, [url]);
  if (!url || failed) {
    const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
    return (
      <span
        className="avatar-fallback"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), fontSize: Math.round(size * 0.4) }}
        aria-hidden
      >
        {initial}
      </span>
    );
  }
  return (
    <img
      className="avatar"
      src={url}
      alt={name ? `${name} avatar` : "Player avatar"}
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}
