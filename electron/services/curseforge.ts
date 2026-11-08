import { CURSEFORGE_API_URL } from "../../src/shared/constants";
import { fetchJson } from "./http";
import { settingsService } from "./settings";
import type {
  CatalogProject,
  CatalogSearchQuery,
  CatalogSearchResult,
  CatalogVersion,
  ContentKind,
} from "../../src/shared/types";

const GAME_ID = 432;
const CLASS_IDS: Record<ContentKind, number> = {
  mod: 6,
  resourcepack: 12,
  shader: 6552,
};
const LOADER_IDS: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
};
const LOADER_NAMES: Record<number, string> = {
  1: "forge",
  4: "fabric",
  5: "quilt",
  6: "neoforge",
};

interface CurseMod {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  dateModified: string;
  dateCreated: string;
  classId?: number;
  authors: { name: string }[];
  logo?: { thumbnailUrl: string; url: string };
  links?: { websiteUrl?: string };
  categories: { name: string }[];
  latestFilesIndexes?: { gameVersion: string; modLoader?: number }[];
}

interface CurseFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  fileLength: number;
  downloadCount: number;
  fileDate: string;
  downloadUrl: string | null;
  gameVersions: string[];
  hashes: { sha1?: string; md5?: string };
  releaseType: number;
  dependencies: { modId: number; relationType: number }[];
}

interface CurseResponse<T> {
  data: T;
  pagination?: { totalCount: number };
}

async function apiHeaders(): Promise<Record<string, string>> {
  const settings = await settingsService.load();
  const key = settings.curseforgeApiKey.trim();
  if (!key) {
    throw new Error(
      "CurseForge requires an API key. Add one in Settings, Catalog, or use Modrinth.",
    );
  }
  return { "x-api-key": key, Accept: "application/json" };
}

function convertMod(mod: CurseMod, kind: ContentKind): CatalogProject {
  const loaders = new Set<string>();
  const gameVersions = new Set<string>();
  for (const index of mod.latestFilesIndexes ?? []) {
    if (index.gameVersion) gameVersions.add(index.gameVersion);
    if (index.modLoader && LOADER_NAMES[index.modLoader]) {
      loaders.add(LOADER_NAMES[index.modLoader]);
    }
  }
  const path =
    kind === "mod"
      ? "mc-mods"
      : kind === "resourcepack"
        ? "texture-packs"
        : "shaders";
  return {
    id: String(mod.id),
    source: "curseforge",
    kind,
    slug: mod.slug,
    name: mod.name,
    summary: mod.summary,
    author: mod.authors?.[0]?.name ?? "CurseForge author",
    license: "See CurseForge project page",
    downloads: mod.downloadCount,
    followers: 0,
    iconUrl: mod.logo?.thumbnailUrl ?? mod.logo?.url,
    updatedAt: mod.dateModified,
    categories: (mod.categories ?? []).map((category) => category.name),
    gameVersions: [...gameVersions],
    loaders: [...loaders],
    externalUrl:
      mod.links?.websiteUrl ??
      `https://www.curseforge.com/minecraft/${path}/${mod.slug}`,
  };
}

function convertFile(file: CurseFile, projectId?: string): CatalogVersion {
  return {
    id: String(file.id),
    projectId: String(projectId ?? file.modId),
    name: file.displayName,
    versionNumber: file.displayName || file.fileName,
    gameVersions: file.gameVersions.filter((value) => /^\d/.test(value)),
    loaders: [],
    downloads: file.downloadCount,
    publishedAt: file.fileDate,
    fileName: file.fileName,
    downloadUrl: file.downloadUrl ?? "",
    hashAlgo: "sha1",
    hash: file.hashes.sha1 ?? file.hashes.md5 ?? "",
    size: file.fileLength,
    dependencies: (file.dependencies ?? [])
      .filter((dependency) => dependency.modId > 0)
      .map((dependency) => ({
        projectId: String(dependency.modId),
        kind:
          dependency.relationType === 3
            ? "required"
            : dependency.relationType === 2
              ? "optional"
              : "incompatible",
      })),
  };
}

export class CurseForgeService {
  async available(): Promise<boolean> {
    const settings = await settingsService.load();
    return Boolean(settings.curseforgeApiKey.trim());
  }

  async search(query: CatalogSearchQuery): Promise<CatalogSearchResult> {
    const headers = await apiHeaders();
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const index = Math.max(0, query.offset ?? 0);
    const sortField =
      query.sort === "downloads" ? 6 : query.sort === "updated" ? 3 : 2;
    const params = new URLSearchParams({
      gameId: String(GAME_ID),
      classId: String(CLASS_IDS[query.kind]),
      index: String(index),
      pageSize: String(limit),
      sortField: String(sortField),
      sortOrder: "desc",
    });
    if (query.query) params.set("searchFilter", query.query);
    if (query.gameVersion) params.set("gameVersion", query.gameVersion);
    if (query.loader && query.kind === "mod") {
      const loaderId = LOADER_IDS[query.loader];
      if (loaderId) params.set("modLoaderType", String(loaderId));
    }
    const response = await fetchJson<CurseResponse<CurseMod[]>>(
      `${CURSEFORGE_API_URL}/mods/search?${params.toString()}`,
      { headers },
      2,
    );
    return {
      projects: response.data.map((mod) => convertMod(mod, query.kind)),
      total: response.pagination?.totalCount ?? response.data.length,
      offset: index,
      source: "curseforge",
    };
  }

  async project(id: string, kind: ContentKind): Promise<CatalogProject> {
    const headers = await apiHeaders();
    const response = await fetchJson<CurseResponse<CurseMod>>(
      `${CURSEFORGE_API_URL}/mods/${encodeURIComponent(id)}`,
      { headers },
      2,
    );
    return convertMod(response.data, kind);
  }

  async versions(
    projectId: string,
    gameVersion: string,
    loader: string,
    kind: ContentKind,
  ): Promise<CatalogVersion[]> {
    const headers = await apiHeaders();
    const params = new URLSearchParams({ pageSize: "50", index: "0" });
    if (gameVersion) params.set("gameVersion", gameVersion);
    if (loader && kind === "mod") {
      const loaderId = LOADER_IDS[loader];
      if (loaderId) params.set("modLoaderType", String(loaderId));
    }
    const response = await fetchJson<CurseResponse<CurseFile[]>>(
      `${CURSEFORGE_API_URL}/mods/${encodeURIComponent(projectId)}/files?${params.toString()}`,
      { headers },
      2,
    );
    return response.data
      .filter((file) => file.downloadUrl)
      .map((file) => convertFile(file, projectId))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  async version(fileId: string): Promise<CatalogVersion> {
    const headers = await apiHeaders();
    const response = await fetchJson<CurseResponse<CurseFile>>(
      `${CURSEFORGE_API_URL}/mods/files/${encodeURIComponent(fileId)}`,
      { headers },
      2,
    );
    return convertFile(response.data);
  }

  async compatibleVersion(
    projectId: string,
    gameVersion: string,
    loader: string,
    kind: ContentKind,
  ): Promise<CatalogVersion | null> {
    const versions = await this.versions(projectId, gameVersion, loader, kind);
    return versions[0] ?? null;
  }
}

export const curseForgeService = new CurseForgeService();
