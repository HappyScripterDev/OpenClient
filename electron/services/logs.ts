import fs from "node:fs";
import path from "node:path";
import { appRoot, instancesDir, resolveDataRoot } from "./paths";
import { logger } from "./logger";
import { settingsService } from "./settings";
import type { CrashReportInfo, LogEntry } from "../../src/shared/types";

export class LogsService {
  list(): LogEntry[] {
    return logger.list();
  }

  clear(): void {
    logger.clear();
  }

  async crashReports(): Promise<CrashReportInfo[]> {
    const settings = await settingsService.load();
    const dataRoot = resolveDataRoot(settings);
    const roots = [instancesDir(dataRoot)];
    const reports: CrashReportInfo[] = [];
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      let profiles: fs.Dirent[] = [];
      try {
        profiles = fs.readdirSync(root, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const profile of profiles) {
        if (!profile.isDirectory()) continue;
        const crashDir = path.join(root, profile.name, "crash-reports");
        if (!fs.existsSync(crashDir)) continue;
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(crashDir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;
          const file = path.join(crashDir, entry.name);
          try {
            const stat = fs.statSync(file);
            const text = fs.readFileSync(file, "utf8").slice(0, 1200);
            reports.push({
              id: `${profile.name}:${entry.name}`,
              fileName: entry.name,
              path: file,
              modifiedAt: stat.mtimeMs,
              sizeBytes: stat.size,
              preview: text.split(/\r?\n/).slice(0, 6).join("\n"),
            });
          } catch {
            void 0;
          }
        }
      }
    }
    return reports.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  async readCrash(filePath: string): Promise<string> {
    const settings = await settingsService.load();
    const allowedRoots = [resolveDataRoot(settings), appRoot()].map((root) =>
      path.resolve(root),
    );
    const resolved = path.resolve(filePath);
    const allowed = allowedRoots.some(
      (root) => resolved === root || resolved.startsWith(root + path.sep),
    );
    if (!allowed) throw new Error("Crash report path is outside the OpenClient data folder");
    if (!resolved.endsWith(".txt")) throw new Error("Only text crash reports can be read");
    const stat = fs.statSync(resolved);
    if (stat.size > 4 * 1024 * 1024) throw new Error("Crash report is too large");
    return fs.readFileSync(resolved, "utf8");
  }
}

export const logsService = new LogsService();
