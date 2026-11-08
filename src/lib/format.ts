import type { ApiResult, AppError, ErrorCode } from "../shared/types";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly detail?: string;

  constructor(error: AppError) {
    super(error.message);
    this.name = "ApiError";
    this.code = error.code;
    this.detail = error.detail;
  }
}

export async function unwrap<T>(promise: Promise<ApiResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new ApiError(result.error);
  return result.data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatNumber(value: number | undefined): string {
  if (!value || !Number.isFinite(value)) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function formatDate(value: string | number | undefined): string {
  if (!value) return "Unknown";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function timeAgo(value: number | undefined): string {
  if (!value) return "Never";
  const seconds = Math.max(1, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatUptime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

export function avatarUrl(uuid: string): string {
  return `https://mc-heads.net/avatar/${uuid.replace(/-/g, "")}/64`;
}

export function requiredJavaMajor(gameVersion: string): number {
  const match = gameVersion.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return 21;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3] ?? 0);
  if (major > 1) return 21;
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 17) return 17;
  return 8;
}

export function loaderLabel(loader: string): string {
  switch (loader) {
    case "fabric":
      return "Fabric";
    case "quilt":
      return "Quilt";
    case "forge":
      return "Forge";
    case "neoforge":
      return "NeoForge";
    default:
      return "Vanilla";
  }
}

export function performanceLabel(preset: string | undefined): string {
  if (preset === "ultra") return "Ultra FPS";
  if (preset === "quality") return "Quality";
  if (preset === "balanced") return "Balanced";
  return "Custom";
}

export function pingQuality(latency: number): "good" | "ok" | "bad" | "none" {
  if (!latency) return "none";
  if (latency < 80) return "good";
  if (latency < 180) return "ok";
  return "bad";
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1)}…`;
}

export function classNames(
  ...values: (string | false | null | undefined)[]
): string {
  return values.filter(Boolean).join(" ");
}
