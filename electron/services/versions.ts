import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import {
  MOJANG_MANIFEST_URL,
  MOJANG_RESOURCES_URL,
} from "../../src/shared/constants";
import {
  assetsDir,
  ensureDir,
  librariesDir,
  resolveDataRoot,
  versionsDir,
  assetPath,
  libraryPath,
  fileExists,
} from "./paths";
import { fetchJson, downloads, DownloadTask } from "./http";
import { logger } from "./logger";
import { settingsService } from "./settings";
import {
  mapOsArch,
  mapOsName,
  mergeVersionJson,
  planLibraries,
  type MergedVersion,
  type VersionJson,
} from "../core/mojang";
import { isVersionAtLeast } from "../core/mojang";
import type {
  MojangVersionSummary,
} from "../../src/shared/types";
import os from "node:os";

interface Manifest {
  latest: { release: string; snapshot: string };
  versions: {
    id: string;
    type: string;
    url: string;
    releaseTime: string;
    time: string;
  }[];
}

interface AssetIndexDocument {
  id: string;
  objects: Record<string, { hash: string; size: number }>;
  virtual?: boolean;
  map_to_resources?: boolean;
}

interface VersionChain {
  merged: MergedVersion;
  jarVersionId: string;
  versionDir: string;
}

const MANIFEST_TTL = 10 * 60 * 1000;

class VersionService extends EventEmitter {
  private manifest: Manifest | null = null;
  private manifestFetchedAt = 0;
  private versionCache = new Map<string, VersionJson>();

  private manifestCacheFile(): string {
    return path.join(resolveDataRoot(settingsService.get()), "version_manifest_v2.json");
  }

  async loadManifest(force = false): Promise<Manifest> {
    const settings = await settingsService.load();
    const dataRoot = resolveDataRoot(settings);
    ensureDir(dataRoot);
    if (this.manifest && !force && Date.now() - this.manifestFetchedAt < MANIFEST_TTL) {
      return this.manifest;
    }
    try {
      const manifest = await fetchJson<Manifest>(MOJANG_MANIFEST_URL, {}, 2);
      this.manifest = manifest;
      this.manifestFetchedAt = Date.now();
      fs.writeFileSync(this.manifestCacheFile(), JSON.stringify(manifest));
      return manifest;
    } catch (error) {
      const cached = this.readManifestCache();
      if (cached) {
        logger.warn("versions", "Using cached Mojang version manifest");
        this.manifest = cached;
        this.manifestFetchedAt = Date.now();
        return cached;
      }
      throw error;
    }
  }

  private readManifestCache(): Manifest | null {
    try {
      const text = fs.readFileSync(this.manifestCacheFile(), "utf8");
      return JSON.parse(text) as Manifest;
    } catch {
      return null;
    }
  }

  async listVersions(includeSnapshots: boolean): Promise<MojangVersionSummary[]> {
    const manifest = await this.loadManifest();
    return manifest.versions
      .filter((version) =>
        includeSnapshots ? true : version.type === "release",
      )
      .map((version) => ({
        id: version.id,
        type: version.type as MojangVersionSummary["type"],
        releaseTime: version.releaseTime,
        url: version.url,
      }));
  }

  async latestVersions(): Promise<{ release: string; snapshot: string }> {
    const manifest = await this.loadManifest();
    return manifest.latest;
  }

  async latestReleaseOrFallback(): Promise<string> {
    try {
      return (await this.latestVersions()).release;
    } catch {
      return "1.21.4";
    }
  }

  async getVersionJson(id: string, forceFetch = false): Promise<VersionJson> {
    if (!forceFetch) {
      const cached = this.versionCache.get(id);
      if (cached) return cached;
      const local = this.localVersionJson(id);
      if (local) {
        this.versionCache.set(id, local);
        return local;
      }
    }
    const manifest = await this.loadManifest();
    const entry = manifest.versions.find((version) => version.id === id);
    if (!entry) {
      throw new Error(`Unknown Minecraft version "${id}"`);
    }
    const data = await fetchJson<VersionJson>(entry.url, {}, 2);
    const settings = await settingsService.load();
    const dir = path.join(versionsDir(resolveDataRoot(settings)), id);
    ensureDir(dir);
    if (forceFetch || !fs.existsSync(path.join(dir, `${id}.json`))) {
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2));
    }
    this.versionCache.set(id, data);
    return data;
  }

  localVersionJson(id: string): VersionJson | null {
    const settings = settingsService.get();
    const dataRoot = resolveDataRoot(settings);
    const file = path.join(versionsDir(dataRoot), id, `${id}.json`);
    try {
      const json = JSON.parse(fs.readFileSync(file, "utf8")) as VersionJson;
      return json;
    } catch {
      return null;
    }
  }

  async resolveVersionChain(id: string): Promise<VersionChain> {
    let child = await this.getVersionJson(id);
    let merged: VersionJson = { ...child };
    let jarVersionId = child.id;
    let current = child;
    let depth = 0;
    while (current.inheritsFrom && depth < 5) {
      const parent = await this.getVersionJson(current.inheritsFrom);
      merged = mergeVersionJson(parent, merged as VersionJson);
      if (!child.downloads?.client && parent.downloads?.client) {
        jarVersionId = parent.id;
      }
      current = parent;
      depth += 1;
    }
    const settings = await settingsService.load();
    const dataRoot = resolveDataRoot(settings);
    return {
      merged: merged as MergedVersion,
      jarVersionId,
      versionDir: path.join(versionsDir(dataRoot), id),
    };
  }

  async ensureVersionInstalled(id: string): Promise<VersionChain> {
    const settings = await settingsService.load();
    const dataRoot = resolveDataRoot(settings);
    const chain = await this.resolveVersionChain(id);
    const librariesRoot = librariesDir(dataRoot);
    const assetsRoot = assetsDir(dataRoot);
    const jobId = `version:${id}`;
    const libTasks = this.buildLibraryTasks(chain.merged, librariesRoot);
    const clientTask = this.buildClientTask(chain, dataRoot);
    const loggingTasks = this.buildLoggingTasks(chain.merged, assetsRoot);
    const assetTasks = await this.buildAssetTasks(chain.merged, assetsRoot, jobId);
    const tasks = [
      ...(clientTask ? [clientTask] : []),
      ...libTasks,
      ...loggingTasks,
      ...assetTasks,
    ];
    logger.info("versions", `Ensuring ${id}: ${tasks.length} files`);
    const result = await downloads.downloadBatch(
      jobId,
      "install",
      `Installing Minecraft ${id}`,
      tasks,
      settings.downloadConcurrency,
    );
    if (result.errors.length > 0) {
      throw new Error(
        `Some Minecraft files could not be downloaded: ${result.errors[0]}`,
      );
    }
    await this.ensureVirtualAssets(chain.merged, assetsRoot);
    return chain;
  }

  private buildClientTask(
    chain: VersionChain,
    dataRoot: string,
  ): DownloadTask | null {
    const client = chain.merged.downloads?.client;
    if (!client) return null;
    const dir = path.join(versionsDir(dataRoot), chain.jarVersionId);
    ensureDir(dir);
    return {
      url: client.url,
      destination: path.join(dir, `${chain.jarVersionId}.jar`),
      sha1: client.sha1,
      size: client.size,
      label: `client ${chain.jarVersionId}.jar`,
    };
  }

  private buildLibraryTasks(
    version: MergedVersion,
    librariesRoot: string,
  ): DownloadTask[] {
    const platform = mapOsName(process.platform);
    const arch = mapOsArch(process.arch);
    const tasks: DownloadTask[] = [];
    const seen = new Set<string>();
    const push = (relative: string, meta: { url?: string; sha1?: string; size?: number }): void => {
      if (!relative || seen.has(relative)) return;
      seen.add(relative);
      tasks.push({
        url: meta.url || `https://libraries.minecraft.net/${relative}`,
        destination: libraryPath(librariesRoot, relative),
        sha1: meta.sha1,
        size: meta.size,
        label: `library ${path.basename(relative)}`,
      });
    };
    const plan = planLibraries(
      version.libraries ?? [],
      platform,
      arch,
      os.release(),
    );
    for (const native of plan.nativeArchives) {
      const library = (version.libraries ?? []).find(
        (entry) => entry.downloads?.artifact?.path === native.path ||
          entry.downloads?.classifiers &&
          Object.values(entry.downloads.classifiers).some(
            (classifier) => classifier.path === native.path,
          ),
      );
      const artifact = library?.downloads?.artifact;
      if (artifact?.path === native.path) {
        push(native.path, artifact);
        continue;
      }
      const classifier = library?.downloads?.classifiers
        ? Object.values(library.downloads.classifiers).find(
            (entry) => entry.path === native.path,
          )
        : undefined;
      if (classifier) push(native.path, classifier);
    }
    for (const library of version.libraries ?? []) {
      const artifact = library.downloads?.artifact;
      if (artifact?.path) {
        push(artifact.path, artifact);
      }
      for (const classifier of Object.values(library.downloads?.classifiers ?? {})) {
        if (classifier?.path) push(classifier.path, classifier);
      }
    }
    return tasks;
  }

  private buildLoggingTasks(
    version: MergedVersion,
    assetsRoot: string,
  ): DownloadTask[] {
    const file = version.logging?.client?.file;
    if (!file) return [];
    return [
      {
        url: file.url,
        destination: path.join(assetsRoot, "log_configs", file.id),
        sha1: file.sha1,
        size: file.size,
        label: "logging configuration",
      },
    ];
  }

  private async buildAssetTasks(
    version: MergedVersion,
    assetsRoot: string,
    jobId: string,
  ): Promise<DownloadTask[]> {
    const index = version.assetIndex;
    if (!index) return [];
    const indexFile = path.join(assetsRoot, "indexes", `${index.id}.json`);
    if (!fileExists(indexFile)) {
      ensureDir(path.dirname(indexFile));
      await downloads.downloadOne({
        url: index.url,
        destination: indexFile,
        sha1: index.sha1,
        size: index.size,
        label: `asset index ${index.id}`,
      });
    }
    let document: AssetIndexDocument;
    try {
      document = JSON.parse(fs.readFileSync(indexFile, "utf8")) as AssetIndexDocument;
    } catch {
      throw new Error(`Asset index ${index.id} is corrupt`);
    }
    const tasks: DownloadTask[] = [];
    for (const [name, object] of Object.entries(document.objects)) {
      const destination = assetPath(assetsRoot, object.hash);
      if (fileExists(destination)) {
        try {
          if (fs.statSync(destination).size === object.size) continue;
        } catch {
          void 0;
        }
      }
      tasks.push({
        url: `${MOJANG_RESOURCES_URL}/${object.hash.slice(0, 2)}/${object.hash}`,
        destination,
        sha1: object.hash,
        size: object.size,
        label: `asset ${name}`,
      });
    }
    if (tasks.length === 0) {
      logger.info("versions", `Asset index ${index.id} is complete`);
    }
    void jobId;
    return tasks;
  }

  private async ensureVirtualAssets(
    version: MergedVersion,
    assetsRoot: string,
  ): Promise<void> {
    const index = version.assetIndex;
    if (!index) return;
    const indexFile = path.join(assetsRoot, "indexes", `${index.id}.json`);
    if (!fileExists(indexFile)) return;
    let document: AssetIndexDocument;
    try {
      document = JSON.parse(fs.readFileSync(indexFile, "utf8")) as AssetIndexDocument;
    } catch {
      return;
    }
    const isLegacy =
      version.assets === "legacy" ||
      document.virtual ||
      document.map_to_resources ||
      !isVersionAtLeast(version.id, "1.7.3");
    if (!isLegacy) return;
    const virtualRoot = path.join(assetsRoot, "virtual", version.assets ?? "legacy");
    for (const [name, object] of Object.entries(document.objects)) {
      const destination = path.join(virtualRoot, name);
      if (fileExists(destination)) continue;
      ensureDir(path.dirname(destination));
      const source = assetPath(assetsRoot, object.hash);
      try {
        fs.copyFileSync(source, destination);
      } catch {
        void 0;
      }
    }
  }

  clientJarPath(chain: VersionChain, dataRoot: string): string {
    return path.join(versionsDir(dataRoot), chain.jarVersionId, `${chain.jarVersionId}.jar`);
  }

  async readAssetObjects(
    version: MergedVersion,
    assetsRoot: string,
  ): Promise<AssetIndexDocument | null> {
    const index = version.assetIndex;
    if (!index) return null;
    try {
      return JSON.parse(
        fs.readFileSync(path.join(assetsRoot, "indexes", `${index.id}.json`), "utf8"),
      ) as AssetIndexDocument;
    } catch {
      return null;
    }
  }
}

export const versionService = new VersionService();
