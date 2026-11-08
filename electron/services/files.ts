import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureDir } from "./paths";

export async function readJsonFile<T>(
  file: string,
  fallback: T,
): Promise<T> {
  try {
    const text = await fs.promises.readFile(file, "utf8");
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(file: string, value: unknown): Promise<void> {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await fs.promises.rename(temp, file);
}

export function readJsonFileSync<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function hashFile(
  file: string,
  algorithm: "sha1" | "sha256" | "sha512" | "md5",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export async function fileMatches(
  file: string,
  expected: { sha1?: string; sha256?: string; sha512?: string; md5?: string; size?: number },
): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) return false;
    if (expected.size !== undefined && stat.size !== expected.size) return false;
    if (expected.sha1) {
      const hash = await hashFile(file, "sha1");
      if (hash.toLowerCase() !== expected.sha1.toLowerCase()) return false;
    }
    if (expected.sha256) {
      const hash = await hashFile(file, "sha256");
      if (hash.toLowerCase() !== expected.sha256.toLowerCase()) return false;
    }
    if (expected.sha512) {
      const hash = await hashFile(file, "sha512");
      if (hash.toLowerCase() !== expected.sha512.toLowerCase()) return false;
    }
    if (expected.md5) {
      const hash = await hashFile(file, "md5");
      if (hash.toLowerCase() !== expected.md5.toLowerCase()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function removeFileIfExists(file: string): Promise<void> {
  try {
    await fs.promises.rm(file, { force: true });
  } catch {
    void 0;
  }
}

export async function ensureEmptyDir(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true });
  ensureDir(dir);
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
