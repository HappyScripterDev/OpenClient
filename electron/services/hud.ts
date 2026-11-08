import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import AdmZip from "adm-zip";
import { profilesService } from "./profiles";
import { contentService } from "./content";
import { modrinthService } from "./modrinth";
import { ServiceError } from "./errors";
import { writeJsonFile } from "./files";
import { ensureDir } from "./paths";
import { mergeHudConfig } from "../../src/shared/hud";
import type { HudConfig } from "../../src/shared/hud";

export function hudConfigPath(gameDir: string): string {
  return path.join(gameDir, "config", "openclient-hud.json");
}

class HudService {
  async get(profileId: string): Promise<HudConfig> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    const file = hudConfigPath(profile.gameDir);
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<HudConfig>;
      return mergeHudConfig(raw);
    } catch {
      return mergeHudConfig(null);
    }
  }

  async save(profileId: string, config: Partial<HudConfig>): Promise<HudConfig> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    const merged = mergeHudConfig(config);
    const file = hudConfigPath(profile.gameDir);
    ensureDir(path.dirname(file));
    await writeJsonFile(file, merged);
    return merged;
  }

  async installCompanion(
    profileId: string,
  ): Promise<{ installed: string[]; jarPath: string }> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    if (profile.loader !== "fabric" && profile.loader !== "quilt") {
      throw new ServiceError(
        "UNSUPPORTED",
        "Install Fabric or Quilt on this profile before adding the HUD mod.",
      );
    }
    const jarCandidates = [
      path.join(process.resourcesPath, "openclient-companion.jar"),
      path.join(app.getAppPath(), "resources", "openclient-companion.jar"),
      path.join(app.getAppPath(), "companion-mod", "build", "libs", "openclient-1.0.0.jar"),
    ];
    const jarPath = jarCandidates.find((candidate) => fs.existsSync(candidate));
    if (!jarPath) {
      throw new ServiceError(
        "NOT_FOUND",
        "The companion mod jar is missing from this build. Build companion-mod first.",
      );
    }
    let targetVersion = "1.21.1";
    try {
      const zip = new AdmZip(jarPath);
      const entry = zip.getEntry("fabric.mod.json");
      if (entry) {
        const meta = JSON.parse(entry.getData().toString("utf8")) as {
          depends?: { minecraft?: string | string[] };
        };
        const value = meta.depends?.minecraft;
        if (typeof value === "string") targetVersion = value.replace(/[~^>=<\s]/g, "");
        else if (Array.isArray(value) && value.length > 0) {
          targetVersion = value[0].replace(/[~^>=<\s]/g, "");
        }
      }
    } catch {
      void 0;
    }
    if (!profile.gameVersion.startsWith(targetVersion.split(".").slice(0, 2).join("."))) {
      throw new ServiceError(
        "UNSUPPORTED",
        "The bundled HUD mod targets Minecraft " +
          targetVersion +
          ". Rebuild companion-mod for " +
          profile.gameVersion +
          " or use a compatible profile.",
      );
    }
    const installed: string[] = [];
    const apiProject = await modrinthService.project("fabric-api", "mod");
    if (!profile.mods.some((mod) => mod.projectId === apiProject.id)) {
      const version = await modrinthService.compatibleVersion(
        apiProject.id,
        profile.gameVersion,
        profile.loader,
        "mod",
      );
      if (!version) {
        throw new ServiceError(
          "UNSUPPORTED",
          "Fabric API has no compatible build for this profile.",
        );
      }
      await contentService.install(profileId, "modrinth", version.id, "mod");
      installed.push("Fabric API");
    } else {
      installed.push("Fabric API already installed");
    }
    const existing = profile.mods.find(
      (mod) => mod.fileName === "openclient-1.0.0.jar" || mod.slug === "openclient",
    );
    if (existing) {
      await contentService.remove(profileId, existing.id);
    }
    const imported = await contentService.importLocal(profileId, "mod", [jarPath]);
    installed.push(...imported.map((mod) => mod.name));
    return { installed, jarPath };
  }
}

export const hudService = new HudService();
