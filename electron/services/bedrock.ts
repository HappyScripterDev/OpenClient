import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { shell } from "electron";
import {
  appRoot,
  ensureDir,
  directorySize,
  safeName,
} from "./paths";
import { settingsService } from "./settings";
import { logger } from "./logger";
import { ServiceError } from "./errors";
import { patchOptionsText, readOptionsMap } from "../core/options";
import type {
  BedrockContentEntry,
  BedrockOptionEntry,
  BedrockStatus,
  BedrockWorldEntry,
} from "../../src/shared/types";

const execFileAsync = promisify(execFile);

const PACKAGE_NAMES = [
  "Microsoft.MinecraftUWP",
  "Microsoft.MinecraftWindowsBeta",
];

const CONTENT_FOLDERS = {
  resource: "resource_packs",
  behavior: "behavior_packs",
  skin: "skin_packs",
} as const;

interface DetectedPackage {
  name: string;
  version: string;
  family: string;
  installLocation: string;
}

interface BedrockManifest {
  header?: { name?: string; uuid?: string; version?: number[] };
  modules?: { type?: string; uuid?: string }[];
}

const OPTION_DEFINITIONS: Omit<BedrockOptionEntry, "value">[] = [
  { key: "gfx_viewdistance", label: "Render distance", group: "performance" },
  { key: "gfx_particle_distance", label: "Particle distance", group: "performance" },
  { key: "gfx_fancygraphics", label: "Fancy graphics", group: "visual" },
  { key: "gfx_fancyskies", label: "Fancy skies", group: "visual" },
  { key: "gfx_transparentleaves", label: "Transparent leaves", group: "visual" },
  { key: "gfx_smooth_lighting", label: "Smooth lighting", group: "visual" },
  { key: "gfx_foliage_waving", label: "Foliage waving", group: "visual" },
  { key: "gfx_vsync", label: "Vertical sync", group: "performance" },
  { key: "gfx_msaa", label: "Anti-aliasing (MSAA)", group: "visual" },
  { key: "gfx_texture_filtering", label: "Texture filtering", group: "visual" },
  { key: "gfx_field_of_view", label: "Field of view", group: "gameplay" },
  { key: "gfx_gamma", label: "Brightness", group: "visual" },
];

const OPTION_DEFAULTS: Record<string, string> = {
  gfx_viewdistance: "16",
  gfx_particle_distance: "8",
  gfx_fancygraphics: "1",
  gfx_fancyskies: "1",
  gfx_transparentleaves: "1",
  gfx_smooth_lighting: "1",
  gfx_foliage_waving: "1",
  gfx_vsync: "1",
  gfx_msaa: "2",
  gfx_texture_filtering: "1",
  gfx_field_of_view: "70",
  gfx_gamma: "50",
};

const OPTION_PRESETS: Record<
  "performance" | "balanced" | "quality",
  Record<string, string>
> = {
  performance: {
    gfx_viewdistance: "8",
    gfx_particle_distance: "4",
    gfx_fancygraphics: "0",
    gfx_fancyskies: "0",
    gfx_transparentleaves: "0",
    gfx_smooth_lighting: "0",
    gfx_foliage_waving: "0",
    gfx_vsync: "0",
    gfx_msaa: "0",
    gfx_texture_filtering: "0",
  },
  balanced: {
    gfx_viewdistance: "12",
    gfx_particle_distance: "8",
    gfx_fancygraphics: "1",
    gfx_fancyskies: "1",
    gfx_transparentleaves: "1",
    gfx_smooth_lighting: "1",
    gfx_foliage_waving: "1",
    gfx_vsync: "1",
    gfx_msaa: "2",
    gfx_texture_filtering: "1",
  },
  quality: {
    gfx_viewdistance: "24",
    gfx_particle_distance: "12",
    gfx_fancygraphics: "1",
    gfx_fancyskies: "1",
    gfx_transparentleaves: "1",
    gfx_smooth_lighting: "1",
    gfx_foliage_waving: "1",
    gfx_vsync: "1",
    gfx_msaa: "4",
    gfx_texture_filtering: "1",
  },
};

function readManifest(dir: string): BedrockManifest | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
    ) as BedrockManifest;
  } catch {
    return null;
  }
}

function imageDataUrl(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 2 * 1024 * 1024) return undefined;
    const data = fs.readFileSync(file);
    const extension = path.extname(file).toLowerCase();
    const mime =
      extension === ".png"
        ? "image/png"
        : extension === ".jpeg" || extension === ".jpg"
          ? "image/jpeg"
          : "";
    if (!mime) return undefined;
    return `data:${mime};base64,${data.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function safeExtract(zipPath: string, destination: string): void {
  ensureDir(destination);
  const zip = new AdmZip(zipPath);
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replace(/\\/g, "/");
    if (!name || name.includes("..") || path.isAbsolute(name)) continue;
    const target = path.resolve(destination, name);
    if (!target.startsWith(path.resolve(destination) + path.sep)) continue;
    if (entry.isDirectory) {
      ensureDir(target);
    } else {
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, entry.getData());
    }
  }
}

function findWorldRoot(root: string): string | null {
  if (fs.existsSync(path.join(root, "level.dat"))) return root;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name);
    if (fs.existsSync(path.join(candidate, "level.dat"))) return candidate;
  }
  return null;
}

function findPackRoots(root: string): string[] {
  if (fs.existsSync(path.join(root, "manifest.json"))) return [root];
  const results: string[] = [];
  const walk = (current: string, depth: number): void => {
    if (depth > 2) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(current, entry.name);
      if (fs.existsSync(path.join(candidate, "manifest.json"))) results.push(candidate);
      else walk(candidate, depth + 1);
    }
  };
  walk(root, 0);
  return results;
}

class BedrockService {
  private detection: { at: number; value: BedrockStatus } | null = null;

  async detect(force = false): Promise<BedrockStatus> {
    if (!force && this.detection && Date.now() - this.detection.at < 30000) {
      return this.detection.value;
    }
    const settings = await settingsService.load();
    const notes = [
      "Bedrock Edition has no official mod API. OpenClient manages content packs, worlds and settings, and never injects code into the game.",
      "No combat, movement or inventory automation is included. That would violate server rules.",
      "Bedrock exposes fewer graphics controls than Java. There is no simulation distance or FPS cap in options.txt, so OpenClient does not invent one.",
      "Direct join links add the server in Bedrock and open the game. Whether the game jumps straight into the world depends on the installed Bedrock version.",
      "Some Microsoft Store installations protect their package files. OpenClient only touches the public com.mojang data folder.",
    ];
    if (process.platform !== "win32") {
      const status: BedrockStatus = {
        supported: false,
        platform: process.platform,
        installed: false,
        launcherUri: "minecraft:",
        notes: [
          "Bedrock Edition can be managed only on Windows, where its data folder is accessible.",
          "On other platforms OpenClient still runs Java Edition.",
          ...notes,
        ],
      };
      this.detection = { at: Date.now(), value: status };
      return status;
    }
    const packages = await this.findPackages();
    const gameDir = settings.bedrockGameDir
      ? this.normalizeGameDir(settings.bedrockGameDir)
      : this.detectGameDir();
    const primary = packages[0];
    const status: BedrockStatus = {
      supported: true,
      platform: process.platform,
      installed: Boolean(primary) || Boolean(gameDir && fs.existsSync(gameDir)),
      version: primary?.version,
      packageFamilyName: primary?.family,
      installPath: primary?.installLocation,
      gameDir,
      launcherUri: "minecraft:",
      notes:
        gameDir && !fs.existsSync(gameDir)
          ? ["The com.mojang data folder has not been created yet. Launch Bedrock once to create it.", ...notes]
          : notes,
    };
    this.detection = { at: Date.now(), value: status };
    return status;
  }

  private normalizeGameDir(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return "";
    if (path.basename(trimmed).toLowerCase() === "com.mojang") return trimmed;
    if (fs.existsSync(path.join(trimmed, "com.mojang"))) {
      return path.join(trimmed, "com.mojang");
    }
    return path.join(trimmed, "games", "com.mojang");
  }

  private async findPackages(): Promise<DetectedPackage[]> {
    const collect = PACKAGE_NAMES.map(
      (name) =>
        `$result += Get-AppxPackage -Name '${name}' -ErrorAction SilentlyContinue`,
    ).join("; ");
    const script = `$result = @(); ${collect}; $result | Select-Object Name,Version,PackageFamilyName,InstallLocation | ConvertTo-Json -Compress`;
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", `${script} | ConvertTo-Json -Compress`],
        { timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 },
      );
      const text = stdout.trim();
      if (!text) return [];
      const parsed = JSON.parse(text) as
        | {
            Name?: string;
            Version?: string;
            PackageFamilyName?: string;
            InstallLocation?: string;
          }
        | {
            Name?: string;
            Version?: string;
            PackageFamilyName?: string;
            InstallLocation?: string;
          }[];
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list
        .filter((entry) => entry.Name && entry.PackageFamilyName)
        .map((entry) => ({
          name: entry.Name ?? "",
          version: entry.Version ?? "",
          family: entry.PackageFamilyName ?? "",
          installLocation: entry.InstallLocation ?? "",
        }));
    } catch (error) {
      logger.warn(
        "bedrock",
        `Package detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private detectGameDir(): string {
    const local = process.env["LOCALAPPDATA"] ?? "";
    const candidates: string[] = [];
    if (local) {
      for (const family of [
        "Microsoft.MinecraftUWP_8wekyb3d8bbwe",
        "Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe",
      ]) {
        candidates.push(
          path.join(local, "Packages", family, "LocalState", "games", "com.mojang"),
        );
      }
    }
    for (const base of [
      "C:\\XboxGames",
      path.join(process.env["ProgramFiles"] ?? "", "WindowsApps"),
    ]) {
      if (!base || !fs.existsSync(base)) continue;
      try {
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          candidates.push(
            path.join(base, entry.name, "Content", "games", "com.mojang"),
          );
          candidates.push(
            path.join(base, entry.name, "LocalState", "games", "com.mojang"),
          );
        }
      } catch {
        void 0;
      }
    }
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0] ?? "";
  }

  async contentRoot(create = false): Promise<string> {
    const status = await this.detect();
    if (!status.supported) {
      throw new ServiceError("UNSUPPORTED", "Bedrock is supported only on Windows.");
    }
    if (!status.gameDir) {
      throw new ServiceError(
        "NOT_FOUND",
        "The Bedrock com.mojang folder was not found. Launch Bedrock once or set the data folder in Settings.",
      );
    }
    if (create) ensureDir(status.gameDir);
    return status.gameDir;
  }

  addServerUri(name: string, address: string, port: number): string {
    const value = encodeURIComponent(`${name}|${address}:${port}`);
    return `minecraft://?addExternalServer=${value}`;
  }

  async launch(uri = "minecraft:"): Promise<void> {
    const status = await this.detect();
    if (!status.supported) {
      throw new ServiceError("UNSUPPORTED", "Bedrock is supported only on Windows.");
    }
    if (!status.installed) {
      throw new ServiceError(
        "NOT_FOUND",
        "Bedrock Edition was not detected. Install it from the Microsoft Store or Xbox app first.",
      );
    }
    await shell.openExternal(uri);
    logger.info("bedrock", `Opened ${uri}`);
  }

  private async packEntriesForFolder(
    root: string,
    folder: string,
    kind: BedrockContentEntry["kind"],
  ): Promise<BedrockContentEntry[]> {
    const dir = path.join(root, folder);
    if (!fs.existsSync(dir)) return [];
    const results: BedrockContentEntry[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const manifest = readManifest(full);
        const icon = ["pack_icon.png", "icon.png", "pack_icon.jpg"]
          .map((name) => path.join(full, name))
          .find((file) => fs.existsSync(file));
        results.push({
          id: `${kind}:${entry.name}`,
          name: manifest?.header?.name ?? entry.name,
          kind,
          path: full,
          sizeBytes: directorySize(full),
          packed: false,
          iconPath: icon,
          iconDataUrl: icon ? imageDataUrl(icon) : undefined,
          uuid: manifest?.header?.uuid,
          version: manifest?.header?.version?.join("."),
        });
      } else if (/\.(mcpack|zip)$/i.test(entry.name)) {
        results.push({
          id: `${kind}:${entry.name}`,
          name: path.basename(entry.name, path.extname(entry.name)),
          kind,
          path: full,
          sizeBytes: fs.statSync(full).size,
          packed: true,
        });
      }
    }
    return results;
  }

  async content(): Promise<BedrockContentEntry[]> {
    const root = await this.contentRoot();
    const [resource, behavior, skin] = await Promise.all([
      this.packEntriesForFolder(root, CONTENT_FOLDERS.resource, "resource"),
      this.packEntriesForFolder(root, CONTENT_FOLDERS.behavior, "behavior"),
      this.packEntriesForFolder(root, CONTENT_FOLDERS.skin, "skin"),
    ]);
    return [...resource, ...behavior, ...skin];
  }

  async importContent(paths: string[]): Promise<BedrockContentEntry[]> {
    const root = await this.contentRoot(true);
    const imported: BedrockContentEntry[] = [];
    const stagingRoot = path.join(appRoot(), "cache", "bedrock-import");
    for (const source of paths) {
      if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
      const extension = path.extname(source).toLowerCase();
      if (![".mcpack", ".mcaddon", ".zip"].includes(extension)) {
        continue;
      }
      const staging = path.join(stagingRoot, crypto.randomUUID());
      ensureDir(staging);
      try {
        safeExtract(source, staging);
        const packRoots = findPackRoots(staging);
        for (const packRoot of packRoots) {
          const manifest = readManifest(packRoot);
          if (!manifest) continue;
          const modules = manifest.modules ?? [];
          const hasResources = modules.some((module) => module.type === "resources");
          const hasData = modules.some((module) => module.type === "data");
          const hasSkin = modules.some((module) => module.type === "skin");
          const targets: { folder: string; kind: BedrockContentEntry["kind"] }[] = [];
          if (hasSkin) targets.push({ folder: CONTENT_FOLDERS.skin, kind: "skin" });
          if (hasData) targets.push({ folder: CONTENT_FOLDERS.behavior, kind: "behavior" });
          if (hasResources) targets.push({ folder: CONTENT_FOLDERS.resource, kind: "resource" });
          if (targets.length === 0) {
            targets.push({ folder: CONTENT_FOLDERS.resource, kind: "resource" });
          }
          for (const target of targets) {
            const folderName = `${safeName(manifest.header?.name ?? "pack")}_${crypto
              .randomUUID()
              .slice(0, 8)}`;
            const destination = path.join(root, target.folder, folderName);
            ensureDir(path.dirname(destination));
            fs.cpSync(packRoot, destination, { recursive: true });
            const icon = ["pack_icon.png", "icon.png", "pack_icon.jpg"]
              .map((name) => path.join(destination, name))
              .find((file) => fs.existsSync(file));
            imported.push({
              id: `${target.kind}:${folderName}`,
              name: manifest.header?.name ?? folderName,
              kind: target.kind,
              path: destination,
              sizeBytes: directorySize(destination),
              packed: false,
              iconPath: icon,
              iconDataUrl: icon ? imageDataUrl(icon) : undefined,
              uuid: manifest.header?.uuid,
              version: manifest.header?.version?.join("."),
            });
          }
        }
      } catch (error) {
        logger.error(
          "bedrock",
          `Import failed for ${path.basename(source)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        fs.rmSync(staging, { recursive: true, force: true });
      }
    }
    if (imported.length === 0) {
      throw new ServiceError(
        "INVALID_INPUT",
        "No valid Bedrock pack or world was found in the selected files.",
      );
    }
    return imported;
  }

  async importWorld(filePath: string): Promise<BedrockWorldEntry> {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new ServiceError("NOT_FOUND", "World file not found");
    }
    const staging = path.join(
      appRoot(),
      "cache",
      "bedrock-world-import",
      crypto.randomUUID(),
    );
    ensureDir(staging);
    try {
      safeExtract(filePath, staging);
      const worldRoot = findWorldRoot(staging);
      if (!worldRoot) {
        throw new ServiceError("INVALID_INPUT", "The file does not contain a Bedrock world");
      }
      const world = await this.installWorldFromDirectory(worldRoot);
      logger.info("bedrock", `Imported world ${world.name}`);
      return world;
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }

  async removeContent(id: string): Promise<void> {
    const root = await this.contentRoot();
    const [kind, ...rest] = id.split(":");
    const name = rest.join(":");
    const folder =
      kind === "resource"
        ? CONTENT_FOLDERS.resource
        : kind === "behavior"
          ? CONTENT_FOLDERS.behavior
          : kind === "skin"
            ? CONTENT_FOLDERS.skin
            : null;
    if (!folder || !name) {
      throw new ServiceError("INVALID_INPUT", "Unknown Bedrock content entry");
    }
    const target = path.resolve(root, folder, name);
    if (!target.startsWith(path.resolve(root, folder) + path.sep)) {
      throw new ServiceError("INVALID_INPUT", "Invalid content entry");
    }
    fs.rmSync(target, { recursive: true, force: true });
    logger.info("bedrock", `Removed Bedrock content ${name}`);
  }

  async worlds(): Promise<BedrockWorldEntry[]> {
    const root = await this.contentRoot();
    const worldsDir = path.join(root, "minecraftWorlds");
    if (!fs.existsSync(worldsDir)) return [];
    const backupDir = path.join(appRoot(), "bedrock-backups");
    const results: BedrockWorldEntry[] = [];
    for (const entry of fs.readdirSync(worldsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const folder = path.join(worldsDir, entry.name);
      let name = entry.name;
      try {
        name = fs.readFileSync(path.join(folder, "levelname.txt"), "utf8").trim() || entry.name;
      } catch {
        void 0;
      }
      const levelDat = path.join(folder, "level.dat");
      const icon = ["world_icon.jpeg", "world_icon.jpg", "world_icon.png"]
        .map((file) => path.join(folder, file))
        .find((file) => fs.existsSync(file));
      results.push({
        id: entry.name,
        name,
        folder: entry.name,
        path: folder,
        sizeBytes: directorySize(folder),
        lastModified: fs.existsSync(levelDat)
          ? fs.statSync(levelDat).mtimeMs
          : fs.statSync(folder).mtimeMs,
        iconDataUrl: icon ? imageDataUrl(icon) : undefined,
        hasBackup: fs.existsSync(path.join(backupDir, `${entry.name}.zip`)),
      });
    }
    return results.sort((a, b) => b.lastModified - a.lastModified);
  }

  private async installWorldFromDirectory(source: string): Promise<BedrockWorldEntry> {
    const root = await this.contentRoot(true);
    const worldsDir = path.join(root, "minecraftWorlds");
    ensureDir(worldsDir);
    const id = crypto.randomUUID();
    const destination = path.join(worldsDir, id);
    fs.cpSync(source, destination, { recursive: true });
    let name: string = id;
    try {
      name = fs.readFileSync(path.join(destination, "levelname.txt"), "utf8").trim() || id;
    } catch {
      void 0;
    }
    const icon = ["world_icon.jpeg", "world_icon.jpg", "world_icon.png"]
      .map((file) => path.join(destination, file))
      .find((file) => fs.existsSync(file));
    return {
      id,
      name,
      folder: id,
      path: destination,
      sizeBytes: directorySize(destination),
      lastModified: Date.now(),
      iconDataUrl: icon ? imageDataUrl(icon) : undefined,
      hasBackup: false,
    };
  }

  private async worldPath(id: string): Promise<string> {
    const worlds = await this.worlds();
    const world = worlds.find((entry) => entry.id === id);
    if (!world) throw new ServiceError("NOT_FOUND", "World not found");
    return world.path;
  }

  async backupWorld(id: string): Promise<string> {
    const worldPath = await this.worldPath(id);
    const backupDir = path.join(appRoot(), "bedrock-backups");
    ensureDir(backupDir);
    const destination = path.join(backupDir, `${path.basename(worldPath)}.zip`);
    const zip = new AdmZip();
    zip.addLocalFolder(worldPath);
    zip.writeZip(destination);
    logger.info("bedrock", `Backed up world ${path.basename(worldPath)}`);
    return destination;
  }

  async restoreWorld(id: string): Promise<void> {
    const worldPath = await this.worldPath(id);
    const backup = path.join(appRoot(), "bedrock-backups", `${path.basename(worldPath)}.zip`);
    if (!fs.existsSync(backup)) {
      throw new ServiceError("NOT_FOUND", "No backup exists for this world");
    }
    fs.rmSync(worldPath, { recursive: true, force: true });
    safeExtract(backup, worldPath);
    logger.info("bedrock", `Restored world ${id}`);
  }

  async duplicateWorld(id: string): Promise<BedrockWorldEntry> {
    const source = await this.worldPath(id);
    const root = await this.contentRoot();
    const worldsDir = path.join(root, "minecraftWorlds");
    const newId = crypto.randomUUID();
    const destination = path.join(worldsDir, newId);
    fs.cpSync(source, destination, { recursive: true });
    let name: string = newId;
    try {
      name = fs.readFileSync(path.join(destination, "levelname.txt"), "utf8").trim() || newId;
      fs.writeFileSync(path.join(destination, "levelname.txt"), `${name} Copy`, "utf8");
      name = `${name} Copy`;
    } catch {
      void 0;
    }
    const icon = ["world_icon.jpeg", "world_icon.jpg", "world_icon.png"]
      .map((file) => path.join(destination, file))
      .find((file) => fs.existsSync(file));
    logger.info("bedrock", `Duplicated world ${id}`);
    return {
      id: newId,
      name,
      folder: newId,
      path: destination,
      sizeBytes: directorySize(destination),
      lastModified: Date.now(),
      iconDataUrl: icon ? imageDataUrl(icon) : undefined,
      hasBackup: false,
    };
  }

  async exportWorld(id: string, destination: string): Promise<string> {
    const worldPath = await this.worldPath(id);
    const zip = new AdmZip();
    zip.addLocalFolder(worldPath);
    zip.writeZip(destination);
    return destination;
  }

  async deleteWorld(id: string): Promise<void> {
    const worldPath = await this.worldPath(id);
    fs.rmSync(worldPath, { recursive: true, force: true });
    logger.info("bedrock", `Deleted world ${id}`);
  }

  private optionsPath(root: string): string {
    return path.join(root, "minecraftpe", "options.txt");
  }

  private optionsBackupPath(root: string): string {
    return path.join(root, "minecraftpe", "options.txt.openclient-backup");
  }

  private async readOptions(root: string): Promise<Record<string, string>> {
    const file = this.optionsPath(root);
    if (!fs.existsSync(file)) return {};
    return readOptionsMap(fs.readFileSync(file, "utf8"));
  }

  private async writeOptions(root: string, patch: Record<string, string>): Promise<void> {
    const file = this.optionsPath(root);
    ensureDir(path.dirname(file));
    if (!fs.existsSync(file)) fs.writeFileSync(file, "", "utf8");
    const backup = this.optionsBackupPath(root);
    if (!fs.existsSync(backup)) {
      fs.copyFileSync(file, backup);
    }
    const current = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, patchOptionsText(current, patch), "utf8");
  }

  private buildOptionEntries(values: Record<string, string>): BedrockOptionEntry[] {
    return OPTION_DEFINITIONS.map((definition) => ({
      ...definition,
      value: values[definition.key] ?? OPTION_DEFAULTS[definition.key] ?? "0",
    }));
  }

  async options(): Promise<BedrockOptionEntry[]> {
    const root = await this.contentRoot();
    return this.buildOptionEntries(await this.readOptions(root));
  }

  async setOption(key: string, value: string): Promise<BedrockOptionEntry[]> {
    const root = await this.contentRoot();
    const definition = OPTION_DEFINITIONS.find((entry) => entry.key === key);
    if (!definition) {
      throw new ServiceError("INVALID_INPUT", "Unknown Bedrock setting");
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new ServiceError("INVALID_INPUT", "Value must be a number");
    }
    await this.writeOptions(root, { [key]: String(numeric) });
    return this.buildOptionEntries(await this.readOptions(root));
  }

  async applyPreset(
    preset: "performance" | "balanced" | "quality",
  ): Promise<BedrockOptionEntry[]> {
    const root = await this.contentRoot();
    await this.writeOptions(root, OPTION_PRESETS[preset]);
    return this.buildOptionEntries(await this.readOptions(root));
  }

  async restoreOptions(): Promise<BedrockOptionEntry[]> {
    const root = await this.contentRoot();
    const backup = this.optionsBackupPath(root);
    if (!fs.existsSync(backup)) {
      throw new ServiceError("NOT_FOUND", "No Bedrock options backup exists");
    }
    fs.copyFileSync(backup, this.optionsPath(root));
    return this.buildOptionEntries(await this.readOptions(root));
  }
}

export const bedrockService = new BedrockService();
export type { BedrockStatus };
