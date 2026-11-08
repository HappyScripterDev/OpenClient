import fs from "node:fs";
import path from "node:path";
import { profilesService } from "./profiles";
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
}

export const hudService = new HudService();
