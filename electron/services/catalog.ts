import { modrinthService } from "./modrinth";
import { curseForgeService } from "./curseforge";
import { settingsService } from "./settings";
import { profilesService } from "./profiles";
import type {
  CatalogProject,
  CatalogSearchQuery,
  CatalogSearchResult,
  CatalogVersion,
  ContentKind,
  ContentSource,
  InstallPlan,
  JavaProfile,
} from "../../src/shared/types";

export interface ResolvedCatalogEntry {
  project: CatalogProject;
  version: CatalogVersion;
  depth: number;
  required: boolean;
}

export interface ResolvedCatalogChain {
  root: ResolvedCatalogEntry;
  entries: ResolvedCatalogEntry[];
  missing: string[];
  warnings: string[];
}

function serviceFor(source: ContentSource) {
  return source === "curseforge" ? curseForgeService : modrinthService;
}

class CatalogService {
  async search(query: CatalogSearchQuery): Promise<CatalogSearchResult> {
    const settings = await settingsService.load();
    const requested = query.source;
    const useCurseForge =
      requested === "curseforge" ||
      (settings.catalogSource === "both" && query.source === "curseforge");
    if (useCurseForge) {
      if (!(await curseForgeService.available())) {
        throw new Error(
          "CurseForge needs an API key. Add one in Settings, Catalog.",
        );
      }
      return curseForgeService.search(query);
    }
    return modrinthService.search(query);
  }

  async project(
    source: "modrinth" | "curseforge",
    id: string,
    kind: ContentKind,
  ): Promise<CatalogProject> {
    return serviceFor(source).project(id, kind);
  }

  async versions(
    source: "modrinth" | "curseforge",
    projectId: string,
    gameVersion: string,
    loader: string,
    kind: ContentKind,
  ): Promise<CatalogVersion[]> {
    return serviceFor(source).versions(projectId, gameVersion, loader, kind);
  }

  async version(
    source: "modrinth" | "curseforge",
    versionId: string,
  ): Promise<CatalogVersion> {
    return serviceFor(source).version(versionId);
  }

  private async compatibleVersion(
    source: "modrinth" | "curseforge",
    projectId: string,
    gameVersion: string,
    loader: string,
    kind: ContentKind,
  ): Promise<CatalogVersion | null> {
    return serviceFor(source).compatibleVersion(
      projectId,
      gameVersion,
      loader,
      kind,
    );
  }

  async resolveChain(
    profileId: string,
    source: "modrinth" | "curseforge",
    projectId: string,
    kind: ContentKind,
    rootVersionId?: string,
  ): Promise<ResolvedCatalogChain> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new Error("Java profile not found");
    const loader = profile.loader === "vanilla" ? "" : profile.loader;
    const projectCache = new Map<string, CatalogProject>();
    const versionCache = new Map<string, CatalogVersion>();
    const missing: string[] = [];
    const warnings: string[] = [];
    const entries: ResolvedCatalogEntry[] = [];
    const visited = new Set<string>();

    const fetchProject = async (id: string): Promise<CatalogProject> => {
      const cached = projectCache.get(id);
      if (cached) return cached;
      const project = await serviceFor(source).project(id, kind);
      projectCache.set(id, project);
      return project;
    };
    const fetchVersion = async (
      id: string,
      projectKey: string,
    ): Promise<CatalogVersion | null> => {
      const key = `${projectKey}:${id}`;
      const cached = versionCache.get(key);
      if (cached) return cached;
      try {
        const version = await this.version(source, id);
        versionCache.set(key, version);
        return version;
      } catch {
        return null;
      }
    };

    const rootVersion = rootVersionId
      ? await fetchVersion(rootVersionId, projectId)
      : await this.compatibleVersion(
          source,
          projectId,
          profile.gameVersion,
          loader,
          kind,
        );
    if (!rootVersion) {
      throw new Error(
        `No compatible version was found for Minecraft ${profile.gameVersion}${loader ? ` on ${loader}` : ""}.`,
      );
    }

    const walk = async (
      currentProjectId: string,
      explicitVersionId: string | undefined,
      depth: number,
      required: boolean,
    ): Promise<ResolvedCatalogEntry | null> => {
      if (visited.has(currentProjectId) || entries.length > 48) return null;
      visited.add(currentProjectId);
      let version = explicitVersionId
        ? await fetchVersion(explicitVersionId, currentProjectId)
        : null;
      if (!version) {
        version = await this.compatibleVersion(
          source,
          currentProjectId,
          profile.gameVersion,
          loader,
          kind,
        );
      }
      if (!version) {
        missing.push(currentProjectId);
        return null;
      }
      if (
        version.gameVersions.length > 0 &&
        !version.gameVersions.includes(profile.gameVersion)
      ) {
        warnings.push(
          `${currentProjectId} does not list Minecraft ${profile.gameVersion}; it may not load.`,
        );
      }
      const project = await fetchProject(currentProjectId);
      const entry: ResolvedCatalogEntry = {
        project,
        version,
        depth,
        required,
      };
      entries.push(entry);
      for (const dependency of version.dependencies) {
        if (dependency.kind === "required") {
          await walk(dependency.projectId, dependency.versionId, depth + 1, true);
        } else if (dependency.kind === "optional") {
          warnings.push(
            `Optional dependency available: ${dependency.projectId}`,
          );
        }
      }
      return entry;
    };

    const root = await walk(rootVersion.projectId, rootVersion.id, 0, true);
    if (!root) {
      throw new Error("The selected version could not be resolved.");
    }
    return { root, entries, missing, warnings };
  }

  async plan(
    profileId: string,
    source: "modrinth" | "curseforge",
    projectId: string,
    kind: ContentKind,
  ): Promise<InstallPlan> {
    const chain = await this.resolveChain(profileId, source, projectId, kind);
    return {
      rootProjectId: chain.root.project.id,
      entries: chain.entries.map((entry) => ({
        projectId: entry.project.id,
        title: entry.project.name,
        required: entry.required,
        version: entry.version,
        state: "resolved" as const,
      })),
      warnings: chain.warnings,
    };
  }
}

export const catalogService = new CatalogService();

export function catalogLoaderLabel(profile: JavaProfile): string {
  return profile.loader === "vanilla" ? "" : profile.loader;
}
