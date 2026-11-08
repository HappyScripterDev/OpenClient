import {
  app,
  dialog,
  ipcMain,
  shell,
} from "electron";
import path from "node:path";
import os from "node:os";
import { settingsService } from "./services/settings";
import { profilesService } from "./services/profiles";
import { accountService } from "./services/accounts";
import { versionService } from "./services/versions";
import { loaderService } from "./services/loaders";
import { javaService } from "./services/java";
import { launchService } from "./services/launch";
import { catalogService } from "./services/catalog";
import { contentService } from "./services/content";
import { performanceService } from "./services/performance";
import { hudService } from "./services/hud";
import { serverService } from "./services/servers";
import { bedrockService } from "./services/bedrock";
import { logsService } from "./services/logs";
import { newsService } from "./services/news";
import { updaterService } from "./services/updater";
import { logger } from "./services/logger";
import { downloads } from "./services/http";
import { toAppError } from "./services/errors";
import {
  appRoot,
  ensureDir,
  resolveDataRoot,
  instancesDir,
} from "./services/paths";
import {
  getMainWindow,
  windowState,
  setQuitting,
} from "./windows";
import type {
  ApiResult,
  AppSettings,
  LoaderType,
} from "../src/shared/types";
import type { AuthFlowStatus } from "../src/shared/ipc";

type Handler = (...args: never[]) => unknown;

function handle(channel: string, handler: Handler): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      const data = await (handler as (...input: unknown[]) => unknown)(...args);
      return { ok: true, data } satisfies ApiResult<unknown>;
    } catch (error) {
      return { ok: false, error: toAppError(error) } satisfies ApiResult<never>;
    }
  });
}

function showOpenDialog(
  window: Electron.BrowserWindow | null,
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  return window
    ? dialog.showOpenDialog(window, options)
    : dialog.showOpenDialog(options);
}

function showSaveDialog(
  window: Electron.BrowserWindow | null,
  options: Electron.SaveDialogOptions,
): Promise<Electron.SaveDialogReturnValue> {
  return window
    ? dialog.showSaveDialog(window, options)
    : dialog.showSaveDialog(options);
}

function broadcast(channel: string, payload: unknown): void {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
}

export function registerIpc(): void {
  handle("app:info", async () => {
    const settings = await settingsService.load();
    return {
      name: "OpenClient",
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      dataRoot: resolveDataRoot(settings),
      isPackaged: app.isPackaged,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    };
  });

  handle("app:open-external", async (url: string) => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("Only http and https links can be opened");
    }
    await shell.openExternal(url);
    return null;
  });

  handle("app:open-path", async (target: string) => {
    if (!target) throw new Error("Path is required");
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return null;
  });

  handle("app:pick-directory", async (title: string, defaultPath?: string) => {
    const window = getMainWindow();
    const result = await showOpenDialog(window, {
      title: title || "Select folder",
      defaultPath: defaultPath || undefined,
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled || result.filePaths.length === 0
      ? null
      : result.filePaths[0];
  });

  handle(
    "app:pick-file",
    async (title: string, filters?: { name: string; extensions: string[] }[]) => {
      const window = getMainWindow();
      const result = await showOpenDialog(window, {
        title: title || "Select file",
        properties: ["openFile"],
        filters: filters ?? [],
      });
      return result.canceled || result.filePaths.length === 0
        ? null
        : result.filePaths[0];
    },
  );

  handle(
    "app:pick-files",
    async (title: string, filters?: { name: string; extensions: string[] }[]) => {
      const window = getMainWindow();
      const result = await showOpenDialog(window, {
        title: title || "Select files",
        properties: ["openFile", "multiSelections"],
        filters: filters ?? [],
      });
      return result.canceled ? [] : result.filePaths;
    },
  );

  handle("app:reveal-path", async (target: string) => {
    if (!target) throw new Error("Path is required");
    shell.showItemInFolder(target);
    return null;
  });

  handle("app:system-memory", () => ({
    totalMb: Math.floor(os.totalmem() / (1024 * 1024)),
    freeMb: Math.floor(os.freemem() / (1024 * 1024)),
  }));

  handle("app:quit", () => {
    setQuitting(true);
    app.quit();
    return null;
  });

  handle("window:minimize", () => {
    getMainWindow()?.minimize();
    return null;
  });

  handle("window:toggle-maximize", () => {
    const window = getMainWindow();
    if (!window) return windowState();
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
    return windowState();
  });

  handle("window:close", () => {
    getMainWindow()?.close();
    return null;
  });

  handle("window:get-state", () => windowState());

  handle("settings:get", async () => settingsService.load());

  handle("settings:update", async (patch: Partial<AppSettings>) => {
    const before = await settingsService.load();
    const after = await settingsService.update(patch);
    if (before.launchOnStartup !== after.launchOnStartup) {
      try {
        app.setLoginItemSettings({ openAtLogin: after.launchOnStartup });
      } catch {
        void 0;
      }
    }
    if (before.javaPath !== after.javaPath) javaService.clearCache();
    if (before.dataRoot !== after.dataRoot) {
      ensureDir(after.dataRoot);
      versionService.loadManifest(true).catch(() => undefined);
    }
    return after;
  });

  handle("profiles:list", async () => {
    await profilesService.load();
    return profilesService.list();
  });

  handle(
    "profiles:create",
    async (input: {
      name: string;
      edition: "java" | "bedrock";
      gameVersion?: string;
      loader?: LoaderType;
    }) => {
      const profile = await profilesService.create(input);
      if (profile.edition === "java") {
        await settingsService.update({ selectedJavaProfileId: profile.id });
      } else {
        await settingsService.update({ selectedBedrockProfileId: profile.id });
      }
      return profile;
    },
  );

  handle("profiles:update", async (id: string, patch: Record<string, unknown>) => {
    return profilesService.update(id, patch as never);
  });

  handle("profiles:remove", async (id: string) => {
    const existing = profilesService.find(id);
    await profilesService.remove(id);
    if (existing) {
      const settings = await settingsService.load();
      const remaining = profilesService
        .list()
        .filter((profile) => profile.edition === existing.edition);
      if (
        existing.edition === "java" &&
        settings.selectedJavaProfileId === id
      ) {
        await settingsService.update({
          selectedJavaProfileId: remaining[0]?.id ?? "",
        });
      }
      if (
        existing.edition === "bedrock" &&
        settings.selectedBedrockProfileId === id
      ) {
        await settingsService.update({
          selectedBedrockProfileId: remaining[0]?.id ?? "",
        });
      }
    }
    return null;
  });

  handle("profiles:duplicate", async (id: string) => profilesService.duplicate(id));

  handle("auth:list", async () => {
    await accountService.load();
    return accountService.list();
  });

  handle("auth:start-device-code", async (clientId?: string) => {
    const challenge = await accountService.startDeviceCode(clientId);
    broadcast("event:device-code", challenge);
    return challenge;
  });

  handle("auth:cancel-device-code", () => {
    accountService.cancelDeviceCode();
    return null;
  });

  handle("auth:sign-out", async (id: string) => {
    await accountService.signOut(id);
    return null;
  });

  handle("auth:set-active", async (id: string) => accountService.setActive(id));

  handle("auth:refresh", async (id: string) => accountService.refresh(id));

  handle("java:versions", async (includeSnapshots: boolean) =>
    versionService.listVersions(includeSnapshots),
  );

  handle("java:latest-version", async () => versionService.latestVersions());

  handle(
    "java:loader-versions",
    async (loader: "fabric" | "quilt" | "forge" | "neoforge", gameVersion: string) =>
      loaderService.listLoaderVersions(loader, gameVersion),
  );

  handle(
    "java:install-loader",
    async (
      profileId: string,
      loader: "fabric" | "quilt" | "forge" | "neoforge",
      loaderVersion?: string,
    ) => {
      await loaderService.installLoader(profileId, loader, loaderVersion);
      return null;
    },
  );

  handle("java:runtimes", async () => javaService.list());

  handle("java:download-runtime", async (major: number) => {
    const runtime = await javaService.downloadRuntime(major);
    javaService.clearCache();
    return runtime;
  });

  handle("java:detect-runtime", async (major: number) =>
    javaService.detectRuntime(major),
  );

  handle("java:prepare", async (profileId: string) => {
    await launchService.prepare(profileId);
    return null;
  });

  handle(
    "java:launch",
    async (
      profileId: string,
      options?: { server?: string; port?: number },
    ) => launchService.launch(profileId, options),
  );

  handle("java:stop", async () => {
    await launchService.stop();
    return null;
  });

  handle("java:process-state", () => launchService.getState());

  handle("java:repair", async (profileId: string) => {
    await launchService.repair(profileId);
    return null;
  });

  handle("catalog:search", async (query: never) => catalogService.search(query));

  handle(
    "catalog:project",
    async (
      source: "modrinth" | "curseforge",
      id: string,
      kind: "mod" | "resourcepack" | "shader",
    ) => catalogService.project(source, id, kind),
  );

  handle(
    "catalog:versions",
    async (
      source: "modrinth" | "curseforge",
      projectId: string,
      gameVersion: string,
      loader: string,
      kind: "mod" | "resourcepack" | "shader",
    ) => catalogService.versions(source, projectId, gameVersion, loader, kind),
  );

  handle(
    "catalog:plan",
    async (
      profileId: string,
      source: "modrinth" | "curseforge",
      projectId: string,
      kind: "mod" | "resourcepack" | "shader",
    ) => catalogService.plan(profileId, source, projectId, kind),
  );

  handle(
    "catalog:install",
    async (
      profileId: string,
      source: "modrinth" | "curseforge",
      versionId: string,
      kind: "mod" | "resourcepack" | "shader",
    ) => contentService.install(profileId, source, versionId, kind),
  );

  handle("content:list", async (profileId: string) => contentService.list(profileId));

  handle("content:remove", async (profileId: string, contentId: string) => {
    await contentService.remove(profileId, contentId);
    return null;
  });

  handle(
    "content:toggle",
    async (profileId: string, contentId: string, enabled: boolean) =>
      contentService.toggle(profileId, contentId, enabled),
  );

  handle("content:check-updates", async (profileId: string) =>
    contentService.checkUpdates(profileId),
  );

  handle("content:update", async (profileId: string, contentId: string) =>
    contentService.update(profileId, contentId),
  );

  handle(
    "content:import-local",
    async (
      profileId: string,
      kind: "mod" | "resourcepack" | "shader",
      paths: string[],
    ) => contentService.importLocal(profileId, kind, paths),
  );

  handle(
    "content:open-folder",
    async (profileId: string, kind: "mod" | "resourcepack" | "shader") => {
      const folder = contentService.folderFor(profileId, kind);
      const error = await shell.openPath(folder);
      if (error) throw new Error(error);
      return null;
    },
  );

  handle("hud:get", async (profileId: string) => hudService.get(profileId));

  handle(
    "hud:save",
    async (profileId: string, config: Record<string, unknown>) =>
      hudService.save(profileId, config as never),
  );

  handle("hud:install", async (profileId: string) =>
    hudService.installCompanion(profileId),
  );

  handle(
    "performance:apply",
    async (profileId: string, preset: "ultra" | "balanced" | "quality") =>
      performanceService.apply(profileId, preset),
  );

  handle("performance:options-snapshot", async (profileId: string) =>
    performanceService.optionsSnapshot(profileId),
  );

  handle("performance:restore-options", async (profileId: string) => {
    await performanceService.restoreOptions(profileId);
    return null;
  });

  handle("servers:list", async () => {
    await serverService.load();
    return serverService.list();
  });

  handle("servers:add", async (input: never) => serverService.add(input));

  handle("servers:update", async (id: string, patch: never) =>
    serverService.update(id, patch),
  );

  handle("servers:remove", async (id: string) => {
    await serverService.remove(id);
    return null;
  });

  handle("servers:ping", async (id: string) => serverService.ping(id));

  handle(
    "servers:ping-address",
    async (edition: "java" | "bedrock", address: string, port: number) =>
      serverService.pingAddress(edition, address, port),
  );

  handle("servers:join", async (id: string, profileId?: string) =>
    serverService.join(id, profileId),
  );

  handle("bedrock:status", async () => bedrockService.detect(true));

  handle("bedrock:launch", async (uri?: string) => {
    await bedrockService.launch(uri);
    return null;
  });

  handle("bedrock:content", async () => bedrockService.content());

  handle("bedrock:import-content", async (paths: string[]) =>
    bedrockService.importContent(paths),
  );

  handle("bedrock:remove-content", async (id: string) => {
    await bedrockService.removeContent(id);
    return null;
  });

  handle("bedrock:worlds", async () => bedrockService.worlds());

  handle("bedrock:import-world", async (filePath: string) =>
    bedrockService.importWorld(filePath),
  );

  handle("bedrock:backup-world", async (id: string) =>
    bedrockService.backupWorld(id),
  );

  handle("bedrock:restore-world", async (id: string) => {
    await bedrockService.restoreWorld(id);
    return null;
  });

  handle("bedrock:duplicate-world", async (id: string) =>
    bedrockService.duplicateWorld(id),
  );

  handle("bedrock:export-world", async (id: string) => {
    const world = (await bedrockService.worlds()).find((entry) => entry.id === id);
    if (!world) throw new Error("World not found");
    const window = getMainWindow();
    const result = await showSaveDialog(window, {
      title: "Export Bedrock world",
      defaultPath: `${world.name || "world"}.mcworld`,
      filters: [{ name: "Minecraft Bedrock world", extensions: ["mcworld"] }],
    });
    if (result.canceled || !result.filePath) return null;
    return bedrockService.exportWorld(id, result.filePath);
  });

  handle("bedrock:delete-world", async (id: string) => {
    await bedrockService.deleteWorld(id);
    return null;
  });

  handle("bedrock:options", async () => bedrockService.options());

  handle("bedrock:set-option", async (key: string, value: string) =>
    bedrockService.setOption(key, value),
  );

  handle(
    "bedrock:apply-preset",
    async (preset: "performance" | "balanced" | "quality") =>
      bedrockService.applyPreset(preset),
  );

  handle("bedrock:restore-options", async () => bedrockService.restoreOptions());

  handle("logs:list", () => logsService.list());

  handle("logs:clear", () => {
    logsService.clear();
    return null;
  });

  handle("logs:crash-reports", async () => logsService.crashReports());

  handle("logs:read-crash", async (filePath: string) =>
    logsService.readCrash(filePath),
  );

  handle("logs:open-folder", async () => {
    const folder = path.join(appRoot(), "logs");
    ensureDir(folder);
    const error = await shell.openPath(folder);
    if (error) throw new Error(error);
    return null;
  });

  handle("logs:open-crash-folder", async () => {
    const settings = await settingsService.load();
    const selected = profilesService.find(settings.selectedJavaProfileId);
    const folder = selected
      ? path.join(selected.gameDir, "crash-reports")
      : instancesDir(resolveDataRoot(settings));
    ensureDir(folder);
    const error = await shell.openPath(folder);
    if (error) throw new Error(error);
    return null;
  });

  handle("news:list", async () => newsService.news());

  handle("news:statuses", async () => newsService.statuses());

  handle("updater:state", () => updaterService.getState());

  handle("updater:check", async () => updaterService.check());

  handle("updater:download", async () => updaterService.download());

  handle("updater:install", () => {
    updaterService.install();
    return null;
  });

  logger.on("entry", (entry) => broadcast("event:log", entry));
  downloads.on("progress", (progress) => broadcast("event:progress", progress));
  launchService.on("state", (state) => broadcast("event:game-state", state));
  accountService.on("status", (status: AuthFlowStatus) =>
    broadcast("event:auth-status", status),
  );
  accountService.on("changed", (accounts) =>
    broadcast("event:auth-changed", accounts),
  );
  profilesService.on("changed", (profiles) =>
    broadcast("event:profiles-changed", profiles),
  );
  updaterService.on("state", (state) => broadcast("event:update-state", state));
}
