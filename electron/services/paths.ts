import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import type { AppSettings } from "../../src/shared/types";

export function appRoot(): string {
  return path.join(app.getPath("appData"), "OpenClient");
}

export function settingsFile(): string {
  return path.join(appRoot(), "settings.json");
}

export function profilesFile(): string {
  return path.join(appRoot(), "profiles.json");
}

export function serversFile(): string {
  return path.join(appRoot(), "servers.json");
}

export function accountsFile(): string {
  return path.join(appRoot(), "accounts.json");
}

export function accountsSecretFile(): string {
  return path.join(appRoot(), "accounts.enc");
}

export function launcherLogFile(): string {
  return path.join(appRoot(), "logs", "launcher.log");
}

export function defaultDataRoot(): string {
  return path.join(appRoot(), "data");
}

export function resolveDataRoot(settings: AppSettings): string {
  return settings.dataRoot && settings.dataRoot.trim()
    ? settings.dataRoot
    : defaultDataRoot();
}

export function versionsDir(dataRoot: string): string {
  return path.join(dataRoot, "versions");
}

export function librariesDir(dataRoot: string): string {
  return path.join(dataRoot, "libraries");
}

export function assetsDir(dataRoot: string): string {
  return path.join(dataRoot, "assets");
}

export function runtimesDir(dataRoot: string): string {
  return path.join(dataRoot, "runtimes");
}

export function instancesDir(dataRoot: string): string {
  return path.join(dataRoot, "instances");
}

export function instanceDir(dataRoot: string, profileId: string): string {
  return path.join(instancesDir(dataRoot), profileId);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function assetPath(assetsRoot: string, hash: string): string {
  return path.join(assetsRoot, "objects", hash.slice(0, 2), hash);
}

export function libraryPath(librariesRoot: string, relative: string): string {
  return path.join(librariesRoot, relative.split("/").join(path.sep));
}

export function safeName(input: string): string {
  return input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function randomId(prefix = ""): string {
  const value = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix ? `${prefix}-${value}` : value;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function fileExists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function dirExists(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

export function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export function listFilesRecursive(dir: string): string[] {
  if (!dirExists(dir)) return [];
  const results: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) results.push(full);
    }
  };
  walk(dir);
  return results;
}

export function directorySize(dir: string): number {
  return listFilesRecursive(dir).reduce((sum, file) => sum + fileSize(file), 0);
}

export function copyDirectory(source: string, destination: string): void {
  if (!dirExists(source)) return;
  fs.cpSync(source, destination, { recursive: true, force: true });
}

export function timestampId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
