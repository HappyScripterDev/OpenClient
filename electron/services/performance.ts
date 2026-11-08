import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  PERFORMANCE_PRESETS,
  getPerformancePreset,
  isModAvailableForVersion,
  presetSupportsVersion,
} from "../../src/shared/performance-presets";
import {
  recommendMemoryMb,
  estimateSystemMemoryMb,
} from "../../src/shared/jvm";
import { profilesService } from "./profiles";
import { contentService } from "./content";
import { modrinthService } from "./modrinth";
import { loaderService } from "./loaders";
import { logger } from "./logger";
import { ServiceError } from "./errors";
import { patchOptionsText, optionsPatchForPreset, readOptionsMap } from "../core/options";
import type {
  JavaProfile,
  PerformanceApplyResult,
  PerformancePresetId,
} from "../../src/shared/types";

const ALTERNATIVES: Record<string, Partial<Record<string, string>>> = {
  sodium: { forge: "embeddium", neoforge: "embeddium" },
  lithium: { forge: "canary", neoforge: "canary" },
  iris: { forge: "oculus", neoforge: "oculus" },
  "modmenu": { forge: "catalogue", neoforge: "catalogue" },
  indium: { forge: "embeddiumplus", neoforge: "embeddiumplus" },
};

class PerformanceService {
  presets() {
    return PERFORMANCE_PRESETS;
  }

  private optionsFile(profile: JavaProfile): string {
    return path.join(profile.gameDir, "options.txt");
  }

  private backupFile(profile: JavaProfile): string {
    return path.join(profile.gameDir, "options.txt.openclient-backup");
  }

  async apply(
    profileId: string,
    presetId: PerformancePresetId,
  ): Promise<PerformanceApplyResult> {
    let profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    const preset = getPerformancePreset(presetId);
    if (!preset) throw new ServiceError("NOT_FOUND", "Unknown performance preset");
    if (!presetSupportsVersion(preset, profile.gameVersion)) {
      throw new ServiceError(
        "UNSUPPORTED",
        `${preset.name} is not available for Minecraft ${profile.gameVersion}. It supports ${preset.minGameVersion} and newer.`,
      );
    }
    if (profile.loader === "vanilla") {
      logger.info("performance", "Installing Fabric before applying a performance preset");
      await loaderService.installLoader(profileId, "fabric");
      profile = profilesService.findJava(profileId) ?? profile;
    }
    const loader = profile.loader === "vanilla" ? "fabric" : profile.loader;
    const installed: string[] = [];
    const skipped: { slug: string; reason: string }[] = [];
    const failed: { slug: string; reason: string }[] = [];
    for (const mod of preset.mods) {
      if (!isModAvailableForVersion(mod.slug, profile.gameVersion, loader)) {
        skipped.push({ slug: mod.slug, reason: "Not available for this version" });
        continue;
      }
      const slug =
        loader === "forge" || loader === "neoforge"
          ? ALTERNATIVES[mod.slug]?.[loader] ?? mod.slug
          : mod.slug;
      try {
        const project = await modrinthService.project(slug, "mod");
        const version = await modrinthService.compatibleVersion(
          project.id,
          profile.gameVersion,
          loader,
          "mod",
        );
        if (!version) {
          skipped.push({
            slug,
            reason: `No ${profile.gameVersion} ${loader} build`,
          });
          continue;
        }
        await contentService.install(profileId, "modrinth", version.id, "mod");
        installed.push(project.name);
      } catch (error) {
        failed.push({
          slug,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const optionsPath = this.optionsFile(profile);
    const backupPath = this.backupFile(profile);
    fs.mkdirSync(profile.gameDir, { recursive: true });
    if (!fs.existsSync(backupPath)) {
      const original = fs.existsSync(optionsPath)
        ? fs.readFileSync(optionsPath, "utf8")
        : "";
      fs.writeFileSync(backupPath, original, "utf8");
    }
    const existing = fs.existsSync(optionsPath)
      ? fs.readFileSync(optionsPath, "utf8")
      : "";
    const patch = optionsPatchForPreset(preset.options);
    const next = patchOptionsText(existing, patch);
    fs.writeFileSync(optionsPath, next, "utf8");
    const totalMemory = estimateSystemMemoryMb(os.totalmem());
    const recommended = recommendMemoryMb(totalMemory);
    await profilesService.update(profileId, {
      performancePreset: presetId,
      jvmPreset: preset.jvmPreset,
      memoryMb: Math.max(profile.memoryMb || 0, Math.min(8192, recommended)),
    });
    logger.info(
      "performance",
      `Applied ${preset.name}: ${installed.length} mods, ${skipped.length} skipped, ${failed.length} failed`,
    );
    return {
      installed,
      skipped,
      failed,
      optionsBackupPath: backupPath,
    };
  }

  async optionsSnapshot(profileId: string): Promise<Record<string, string>> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    const file = this.optionsFile(profile);
    if (!fs.existsSync(file)) return {};
    return readOptionsMap(fs.readFileSync(file, "utf8"));
  }

  async restoreOptions(profileId: string): Promise<void> {
    const profile = profilesService.findJava(profileId);
    if (!profile) throw new ServiceError("NOT_FOUND", "Java profile not found");
    const backup = this.backupFile(profile);
    if (!fs.existsSync(backup)) {
      throw new ServiceError("NOT_FOUND", "No options backup exists for this profile");
    }
    fs.copyFileSync(backup, this.optionsFile(profile));
    logger.info("performance", `Restored options.txt for ${profile.name}`);
  }
}

export const performanceService = new PerformanceService();
