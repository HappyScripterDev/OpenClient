import fs from "node:fs";
import path from "node:path";
import { downloads } from "./http";
import { profilesService } from "./profiles";
import { catalogService, type ResolvedCatalogEntry } from "./catalog";
import { logger } from "./logger";
import { randomId, safeName } from "./paths";
import { ServiceError } from "./errors";
import type {
  ContentKind,
  InstalledContent,
  JavaProfile,
} from "../../src/shared/types";

const FOLDERS: Record<ContentKind, string> = {
  mod: "mods",
  resourcepack: "resourcepacks",
  shader: "shaderpacks",
};

function contentFolder(profile: JavaProfile, kind: ContentKind): string {
  return path.join(profile.gameDir, FOLDERS[kind]);
}

function arrayFor(profile: JavaProfile, kind: ContentKind): InstalledContent[] {
  if (kind === "mod") return profile.mods;
  if (kind === "resourcepack") return profile.resourcePacks;
  return profile.shaderPacks;
}

function normalizeFileName(fileName: string, kind: ContentKind, fallback: string): string {
  const base = safeName(path.basename(fileName || fallback));
  if (!base) return kind === "mod" ? "mod.jar" : "pack.zip";
  if (kind === "mod" && !base.toLowerCase().endsWith(".jar")) return `${base}.jar`;
  if (kind !== "mod" && !base.toLowerCase().endsWith(".zip")) return `${base}.zip`;
  return base;
}

class ContentService {
  async list(profileId: string): Promise<InstalledContent[]> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    return [...profile.mods, ...profile.resourcePacks, ...profile.shaderPacks];
  }

  async install(
    profileId: string,
    source: "modrinth" | "curseforge",
    versionId: string,
    kind: ContentKind,
  ): Promise<InstalledContent> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    if (kind === "mod" && profile.loader === "vanilla") {
      throw new ServiceError(
        "UNSUPPORTED",
        "Install Fabric, Quilt, Forge or NeoForge on this profile before adding mods.",
      );
    }
    const rootVersion = await catalogService.version(source, versionId);
    const chain = await catalogService.resolveChain(
      profileId,
      source,
      rootVersion.projectId,
      kind,
      rootVersion.id,
    );
    const ordered = [...chain.entries].sort((a, b) => b.depth - a.depth);
    let rootRecord: InstalledContent | null = null;
    const skipped: string[] = [];
    for (const entry of ordered) {
      const isRoot = entry.project.id === chain.root.project.id;
      const currentProfile = profilesService.findJava(profileId);
      if (!currentProfile) throw new ServiceError("NOT_FOUND", "Profile disappeared");
      const existing = arrayFor(currentProfile, kind).find(
        (content) => content.projectId === entry.project.id,
      );
      if (existing && !isRoot) {
        skipped.push(entry.project.name);
        continue;
      }
      if (existing && isRoot && existing.versionId === entry.version.id) {
        rootRecord = existing;
        continue;
      }
      if (existing && isRoot) {
        await this.removeRecord(profileId, existing, kind);
      }
      const record = await this.installEntry(profileId, entry, kind);
      if (isRoot) rootRecord = record;
    }
    if (!rootRecord) {
      throw new ServiceError("INTERNAL", "Installation did not produce a project record");
    }
    if (chain.missing.length > 0) {
      logger.warn(
        "content",
        `Some required dependencies were not found: ${chain.missing.join(", ")}`,
      );
    }
    if (skipped.length > 0) {
      logger.info("content", `Skipped already installed dependencies: ${skipped.join(", ")}`);
    }
    logger.info("content", `Installed ${rootRecord.name} ${rootRecord.versionNumber}`);
    return rootRecord;
  }

  private async installEntry(
    profileId: string,
    entry: ResolvedCatalogEntry,
    kind: ContentKind,
  ): Promise<InstalledContent> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    if (!entry.version.downloadUrl) {
      throw new ServiceError(
        "UNSUPPORTED",
        `${entry.project.name} does not allow third-party downloads. Use the official project page instead.`,
      );
    }
    const folder = contentFolder(profile, kind);
    fs.mkdirSync(folder, { recursive: true });
    const fileName = normalizeFileName(
      entry.version.fileName,
      kind,
      `${entry.project.slug}-${entry.version.versionNumber}`,
    );
    const destination = path.resolve(folder, fileName);
    if (!destination.startsWith(path.resolve(folder) + path.sep)) {
      throw new ServiceError("INVALID_INPUT", "Invalid file name from catalog");
    }
    const staging = `${destination}.download`;
    const result = await downloads.downloadBatch(
      `content:${profileId}:${entry.project.id}`,
      "content",
      `Installing ${entry.project.name}`,
      [
        {
          url: entry.version.downloadUrl,
          destination: staging,
          sha1: entry.version.hashAlgo === "sha1" ? entry.version.hash : undefined,
          sha512: entry.version.hashAlgo === "sha512" ? entry.version.hash : undefined,
          md5: entry.version.hashAlgo === "md5" ? entry.version.hash : undefined,
          size: entry.version.size,
          label: fileName,
        },
      ],
      1,
    );
    if (result.errors.length > 0) {
      throw new ServiceError("DOWNLOAD_FAILED", result.errors[0]);
    }
    if (fs.existsSync(destination)) {
      fs.rmSync(destination, { force: true });
    }
    fs.renameSync(staging, destination);
    const record: InstalledContent = {
      id: randomId("content"),
      kind,
      source: entry.project.source === "local" ? "local" : entry.project.source,
      projectId: entry.project.id,
      slug: entry.project.slug,
      name: entry.project.name,
      author: entry.project.author,
      license: entry.project.license,
      versionId: entry.version.id,
      versionNumber: entry.version.versionNumber,
      fileName,
      gameVersions: entry.version.gameVersions,
      loaders: entry.version.loaders,
      enabled: true,
      sizeBytes: entry.version.size ?? 0,
      installedAt: Date.now(),
    };
    await this.appendRecord(profileId, record);
    return record;
  }

  private async appendRecord(profileId: string, record: InstalledContent): Promise<void> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    const current = arrayFor(profile, record.kind);
    const next = [...current.filter((item) => item.id !== record.id), record];
    await this.writeArray(profileId, record.kind, next);
  }

  private async writeArray(
    profileId: string,
    kind: ContentKind,
    records: InstalledContent[],
  ): Promise<void> {
    if (kind === "mod") await profilesService.update(profileId, { mods: records });
    else if (kind === "resourcepack") {
      await profilesService.update(profileId, { resourcePacks: records });
    } else {
      await profilesService.update(profileId, { shaderPacks: records });
    }
  }

  async remove(profileId: string, contentId: string): Promise<void> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    for (const kind of ["mod", "resourcepack", "shader"] as ContentKind[]) {
      const record = arrayFor(profile, kind).find((item) => item.id === contentId);
      if (record) {
        await this.removeRecord(profileId, record, kind);
        logger.info("content", `Removed ${record.name}`);
        return;
      }
    }
    throw new ServiceError("NOT_FOUND", "Content entry not found");
  }

  private async removeRecord(
    profileId: string,
    record: InstalledContent,
    kind: ContentKind,
  ): Promise<void> {
    const profile = profilesService.findJava(profileId);
    if (!profile) return;
    const folder = contentFolder(profile, kind);
    for (const name of [record.fileName, `${record.fileName}.disabled`]) {
      const file = path.resolve(folder, name);
      if (file.startsWith(path.resolve(folder) + path.sep)) {
        try {
          fs.rmSync(file, { force: true });
        } catch {
          void 0;
        }
      }
    }
    const next = arrayFor(profile, kind).filter((item) => item.id !== record.id);
    await this.writeArray(profileId, kind, next);
  }

  async toggle(
    profileId: string,
    contentId: string,
    enabled: boolean,
  ): Promise<InstalledContent> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    for (const kind of ["mod", "resourcepack", "shader"] as ContentKind[]) {
      const record = arrayFor(profile, kind).find((item) => item.id === contentId);
      if (!record) continue;
      const folder = contentFolder(profile, kind);
      const enabledFile = path.resolve(folder, record.fileName);
      const disabledFile = path.resolve(folder, `${record.fileName}.disabled`);
      if (!enabledFile.startsWith(path.resolve(folder) + path.sep)) {
        throw new ServiceError("INVALID_INPUT", "Invalid stored file name");
      }
      if (enabled) {
        if (fs.existsSync(disabledFile)) {
          fs.renameSync(disabledFile, enabledFile);
        }
      } else if (fs.existsSync(enabledFile)) {
        fs.renameSync(enabledFile, disabledFile);
      }
      const next = arrayFor(profile, kind).map((item) =>
        item.id === contentId ? { ...item, enabled } : item,
      );
      await this.writeArray(profileId, kind, next);
      return { ...record, enabled };
    }
    throw new ServiceError("NOT_FOUND", "Content entry not found");
  }

  async checkUpdates(profileId: string): Promise<InstalledContent[]> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    const loader = profile.loader === "vanilla" ? "" : profile.loader;
    const kinds: ContentKind[] = ["mod", "resourcepack", "shader"];
    const updates: InstalledContent[] = [];
    for (const kind of kinds) {
      const current = arrayFor(profile, kind);
      const next: InstalledContent[] = [];
      for (const entry of current) {
        if (entry.source === "local") {
          next.push(entry);
          continue;
        }
        try {
          const versions = await catalogService.versions(
            entry.source === "curseforge" ? "curseforge" : "modrinth",
            entry.projectId,
            profile.gameVersion,
            loader,
            kind,
          );
          const latest = versions[0];
          if (latest && latest.id !== entry.versionId) {
            const updated: InstalledContent = {
              ...entry,
              updateVersionId: latest.id,
              updateVersionNumber: latest.versionNumber,
            };
            if (!updates.some((item) => item.id === entry.id)) updates.push(updated);
            next.push(updated);
          } else if (entry.updateVersionId) {
            const { updateVersionId: _, updateVersionNumber: __, ...rest } = entry;
            void _;
            void __;
            next.push(rest);
          } else {
            next.push(entry);
          }
        } catch {
          next.push(entry);
        }
      }
      await this.writeArray(profileId, kind, next);
    }
    logger.info("content", `Update check finished for ${profile.name}: ${updates.length} updates`);
    return updates;
  }

  async update(profileId: string, contentId: string): Promise<InstalledContent> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    const all = [...profile.mods, ...profile.resourcePacks, ...profile.shaderPacks];
    const record = all.find((item) => item.id === contentId);
    if (!record) throw new ServiceError("NOT_FOUND", "Content entry not found");
    const source = record.source === "curseforge" ? "curseforge" : "modrinth";
    const loader = profile.loader === "vanilla" ? "" : profile.loader;
    const versionId =
      record.updateVersionId ??
      (
        await catalogService.versions(
          source,
          record.projectId,
          profile.gameVersion,
          loader,
          record.kind,
        )
      )[0]?.id;
    if (!versionId) {
      throw new ServiceError("NOT_FOUND", "No newer version is available");
    }
    await this.removeRecord(profileId, record, record.kind);
    const installed = await this.install(profileId, source, versionId, record.kind);
    if (!record.enabled) {
      return this.toggle(profileId, installed.id, false);
    }
    return installed;
  }

  async importLocal(
    profileId: string,
    kind: ContentKind,
    paths: string[],
  ): Promise<InstalledContent[]> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    if (kind === "mod" && profile.loader === "vanilla") {
      throw new ServiceError("UNSUPPORTED", "Install a mod loader first");
    }
    const folder = contentFolder(profile, kind);
    fs.mkdirSync(folder, { recursive: true });
    const imported: InstalledContent[] = [];
    for (const sourcePath of paths) {
      if (!fs.existsSync(sourcePath)) continue;
      const stat = fs.statSync(sourcePath);
      if (!stat.isFile()) continue;
      const lower = sourcePath.toLowerCase();
      const valid = kind === "mod" ? lower.endsWith(".jar") : lower.endsWith(".zip");
      if (!valid) continue;
      const fileName = normalizeFileName(path.basename(sourcePath), kind, "imported");
      const destination = path.resolve(folder, fileName);
      if (!destination.startsWith(path.resolve(folder) + path.sep)) continue;
      fs.copyFileSync(sourcePath, destination);
      const record: InstalledContent = {
        id: randomId("content"),
        kind,
        source: "local",
        projectId: `local:${fileName}`,
        slug: path.basename(fileName, path.extname(fileName)),
        name: path.basename(fileName, path.extname(fileName)),
        author: "Local file",
        license: "Unknown",
        versionId: "local",
        versionNumber: "Local",
        fileName,
        gameVersions: [],
        loaders: [],
        enabled: true,
        sizeBytes: stat.size,
        installedAt: Date.now(),
      };
      await this.appendRecord(profileId, record);
      imported.push(record);
    }
    if (imported.length === 0) {
      throw new ServiceError(
        "INVALID_INPUT",
        kind === "mod" ? "Select one or more .jar files" : "Select one or more .zip files",
      );
    }
    return imported;
  }

  folderFor(profileId: string, kind: ContentKind): string {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    const folder = contentFolder(profile, kind);
    fs.mkdirSync(folder, { recursive: true });
    return folder;
  }
}

export const contentService = new ContentService();
