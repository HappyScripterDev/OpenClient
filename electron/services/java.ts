import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import AdmZip from "adm-zip";
import { ADOPTIUM_API_URL } from "../../src/shared/constants";
import {
  ensureDir,
  runtimesDir,
  resolveDataRoot,
  listFilesRecursive,
  fileExists,
} from "./paths";
import { fetchJson, downloads } from "./http";
import { settingsService } from "./settings";
import { logger } from "./logger";
import { hashFile } from "./files";
import { isVersionAtLeast } from "../core/mojang";
import type {
  JavaRuntimeInfo,
  ManagedRuntimeInfo,
} from "../../src/shared/types";

const execFileAsync = promisify(execFile);

interface AdoptiumPackage {
  binary: {
    package: {
      link: string;
      name: string;
      checksum: string;
      size: number;
    };
    os: string;
    architecture: string;
    image_type: string;
  };
  version: {
    semver: string;
    major: number;
    openjdk_version: string;
  };
  release_name: string;
}

interface ManagedMetadata {
  major: number;
  version: string;
  installedAt: number;
  archive: string;
}

function javaExecutableName(): string {
  return process.platform === "win32" ? "java.exe" : "java";
}

function parseJavaVersion(output: string): { version: string; major: number } {
  const quoted = output.match(/version "([^"]+)"/);
  const settings = output.match(/java\.version\s*=\s*([^\s]+)/);
  const raw = quoted?.[1] ?? settings?.[1] ?? "";
  if (!raw) return { version: "unknown", major: 0 };
  const major = raw.startsWith("1.")
    ? Number(raw.split(".")[1]) || 0
    : Number(raw.split(/[._-]/)[0]) || 0;
  return { version: raw, major };
}

export function javaMajorForMinecraftVersion(gameVersion: string): number {
  if (isVersionAtLeast(gameVersion, "1.20.5")) return 21;
  if (isVersionAtLeast(gameVersion, "1.17")) return 17;
  return 8;
}

class JavaService {
  private cachedSystem: JavaRuntimeInfo[] | null = null;

  async inspectJava(
    javaPath: string,
    source: JavaRuntimeInfo["source"] = "system",
  ): Promise<JavaRuntimeInfo | null> {
    if (!javaPath || !fileExists(javaPath)) return null;
    try {
      const { stdout, stderr } = await execFileAsync(
        javaPath,
        ["-XshowSettings:properties", "-version"],
        { timeout: 15000, windowsHide: true },
      );
      const output = `${stdout}\n${stderr}`;
      const parsed = parseJavaVersion(output);
      if (!parsed.major) return null;
      const vendorMatch = output.match(/java\.vendor\s*=\s*(.+)/);
      return {
        path: javaPath,
        version: parsed.version,
        major: parsed.major,
        source,
        vendor: vendorMatch?.[1]?.trim() ?? "Unknown",
      };
    } catch {
      return null;
    }
  }

  async detectSystemJava(): Promise<JavaRuntimeInfo[]> {
    if (this.cachedSystem) return this.cachedSystem;
    const candidates = new Set<string>();
    const addCandidate = (value: string): void => {
      if (value && !value.includes("*")) candidates.add(path.normalize(value));
    };
    const settings = await settingsService.load();
    if (settings.javaPath) addCandidate(settings.javaPath);
    if (process.env.JAVA_HOME) {
      addCandidate(path.join(process.env.JAVA_HOME, "bin", javaExecutableName()));
    }
    try {
      const command = process.platform === "win32" ? "where" : "which";
      const { stdout } = await execFileAsync(command, ["java"], {
        timeout: 8000,
        windowsHide: true,
      });
      for (const line of stdout.split(/\r?\n/)) {
        if (line.trim()) addCandidate(line.trim());
      }
    } catch {
      void 0;
    }
    const glob = (dir: string, depth = 3): void => {
      if (!dir || !fs.existsSync(dir)) return;
      const walk = (current: string, level: number): void => {
        if (level > depth) return;
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            walk(full, level + 1);
          } else if (entry.isFile() && entry.name === javaExecutableName()) {
            const parent = path.dirname(full);
            if (path.basename(parent) === "bin") addCandidate(full);
          }
        }
      };
      walk(dir, 0);
    };
    if (process.platform === "win32") {
      const programFiles = [
        process.env["ProgramFiles"],
        process.env["ProgramFiles(x86)"],
      ].filter(Boolean) as string[];
      for (const base of programFiles) {
        for (const vendor of [
          "Java",
          "Eclipse Adoptium",
          "Eclipse Foundation",
          "Microsoft",
          "Zulu",
          "BellSoft",
          "Amazon Corretto",
          "Semeru",
          "RedHat",
        ]) {
          glob(path.join(base, vendor), 3);
        }
      }
      const local = process.env["LOCALAPPDATA"];
      if (local) {
        glob(path.join(local, "Programs", "Eclipse Adoptium"), 3);
        glob(path.join(local, "Programs", "Microsoft"), 3);
        glob(path.join(local, "Minecraft Launcher", "runtime"), 4);
      }
      glob(path.join(process.env["ProgramData"] ?? "C:\\ProgramData", "Oracle", "Java"), 4);
    } else if (process.platform === "darwin") {
      glob("/Library/Java/JavaVirtualMachines", 4);
      glob(path.join(os.homedir(), "Library", "Java", "JavaVirtualMachines"), 4);
      try {
        const { stdout } = await execFileAsync("/usr/libexec/java_home", ["-V"], {
          timeout: 8000,
        });
        for (const line of stdout.split(/\r?\n/)) {
          const match = line.match(/(\/.*?Contents\/Home)/);
          if (match) addCandidate(path.join(match[1], "bin", "java"));
        }
      } catch {
        void 0;
      }
    } else {
      glob("/usr/lib/jvm", 3);
      glob(path.join(os.homedir(), ".sdkman", "candidates", "java"), 3);
    }
    for (const managed of this.scanManaged()) {
      addCandidate(managed.path);
    }
    const found: JavaRuntimeInfo[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      const info = await this.inspectJava(
        candidate,
        candidate.startsWith(runtimesDir(resolveDataRoot(settings)))
          ? "managed"
          : "system",
      );
      if (info) found.push(info);
    }
    const unique = new Map<string, JavaRuntimeInfo>();
    for (const info of found) {
      const key = `${info.path}|${info.version}`;
      if (!unique.has(key)) unique.set(key, info);
    }
    this.cachedSystem = [...unique.values()].sort((a, b) => b.major - a.major);
    return this.cachedSystem;
  }

  scanManaged(): ManagedRuntimeInfo[] {
    const root = runtimesDir(resolveDataRoot(settingsService.get()));
    if (!fs.existsSync(root)) return [];
    const results: ManagedRuntimeInfo[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      const metadataFile = path.join(dir, "runtime.json");
      const javaPath = path.join(dir, "bin", javaExecutableName());
      if (!fileExists(javaPath)) continue;
      let metadata: ManagedMetadata | null = null;
      try {
        metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8")) as ManagedMetadata;
      } catch {
        metadata = null;
      }
      results.push({
        major: metadata?.major ?? (Number(entry.name) || 0),
        path: javaPath,
        version: metadata?.version ?? "unknown",
        installedAt: metadata?.installedAt ?? 0,
        sizeBytes: listFilesRecursive(dir).reduce((sum, file) => {
          try {
            return sum + fs.statSync(file).size;
          } catch {
            return sum;
          }
        }, 0),
      });
    }
    return results;
  }

  async downloadRuntime(major: number): Promise<ManagedRuntimeInfo> {
    const root = runtimesDir(resolveDataRoot(settingsService.get()));
    const targetDir = path.join(root, String(major));
    const metadataFile = path.join(targetDir, "runtime.json");
    const existing = this.scanManaged().find((runtime) => runtime.major === major);
    if (existing) return existing;
    ensureDir(targetDir);
    const adoptiumOs =
      process.platform === "win32"
        ? "windows"
        : process.platform === "darwin"
          ? "mac"
          : "linux";
    const adoptiumArch = process.arch === "arm64" ? "aarch64" : "x64";
    const url = `${ADOPTIUM_API_URL}/assets/latest/${major}/hotspot?architecture=${adoptiumArch}&image_type=jre&os=${adoptiumOs}&vendor=eclipse`;
    logger.info("java", `Resolving Temurin JRE ${major} for ${adoptiumOs}/${adoptiumArch}`);
    const assets = await fetchJson<AdoptiumPackage[]>(url, {}, 2);
    const asset = assets.find((entry) =>
      entry.binary.package.name.endsWith(adoptiumOs === "windows" ? ".zip" : ".tar.gz"),
    ) ?? assets[0];
    if (!asset) {
      throw new Error(`No Java ${major} runtime is available for this platform.`);
    }
    const archivePath = path.join(targetDir, asset.binary.package.name);
    const downloadResult = await downloads.downloadBatch(
      `runtime:${major}`,
      "runtime",
      `Downloading Java ${major}`,
      [
        {
          url: asset.binary.package.link,
          destination: archivePath,
          size: asset.binary.package.size,
          label: asset.binary.package.name,
        },
      ],
      1,
    );
    if (downloadResult.errors.length > 0) {
      throw new Error(`Java runtime download failed: ${downloadResult.errors[0]}`);
    }
    if (asset.binary.package.checksum) {
      const digest = await hashFile(archivePath, "sha256");
      if (digest.toLowerCase() !== asset.binary.package.checksum.toLowerCase()) {
        await fs.promises.rm(archivePath, { force: true });
        throw new Error("Java runtime checksum verification failed.");
      }
    }
    logger.info("java", `Extracting Java ${major}`);
    if (archivePath.endsWith(".zip")) {
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(targetDir, true);
    } else {
      await execFileAsync("tar", ["-xzf", archivePath, "-C", targetDir], {
        timeout: 180000,
      });
    }
    await fs.promises.rm(archivePath, { force: true });
    const javaPath = this.findJavaInDirectory(targetDir);
    if (!javaPath) {
      throw new Error("The downloaded runtime did not contain a Java executable.");
    }
    const info = await this.inspectJava(javaPath, "managed");
    if (!info) throw new Error("The downloaded Java runtime could not be started.");
    const metadata: ManagedMetadata = {
      major: info.major,
      version: info.version,
      installedAt: Date.now(),
      archive: asset.binary.package.name,
    };
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    this.cachedSystem = null;
    return {
      major: info.major,
      path: info.path,
      version: info.version,
      installedAt: metadata.installedAt,
      sizeBytes: 0,
    };
  }

  private findJavaInDirectory(root: string): string | null {
    const direct = path.join(root, "bin", javaExecutableName());
    if (fileExists(direct)) return direct;
    for (const file of listFilesRecursive(root)) {
      if (path.basename(file) === javaExecutableName() && path.basename(path.dirname(file)) === "bin") {
        return file;
      }
    }
    return null;
  }

  async ensureRuntime(
    requiredMajor: number,
    preferredPath?: string,
  ): Promise<JavaRuntimeInfo> {
    const settings = await settingsService.load();
    const candidates = await this.detectSystemJava();
    if (preferredPath) {
      const preferred = candidates.find(
        (runtime) => path.normalize(runtime.path).toLowerCase() === path.normalize(preferredPath).toLowerCase(),
      );
      if (preferred) return preferred;
      const inspected = await this.inspectJava(preferredPath, "system");
      if (inspected) return inspected;
    }
    if (settings.javaPath) {
      const inspected = await this.inspectJava(settings.javaPath, "system");
      if (inspected) return inspected;
    }
    const managed = this.scanManaged();
    const exactManaged = managed.find((runtime) => runtime.major === requiredMajor);
    if (exactManaged) {
      const info = await this.inspectJava(exactManaged.path, "managed");
      if (info) return info;
    }
    const exactSystem = candidates.find((runtime) => runtime.major === requiredMajor);
    if (exactSystem) return exactSystem;
    if (requiredMajor >= 17) {
      const newer = candidates
        .filter((runtime) => runtime.major >= requiredMajor && runtime.major <= requiredMajor + 6)
        .sort((a, b) => a.major - b.major)[0];
      if (newer) return newer;
    }
    logger.warn("java", `No Java ${requiredMajor} found, downloading Temurin JRE`);
    const downloaded = await this.downloadRuntime(requiredMajor);
    const info = await this.inspectJava(downloaded.path, "managed");
    if (!info) throw new Error("Java runtime install failed.");
    return info;
  }

  async detectRuntime(requiredMajor: number, preferredPath?: string): Promise<JavaRuntimeInfo> {
    const settings = await settingsService.load();
    if (preferredPath) {
      const inspected = await this.inspectJava(preferredPath, "system");
      if (inspected) return inspected;
    }
    if (settings.javaPath) {
      const inspected = await this.inspectJava(settings.javaPath, "system");
      if (inspected) return inspected;
    }
    const managed = this.scanManaged().find((runtime) => runtime.major === requiredMajor);
    if (managed) {
      const inspected = await this.inspectJava(managed.path, "managed");
      if (inspected) return inspected;
    }
    const system = (await this.detectSystemJava()).find(
      (runtime) => runtime.major === requiredMajor,
    );
    if (system) return system;
    throw new Error(`Java ${requiredMajor} was not found on this system.`);
  }

  async list(): Promise<{ managed: ManagedRuntimeInfo[]; system: JavaRuntimeInfo[] }> {
    return {
      managed: this.scanManaged(),
      system: await this.detectSystemJava(),
    };
  }

  clearCache(): void {
    this.cachedSystem = null;
  }
}

export const javaService = new JavaService();
