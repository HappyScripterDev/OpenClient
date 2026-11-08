import fs from "node:fs";
import path from "node:path";
import { appRoot, ensureDir } from "./paths";
import { fetchJson } from "./http";
import { logger } from "./logger";
import { MOJANG_NEWS_URL, MOJANG_STATUS_URL } from "../../src/shared/constants";
import type { NewsItem, ServiceStatusEntry } from "../../src/shared/types";

interface MojangStatusEntry {
  [service: string]: string;
}

interface LauncherNewsEntry {
  id?: string;
  title?: string;
  version?: string;
  type?: string;
  shortDescription?: string;
  body?: string;
  image?: { url?: string };
  images?: { url?: string }[];
  date?: string;
  published?: string;
  link?: string;
  url?: string;
}

interface LauncherNewsResponse {
  entries?: LauncherNewsEntry[];
  articles?: LauncherNewsEntry[];
}

function cachePath(name: string): string {
  const dir = path.join(appRoot(), "cache");
  ensureDir(dir);
  return path.join(dir, name);
}

function readCache<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(cachePath(name), "utf8")) as T;
  } catch {
    return null;
  }
}

function writeCache(name: string, value: unknown): void {
  try {
    fs.writeFileSync(cachePath(name), JSON.stringify(value));
  } catch {
    void 0;
  }
}

function statusLabel(id: string): string {
  const labels: Record<string, string> = {
    "minecraft.net": "Minecraft website",
    "session.minecraft.net": "Minecraft sessions",
    "account.mojang.com": "Mojang accounts",
    "authserver.mojang.com": "Authentication",
    "sessionserver.mojang.com": "Session server",
    "api.mojang.com": "Mojang API",
    "textures.minecraft.net": "Skin textures",
    "mojang.com": "Mojang website",
    "piston-meta.mojang.com": "Version manifest",
    "libraries.minecraft.net": "Libraries",
    "resources.download.minecraft.net": "Asset downloads",
  };
  return labels[id] ?? id;
}

export class NewsService {
  private newsCache: NewsItem[] | null = null;
  private statusCache: ServiceStatusEntry[] | null = null;

  async news(): Promise<NewsItem[]> {
    if (this.newsCache) return this.newsCache;
    try {
      const response = await fetchJson<LauncherNewsResponse>(MOJANG_NEWS_URL, {}, 1);
      const entries = response.entries ?? response.articles ?? [];
      const mapped = entries
        .map((entry, index) => ({
          id: entry.id ?? entry.version ?? `news-${index}`,
          title: entry.title ?? entry.version ?? "Minecraft update",
          summary: entry.shortDescription ?? entry.body?.slice(0, 220) ?? "",
          category: entry.type ?? "Update",
          publishedAt: entry.date ?? entry.published ?? new Date().toISOString(),
          imageUrl: entry.image?.url ?? entry.images?.[0]?.url,
          url: entry.link ?? entry.url ?? "https://www.minecraft.net/en-us/articles",
        }))
        .filter((entry) => entry.title)
        .slice(0, 8);
      if (mapped.length > 0) {
        this.newsCache = mapped;
        writeCache("news.json", mapped);
        return mapped;
      }
    } catch (error) {
      logger.warn(
        "news",
        `News request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const cached = readCache<NewsItem[]>("news.json");
    this.newsCache = cached ?? [];
    return this.newsCache;
  }

  async statuses(): Promise<ServiceStatusEntry[]> {
    if (this.statusCache) return this.statusCache;
    try {
      const response = await fetchJson<MojangStatusEntry[]>(MOJANG_STATUS_URL, {}, 1);
      const entries: ServiceStatusEntry[] = [];
      for (const item of response) {
        for (const [id, state] of Object.entries(item)) {
          entries.push({
            id,
            name: statusLabel(id),
            state:
              state === "green"
                ? "up"
                : state === "yellow"
                  ? "degraded"
                  : state === "red"
                    ? "down"
                    : "unknown",
            detail:
              state === "green"
                ? "Operational"
                : state === "yellow"
                  ? "Partial outage"
                  : state === "red"
                    ? "Outage"
                    : "Unknown",
          });
        }
      }
      if (entries.length > 0) {
        this.statusCache = entries;
        writeCache("status.json", entries);
        return entries;
      }
    } catch (error) {
      logger.warn(
        "status",
        `Status request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const cached = readCache<ServiceStatusEntry[]>("status.json");
    this.statusCache = cached ?? [
      {
        id: "minecraft.net",
        name: "Minecraft services",
        state: "unknown",
        detail: "Status could not be checked",
      },
    ];
    return this.statusCache;
  }
}

export const newsService = new NewsService();
