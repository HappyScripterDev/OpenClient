import { MODRINTH_API_URL } from "../../src/shared/constants";
import { fetchJson } from "./http";
import type {
  CatalogProject,
  CatalogSearchQuery,
  CatalogSearchResult,
  CatalogVersion,
  ContentKind,
} from "../../src/shared/types";

interface ModrinthHit {
  project_id: string;
  project_type: string;
  slug: string;
  author?: string;
  title: string;
  description: string;
  categories: string[];
  versions: string[];
  downloads: number;
  follows: number;
  icon_url?: string;
  date_modified: string;
  latest_version?: string;
  license?: string;
}

interface ModrinthSearchResponse {
  hits: ModrinthHit[];
  offset: number;
  limit: number;
  total_hits: number;
}

interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  body?: string;
  categories: string[];
  client_side: string;
  server_side: string;
  project_type: string;
  downloads: number;
  followers: number;
  icon_url?: string;
  license?: { id: string; name: string };
  team?: string;
  updated: string;
  game_versions: string[];
  loaders: string[];
  source_url?: string;
  issues_url?: string;
}

interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  downloads: number;
  date_published: string;
  changelog?: string;
  dependencies: {
    version_id?: string;
    project_id?: string;
    file_name?: string;
    dependency_type: string;
  }[];
  files: {
    hashes: { sha1?: string; sha512?: string };
    url: string;
    filename: string;
    primary: boolean;
    size: number;
  }[];
}

const QUERY_CACHE = new Map<string, { at: number; value: unknown }>();
const CACHE_TTL = 2 * 60 * 1000;

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = QUERY_CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value as T;
  const value = await loader();
  QUERY_CACHE.set(key, { at: Date.now(), value });
  return value;
}

function projectType(kind: ContentKind): string {
  if (kind === "resourcepack") return "resourcepack";
  if (kind === "shader") return "shader";
  return "mod";
}

function convertHit(hit: ModrinthHit, kind: ContentKind): CatalogProject {
  return {
    id: hit.project_id,
    source: "modrinth",
    kind,
    slug: hit.slug,
    name: hit.title,
    summary: hit.description,
    author: hit.author || "Modrinth author",
    license: hit.license || "See project page",
    downloads: hit.downloads,
    followers: hit.follows,
    iconUrl: hit.icon_url,
    updatedAt: hit.date_modified,
    categories: hit.categories,
    gameVersions: hit.versions ?? [],
    loaders: hit.categories.filter((category) =>
      ["fabric", "quilt", "forge", "neoforge"].includes(category),
    ),
    externalUrl: `https://modrinth.com/${hit.project_type}/${hit.slug}`,
  };
}

function convertVersion(version: ModrinthVersion): CatalogVersion {
  const primary = version.files.find((file) => file.primary) ?? version.files[0];
  return {
    id: version.id,
    projectId: version.project_id,
    name: version.name,
    versionNumber: version.version_number,
    gameVersions: version.game_versions,
    loaders: version.loaders,
    downloads: version.downloads,
    publishedAt: version.date_published,
    fileName: primary?.filename ?? "",
    downloadUrl: primary?.url ?? "",
    hashAlgo: "sha512",
    hash: primary?.hashes.sha512 ?? primary?.hashes.sha1 ?? "",
    size: primary?.size ?? 0,
    dependencies: version.dependencies
      .filter((dependency) => dependency.project_id)
      .map((dependency) => ({
        projectId: dependency.project_id as string,
        versionId: dependency.version_id,
        kind: dependency.dependency_type,
      })),
    changelog: version.changelog,
  } as CatalogVersion;
}

export class ModrinthService {
  async search(query: CatalogSearchQuery): Promise<CatalogSearchResult> {
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const offset = Math.max(0, query.offset ?? 0);
    const facets: string[][] = [[`project_type:${projectType(query.kind)}`]];
    if (query.gameVersion) facets.push([`versions:${query.gameVersion}`]);
    if (query.loader && query.kind === "mod") {
      facets.push([`categories:${query.loader}`]);
    }
    const sortMap = {
      relevance: "relevance",
      downloads: "downloads",
      updated: "updated",
      newest: "newest",
    } as const;
    const params = new URLSearchParams({
      query: query.query ?? "",
      limit: String(limit),
      offset: String(offset),
      index: sortMap[query.sort ?? "relevance"],
      facets: JSON.stringify(facets),
    });
    const key = `search:${params.toString()}`;
    const response = await cached(key, () =>
      fetchJson<ModrinthSearchResponse>(
        `${MODRINTH_API_URL}/search?${params.toString()}`,
        {},
        2,
      ),
    );
    return {
      projects: response.hits.map((hit) => convertHit(hit, query.kind)),
      total: response.total_hits,
      offset,
      source: "modrinth",
    };
  }

  async project(idOrSlug: string, kind: ContentKind): Promise<CatalogProject> {
    const key = `project:${idOrSlug}`;
    const project = await cached(key, () =>
      fetchJson<ModrinthProject>(
        `${MODRINTH_API_URL}/project/${encodeURIComponent(idOrSlug)}`,
        {},
        2,
      ),
    );
    let author = "Modrinth author";
    if (project.team) {
      try {
        const members = await cached(`team:${project.team}`, () =>
          fetchJson<
            { user: { username: string }; role: string; ordering: number }[]
          >(`${MODRINTH_API_URL}/team/${project.team}/members`, {}, 1),
        );
        author =
          members.find((member) => member.role.toLowerCase().includes("owner"))?.user
            .username ??
          members[0]?.user.username ??
          author;
      } catch {
        void 0;
      }
    }
    return {
      id: project.id,
      source: "modrinth",
      kind,
      slug: project.slug,
      name: project.title,
      summary: project.description,
      author,
      license: project.license?.name ?? "See project page",
      downloads: project.downloads,
      followers: project.followers,
      iconUrl: project.icon_url,
      updatedAt: project.updated,
      categories: project.categories,
      gameVersions: project.game_versions,
      loaders: project.loaders,
      externalUrl: `https://modrinth.com/${projectType(kind)}/${project.slug}`,
    };
  }

  async versions(
    projectId: string,
    gameVersion: string,
    loader: string,
    kind: ContentKind,
  ): Promise<CatalogVersion[]> {
    const params = new URLSearchParams();
    if (gameVersion) params.set("game_versions", JSON.stringify([gameVersion]));
    if (loader && kind === "mod") params.set("loaders", JSON.stringify([loader]));
    const key = `versions:${projectId}:${params.toString()}`;
    const versions = await cached(key, () =>
      fetchJson<ModrinthVersion[]>(
        `${MODRINTH_API_URL}/project/${encodeURIComponent(projectId)}/version?${params.toString()}`,
        {},
        2,
      ),
    );
    return versions
      .filter((version) => version.files.length > 0)
      .map(convertVersion)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  async version(versionId: string): Promise<CatalogVersion> {
    const key = `version:${versionId}`;
    const version = await cached(key, () =>
      fetchJson<ModrinthVersion>(
        `${MODRINTH_API_URL}/version/${encodeURIComponent(versionId)}`,
        {},
        2,
      ),
    );
    return convertVersion(version);
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

export const modrinthService = new ModrinthService();
