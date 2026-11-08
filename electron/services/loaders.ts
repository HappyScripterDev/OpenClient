import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  FABRIC_META_URL,
  FORGE_PROMOTIONS_URL,
  NEOFORGE_MAVEN_URL,
  QUILT_META_URL,
} from "../../src/shared/constants";
import {
  ensureDir,
  resolveDataRoot,
  versionsDir,
} from "./paths";
import { fetchJson, downloads } from "./http";
import { settingsService } from "./settings";
import { profilesService } from "./profiles";
import { versionService } from "./versions";
import { javaService, javaMajorForMinecraftVersion } from "./java";
import { logger } from "./logger";
import type { JavaProfile, LoaderType } from "../../src/shared/types";

const execFileAsync = promisify(execFile);

type ModdedLoader = "fabric" | "quilt" | "forge" | "neoforge";

interface FabricLoaderEntry {
  version: string;
  stable?: boolean;
}

interface QuiltLoaderEntry {
  version: string;
}

interface FabricProfile {
  id: string;
  inheritsFrom?: string;
  mainClass?: string;
}

interface Promotions {
  promotions: Record<string, string>;
}

function compareVersions(a: string, b: string): number {
  const split = (value: string): number[] =>
    value.split(/[.+-]/).map((part) => Number(part) || 0);
  const left = split(a);
  const right = split(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

class LoaderService {
  async listLoaderVersions(
    loader: ModdedLoader,
    gameVersion: string,
  ): Promise<string[]> {
    if (loader === "fabric") {
      const entries = await fetchJson<FabricLoaderEntry[]>(
        `${FABRIC_META_URL}/versions/loader`,
        {},
        2,
      );
      return entries
        .filter((entry) => entry.stable !== false)
        .map((entry) => entry.version)
        .sort((a, b) => compareVersions(b, a));
    }
    if (loader === "quilt") {
      const entries = await fetchJson<QuiltLoaderEntry[]>(
        `${QUILT_META_URL}/versions/loader`,
        {},
        2,
      );
      return entries
        .map((entry) => entry.version)
        .sort((a, b) => compareVersions(b, a));
    }
    if (loader === "forge") {
      const promotions = await fetchJson<Promotions>(FORGE_PROMOTIONS_URL, {}, 2);
      const versions = new Set<string>();
      for (const prefix of ["recommended", "latest"]) {
        const version = promotions.promotions[`${gameVersion}-${prefix}`];
        if (version) versions.add(version);
      }
      return [...versions].sort((a, b) => compareVersions(b, a));
    }
    const metadata = await fetchJsonText(
      `${NEOFORGE_MAVEN_URL}/maven-metadata.xml`,
    );
    const prefix = this.neoforgePrefix(gameVersion);
    const versions = [...metadata.matchAll(/<version>([^<]+)<\/version>/g)]
      .map((match) => match[1])
      .filter((version) => version.startsWith(prefix))
      .sort((a, b) => compareVersions(b, a));
    return versions;
  }

  private neoforgePrefix(gameVersion: string): string {
    const match = gameVersion.match(/^1\.(\d+)(?:\.(\d+))?/);
    if (!match) return "";
    return `${Number(match[1])}.${Number(match[2] ?? 0)}.`;
  }

  async installLoader(
    profileId: string,
    loader: LoaderType,
    requestedVersion?: string,
  ): Promise<void> {
    const profile = profilesService.find(profileId);
    if (!profile || profile.edition !== "java") {
      throw new Error("Java profile not found");
    }
    if (loader === "vanilla") {
      throw new Error("Vanilla needs no loader installation");
    }
    const manifest = await versionService.loadManifest();
    if (!manifest.versions.some((version) => version.id === profile.gameVersion)) {
      throw new Error(`Minecraft ${profile.gameVersion} is not in the Mojang manifest`);
    }
    const settings = await settingsService.load();
    const dataRoot = resolveDataRoot(settings);
    const available = await this.listLoaderVersions(loader, profile.gameVersion);
    const version = requestedVersion || available[0];
    if (!version) {
      throw new Error(
        `${loader} has no build for Minecraft ${profile.gameVersion}`,
      );
    }
    logger.info("loaders", `Installing ${loader} ${version} for ${profile.gameVersion}`);
    let versionId: string;
    if (loader === "fabric" || loader === "quilt") {
      versionId = await this.installMetaLoader(loader, profile.gameVersion, version, dataRoot);
    } else {
      versionId = await this.installInstallerLoader(
        loader,
        profile.gameVersion,
        version,
        dataRoot,
      );
    }
    await profilesService.update(profileId, {
      loader,
      loaderVersion: version,
      loaderVersionId: versionId,
    });
    logger.info("loaders", `Installed ${loader} ${version} as ${versionId}`);
  }

  private async installMetaLoader(
    loader: "fabric" | "quilt",
    gameVersion: string,
    loaderVersion: string,
    dataRoot: string,
  ): Promise<string> {
    const base =
      loader === "fabric"
        ? `${FABRIC_META_URL}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
        : `${QUILT_META_URL}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
    const profile = await fetchJson<FabricProfile>(base, {}, 2);
    if (!profile.id) throw new Error(`${loader} returned an invalid profile`);
    const dir = path.join(versionsDir(dataRoot), profile.id);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, `${profile.id}.json`), JSON.stringify(profile, null, 2));
    return profile.id;
  }

  private async installInstallerLoader(
    loader: "forge" | "neoforge",
    gameVersion: string,
    loaderVersion: string,
    dataRoot: string,
  ): Promise<string> {
    const installerUrl =
      loader === "forge"
        ? `https://maven.minecraftforge.net/net/minecraftforge/forge/${gameVersion}-${loaderVersion}/forge-${gameVersion}-${loaderVersion}-installer.jar`
        : `${NEOFORGE_MAVEN_URL}/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
    const cacheDir = path.join(dataRoot, "installers");
    ensureDir(cacheDir);
    const installerPath = path.join(
      cacheDir,
      `${loader}-${loaderVersion}-installer.jar`,
    );
    const result = await downloads.downloadBatch(
      `loader:${loader}:${gameVersion}:${loaderVersion}`,
      "loader",
      `Downloading ${loader} ${loaderVersion}`,
      [
        {
          url: installerUrl,
          destination: installerPath,
          label: `${loader} installer`,
        },
      ],
      1,
    );
    if (result.errors.length > 0) {
      throw new Error(`Loader installer download failed: ${result.errors[0]}`);
    }
    const launcherProfiles = path.join(dataRoot, "launcher_profiles.json");
    if (!fs.existsSync(launcherProfiles)) {
      fs.writeFileSync(
        launcherProfiles,
        JSON.stringify({ profiles: {}, settings: {}, version: 3 }, null, 2),
      );
    }
    ensureDir(versionsDir(dataRoot));
    const requiredJava = javaMajorForMinecraftVersion(gameVersion);
    const runtime = await javaService.ensureRuntime(requiredJava);
    logger.info("loaders", `Running ${loader} installer with Java ${runtime.major}`);
    try {
      const { stdout, stderr } = await execFileAsync(
        runtime.path,
        ["-jar", installerPath, "--installClient", dataRoot],
        { timeout: 900000, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      );
      const output = `${stdout}\n${stderr}`.trim();
      if (output) {
        logger.info("loaders", output.slice(-4000));
      }
    } catch (error) {
      const detail = error as { stdout?: string; stderr?: string; message?: string };
      const output = `${detail.stdout ?? ""}\n${detail.stderr ?? ""}`.trim();
      logger.error("loaders", `Installer failed: ${output.slice(-2000) || detail.message || ""}`);
      throw new Error(
        `The ${loader} installer failed. Open the log for the installer output.`,
      );
    }
    const expected =
      loader === "forge"
        ? `${gameVersion}-forge-${loaderVersion}`
        : `neoforge-${loaderVersion}`;
    if (fs.existsSync(path.join(versionsDir(dataRoot), expected, `${expected}.json`))) {
      return expected;
    }
    const found = this.findRecentLoaderVersion(gameVersion, loader);
    if (!found) {
      throw new Error(
        `The ${loader} installer finished but no version profile was created.`,
      );
    }
    return found;
  }

  private findRecentLoaderVersion(
    gameVersion: string,
    loader: "forge" | "neoforge",
  ): string | null {
    const root = versionsDir(resolveDataRoot(settingsService.get()));
    if (!fs.existsSync(root)) return null;
    const cutoff = Date.now() - 15 * 60 * 1000;
    const candidates: { id: string; modified: number }[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const jsonFile = path.join(root, entry.name, `${entry.name}.json`);
      try {
        const stat = fs.statSync(jsonFile);
        if (stat.mtimeMs < cutoff) continue;
        const json = JSON.parse(fs.readFileSync(jsonFile, "utf8")) as {
          inheritsFrom?: string;
          id?: string;
        };
        if (json.inheritsFrom !== gameVersion && json.id !== gameVersion) continue;
        if (loader === "forge" && !/forge/i.test(entry.name)) continue;
        if (loader === "neoforge" && !/neoforge/i.test(entry.name)) continue;
        candidates.push({ id: entry.name, modified: stat.mtimeMs });
      } catch {
        void 0;
      }
    }
    candidates.sort((a, b) => b.modified - a.modified);
    return candidates[0]?.id ?? null;
  }

  async resolveLaunchVersion(profile: JavaProfile): Promise<string> {
    if (profile.loader === "vanilla") return profile.gameVersion;
    if (profile.loaderVersionId) {
      const json = versionService.localVersionJson(profile.loaderVersionId);
      if (json) return profile.loaderVersionId;
    }
    const loader = profile.loader as ModdedLoader;
    const versions = await this.listLoaderVersions(loader, profile.gameVersion);
    const version = profile.loaderVersion || versions[0];
    if (!version) {
      throw new Error(`No ${loader} build exists for Minecraft ${profile.gameVersion}`);
    }
    const dataRoot = resolveDataRoot(settingsService.get());
    let versionId: string;
    if (loader === "fabric" || loader === "quilt") {
      versionId = await this.installMetaLoader(loader, profile.gameVersion, version, dataRoot);
    } else {
      const expected =
        loader === "forge"
          ? `${profile.gameVersion}-forge-${version}`
          : `neoforge-${version}`;
      if (fs.existsSync(path.join(versionsDir(dataRoot), expected, `${expected}.json`))) {
        versionId = expected;
      } else {
        versionId = await this.installInstallerLoader(
          loader,
          profile.gameVersion,
          version,
          dataRoot,
        );
      }
    }
    await profilesService.update(profile.id, {
      loaderVersion: version,
      loaderVersionId: versionId,
    });
    return versionId;
  }
}

async function fetchJsonText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "OpenClient/1.0" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}`);
  return response.text();
}

export const loaderService = new LoaderService();
export type { ModdedLoader };
export type { LoaderType };
