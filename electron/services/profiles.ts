import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import {
  profilesFile,
  instanceDir,
  resolveDataRoot,
  ensureDir,
} from "./paths";
import { readJsonFile, writeJsonFile } from "./files";
import { settingsService } from "./settings";
import { randomId, copyDirectory, safeName } from "./paths";
import type {
  BedrockProfile,
  JavaProfile,
  LoaderType,
  Profile,
} from "../../src/shared/types";

interface ProfileDocument {
  schemaVersion: number;
  profiles: Profile[];
}

const LOADERS: LoaderType[] = ["vanilla", "fabric", "quilt", "forge", "neoforge"];

function normalizeJava(
  profile: Partial<JavaProfile>,
  fallback: JavaProfile,
): JavaProfile {
  return {
    ...fallback,
    ...profile,
    edition: "java",
    loader: LOADERS.includes(profile.loader as LoaderType)
      ? (profile.loader as LoaderType)
      : fallback.loader,
    memoryMb: Math.max(1024, Math.min(32768, profile.memoryMb ?? fallback.memoryMb)),
    customJvmArgs: Array.isArray(profile.customJvmArgs)
      ? profile.customJvmArgs.filter((arg) => typeof arg === "string")
      : fallback.customJvmArgs,
    mods: Array.isArray(profile.mods) ? profile.mods : fallback.mods,
    resourcePacks: Array.isArray(profile.resourcePacks)
      ? profile.resourcePacks
      : fallback.resourcePacks,
    shaderPacks: Array.isArray(profile.shaderPacks)
      ? profile.shaderPacks
      : fallback.shaderPacks,
    updatedAt: Date.now(),
  };
}

class ProfilesService extends EventEmitter {
  private profiles: Profile[] = [];
  private loaded = false;

  async load(): Promise<Profile[]> {
    if (this.loaded) return this.profiles;
    const document = await readJsonFile<ProfileDocument>(profilesFile(), {
      schemaVersion: 1,
      profiles: [],
    });
    this.profiles = document.profiles.filter((profile) =>
      profile && (profile.edition === "java" || profile.edition === "bedrock"),
    );
    this.loaded = true;
    return this.profiles;
  }

  list(): Profile[] {
    return [...this.profiles];
  }

  find(id: string): Profile | undefined {
    return this.profiles.find((profile) => profile.id === id);
  }

  findJava(id: string): JavaProfile | undefined {
    const profile = this.profiles.find((entry) => entry.id === id);
    return profile?.edition === "java" ? profile : undefined;
  }

  async ensureDefaults(
    latestJavaVersion: string,
  ): Promise<Profile[]> {
    await this.load();
    const settings = await settingsService.load();
    const dataRoot = resolveDataRoot(settings);
    let changed = false;
    if (!this.profiles.some((profile) => profile.edition === "java")) {
      const id = randomId("java");
      const gameDir = instanceDir(dataRoot, id);
      const profile: JavaProfile = {
        id,
        edition: "java",
        name: "Main",
        gameVersion: latestJavaVersion,
        loader: "fabric",
        memoryMb: settings.memoryMb,
        jvmPreset: settings.jvmPreset,
        customJvmArgs: [],
        gameDir,
        performancePreset: "balanced",
        mods: [],
        resourcePacks: [],
        shaderPacks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      ensureDir(gameDir);
      this.profiles.push(profile);
      changed = true;
    }
    if (!this.profiles.some((profile) => profile.edition === "bedrock")) {
      const id = randomId("bedrock");
      const gameDir = instanceDir(dataRoot, id);
      const profile: BedrockProfile = {
        id,
        edition: "bedrock",
        name: "Bedrock",
        gameDir,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      ensureDir(gameDir);
      this.profiles.push(profile);
      changed = true;
    }
    if (changed) await this.persist();
    const selectedJava =
      this.profiles.find((profile) => profile.id === settings.selectedJavaProfileId) ??
      this.profiles.find((profile) => profile.edition === "java");
    const selectedBedrock =
      this.profiles.find((profile) => profile.id === settings.selectedBedrockProfileId) ??
      this.profiles.find((profile) => profile.edition === "bedrock");
    if (
      selectedJava &&
      settings.selectedJavaProfileId !== selectedJava.id
    ) {
      await settingsService.update({ selectedJavaProfileId: selectedJava.id });
    }
    if (
      selectedBedrock &&
      settings.selectedBedrockProfileId !== selectedBedrock.id
    ) {
      await settingsService.update({ selectedBedrockProfileId: selectedBedrock.id });
    }
    return this.list();
  }

  async create(input: {
    name: string;
    edition: "java" | "bedrock";
    gameVersion?: string;
    loader?: LoaderType;
  }): Promise<Profile> {
    await this.load();
    const settings = await settingsService.load();
    const dataRoot = resolveDataRoot(settings);
    const id = randomId(input.edition);
    const gameDir = instanceDir(dataRoot, id);
    ensureDir(gameDir);
    const name = safeName(input.name) || (input.edition === "java" ? "New profile" : "Bedrock");
    let profile: Profile;
    if (input.edition === "java") {
      profile = {
        id,
        edition: "java",
        name,
        gameVersion: input.gameVersion || "1.21.4",
        loader: input.loader && LOADERS.includes(input.loader) ? input.loader : "fabric",
        memoryMb: settings.memoryMb,
        jvmPreset: settings.jvmPreset,
        customJvmArgs: [],
        gameDir,
        performancePreset: "balanced",
        mods: [],
        resourcePacks: [],
        shaderPacks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } satisfies JavaProfile;
    } else {
      profile = {
        id,
        edition: "bedrock",
        name,
        gameDir,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } satisfies BedrockProfile;
    }
    this.profiles.push(profile);
    await this.persist();
    this.emit("changed", this.list());
    return profile;
  }

  async update(
    id: string,
    patch: Partial<JavaProfile> & Partial<Profile>,
  ): Promise<Profile> {
    await this.load();
    const index = this.profiles.findIndex((profile) => profile.id === id);
    if (index === -1) throw new Error("Profile not found");
    const current = this.profiles[index];
    if (patch.edition && patch.edition !== current.edition) {
      throw new Error("The edition of a profile cannot be changed");
    }
    let next: Profile;
    if (current.edition === "java") {
      next = normalizeJava(
        {
          ...patch,
          id: current.id,
          edition: "java",
          createdAt: current.createdAt,
          gameDir: patch.gameDir?.trim() || current.gameDir,
          name: patch.name ? safeName(patch.name) || current.name : current.name,
        } as Partial<JavaProfile>,
        current,
      );
      ensureDir(next.gameDir);
    } else {
      next = {
        ...current,
        name: patch.name ? safeName(patch.name) || current.name : current.name,
        gameDir: patch.gameDir?.trim() || current.gameDir,
        updatedAt: Date.now(),
      };
      ensureDir(next.gameDir);
    }
    this.profiles[index] = next;
    await this.persist();
    this.emit("changed", this.list());
    return next;
  }

  async replace(profile: Profile): Promise<void> {
    await this.load();
    const index = this.profiles.findIndex((entry) => entry.id === profile.id);
    if (index === -1) return;
    this.profiles[index] = profile;
    await this.persist();
    this.emit("changed", this.list());
  }

  async remove(id: string): Promise<void> {
    await this.load();
    const profile = this.find(id);
    if (!profile) return;
    this.profiles = this.profiles.filter((entry) => entry.id !== id);
    await this.persist();
    this.emit("changed", this.list());
  }

  async duplicate(id: string): Promise<Profile> {
    await this.load();
    const source = this.find(id);
    if (!source) throw new Error("Profile not found");
    const settings = await settingsService.load();
    const dataRoot = resolveDataRoot(settings);
    const newId = randomId(source.edition);
    const newDir = instanceDir(dataRoot, newId);
    ensureDir(newDir);
    for (const folder of ["mods", "resourcepacks", "shaderpacks", "config", "saves"]) {
      const sourceFolder = path.join(source.gameDir, folder);
      if (fs.existsSync(sourceFolder)) {
        copyDirectory(sourceFolder, path.join(newDir, folder));
      }
    }
    const optionsFile = path.join(source.gameDir, "options.txt");
    if (fs.existsSync(optionsFile)) {
      fs.copyFileSync(optionsFile, path.join(newDir, "options.txt"));
    }
    const copy: Profile =
      source.edition === "java"
        ? {
            ...source,
            id: newId,
            name: `${source.name} Copy`,
            gameDir: newDir,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastPlayed: undefined,
          }
        : {
            ...source,
            id: newId,
            name: `${source.name} Copy`,
            gameDir: newDir,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastPlayed: undefined,
          };
    this.profiles.push(copy);
    await this.persist();
    this.emit("changed", this.list());
    return copy;
  }

  private async persist(): Promise<void> {
    ensureDir(path.dirname(profilesFile()));
    await writeJsonFile(profilesFile(), {
      schemaVersion: 1,
      profiles: this.profiles,
    } satisfies ProfileDocument);
  }
}

export const profilesService = new ProfilesService();
