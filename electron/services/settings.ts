import { EventEmitter } from "node:events";
import fs from "node:fs";
import { settingsFile, defaultDataRoot, ensureDir } from "./paths";
import { readJsonFile, writeJsonFile } from "./files";
import { DEFAULT_SETTINGS } from "../../src/shared/defaults";
import { SETTINGS_SCHEMA } from "../../src/shared/constants";
import type { AppSettings } from "../../src/shared/types";

function normalize(input: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...input };
  merged.schemaVersion = SETTINGS_SCHEMA;
  if (merged.language !== "en" && merged.language !== "de") merged.language = "en";
  if (merged.theme !== "dark" && merged.theme !== "midnight") merged.theme = "dark";
  if (!/^#[0-9a-f]{6}$/i.test(merged.accent)) merged.accent = DEFAULT_SETTINGS.accent;
  merged.memoryMb = clamp(Math.round(merged.memoryMb || 4096), 1024, 32768);
  merged.downloadConcurrency = clamp(
    Math.round(merged.downloadConcurrency || 8),
    1,
    24,
  );
  if (merged.catalogSource !== "modrinth" && merged.catalogSource !== "both") {
    merged.catalogSource = "modrinth";
  }
  if (merged.defaultEdition !== "java" && merged.defaultEdition !== "bedrock") {
    merged.defaultEdition = "java";
  }
  if (!merged.dataRoot || !merged.dataRoot.trim()) {
    merged.dataRoot = defaultDataRoot();
  }
  return merged;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

class SettingsService extends EventEmitter {
  private settings: AppSettings = DEFAULT_SETTINGS;
  private loaded = false;

  async load(): Promise<AppSettings> {
    if (this.loaded) return this.settings;
    const raw = await readJsonFile<Partial<AppSettings>>(settingsFile(), {});
    this.settings = normalize(raw);
    ensureDir(this.settings.dataRoot);
    this.loaded = true;
    if (!fs.existsSync(settingsFile())) {
      await this.persist();
    }
    return this.settings;
  }

  get(): AppSettings {
    return this.settings;
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    await this.load();
    const next = normalize({ ...this.settings, ...patch });
    this.settings = next;
    await this.persist();
    this.emit("changed", next);
    return next;
  }

  private async persist(): Promise<void> {
    ensureDir(this.settings.dataRoot);
    await writeJsonFile(settingsFile(), this.settings);
  }
}

export const settingsService = new SettingsService();
